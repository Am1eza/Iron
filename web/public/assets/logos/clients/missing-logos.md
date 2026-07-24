# Missing client logos

19 of 21 logos are now in place. The 2026-07-24 pass ran from a server inside
Iran, so the previously geo-blocked official sites were reachable; 15 logos
were fetched, optimized (webp, max height 96px, q82; one clean SVG) and wired
into `index.ts`.

## Still missing (2)

| Company | Slug | Reason |
|---------|------|--------|
| Esfahan Alloy Steel | `esfahan-alloy-steel` | No URL in manifest. Likely official site www.sfae.ir times out even from inside Iran. No fa/en Wikipedia page, no official Aparat channel; directory pages (iranestekhdam, fooladino) only carry factory photos, not a logo. |
| Faradast Energy Falat | `faradast-energy-falat` | No URL in manifest. Candidate domains (faradastenergy.com, fefalat.com, fef.co.ir) are dead or time out. No Wikipedia page, no official Aparat channel; company registries (rasmio, vlist, parsjahd) show no logo. |

## Notes on obtained logos

- `sina-port-marine.svg` — the site's PNG logo is **white-on-transparent**
  (invisible on a light surface); the SVG variant used instead is dark blue
  (#0c3b78) and safe on light backgrounds.
- `torc.webp` and `pgsoc.webp` came from the companies' **official Aparat
  channel avatars** (JPEG, opaque white background — they render as small
  square tiles, not transparent marks). torc.ir and www.pgsoc.ir remained
  unreachable/behind an ArvanCloud JS challenge even from inside Iran.
- `pasargad-alloy-steel.webp` (60x56) and `mibic.webp` (68x68) are the largest
  copies the official sites serve — small but genuine.
- `dashtestan-cement.webp` is 214x60 (site's own header logo; no larger copy).

## How to add one

Drop the official logo into this folder as `<slug>.svg` (preferred) or
`<slug>.webp`/`.png`, then set `hasLogo: true` for that entry in `index.ts`.
