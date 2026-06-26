# Poladin — Success Metrics
## Phase 1 · Foundation — #10

**Version:** 1.0 · 26 June 2026
**Companions:** `foundation/business-goals.md`, `product/navigation.md §22` (event instrumentation).
**Purpose:** How we measure success — the north star, the funnel KPIs, business/ops/AI/SEO metrics, guardrails, instrumentation, and cadence. (Numeric targets are placeholders to set with the founder.)

---

## 1. North-Star Metric
**Monthly closed orders facilitated (won leads).**
> It captures *real value* (a purchase happened) and forces the whole funnel to work — traffic, trust, AI, and the human close. Leading indicators below predict it.

## 2. The Funnel (Magnet → Engage → Capture → Convert → Retain)
| Stage | Metric | Definition | Target* |
|---|---|---|---|
| **Magnet** | organic sessions; ticker/طلا‌و‌ارز entries | top-of-funnel reach | grow MoM |
| | avg. session duration | "stays a few minutes" goal | ↑ |
| **Engage** | AI conversations started / completed | advisor adoption & quality | high completion |
| | price-page sessions; tools used (وزن‌سنج/پروژه‌سنج) | depth | ↑ |
| **Capture** | leads created (ثبت درخواست) | qualified demand | core driver |
| | alerts set; club sign-ups; phone reveals/WhatsApp hand-offs | identity capture | ↑ |
| **Convert** | **lead → sales-qualified → won** | the money step (offline) | ↑ % |
| | time-to-پیش‌فاکتور; quote→order | speed/efficiency | ↓ time |
| **Retain** | returning visitors; repeat-purchase rate | stickiness | ↑ |
| | alert open rate; club active members | re-engagement | ↑ |

\*Set concrete numbers with the founder before launch; track MoM trend first.

## 3. Business Metrics
Closed orders / **GMV** · **AOV** · **margin per order/ton** · **lead→won %** · **repeat-purchase rate** · **CAC** (≈ low via organic) · **LTV**.

## 4. Operational Metrics (trust depends on these)
- **Price freshness:** % SKUs updated today (target high, e.g., ≥95%).
- **Time-to-publish** the daily price set.
- **Lead response time** (sales callback).
- **Uptime / data availability** (ticker, AI).

## 5. AI Quality Metrics (the differentiator must be trustworthy)
- **Zero ungrounded numbers** (hard gate; adversarial test set).
- **Intent-first compliance** (asks purpose before quoting).
- **Conversation→lead rate**; **fallback rate** (missing-data → callback).
- **CSAT / helpfulness** (thumbs / short survey).

## 6. SEO Metrics (the acquisition lifeblood)
- Organic sessions & **share of traffic**; **rankings** for قیمت میلگرد/تیرآهن…; **indexed pages** (SKU/category/article); CTR; Core Web Vitals (LCP/CLS within budget).

## 7. Guardrail Metrics (don't win one by breaking another)
- Bounce rate; client/API error rate; AI latency (first token < 2s); complaint rate; stale-price incidents (should be ~0).

## 8. Instrumentation
- **Events** (per `navigation §22`): `rail_category_click`, `ai_entry`, `search_use`, `ticker_item_click`, `lead_created`, `alert_set`, `club_join`, `quote_built`, plus funnel-stage events.
- **Tooling:** privacy-respecting web analytics + a CRM pipeline (lead→won) + an ops dashboard (price freshness, time-to-publish). Reconcile lead/order numbers with the CRM.
- **Dashboards:** Funnel (by stage & persona/lane: AI vs tables), Business (orders/GMV/margin/repeat), Ops (freshness/response), AI quality.

## 9. Cadence & Ownership
- **Daily:** ops (price freshness, leads, errors).
- **Weekly:** funnel + AI quality + SEO trend.
- **Monthly:** business review (north star, GMV, retention) → roadmap adjustments.
- Each metric has an owner; regressions are tracked as issues.

## 10. Definition of "winning" (Phase-1)
A steady, **growing flow of qualified leads converting to orders**, with **fresh prices**, a **grounded, trusted AI**, **rising organic share**, and **early repeat/club signals** — proving the funnel and the model before scaling to web/mobile apps and new revenue lines.

*Poladin — اول مشورت، بعد خرید.*
