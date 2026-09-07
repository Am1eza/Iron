# Code quality review — 2026-09-06

This ledger distinguishes implemented changes from automated checks and manual review. It does **not** certify that every line in the application has been manually audited. Existing uncommitted product/catalog changes were preserved; the repository-wide Git diff includes work that predates this review.

[File-by-file inventory](code-review-inventory.csv) records source, scripts, tests and styles individually. `static_checked` and `stylelint_checked` do not mean manual review. `targeted_review` means selected paths were inspected, not the entire module. The CSV is a snapshot for this review, not generated application code.

## Review rules

- **YAGNI:** remove confirmed unused features and forwarding-only layers. Check runtime callers, maintenance scripts, framework conventions, namespace imports and tests before deleting.
- **KISS:** prefer the smallest implementation that preserves actual behavior. Do not split large domain tables or introduce generic frameworks merely to reduce file length.
- **DRY:** consolidate genuinely shared behavior; keep transport, presentation and business decisions distinct.
- **Performance:** eliminate repeated work at observed call sites. Measure isolated changes without presenting microbenchmarks as page-load gains.
- **Correctness:** exercise cancellation, cleanup, Strict Mode, nested UI, interrupted streams and database expressions. Preserve price bases, rounding, provider choices, permissions and stored data.

## Implemented changes

| Files (under `web/`) | Finding and result |
|---|---|
| `src/lib/api/client.ts`, `endpoints.ts` | Deleted unused compatibility shims. |
| `src/lib/api/forms.ts`; `components/forms/LoginForm.tsx`, `ContactForm.tsx` | Removed forwarding-only facade; callers now use `authApi` and `contactApi` directly. |
| `src/lib/hooks/useAuth.ts` | Imports the auth resource directly instead of the aggregate API object. |
| `src/lib/i18n/{index,locale,strings}.ts` | Removed obsolete, unused translation implementation. Active `src/i18n/` and message dictionaries remain. |
| `src/components/feedback/ErrorState.tsx` | Deleted unused generic error UI. Existing error/empty-state components and route boundaries remain. |
| `src/components/admin/charts/Heatmap.tsx`, `charts.module.css`, `MeterBar.tsx` | Removed unused heatmap, its CSS, and unused `BrandBar`. |
| `src/lib/stores/ui.ts`, `requests.ts` | Removed unwritten modal state/actions and unused request-count selector. Persisted preferences and migrations remain. |
| `src/lib/hooks/useFocusTrap.ts` | Only the top trap handles keyboard events; nested modals share a scroll lock and restore it after the last modal closes, even out of order. Disabled fields are excluded. Removed redundant subscription callback wrapper. |
| `src/components/ui/useConfirm.tsx` | Replaced/unmounted confirmation prompts settle as cancelled instead of leaving callers waiting forever. |
| `src/lib/hooks/useRequestsSync.ts` | Removed ref-based suppression that broke Strict Mode replay. Sync depends on user ID, aborts obsolete work, ignores late results, and retains skipped local requests. |
| `src/components/ui/CountUp.tsx` | Reuses the intersection hook; unchanged values do not schedule frames; interrupted animation continues from its displayed value; invalid durations settle immediately. |
| `src/components/feedback/Toaster.tsx` | Prevents overlapping timers and keeps dismissal paused while either pointer hover or keyboard focus remains inside. |
| `src/lib/server/catalog.ts` | Request-scoped React cache for categories, subcategories, rows, SKU lookup and factory ordering. Metadata/layout/page calls share reads without cross-request stale prices. |
| `src/lib/utils/catalogSize.ts`; `components/catalog/PriceTable.tsx` | Reuse Persian numeric collators instead of constructing collation state inside sort comparisons. |
| `src/lib/utils/catalogFacets.ts` | Slugifies distinct facet spellings once, retains counts/collisions, and removes unused collision-helper facade. |
| `src/app/page.tsx` | Groups factories in one pass per category instead of repeatedly filtering the same rows for every subcategory. |
| `src/lib/utils/catalogCompose.ts`; `components/admin/catalog/SkuDrawer.tsx` | Removes unused category argument from `defaultPriceBasisFor`; price-basis decisions are unchanged. |
| `src/lib/utils/compressImage.ts` | A browser PNG fallback is no longer mislabeled and uploaded as WebP. |
| `src/lib/server/repos/articlesRepo.ts` | Fixes SQL whitespace escaping for reading-time word counts; removes unused `recentPublished` query. |
| `src/lib/server/utils/httpJson.ts` | Rejects interrupted response streams instead of leaving an unhandled stream error/pending request. |
| `src/lib/server/repos/{alertsRepo,commentsRepo,catalogAdminRepo}.ts` | Removes unused `activeAlertCount`, `deleteComment`, and `adminListSubCategories`; active transactional and count-aware APIs remain. |
| `src/lib/api/http.ts`, `src/lib/query/queryClient.ts` | Cancels obsolete requests/backoff, cleans listeners, retains timeout through body reading, and avoids retries for malformed JSON/schema failures. Upload attempts/backoff share one timeout. |
| `src/lib/server/seo/knownPaths.ts` | Fixes stale public-route membership across separately compiled middleware/route modules. Concurrent readers share a refresh; invalidation prevents old refreshes publishing stale paths. Existing browser create/delete flow exposed the bug. |
| `tsconfig.json` | Enables `noUnusedLocals` and `noUnusedParameters` as continuing quality gates. |
| API/state/frontend/error documentation | Removes guidance pointing to deleted facades and obsolete localization modules. |

Regression tests were added/extended alongside the affected HTTP, query, dialog, toast, sync, animation, image and database code. Existing catalog, financial and authorization suites remain intact.

## Performance evidence

Local Node 26 microbenchmark: 30 sorts of 1,000 Persian labels with numeric dimensions produced **identical order**. Per-comparison `localeCompare(..., 'fa', { numeric: true })`: **199.0 ms**. Reused `Intl.Collator`: **13.2 ms**. This is isolated sorting time, not an LCP/TTFB measurement.

Catalog deduplication follows concrete duplicate calls: SKU metadata and page both call `findSku`; category metadata and page both call `getRows`; layout and pages share taxonomy reads. React caching is request-scoped. No global price-cache TTL was increased.

## Deliberately retained

- Framework entry points `src/i18n/request.ts` and `src/lib/server/jobs/cronRunner.ts`: referenced by Next config and the custom worker outside the ordinary source import graph.
- Analytics helpers used by `.mts` maintenance scripts; test-only reset seams; database schema exports; icon-system exports accessed through namespace/styleguide tooling.
- Catalog measurement tables, price-basis rules, session migrations, auth/provider boundaries and live/mock fail-closed behavior.
- The aggregate `api` client still has real consumers. Removing it would require a separate migration of those consumers and their mocks; it was not deleted simply because direct imports are preferable.

## Validation and remaining coverage

Final validation after the implementation changes:

- Vitest: **266 files, 2,839 tests passed**.
- Chromium Playwright: **24 tests passed**, including accessibility checks and the create/delete SKU flow that originally exposed the route-cache bug. Browser execution used the existing ephemeral PGlite database and local Next server.
- Production build: passed with `DATABASE_URL='' REDIS_URL=''` to avoid unavailable local services. This verifies compilation and database-free prerendering; it does not certify a production database deployment.
- TypeScript: passed with unused locals and parameters enforced.
- Project lint command (`next lint`): passed. Direct ESLint 9 invocation requires flat configuration; the existing project command handles its legacy configuration.
- Stylelint: all source CSS passed.
- `git diff --check`: passed.

No production deployment or production load benchmark was performed.

Broader manual review remains for files marked `static_checked`, `inventoried`, or `targeted_review`, especially the large AI pipeline, price synchronization, admin editor and repository modules. No claim of exhaustive manual review or production performance measurement is made.
