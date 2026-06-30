# Missing client logos

These logos could **not** be obtained from the companies' official websites.
Per the task rules, no substitute sources (Google Images, Wikipedia, unofficial
sites) were used — so they are intentionally skipped.

## Root cause
The build/agent environment cannot reach Iranian‑hosted websites: outbound
requests to them time out at the network edge (HTTP `000`), and `azarab.ir`
returns `503` on every attempt. Exa (no API key here) and WebFetch also failed,
and the headless‑browser path is unavailable. The **only** reachable official
site was `parsgarma.com`, whose logo was downloaded successfully.

A reachability sweep of all 21 sites confirmed: **1 reachable** (parsgarma),
**18 unreachable** (`000`), **1 blocked** (`azarab`, `503`), and **2 with no
official URL** to try.

## How to complete these
Drop the official logo file into this folder named `<slug>.svg` (preferred) or
`<slug>.png`, then set `hasLogo: true` for that entry in `index.ts`. The
trusted‑by wall upgrades the name chip to the real logo automatically. (You can
also just upload the files to me and I'll optimize + wire them in.)

| # | Company | Website | Reason |
|---|---------|---------|--------|
| 1 | Kurdestan Cement | https://www.kordestancement.com | Unreachable (HTTP 000 — geo‑restricted egress) |
| 2 | Dashtestan Cement | https://dashtestancement.com | Unreachable (HTTP 000) |
| 3 | Hegmatan Cement | https://www.hegmatancement.com | Unreachable (HTTP 000) |
| 4 | Parsian Construction Development | https://pcdco.org | Unreachable (HTTP 000) |
| 5 | Sina Port & Marine Services Development | https://spmco.co | Unreachable (HTTP 000) |
| 6 | Persi Iran Gas | https://persiirangas.ir | Unreachable (HTTP 000) |
| 7 | Tehran Oil Refining Company | https://www.torc.ir | Unreachable (HTTP 000) |
| 8 | MIBIC (International Building & Industry Co.) | https://mibic.ir | Unreachable (HTTP 000) |
| 9 | Pasargad Alloy Steel | https://www.pascosteel.com | Unreachable (HTTP 000) |
| 10 | Esfahan Alloy Steel | — | No official URL provided; could not confirm an official source (non‑official sources excluded) |
| 11 | Faradast Energy Falat | — | No official URL provided; could not confirm an official source (non‑official sources excluded) |
| 13 | Persian Gulf Petrochemical Industries Co. (PGPIC) | https://pgpic.ir | Unreachable (HTTP 000) |
| 14 | Azarab | http://www.azarab.ir | Blocked — HTTP 503 on every attempt |
| 15 | Shams Energy | https://shams.energy | Unreachable (HTTP 000) |
| 16 | Persian Gulf Star Oil Company | https://www.pgsoc.ir | Unreachable (HTTP 000) |
| 17 | MAPNA Pars Generator Eng. & Mfg. | https://mapnagroup.com/mapnacompanies/mapna-pars | Unreachable (HTTP 000) |
| 18 | Pars Machine Manufacturing | https://mspco.ir | Unreachable (HTTP 000) |
| 19 | National Iranian Steel Industries Group | https://insig.org | Unreachable (HTTP 000) |
| 20 | Karun Agro Industry | https://karuncane.com | Unreachable (HTTP 000) |
| 21 | Imam Khomeini Agro Industry | https://www.ik-sugarcane.ir | Unreachable (HTTP 000) |

> Obtained successfully: **#12 Pars Garma** → `pars-garma.png` (official header
> logo from parsgarma.com, transparent PNG, trimmed).
