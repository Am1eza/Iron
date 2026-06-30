# Client logos — collection report

## Summary
- **Companies processed:** 21 (company #22 intentionally excluded)
- **Logos downloaded:** 1
- **SVG:** 0
- **PNG:** 1 (`pars-garma.png`)
- **Missing:** 20 (see `missing-logos.md`)

## What was obtained
| Company | File | Format | Source | Notes |
|---------|------|--------|--------|-------|
| Pars Garma | `pars-garma.png` | PNG (RGBA) | parsgarma.com `/Portals/0/logo.png` (official header logo) | Transparent preserved; whitespace trimmed (251×65); not rasterized from vector (site only ships PNG); colors unchanged. |

## Issues encountered
- **Network reachability is the blocker.** The environment cannot reach
  Iranian‑hosted sites — 18 of the 21 official sites returned HTTP `000`
  (connection blocked at the egress), `azarab.ir` returned `503` on every
  attempt, and 2 companies (Esfahan Alloy Steel, Faradast Energy Falat) had no
  official URL to try. Only `parsgarma.com` (200) was reachable.
- **No alternative sources used.** Per the task, Google Images, Wikipedia, and
  unofficial sites were not used. Missing logos are skipped, not substituted.
- **Fetch fallbacks unavailable here:** Exa has no API key in this session,
  `WebFetch` returned 503 for the Iranian hosts, and the headless‑browser MCP
  is not configured — none could bypass the geo‑restriction.

## Verification (for the one downloaded file)
- `file` reports a valid `PNG image data, 251 x 65, 8-bit/color RGBA` — not corrupt.
- Opens correctly in Pillow; alpha channel present → transparency preserved.
- Filename is unique, lowercase kebab‑case.
- Visually confirmed as the official Pars Garma corporate logo (not a favicon,
  social, partner, or certification icon).

## Integration
- All 21 companies are listed in `index.ts`. The trusted‑by wall on the home
  page renders each one in a **rotating (auto‑scrolling) marquee**: companies
  with a logo file show the logo; the rest show a clean, on‑brand name chip and
  upgrade to the real logo automatically once a file is added and `hasLogo` is
  set to `true`.

## To finish the set
Add each missing logo as `<slug>.svg` (preferred) or `<slug>.png` in this
folder and set `hasLogo: true` in `index.ts`. Best done from inside Iran (or by
uploading the files here so I can optimize + wire them in). `index.ts` already
has the exact `slug` for every company.
