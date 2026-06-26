# Ahantime — Phase 3 · UI Engineering

**Status:** ✅ Built. A real, reusable component library under `web/src/components/ui/`, exported from one barrel (`@/components/ui`) and validated by a live style guide at **`/styleguide`** (noindex).
**Spec source:** `design/components.md` (A–H, ~56 components), `design/color-system.md`, `design/typography.md`, `design/spacing-system.md`, `design/iconography.md`, `design/motion-design.md`, `design/empty-states.md`.

This phase turns the design system *documents* + *tokens* into **engineered, importable React components** — the kit every feature screen (catalog, AI, commerce, admin) will assemble from. Token-only, RTL-native, WCAG 2.2 AA, reduced-motion aware.

---

## The 10 items — what was built

| # | Item | Deliverable |
|---|---|---|
| 21 | **Design System** | `components/ui/index.ts` barrel + `/styleguide` kitchen-sink + this doc |
| 22 | **Color Tokens** | `ThemeToggle` (light/dark via `:root[data-theme]`), `lib/theme/tokens.ts` (JS/canvas bridge), swatch reference |
| 23 | **Typography** | `Text` · `Heading` · `Overline` · `Num` (bound to `--t-*` tokens; tabular numerals) |
| 24 | **Grid System** | `Container` · `Section` · `Stack` · `Cluster` · `Grid` (auto-fit) · `Divider` |
| 25 | **Spacing** | `Spacer` + every layout prop maps to the 4px `--space-N` scale (no off-grid values) |
| 26 | **Components** | `Button`* · `IconButton` · `Badge`/`CountBadge` · `Chip` · `Card` · `Switch` · `Avatar`/`LogoFrame` · `Tabs`/`TabPanel` · `Breadcrumbs` · `Pagination` · `Alert` · `Tooltip` · `Modal` · `MovementBadge` · `PriceTag` · `DeliveryBadge` |
| 27 | **Icons** | Extended `primitives/icons.tsx` (+~30 icons: filter, sort, download, print, sheet, chart, heart, star, share, phone, whatsapp, telegram, check, info, warning, calendar, clock, plus/minus, trash, edit, external, copy, refresh, offline) + `IBeamGlyph` |
| 28 | **Animations** | `useSpark` (the signature pulse) · `Reveal` (on-scroll fade/slide) — all reduced-motion gated |
| 29 | **Loading States** | `Spinner` · `Skeleton`/`SkeletonText`/`TableSkeleton` (shimmer, static under reduced-motion) |
| 30 | **Empty States** | `EmptyState` (full/section/inline; a11y live region + focus) + `emptyPresets` (exact copy from `empty-states.md §5`) |

\* `Button` already existed (Phase 1); it's re-exported through the barrel so `@/components/ui` is the single door.

---

## Principles encoded

- **Tokens only.** No hardcoded colors, type, spacing, radii, or durations — every component reads semantic tokens, so theming (light/dark) and global tuning are free.
- **States are mandatory.** Each interactive component defines default / hover / press / focus / disabled (+ loading/error where relevant), per `components.md` §H.
- **RTL-native.** Logical properties throughout; directional icons mirror via `.icon--rtl`; switches/thumbs/tooltips account for direction.
- **A11y.** Focus rings everywhere; `IconButton` *requires* a `label`; `Modal` is focus-trapped with Esc/scrim close and focus return; `Tabs` use roving arrow-keys; `EmptyState`/`Alert` announce via live regions; targets ≥44px.
- **Motion is calm and optional.** The Spark ≤300ms; skeleton shimmer, reveal, modal/tooltip transitions all degrade to instant/static under `prefers-reduced-motion`.
- **No dead-ends.** `EmptyState` + `emptyPresets` make every "nothing here" a funnel moment (request / browse / ask آهن‌تایم) with on-brand Persian copy.

## How to use

```tsx
import { Card, Stack, Heading, PriceTag, MovementBadge, Button } from '@/components/ui';

<Card interactive>
  <Stack gap={2}>
    <Heading level={4}>میلگرد ۱۴ A3 ذوب‌آهن</Heading>
    <PriceTag value={32450} />
    <MovementBadge dir="up" pct={0.8} pill />
    <Button>ثبت درخواست</Button>
  </Stack>
</Card>
```

Server vs client: layout/typography/Badge/Card/Breadcrumbs/Pagination/PriceParts/Avatar/Spinner/Skeleton are **Server-Component-safe** (no hooks). Interactive pieces (`Button`, `Chip`, `IconButton`, `Switch`, `Tabs`, `Alert`, `Tooltip`, `Modal`, `EmptyState`, `Reveal`, `ThemeToggle`) are client components and render fine across the boundary.

## Wired into the app

- `app/not-found.tsx` → `EmptyState` + `emptyPresets.notFound()`.
- `app/error.tsx` → `EmptyState` + `emptyPresets.serverError(reset)` + `reportError`.
- `app/loading.tsx` → `Skeleton` + `TableSkeleton` (anti-flash).
- `Header` utility nav → `ThemeToggle` (dark mode reachable in the real UI).
- `/styleguide` → renders the whole kit (colors, type, buttons, badges, chips, price parts, tabs, breadcrumbs, pagination, alerts, tooltip, modal, loading, empty states, reveal) and toggles theme.

## Files added (Phase 3)

```
web/src/components/ui/
  index.ts                     barrel (the one import surface)
  Layout.{tsx,module.css}      Container/Section/Stack/Cluster/Grid/Divider/Spacer
  Typography.{tsx,module.css}  Text/Heading/Overline/Num
  Badge.{tsx,module.css}       Badge/CountBadge
  Chip.{tsx,module.css}
  Card.{tsx,module.css}
  IconButton.{tsx,module.css}
  Switch.{tsx,module.css}
  Avatar.{tsx,module.css}      Avatar/LogoFrame
  PriceParts.{tsx,module.css}  MovementBadge/PriceTag/DeliveryBadge
  Tabs.{tsx,module.css}        Tabs/TabPanel
  Breadcrumbs.{tsx,module.css}
  Pagination.{tsx,module.css}
  Alert.{tsx,module.css}
  Tooltip.{tsx,module.css}
  Modal.{tsx,module.css}
  EmptyState.{tsx,module.css}
  emptyPresets.ts
  Spark.tsx                    useSpark hook
  Reveal.{tsx,module.css}
  Spinner.{tsx,module.css}
  Skeleton.{tsx,module.css}    Skeleton/SkeletonText/TableSkeleton
  ThemeToggle.{tsx,module.css}
web/src/lib/theme/tokens.ts    JS/canvas token bridge + chart palette
web/src/app/styleguide/        page.tsx (noindex) + StyleGuide.tsx + styleguide.module.css
```
Modified: `primitives/icons.tsx` (+~30 icons + IBeamGlyph), `app/{not-found,error,loading}.tsx`, `Header` (ThemeToggle).

> **Next phase:** assemble these primitives into the **feature screens** — the price Datasheet (E1) behind the rail, the AI conversation view (F1/F2), and the request→پیش‌فاکتور commerce flow (F3/F4/F7).

*Ahantime — اول مشورت، بعد خرید.*
