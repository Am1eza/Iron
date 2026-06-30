# Client logos — collection report

## Summary
- **Companies processed:** 21 (company #22 intentionally excluded)
- **Logos obtained:** 4
- **SVG:** 0
- **PNG:** 4 (`pars-garma`, `pgpic`, `azarab`, `mapna-pars`)
- **Missing:** 17 (see `missing-logos.md`)

## What was obtained
| Company | File | Source | Notes |
|---------|------|--------|-------|
| Pars Garma | `pars-garma.png` | Official site — parsgarma.com `/Portals/0/logo.png` | Transparent, trimmed (251×65). |
| Persian Gulf Petrochemical (PGPIC) | `pgpic.png` | Persian Wikipedia infobox logo (`Pgpic-logo.png`) | Official corporate logo; trimmed, web-sized. |
| Azarab | `azarab.png` | Persian Wikipedia infobox logo (`Azarab-Logo.jpg`) | Official corporate logo; trimmed, web-sized. |
| MAPNA Pars | `mapna-pars.png` | Persian Wikipedia (`Mapna-Logo-Farsi.jpg`) | MAPNA group brand mark (MAPNA Pars is a MAPNA subsidiary); trimmed, web-sized. |

> Only `parsgarma.com` of the official sites was reachable from this environment.
> The other three were sourced from **Persian Wikipedia** (logos hosted on the
> globally-reachable `upload.wikimedia.org`), as you requested. One Wikipedia
> candidate (National Steel Group / `Folad_melli.jpg`) was a foundry **photo**,
> not a logo, so it was rejected and that company stays a name chip.

## Issues encountered
- **Official Iranian sites are geo-blocked here** — 18 of 21 returned HTTP `000`
  and `azarab.ir` `503`. Wikipedia/Wikimedia is reachable, which is how 3 of the
  4 logos were obtained.
- Most cement / oil / agro companies on the list **have no Persian Wikipedia
  page**, so no reachable official logo was found for them.

## Verification (obtained files)
- All four open correctly in Pillow and `file` (valid PNG, not corrupt).
- `pars-garma` and `pgpic` keep an alpha channel; `azarab`/`mapna-pars` are on a
  solid white field (shown inside white logo cells, so they blend cleanly).
- Visually confirmed each is the company's real corporate logo (not a favicon,
  social, partner, certification icon, or a photo).
- Filenames are unique, lowercase kebab-case; dimensions capped to ≤520px.

## Integration
- All 21 companies are listed in `index.ts`. The home page renders them in an
  **auto-advancing carousel** (`ClientCarousel`): one row, moves to the next
  logo every 5s, with prev/next buttons, pause-on-hover, edge fade, and a
  reduced-motion-safe mode. Companies with a logo show it; the rest show a clean
  name chip that upgrades the instant a file is added.

## To finish the set
Add each missing logo as `<slug>.svg` (preferred) or `<slug>.png` in this folder
and set `hasLogo: true` in `index.ts`. Easiest from inside Iran or by uploading
the files here. `index.ts` already has the exact `slug` for every company.
