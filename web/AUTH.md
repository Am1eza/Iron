# Ahantime — Phase 5 · Authentication

> **Numbers in this document are load-bearing and were wrong until 2026-08-03.**
> `src/lib/config/constants.ts` is the source of truth for OTP length/TTL, token
> lifetimes and rate limits — check it before trusting any figure quoted here.

**Status:** ✅ Implemented end-to-end (passwordless mobile + OTP, JWT access + rotating refresh, RBAC, profile, security). The earlier TODO stubs in `api/auth/*` are now real.

**Locked product decision:** auth is **mobile number + OTP** (no passwords), SMS via **SMS.ir**. "Register" and "Login" are the same flow — the first verified OTP for a new mobile creates the account (with an optional name).

---

## The 10 items

| # | Item | Implementation |
|---|------|----------------|
| 51 | **Login** | OTP flow (`LoginForm` → `/api/auth/otp/*`); returning users log in on verify |
| 52 | **Register** | Same flow; first OTP for a new mobile creates the account (optional name captured at request) |
| 53 | **OTP** | `service.requestOtp/verifyOtp`: **6**-digit code, **900s** TTL, hashed at rest, attempts + lockout, resend cooldown, per-hour cap; SMS.ir (dev logs the code) |
| 54 | **Session** | httpOnly cookies — access JWT (`ahantime_at`, path `/`) + refresh (`ahantime_rt`, path `/api/auth`); `getSession()` server helper |
| 55 | **JWT** | `jwt.ts` — HS256 (pinned via `algorithms`) via `jose`, **4-hour** access token, issuer/audience, signed with `SESSION_SECRET` |
| 56 | **Refresh Token** | Opaque 32-byte token, **hashed** in store, **single-use rotation** (`rotateRefresh`, but **no reuse detection** — see below); silent client refresh every **3 hours** |
| 57 | **Role Management** | `Role` = customer + operator/sales/content/catalog/admin (navigation §21); `ROLE_LABEL`, `STAFF_ROLES` |
| 58 | **Permissions** | `Permission` set + `ROLE_PERMISSIONS` map + `can()` / `canAccessAdmin()`; `requirePermission()` (server) + the same `can()` called directly in client components (below) |
| 59 | **User Profile** | `/api/me`, `/api/me/profile` (PUT); `<ProfileForm>` + `<LogoutButton>`; real `/حساب` dashboard |
| 60 | **Security** | hashed OTP/refresh (SHA-256 + pepper), constant-time compare, lockout/rate-limit, httpOnly + Secure + SameSite=Lax cookies, same-origin CSRF check, no secrets/PII in logs |

---

## Architecture

```
Browser  ──POST /api/auth/otp/request──▶  rate-limit → issue OTP → hash+store → SMS.ir/dev-log
Browser  ──POST /api/auth/otp/verify ──▶  check TTL/attempts → constant-time compare → login|register
                                          → sign access JWT + issue refresh → Set-Cookie (httpOnly)
Server Components ── getSession() ───────▶ verify access JWT from cookie → AuthUser | null
Browser (every 12m) ─POST /api/auth/refresh▶ rotate refresh (single-use) → new access cookie
Browser  ──POST /api/auth/logout ────────▶ revoke refresh + clear cookies
```

- **Data layer** (`lib/auth/store.ts`) selects at runtime: `hasDb() ? pgStore : memoryStore`. The Postgres-backed store (`store.pg.ts`) has been live in production for weeks; the in-memory one is the no-DATABASE_URL fallback for local work. A dev admin (`DEV_ADMIN_MOBILE`, default `09120000000`) is seeded so the admin area is reachable locally.
- **Crypto is real** (`lib/auth/crypto.ts` Web Crypto; `jose` JWT).
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

Guards: **server** pages use `requireUser()` / `requirePermission()` (guests → OTP login; unauthorized staff routes → 404, hidden not revealed), and `middleware.ts` gates `/admin/*` at the edge from `ADMIN_PATH_PERMISSIONS`. The server always enforces; **every client-side check below is UX only** — it decides which controls are worth rendering, never whether an action is allowed.

### Gating client UI

There is **no `<Can>` / `<Protected>` wrapper component**. Client components call the same pure `can(role, permission)` from `lib/auth/roles.ts` that the server guards use, reading the role straight off the auth store:

```tsx
import { useAuthStore } from '@/lib/stores/auth';
import { can } from '@/lib/auth/roles';

const role = useAuthStore((s) => s.user?.role);
if (!can(role, 'leads:read')) return null;
```

Why a plain function and not a component:

- **Bundle.** `useAuth()` (`lib/hooks/useAuth.ts`) also exposes `.can()` / `.canAccessAdmin()`, but it imports the `@/lib/api` barrel — and with it the zod catalog/market schemas. Anything in the **admin shell** (rendered on every panel page) must therefore use `useAuthStore` + `can()` directly and keep the barrel off that critical path. `useAuth()` stays the right call on public pages that already need `logout` / `refresh` / `isAuthenticated` (`LogoutButton`, `PriceTable`, `SkuDetail`).
- **Most gates aren't "hide this subtree."** They compute a *value* — `AdminAlerts` turns the role into a polling scope (`'global' | 'desk' | null`), not a visibility flag — or they ask a rule that takes more than a permission string, like `canChangeLeadAssignee(actor, before, next)` in `LeadDetail`, whose result drives several controls at once.
- **`can()` fails closed** on a missing role, so the first paint while the session hydrates hides staff controls rather than flashing one the user may not be allowed to use.

Rules that both a route handler and the UI need to agree on live in `lib/auth/roles.ts` as pure, id-based functions (`can`, `canAccessAdmin`, `canChangeLeadAssignee`) — the UI asks the *same* function as the API, so a button can never appear that the server would answer 403 to.

Reference call sites: `components/admin/AdminAlerts.tsx`, `components/admin/leads/LeadDetail.tsx`.

## Security notes

- OTP and refresh tokens are **never stored in clear** (SHA-256 + `SESSION_SECRET` pepper); comparisons are constant-time.
- Brute-force: ≤5 verify attempts, then a 15-min lockout; resend cooldown 60s; ≤**5** sends/hour.
- Cookies: `httpOnly` (no JS access), `Secure` in production, `SameSite=Lax`; refresh token scoped to `/api/auth`.
- CSRF: `SameSite=Lax` + an explicit same-origin Origin/Referer check on every mutating auth route.
- Refresh **rotation** makes stolen refresh tokens single-use; reuse fails and clears the session.
- Logs never include codes, hashes, tokens, or PII (`errors/report.ts` redaction).
- `SESSION_SECRET` is **required in production** (loud dev fallback otherwise); validated by `lib/validation/env.ts` in live mode.

## Files
```
lib/auth/{types,roles,crypto,jwt,store,sms,service,session,guards,origin,apiError,publicUser}.ts
lib/hooks/useAuth.ts · lib/providers/AuthHydrator.tsx (seed + silent refresh)
components/auth/{LogoutButton,ProfileForm}.tsx
app/api/auth/otp/{request,verify}/route.ts · app/api/auth/{refresh,logout}/route.ts
app/api/me/route.ts · app/api/me/profile/route.ts
app/حساب/[[...tab]]/page.tsx (guarded dashboard)
tests: lib/auth/{roles,service}.test.ts
```
Modified: `stores/auth.ts` (+role, loading status), `api/resources/auth.ts` (real endpoints), `forms.ts`, `LoginForm.tsx` (name + dev hint), `layout.tsx` (server session → AuthHydrator), `middleware.ts` (cookie name), `validation/{api,schemas}.ts`, `package.json` (jose), `.env.example`.

> **Already live.** `SESSION_SECRET`, `SMSIR_API_KEY`/`SMSIR_TEMPLATE_ID` and `AUTH_ENFORCED=true` are set in production, and the DB-backed store (`store.pg.ts`) is what actually runs. Do **not** re-implement it.

> **Known gap (2026-08-03 audit):** refresh rotation is single-use, but there is
> no **reuse detection** — a presented-but-already-rotated token is indistinguishable
> from one that never existed (both 401), so a stolen refresh token yields a silent
> parallel session that re-logging in does not evict. Closing it needs a
> `previous_hash`/`family_id` column and a migration; flagged NEEDS-HUMAN-REVIEW
> because the fix mass-invalidates sessions and a bad heuristic would log out staff.

*Ahantime — اول مشورت، بعد خرید.*
