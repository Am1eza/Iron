# Documentation index

Updated 2026-09-06. Implementation guides describe the checkout; product/design documents describe intent. Historical reports retain their original evidence and are not current production-health or completion certificates.

## Development

- [Project overview](../README.md) and [local setup/checks](../web/README.md)
- [Architecture](../web/ARCHITECTURE.md), [routing](../web/ROUTING.md), [state](../web/STATE-MANAGEMENT.md)
- [Forms and validation](../web/FORMS.md), [API client](../web/API-CLIENT.md), [errors](../web/ERROR-HANDLING.md)
- [Authentication](../web/AUTH.md), [AI advisor](../web/AI.md), [UI system](../web/UI-SYSTEM.md), [UX engineering](../web/UX-ENGINEERING.md)
- [Code review ledger](code-quality-review.md) and [file coverage](code-review-inventory.csv)

- [Security hardening review](security-review.md)

## Operations

- [Deployment](../DEPLOY.md), [geo routing](../GEO-ROUTING.md), [Cloudflare target](../web/DEPLOY-CLOUDFLARE.md)
- [Backups](BACKUP.md), [analytics](ANALYTICS.md), [SMS templates](SMS-TEMPLATES.md), [call center](CALL-CENTER.md)

## Product, design and planning

- [Foundation index](../foundation/README.md), [vision](vision.md), [market research](market-research.md)
- [Product scope](../product/product-scope.md), [acceptance criteria](../product/acceptance-criteria.md), [stories](../product/epics-user-stories-v2.md)
- [Information architecture](../product/information-architecture.md), [design language](../design/design-language.md), [brand book](../brand/brand-book.md)
- Roadmaps: [admin](roadmap/admin-panel.md), [AI training](roadmap/ai-advisor-training.md), [performance](roadmap/performance.md)
- [Price-source survey](price-sync-source-survey.md)

## Historical reports

Twenty-seven root-level reports were consolidated into four topic archives. Original bodies, decisions, SQL examples and evidence remain available under a section named for each original file. Old deploy/merge commands are historical records, not instructions to execute today.

- [Catalog and data corrections](archive/catalog.md)
- [Pricing and source synchronization](archive/pricing.md)
- [User experience and content](archive/experience.md)
- [Audits and closeout](archive/audits.md)
- Other dated records: [production audit](PRODUCTION-AUDIT.md), [navigation redesign](nav-redesign/README.md)

`web/VALIDATION.md` was merged into `web/FORMS.md`; the obsolete phase-completion checklist `web/FRONTEND-ENGINEERING.md` was replaced by the current architecture guide and its linked specialist documentation. Separate design and product specifications remain separate because they serve distinct purposes.
