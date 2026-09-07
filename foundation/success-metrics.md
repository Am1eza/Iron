# Ahantime — Success Metrics
## Phase 1 · Foundation — #10

**Version:** 2.0 · 4 September 2026

**Owner:** Head of Growth (accountable) · Sales Lead, Catalog Ops, Engineering and Content/SEO (metric owners)

**North star:** monthly closed orders facilitated by Ahantime (`won` leads with a recorded order reference).

These are operating targets, not aspirations. The first 14 complete days after this version ships form the baseline. Targets apply by day 90 unless a written decision log changes them. A missing denominator, owner or data source is a failed metric—not a zero and not “N/A”.

## 1. Ninety-day scorecard

| Stage | Metric and exact definition | Day-90 target | Owner | Source |
|---|---|---:|---|---|
| Magnet | Organic sessions, bot-filtered | ≥20% growth vs baseline 28-day run-rate | Content/SEO | Matomo |
| Magnet | Search CTR on valid indexed catalog pages | ≥4.0% | Content/SEO | Search Console |
| Engage | Engaged catalog session: `view-product` or tool use / catalog sessions | ≥35% | Growth | Matomo events |
| Engage | AI useful-response rate: grounded answer without fallback / started conversations | ≥80% | AI/Product | AI logs |
| Capture | Visitor→lead: unique sessions with `lead` / eligible non-staff sessions | ≥3.5% | Growth | Matomo + CRM |
| Capture | Cart→lead: `cart-proforma` / sessions reaching cart with ≥1 item | ≥18% | Growth | Matomo events |
| Capture | Alert-set success / alert modal submits | ≥70% | Product | API + Matomo |
| Convert | Lead→sales-qualified | ≥45% | Sales Lead | CRM |
| Convert | Sales-qualified→won | ≥20% | Sales Lead | CRM |
| Convert | First human response during working hours | median ≤10 min; p90 ≤30 min | Sales Lead | CRM timestamps |
| Convert | Quote→won | ≥15% | Sales Lead | CRM/proforma |
| Retain | Won customers with another won order within 90 days | ≥25% | Sales Lead | CRM |
| Retain | Active club members with ≥1 value event in 30 days | ≥30% | Growth | club/alert/lead tables |

## 2. Revenue and unit economics

The Business dashboard must show monthly won orders, GMV, gross margin amount, gross margin %, tonnes sold, AOV, margin/tonne, lead→won, repeat rate, CAC and 90-day contribution LTV. GMV or margin without a traceable order reference is excluded. Refunds/cancellations reverse the original month and remain visible in an adjustment row.

Guardrails:

- Gross margin % may not fall more than 1.5 percentage points below the trailing 90-day baseline to buy conversion.
- No channel scales if its 90-day contribution margin is negative.
- Staff/test traffic is excluded using an explicit segment; it is never manually subtracted.

**Owner:** Finance/Founder for margin and GMV integrity; Growth for acquisition; Sales Lead for status hygiene.

## 3. Trust and operations SLOs

| Metric | Target | Owner |
|---|---:|---|
| Visible priced SKUs updated inside the configured freshness window | ≥95% each working day by 10:30 Tehran | Catalog Ops |
| Price displayed after its hide-after threshold | 0 | Engineering + Catalog Ops |
| Published price differing from approved admin value | 0 | Engineering |
| Delivery promise missed after written confirmation | <2% monthly | Sales/Ops |
| Public web/API availability | ≥99.9% monthly | Engineering |
| Server 5xx rate | <0.5% of requests | Engineering |
| Lead records missing source/UTM/first-response timestamp | <1% | Growth + Sales |

## 4. AI quality gates

- Ungrounded numeric claims: **0** across the maintained adversarial suite; any occurrence blocks release.
- Price/tool arithmetic agreement: **100%** on deterministic fixtures.
- First token: p75 <2.0s and p95 <5.0s; complete answer p95 <20s.
- Conversation→lead: ≥8% by day 90, reported separately by intent.
- User-rated helpful: ≥75% positive with ≥50 ratings/month before the percentage is decision-grade.

**Owner:** AI/Product. Source: conversation/tool audit logs plus Matomo `ai-chat` and `lead` events.

## 5. SEO and UX performance gates

- Valid indexed canonical pages / submitted indexable pages: ≥95%; fixture, redirect and 404 URLs in sitemap: 0.
- Core Web Vitals at p75 by mobile route group: LCP <2.5s, INP <200ms, CLS <0.1.
- Server TTFB at p75 <0.8s and p95 <1.5s by route group.
- Form/API error rate <2%; OTP delivery success ≥98%, median delivery ≤20s, reported separately from application errors.

**Owners:** Content/SEO for indexing; Engineering for performance/errors; Auth Ops for SMS delivery.

## 6. Event contract

Required client events: `rail_category_click`, `ai_entry`, `search_use`, `search_suggestion_click`, `ticker_item_click`, `view-product`, `add-to-cart`, `cart_to_request`, `lead`, `alert_set`, `club_join`, `phone-click`, and `whatsapp-click`. Every event carries route; conversion events also carry source/type. Server records remain authoritative for leads, proformas, alerts and membership; client analytics is reconciled weekly and must be within ±5% after bot/ad-blocker exclusions.

Release acceptance:

1. Automated tests prove every declared `data-event` is consumed.
2. A synthetic production journey appears in Matomo within 15 minutes and is tagged as test traffic.
3. Lead, alert and club totals reconcile to database records within ±5% for a complete week.
4. Funnel dashboard shows a denominator at every step; no percentage is calculated from mixed date windows.

## 7. Review cadence and decision rules

- Daily, Catalog Ops: freshness, hidden stale prices, failed imports.
- Daily, Sales Lead: uncontacted leads and response-time SLO.
- Weekly, Growth: full funnel by source, device and AI/table lane; investigate any ≥15% week-over-week fall with ≥100 eligible sessions.
- Weekly, Engineering: availability, errors and p75/p95 web vitals by route group.
- Monthly, Founder/Finance: won orders, GMV, margin, repeat rate and channel contribution.

Every red metric receives an owner, due date and linked issue in the same review. Changes to definitions or targets require a dated decision-log entry; historical dashboards retain the prior definition boundary.

*Ahantime — اول مشورت، بعد خرید.*
