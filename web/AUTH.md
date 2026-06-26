# Poladin — Phase 5 · Authentication

**Status:** ✅ Implemented end-to-end (passwordless mobile + OTP, JWT access + rotating refresh, RBAC, profile, security). The earlier TODO stubs in `api/auth/*` are now real.

**Locked product decision:** auth is **mobile number + OTP** (no passwords), SMS via **Kavenegar**. "Register" and "Login" are the same flow — the first verified OTP for a new mobile creates the account (with an optional name).

---

## The 10 items

| # | Item | Implementation |
|---|------|----------------|
| 51 | **Login** | OTP flow (`LoginForm` → `/api/auth/otp/*`); returning users log in on verify |
| 52 | **Register** | Same flow; first OTP for a new mobile creates the account (optional name captured at request) |
| 53 | **OTP** | `service.requestOtp/verifyOtp`: 5-digit code, 120s TTL, hashed at rest, attempts + lockout, resend cooldown, per-hour cap; Kavenegar (dev logs the code) |
| 54 | **Session** | httpOnly cookies — access JWT (`poladin_at`, path `/`) + refresh (`poladin_rt`, path `/api/auth`); `getSession()` server helper |
| 55 | **JWT** | `jwt.ts` — HS256 via `jose`, 15-min access token, issuer/audience, signed with `SESSION_SECRET` |
| 56 | **Refresh Token** | Opaque 32-byte token, **hashed** in store, **single-use rotation** (`rotateRefresh`); silent client refresh every 12 min |
| 57 | **Role Management** | `Role` = customer + operator/sales/content/catalog/admin (navigation §21); `ROLE_LABEL`, `STAFF_ROLES` |
| 58 | **Permissions** | `Permission` set + `ROLE_PERMISSIONS` map + `can()` / `canAccessAdmin()`; `<Can>` (UI) + `requirePermission()` (server) |
| 59 | **User Profile** | `/api/me`, `/api/me/profile` (PUT); `<ProfileForm>` + `<LogoutButton>`; real `/حساب` dashboard |
| 60 | **Security** | hashed OTP/refresh (SHA-256 + pepper), constant-time compare, lockout/rate-limit, httpOnly + Secure + SameSite=Lax cookies, same-origin CSRF check, no secrets/PII in logs |

---

## Architecture

```
Browser  ──POST /api/auth/otp/request──▶  rate-limit → issue OTP → hash+store → Kavenegar/dev-log
Browser  ──POST /api/auth/otp/verify ──▶  check TTL/attempts → constant-time compare → login|register
                                          → sign access JWT + issue refresh → Set-Cookie (httpOnly)
Server Components ── getSession() ───────▶ verify access JWT from cookie → AuthUser | null
Browser (every 12m) ─POST /api/auth/refresh▶ rotate refresh (single-use) → new access cookie
Browser  ──POST /api/auth/logout ────────▶ revoke refresh + clear cookies
```

- **Data layer** (`lib/auth/store.ts`) is an in-memory implementation behind repository functions — the same mock⇄live seam as the API layer. Swap for a DB (`DATABASE_URL`) in production; nothing else changes. A dev admin (`DEV_ADMIN_MOBILE`, default `09120000000`) is seeded so the admin area is reachable locally.
- **Crypto is real** (`lib/auth/crypto.ts` Web Crypto; `jose` JWT) — only persistence is in-memory for now.
- **No mock branch** in the client `authApi`: auth always hits the in-app route handlers, so the full flow works even in `NEXT_PUBLIC_API_MODE=mock` (the dev SMS surfaces the code as `devCode`, shown in `LoginForm`).

## Roles & permissions (RBAC)

| Role | Permissions (summary) |
|------|------------------------|
| `customer` | — (public features only) |
| `operator` | admin · pricing:write · market:write · catalog:read |
| `sales` | admin · leads:read/write · catalog:read |
| `content` | admin · content:write/publish |
| `catalog` | admin · catalog:read/write |
| `admin` | everything |

Guards: **server** pages use `requireUser()` / `requirePermission()` (guests → OTP login; unauthorized staff routes → 404, hidden not revealed). **Client** UI uses `<Can permission>` and `<Protected>`. The server always enforces; client checks are UX only.

## Security notes

- OTP and refresh tokens are **never stored in clear** (SHA-256 + `SESSION_SECRET` pepper); comparisons are constant-time.
- Brute-force: ≤5 verify attempts, then a 15-min lockout; resend cooldown 60s; ≤3 sends/hour.
- Cookies: `httpOnly` (no JS access), `Secure` in production, `SameSite=Lax`; refresh token scoped to `/api/auth`.
- CSRF: `SameSite=Lax` + an explicit same-origin Origin/Referer check on every mutating auth route.
- Refresh **rotation** makes stolen refresh tokens single-use; reuse fails and clears the session.
- Logs never include codes, hashes, tokens, or PII (`errors/report.ts` redaction).
- `SESSION_SECRET` is **required in production** (loud dev fallback otherwise); validated by `lib/validation/env.ts` in live mode.

## Files
```
lib/auth/{types,roles,crypto,jwt,store,sms,service,session,guards,origin,apiError,publicUser}.ts
lib/hooks/useAuth.ts · lib/providers/AuthHydrator.tsx (seed + silent refresh)
components/auth/{LogoutButton,ProfileForm,Can,Protected}.tsx
app/api/auth/otp/{request,verify}/route.ts · app/api/auth/{refresh,logout}/route.ts
app/api/me/route.ts · app/api/me/profile/route.ts
app/حساب/[[...tab]]/page.tsx (guarded dashboard)
tests: lib/auth/{roles,service}.test.ts
```
Modified: `stores/auth.ts` (+role, loading status), `api/resources/auth.ts` (real endpoints), `forms.ts`, `LoginForm.tsx` (name + dev hint), `layout.tsx` (server session → AuthHydrator), `middleware.ts` (cookie name), `validation/{api,schemas}.ts`, `package.json` (jose), `.env.example`.

> **To go live:** set `SESSION_SECRET`, `KAVENEGAR_API_KEY`/template, `AUTH_ENFORCED=true`, and replace `lib/auth/store.ts` with a DB-backed repo (users, refresh tokens, OTP, rate-limits). The interfaces stay identical.

*Poladin — اول مشورت، بعد خرید.*
