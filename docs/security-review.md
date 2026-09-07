# Security hardening — 2026-09-06

This is a scoped source review and local hardening record, not a penetration-test certificate or a guarantee against intrusion. Changes have not been deployed by this review.

## Implemented

- **Bound JSON before parsing:** `web/src/lib/validation/request.ts` now limits consumed request bytes to 1 MiB. Declared oversized bodies are rejected early; missing or false Content-Length cannot bypass the streaming byte limit. Oversized streams are cancelled with HTTP 413. This applies to the 64 API route files importing `validateBody`; multipart uploads and routes reading JSON directly are outside this change.
- **Tighten CSRF origin checks:** `web/src/lib/auth/origin.ts` rejects browser `Sec-Fetch-Site: cross-site` evidence, non-HTTP(S) origin URLs and URL credentials. Existing missing-Origin/Host rejection and Referer fallback remain. Fetch Metadata supplements the existing host check; it is not an authentication mechanism.
- **Regression coverage:** 15 new tests exercise chunked oversized bodies, dishonest/missing length, exact byte boundary, split Persian UTF-8, invalid JSON/schema input, cross-site origin metadata and legitimate origin/referrer handling.

The JSON cap is an intentional behavior change: clients sending more than 1 MiB to these routes receive 413. The article-create schema's 100,000-character body remains below the cap for ordinary Persian content. This does not bound concurrent connections, upload parsing or slow-client duration.

## Inspected controls

Read the shared API permission guards, session verification, rate-limit implementation, admin upload/sniffing/storage path and Caddy body-limit configuration. A source scan found an authentication/permission guard reference in every admin route file; that scan does not prove every branch or object-ownership check correct. Existing strict staff verification, generated upload filenames, image signature checks and proxy body limits were retained.

## Validation

- Full Vitest suite: 268 files / 2,854 tests passed.
- Production Next build: passed with local `DATABASE_URL` and `REDIS_URL` unset; this includes type checking, not production database verification.
- Project lint: passed.
- Chromium Playwright: 24 tests passed, including login, role-based admin access, catalog flows and accessibility. Uses the local ephemeral test database.
- `git diff --check`: passed.

## Remaining security work

A complete assessment still requires route-by-route object-ownership review, multipart/parser resource limits, dependency advisory checks, stored-content sanitization review, and refresh-token replay analysis. Production SSH access, firewall rules, database exposure, deployed TLS/headers, backup restoration and alert delivery have not been verified by this local review. Do not interpret historical deployment reports as current evidence.

Keep operational changes separate from source validation: rotating session secrets or changing token families can log out existing users and requires a concrete migration plan. No secrets were rotated, sessions invalidated, database records changed or production probes performed here.

## Second pass — request parsers and AI draft authorization

- Consolidated bounded request reading in `web/src/lib/server/utils/requestBody.ts`. All remaining direct JSON parsers in API route files now use it, including AI, telemetry, the alert relay and pricing-history endpoints. JSON remains capped at 1 MiB; telemetry keeps its existing 204 drop behavior on bad/oversized input.
- All three multipart endpoints (admin images, customer letterhead logos, Excel pricing import) now cap the entire encoded body at 6 MiB before invoking the multipart parser. Existing 5 MiB individual-file limits and permission checks remain. Extra fields/files count against the aggregate budget. The reader uses a growing bounded buffer rather than retaining an unbounded number of tiny chunk objects.
- AI draft editing and confirmation now use strict database-verified sessions instead of JWT-only identity. Confirmation checks ownership before consuming the draft, preventing a different account from destroying it by submitting its identifier. The ownership check after consumption remains as defense in depth.
- Added regression coverage for multipart round trips, excess aggregate size, falsified Content-Length, malformed payloads, invalid sessions and foreign-draft rejection.

Inspected account-request and alert-owner restrictions, public proforma/tracking handlers and draft storage. Public references intentionally remain bearer capabilities; this pass does not change that product behavior. A further issue remains in draft storage: consumption uses separate read/delete operations and a local/Redis dual cache, so cross-request/cross-instance atomicity needs a dedicated fix and concurrency tests. Multipart byte limits also do not bound XLSX decompression or image decoding expansion. These are outstanding work, not protections claimed by this pass.

Second-pass source checks: 64 schema-based JSON route files, nine direct JSON route files and three multipart route files now use bounded reading. No direct request `.json()` or `.formData()` calls remain in API route files. Full Vitest: 270 files / 2,863 tests passed. A typed-array return annotation exposed a TypeScript DOM `BodyInit` incompatibility during the first build; retaining the owned-buffer inferred type resolved it without changing runtime behavior.

Second-pass production build (database-free local configuration) and project lint passed. Two additional API-boundary regressions passed in the five-test `apiGuardAudit` suite after the full run: size rejection returns 413 without error-log amplification, while genuine exceptions still report and return 500. Chromium Playwright: all 24 browser tests passed against the local ephemeral database.
