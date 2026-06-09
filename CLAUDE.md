# All Forward — Project Guide

Static marketing site for **All Forward LLC** (allforwardllc.com) — disaster recovery & federal grant consulting by **Francisco Pellerano**. Deployed via GitHub → Netlify auto-deploy. See `DEPLOY.md`.

## ⭐ SEO Strategy (apply to ALL new pages)

**Target the founder's name: "Francisco Pellerano"** — personal-brand SEO, same pattern as the homepage. Every page should use **name + keyword + locality**.

On every page include:
- `<title>` containing `Francisco Pellerano` (e.g. `Louisiana Disaster Recovery & FEMA Funding Guide | Francisco Pellerano · All Forward`)
- Meta `description` that names him + the keyword
- `<meta name="author" content="Francisco Pellerano">`
- A **`Person` JSON-LD entity** for Francisco Pellerano (jobTitle: "FEMA-certified Disaster Recovery & Federal Grant Consultant", `url`: `/about-francisco-pellerano`, `worksFor`: All Forward LLC) — this is the E-E-A-T authorship signal
- Open Graph `og:title` / `article:author` with his name
- A **visible byline** crediting him (on-page text matters as much as schema)

Keywords to weave naturally: FEMA, HUD, CDBG-DR, Public Assistance, Hazard Mitigation, federal grants, disaster recovery, SAM.gov. Don't keyword-stuff.

## Rules
- **Do NOT modify the original marketing site** (`index.html`, `strike-pack.html`, `about-francisco-pellerano.html`, `blog/`) unless explicitly asked. New features go in their own directory.
- Adding pages → also add them to `sitemap.xml`.

## Operations Center (`ops-center/`)
Live U.S. disaster-intel dashboard + 51 per-state SEO pages. Live at `/ops-center/`.
- `ops-center/states.json` — single source of truth, 51 jurisdictions (risk profiles, funding programs, state EM orgs).
- `ops-center/index.html` — dashboard: clickable SVG map, 5 live modules, state drawer, Netlify alert form.
- `ops-center/<slug>.html` × 51 — generated SEO pages with real FEMA history.
- `ops-center/assets/` — `ops-center.css`, `ops-center.js`, `us-states-clean.svg`.

**Regenerate the 51 pages:** `node scripts/generate-ops-pages.js`
- Re-renders all 51 from cache (`ops-center/.fema-cache.json`) in <1s, **no network** — use this after any template/SEO edit to `page()` in `scripts/generate-ops-pages.js`.
- `FORCE=1 node scripts/generate-ops-pages.js` refetches live FEMA data from OpenFEMA (only needed to refresh disaster data). OpenFEMA rate-limits batch runs — never run two passes concurrently.

**Live data feeds (client-side JS, no API keys):** FEMA OpenFEMA, NWS alerts, NIFC wildfires all work. **NHC storms shows "—" by design** (NHC blocks browser CORS) — not a bug; handled gracefully.

## Deploy
`git add . && git commit -m "..." && git push` → Netlify auto-deploys (~60s). Publish dir is repo root.
