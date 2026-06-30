# Ahantime — User Journey Maps
## Phase 1 · Foundation — #4

**Version:** 1.0 · 26 June 2026
**Companions:** `product/user-prioritization.md` (personas), `product/ux-flow.md` (detailed step flows).
**Purpose:** The *high-altitude* journey — how each primary persona moves from first contact to purchase and beyond — with emotions, pain points (today), and the Ahantime moment that wins them. (Step-level flows live in `ux-flow.md`.)

### The macro funnel (all personas)
**Magnet → Engage → Capture → Convert → Retain.** Every feature serves one stage; every journey below maps onto it.

---

## Journey A — آقای کریمی · Individual Builder (Tier 1, the AI's audience)
*Building one home; doesn't know steel; afraid of being overcharged.*

| Stage | Goal | Actions / touchpoints | Feeling | Pain today | Ahantime moment | Stage metric |
|---|---|---|---|---|---|---|
| **Awareness** | understand what/how much | Google «چقدر میلگرد برای خونه» → lands on a guide/AI | confused, cautious | jargon, no guidance | **AI «آهن‌تایم»** greets, asks intent | organic entry, AI start |
| **Consideration** | estimate & cost | tells AI متراژ/طبقات → gets BOM + weight + cost | reassured | can't estimate; fears being cheated | **پروژه‌سنج / grounded estimate** | conversation completion |
| **Decision** | trust the price | sees transparent price + زمان تحویل + trust signals | confident | opaque markups | **transparency + delivery time + eNamad/logos** | quote built |
| **Purchase** | order safely | «دریافت پیش‌فاکتور» → OTP → پیش‌فاکتور via SMS → sales calls | relieved | phone-only, anxious | **warm human close, armed with context** | lead → won |
| **Retain** | future needs | alerts, club, content | valued | forgotten by sellers | **alerts / باشگاه / reorder** | repeat, club join |

**Moment of truth:** the AI turning "I don't know what to buy" into a clear, trusted plan.

---

## Journey B — رضا · Contractor / پیمانکار (Tier 1, the volume buyer)
*Buys by the ton, weekly; knows specs; wants speed + reliable delivery + credit.*

| Stage | Goal | Actions | Feeling | Pain today | Ahantime moment | Metric |
|---|---|---|---|---|---|---|
| **Awareness** | today's price | SEO «قیمت میلگرد امروز» / Telegram → price table | hurried | phoning around | **fast price tables (Datasheet) + rail** | price-page sessions |
| **Consideration** | compare & plan | filters, نوسان, **زمان تحویل**, cart multiple SKUs | focused | no delivery clarity | **delivery-time + inquiry cart** | cart adds |
| **Decision** | lock & request | «ثبت درخواست» from cart → پیش‌فاکتور | decisive | price moves intraday | **quote-validity lock + پیش‌فاکتور** | request submitted |
| **Purchase** | buy on terms | sales calls; credit (چک/LC) | in control | cash-flow pressure | **credit options + reliable delivery** | lead → won, AOV |
| **Retain** | re-buy fast | alerts, reorder, dedicated advisor | loyal | starts over each time | **alerts + reorder + club** | repeat rate |

**Moment of truth:** pricing and requesting a multi-ton order in ~2 minutes, with a delivery date.

---

## Journey C — نازنین · Price-Checker → Lead (Tier 2, the funnel's mouth)
*Came only for the dollar/gold.* Awareness: **نبض بازار / طلا و ارز**. Hook: cross-link «قیمت آهن امروز» + **set a price alert** (OTP) → identity captured → re-engaged later → becomes a Builder/Contractor lead. *Metric: FX-page → alert/identity-capture rate, return visits.*

## Journey D — حسن · Trader (Tier 2, high frequency)
Lives in daily prices: **ticker + tables + charts + alerts (+ Telegram bot)**. Retained by frequency and reliability; converts on real buys. *Metric: return frequency, alerts set.*

## Journey E — مهندس سارا · Engineer/Architect (Tier 2, influencer)
Specs structures: **وزن‌سنج / پروژه‌سنج / standards / certs / guides**. Doesn't always buy but **decides what's bought** → winning the engineer wins the contractor's order. *Metric: tool usage, assisted-influence.*

---

## Cross-journey insights
- **Two doors, always open:** Builders enter via the **AI**; Pros/Traders via the **price tables** — the dual-mode home serves both (User Prioritization).
- **The capture step is universal:** OTP + alerts + cart + club turn anonymous interest into a known, re-marketable contact.
- **The close stays human** (traditional buyers) — but the sales team arrives *informed* (context-rich lead), which is the conversion edge.
- **No dead-ends:** every empty/error/stale moment offers a request or the AI (empty-states).

## Friction points to design against (verified in flows)
1. Intraday price changes → **quote-lock + human confirm**.
2. Guest friction at request → **lightweight OTP**, draft preserved.
3. AI accuracy fear → **grounded numbers + callback fallback**.
4. Trust on first order → **transparency + delivery-time + guarantee + logos**.

*Ahantime — اول مشورت، بعد خرید.*
