# Geo-routing: Iran server + foreign server for ahantime.com

Goal: Iranian visitors reach a server physically inside Iran (fast, not
dependent on any foreign network being reachable); everyone else reaches a
server abroad (fast, not dependent on Iran's international bandwidth or
filtering). One domain, two origins, and something in the middle decides
which origin a given visitor's IP gets sent to.

This repo already has **both origins fully built**:

| Origin | Path | Docs |
| --- | --- | --- |
| Iran (self-hosted) | Docker Compose — `docker-compose.yml` + `Caddyfile` | `DEPLOY.md` |
| Foreign (serverless) | Cloudflare Workers — OpenNext adapter | `web/DEPLOY-CLOUDFLARE.md` |

What was missing — and what this doc + the small code change alongside it
adds — is the **decision layer**: the thing that looks at a visitor's IP and
picks which of the two origins answers. That layer lives at the DNS level,
outside this repo (in your Cloudflare/DNS-provider account), which is why it
needs your action — nothing here can click through your account for you. This
doc is written so that step is copy-paste simple once you have both servers.

## The one architecture decision I made — flag if you want it differently

**Iran server = canonical, fully live app** (real DB, real OTP login, real
orders, the background job scheduler). **Cloudflare (foreign) = the same UI in
mock mode** (browsable catalog + prices, no login/orders) — this was already
the Cloudflare default before any of this work; I'm keeping it as the
intentional choice, not just leaving an accident in place.

**Why this default, not two independent live databases:** OTP login only
works with Iranian mobile numbers (SMS.ir), and the product is domestic
steel delivery — a foreign visitor genuinely cannot complete an order today
regardless of which server answers. Two independent *live* databases would
also mean orders/accounts diverge between them (a customer who somehow
registered on one origin wouldn't exist on the other) — real complexity for
a capability foreign visitors can't use yet. Mock-mode-abroad sidesteps that
entirely: no database to keep in sync, nothing to diverge, and foreign
visitors still get a fast, fully-browsable site.

**If you actually need foreign visitors to log in and transact** (e.g.
diaspora customers), that's a different, heavier setup: both origins pointed
at one **shared external Postgres** (Neon/Supabase, reachable over the
internet from both) via Cloudflare Hyperdrive (already supported — see
`web/DEPLOY-CLOUDFLARE.md` step 5) for the Cloudflare side, and the Iran
Docker stack's `DATABASE_URL` pointed at that same external DB instead of its
bundled `db` container. Tell me if this is actually what you want and I'll
wire it — flagging it here rather than silently picking the heavier option.

## Verifying which origin answered

Both origins expose `/api/health`, which now includes a `region` field (added
alongside this doc): `ir-docker` for the Docker stack, `cloudflare-edge` for
the Workers deployment (`unknown` if unset — a signal something's
misconfigured). Once both are up:

```bash
curl https://ahantime.com/api/health
# {"status":"ok","db":"up","region":"ir-docker"}          ← from inside Iran
# {"status":"ok","db":"not_configured","region":"cloudflare-edge"}  ← from abroad
```

Use this after every DNS/routing change below to confirm it actually worked
— don't trust the change until this shows the origin you expect from each
side.

## Choosing how the IP-based decision happens

Cloudflare's plain (free) DNS does **not** do geo-based routing on its own —
a plain A/CNAME record always resolves to the same value everywhere. You need
one of:

### Option A — ArvanCloud (recommended for an Iran-facing site)

[ArvanCloud](https://www.arvancloud.ir) is an Iranian CDN with PoPs both
inside Iran and abroad, and multi-origin geo-split is a first-class,
purpose-built feature there (Iranian visitors are served from Iranian PoPs
without ever touching foreign network paths; everyone else from ArvanCloud's
international PoPs) — this is the standard, well-trodden path Iranian
businesses use for exactly this problem, not a workaround.

1. Sign up at arvancloud.ir, add `ahantime.com` as a CDN service.
2. Point the registrar's nameservers at ArvanCloud (replacing Cloudflare's —
   you'd be moving DNS authority from Cloudflare to ArvanCloud for this
   domain; Cloudflare's Workers deployment keeps running fine at its
   `*.workers.dev` URL regardless of who hosts the DNS zone).
3. In ArvanCloud's panel, configure **two origins**:
   - **Iran origin**: your Iran server's IP, port 443 (Caddy terminates TLS
     there already).
   - **International/default origin**: your Cloudflare Workers app — its
     `*.workers.dev` hostname (or a CNAME to it).
4. Set ArvanCloud's routing rule: requests geolocated to Iran → Iran origin;
   everything else → the international origin.
5. Let ArvanCloud issue/manage TLS for `ahantime.com`.

### Option B — Cloudflare Load Balancing (stay on Cloudflare)

A paid add-on (~$5/mo + per-request cost) on your existing Cloudflare
account. Simpler if you'd rather not move DNS providers, with one caveat:
traffic still enters through Cloudflare's network first (even for Iranian
visitors) before being steered — usually fine since Cloudflare is broadly
reachable from Iran, but it does mean you're not fully bypassing "foreign
infrastructure" for the Iran path the way ArvanCloud's Iran-local PoPs do.

1. Cloudflare dashboard → your zone → **Load Balancing** → enable it.
2. Create a **Pool** named `iran-origin` with your Iran server's IP as its
   single origin (health check path: `/api/health`).
3. Create a second **Pool** named `foreign-origin` pointed at the Workers
   app's `*.workers.dev` hostname.
4. Create a **Load Balancer** for `ahantime.com` with **geo-steering**
   enabled: region `Iran` (or country `IR`) → `iran-origin` pool; default/all
   other regions → `foreign-origin` pool.
5. Cloudflare issues TLS automatically as part of the existing zone.

## Checklist — run this the moment you have the Iran server's IP

1. [ ] Provision the Iran VPS, SSH in, follow `DEPLOY.md` steps 1–6 exactly
       (Docker install → clone → `.env` → `docker compose up -d --build`).
       Confirm `curl http://<iran-ip>/api/health` (or `https://` once Caddy's
       cert is issued) returns `"region":"ir-docker"`.
2. [ ] Confirm the Cloudflare Workers deployment is live at its
       `*.workers.dev` URL (already should be, per `web/DEPLOY-CLOUDFLARE.md`)
       and returns `"region":"cloudflare-edge"` — set
       `NEXT_PUBLIC_DEPLOY_REGION=cloudflare-edge` as a **Build variable**
       in Workers Builds project settings (same place as
       `NEXT_PUBLIC_API_MODE`; it's a `NEXT_PUBLIC_*` var, so it must be set
       at build time, not as a runtime Secret/Variable) if you haven't yet.
3. [ ] Pick Option A or B above and complete its numbered steps.
4. [ ] Run the verification `curl` from the "Verifying" section above from
       two vantage points — a device physically in Iran, and any server/VPN
       exit point abroad — confirm each gets the expected `region`.
5. [ ] Only after step 4 passes: consider this live. Until then, keep telling
       people the `*.workers.dev` URL directly rather than `ahantime.com`, so
       a half-finished routing config never fronts real traffic.

## What I could not do from this session

Both DNS providers (Cloudflare Load Balancing, ArvanCloud) require actions
inside your account — creating pools/load balancers, or signing up and
moving nameservers — that need your login/OAuth, which this non-interactive
session cannot perform. Everything on the code side (both full deployments,
the `region` health-check field, this doc) is done and pushed; the DNS step
is the one piece only you can click through.
