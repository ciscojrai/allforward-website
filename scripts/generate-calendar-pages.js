#!/usr/bin/env node
/* Generates one static, crawlable hazard & funding calendar page per state at
   command-center/calendar/<slug>.html from states.json, and registers them in sitemap.xml.
   Static (server-rendered) so the season tables + FAQ are indexable by Google.
   Run:  node scripts/generate-calendar-pages.js  */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "command-center", "calendar");
const states = JSON.parse(fs.readFileSync(path.join(ROOT, "command-center", "states.json"), "utf8")).states;

const MIDX = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const MABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MFULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const COLORS = { "hurricane": "#dc2626", "tropical-storm": "#dc2626", "wildfire": "#f59e0b", "severe-storm": "#a855f7", "tornado": "#a855f7", "flood": "#0d9488", "drought": "#d4a843", "winter-storm": "#4fc3f7", "mudslide": "#b45309", "earthquake": "#9aa3b8" };
const DEFAULT_SEASON = { "hurricane": "Jun–Nov", "tropical-storm": "Jun–Nov", "wildfire": "Jun–Nov", "severe-storm": "Mar–Jun", "tornado": "Mar–Jun", "flood": "Mar–Jun", "winter-storm": "Nov–Mar", "drought": "Jun–Sep", "mudslide": "Nov–Mar", "earthquake": "" };

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const label = (h) => String(h).replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function parseRange(str) {
  if (!str) return null;
  const p = String(str).split(/[–-]/).map((s) => s.trim().slice(0, 3).toLowerCase());
  const a = MIDX[p[0]], b = MIDX[p[p.length - 1]];
  return (a == null || b == null) ? null : [a, b];
}
function inBand(m, r) { return r && (r[0] <= r[1] ? (m >= r[0] && m <= r[1]) : (m >= r[0] || m <= r[1])); }
function rangeText(r) { return r ? (MFULL[r[0]] + "–" + MFULL[r[1]]) : ""; }

function hazardList(state) {
  const pm = (state.risk_profile && state.risk_profile.peak_months) || {};
  const tops = (state.risk_profile && state.risk_profile.top_disasters) || Object.keys(pm);
  const seen = {};
  return tops.filter((h) => { if (seen[h]) return false; seen[h] = 1; return true; })
    .map((h) => ({ haz: h, str: pm[h] || DEFAULT_SEASON[h] || "", range: parseRange(pm[h] || DEFAULT_SEASON[h]) }))
    .filter((x) => x.range);
}

function bandTable(list) {
  const head = "<tr><th class=\"haz-h\">Hazard</th>" + MABBR.map((m) => `<th title="${m}">${m[0]}</th>`).join("") + "<th></th></tr>";
  const rows = list.map((x) => {
    let cells = "";
    for (let i = 0; i < 12; i++) {
      const on = inBand(i, x.range);
      cells += `<td><div class="cell"${on ? ` style="background:${COLORS[x.haz] || "#9aa3b8"};opacity:.82"` : ""}></div></td>`;
    }
    return `<tr><td class="haz">${esc(label(x.haz))}</td>${cells}<td class="band-range">${esc(rangeText(x.range))}</td></tr>`;
  }).join("");
  return `<table class="bands"><thead>${head}</thead><tbody>${rows}</tbody></table>`;
}

function prose(state, list) {
  return list.map((x) =>
    `<li><span class="hz-dot" style="background:${COLORS[x.haz] || "#9aa3b8"}"></span><strong>${esc(label(x.haz))}</strong> — typically <strong>${esc(rangeText(x.range))}</strong> in ${esc(state.state)}.</li>`
  ).join("");
}

function faqEntries(state, list) {
  // Q&A pairs (also emitted as FAQPage JSON-LD for rich results).
  return list.slice(0, 4).map((x) => ({
    q: `When is ${label(x.haz).toLowerCase()} season in ${state.state}?`,
    a: `In ${state.state}, ${label(x.haz).toLowerCase()} season typically runs ${rangeText(x.range)}. Federal recovery funding windows (FEMA Public Assistance, Hazard Mitigation, and HUD CDBG-DR where appropriated) open after a declaration and close quickly — preparation before the season matters.`
  }));
}

function page(state) {
  const list = hazardList(state);
  const faqs = faqEntries(state, list);
  const hazNames = list.map((x) => label(x.haz).toLowerCase()).join(", ");
  const faqJsonLd = {
    "@context": "https://schema.org", "@type": "FAQPage",
    "mainEntity": faqs.map((f) => ({ "@type": "Question", "name": f.q, "acceptedAnswer": { "@type": "Answer", "text": f.a } }))
  };
  const pageJsonLd = {
    "@context": "https://schema.org", "@type": "WebPage",
    "name": `${state.state} Disaster & Funding Calendar`,
    "url": `https://allforwardllc.com/command-center/calendar/${state.slug}.html`,
    "author": { "@type": "Person", "name": "Francisco Pellerano", "jobTitle": "FEMA-certified Disaster Recovery & Federal Grant Consultant", "url": "https://allforwardllc.com/about-francisco-pellerano", "worksFor": { "@type": "Organization", "name": "All Forward LLC", "url": "https://allforwardllc.com" } }
  };

  const title = `${state.state} Disaster & Funding Calendar 2026 — Hazard Seasons & FEMA Deadlines | Francisco Pellerano`;
  const desc = `${state.state} hazard seasons (${hazNames}) and the federal funding & deadline cycles that follow — when to prepare and when FEMA, HMGP and CDBG-DR money windows open. By FEMA-certified consultant Francisco Pellerano, All Forward LLC.`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-H9P6XK24RX"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-H9P6XK24RX');</script>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="author" content="Francisco Pellerano">
<meta name="keywords" content="${esc(state.state)} hurricane season, ${esc(state.state)} disaster calendar, ${esc(state.state)} FEMA funding, hazard season ${esc(state.state)}, Francisco Pellerano, All Forward LLC">
<link rel="canonical" href="https://allforwardllc.com/command-center/calendar/${state.slug}.html">
<meta name="robots" content="index,follow">
<link rel="icon" href="/favicon.ico">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(state.state)} Disaster & Funding Calendar — Hazard Seasons & FEMA Deadlines">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="https://allforwardllc.com/command-center/calendar/${state.slug}.html">
<meta property="og:image" content="https://allforwardllc.com/og-image.jpg">
<meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="../assets/command-center.css">
<script type="application/ld+json">${JSON.stringify(pageJsonLd)}</script>
<script type="application/ld+json">${JSON.stringify(faqJsonLd)}</script>
<style>
  .cal-wrap{max-width:880px;margin:0 auto;padding:0 18px 60px}
  .cal-intro{padding:30px 0 6px}
  .cal-intro h1{font-size:clamp(1.4rem,3.2vw,2rem);margin:0 0 10px;color:var(--text)}
  .cal-intro p{color:var(--text-2);max-width:720px}
  .crumb{font-size:.75rem;color:var(--text-2);margin-bottom:14px}
  .crumb a{color:var(--blue)}
  .cal-byline{font-size:.8rem;color:var(--text-2);margin-top:10px}
  .cal-card{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:18px 20px;margin:18px 0}
  .cal-card h2{margin:0 0 12px;font-size:1.05rem;color:var(--text)}
  .bands{width:100%;border-collapse:collapse;font-size:.8rem}
  .bands th{color:var(--text-2);font-weight:600;text-align:center;padding:4px 1px;font-size:.7rem}
  .bands th.haz-h,.bands td.haz{text-align:left;white-space:nowrap;padding-right:10px;color:var(--text);min-width:120px}
  .bands td{padding:3px 1px}
  .cell{height:16px;border-radius:3px;background:rgba(255,255,255,.05)}
  .band-range{color:var(--text-2);font-size:.72rem;padding-left:10px;white-space:nowrap}
  .hz-list{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:9px}
  .hz-list li{color:var(--text-2)}
  .hz-dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:9px;vertical-align:middle}
  .fund-list{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:13px}
  .fund-list li{display:flex;gap:11px;align-items:flex-start}
  .fund-list .ft{color:var(--text);font-weight:600}
  .fund-list .fd{color:var(--text-2);font-size:.85rem}
  .faq h3{font-size:.96rem;color:var(--text);margin:16px 0 6px}
  .faq p{color:var(--text-2);margin:0 0 4px}
  .cal-cta{display:inline-block;background:var(--blue);color:#fff !important;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600;margin:8px 10px 0 0}
  .cal-cta.ghost{background:transparent;border:1px solid var(--border);color:var(--text) !important}
  .cal-note{color:var(--text-2);font-size:.74rem;margin-top:10px}
  @media(max-width:600px){ .bands th.haz-h,.bands td.haz{min-width:88px;font-size:.74rem} .band-range{display:none} }
</style>
</head>
<body class="ops">
<header class="ops-header">
  <div class="wrap">
    <div class="ops-title"><span class="live-dot" aria-hidden="true"></span><div><h1>The Command Center</h1><span class="sub">Live U.S. Disaster Intel</span></div></div>
    <div class="brand"><a class="home-link" href="/command-center/">← Dashboard</a><a class="home-link" href="/"><img src="/logo.png" alt="All Forward logo" style="height:34px;width:auto;vertical-align:middle;margin-left:14px"></a></div>
  </div>
</header>
<main>
  <div class="cal-wrap">
    <div class="cal-intro">
      <div class="crumb"><a href="/command-center/">Command Center</a> / <a href="/command-center/calendar/">Calendar</a> / ${esc(state.state)}</div>
      <h1>${esc(state.state)} Disaster &amp; Funding Calendar</h1>
      <p>When ${esc(state.state)}'s hazards peak — and when the federal money windows open. The recurring hazard seasons (${esc(hazNames)}) alongside the SAM.gov, FEMA and grant deadlines that decide who's ready when disaster strikes.</p>
      <p class="cal-byline">Maintained by <a href="/about-francisco-pellerano"><strong>Francisco Pellerano</strong></a> — FEMA-certified disaster recovery &amp; federal grant consultant, All Forward LLC.</p>
    </div>

    <div class="cal-card">
      <h2>${esc(state.state)} hazard seasons — 12-month view</h2>
      ${bandTable(list)}
    </div>

    <div class="cal-card">
      <h2>Peak windows</h2>
      <ul class="hz-list">${prose(state, list)}</ul>
    </div>

    <div class="cal-card">
      <h2>💰 Funding &amp; deadline cycles</h2>
      <ul class="fund-list">
        <li><span>🔁</span><div><div class="ft">SAM.gov registration renewal — annual</div><div class="fd">Lapses lock you out of federal contracts &amp; grants. Renew ~60 days before expiry.</div></div></li>
        <li><span>🏛️</span><div><div class="ft">FEMA Public Assistance &amp; HMGP — post-declaration</div><div class="fd">Windows open after a ${esc(state.state)} disaster is declared and close fast. Watch the <a href="/command-center/">live map</a> for new declarations.</div></div></li>
        <li><span>🏗️</span><div><div class="ft">HUD CDBG-DR — appropriation-driven</div><div class="fd">Funds follow major disasters via Congressional appropriation; action-plan deadlines follow.</div></div></li>
        <li><span>📅</span><div><div class="ft">Federal fiscal year — Oct 1</div><div class="fd">Grant cycles and mitigation notices (BRIC) reset. Position before Q4.</div></div></li>
      </ul>
      <a class="cal-cta" href="/command-center/#alerts">Get ${esc(state.state)} deadline &amp; declaration alerts →</a>
    </div>

    <div class="cal-card faq">
      <h2>${esc(state.state)} hazard season FAQ</h2>
      ${faqs.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join("")}
    </div>

    <div class="cal-card">
      <a class="cal-cta ghost" href="/command-center/${state.slug}.html">${esc(state.state)} recovery profile &amp; FEMA history →</a>
      <a class="cal-cta ghost" href="/command-center/">Open the live map →</a>
      <div class="cal-note">Seasons are typical historical windows for planning, not forecasts. For live conditions, see the <a href="/command-center/">Command Center</a>.</div>
    </div>
  </div>
</main>
</body>
</html>
`;
}

// --- generate pages ---
let written = 0;
const urls = [];
for (const state of states) {
  if (!state.slug) continue;
  fs.writeFileSync(path.join(OUT_DIR, state.slug + ".html"), page(state));
  urls.push(`https://allforwardllc.com/command-center/calendar/${state.slug}.html`);
  written++;
}

// --- register in sitemap.xml (idempotent) ---
const smPath = path.join(ROOT, "sitemap.xml");
let sm = fs.readFileSync(smPath, "utf8");
let added = 0;
const block = urls.filter((u) => !sm.includes(u)).map((u) =>
  `  <url>\n    <loc>${u}</loc>\n    <lastmod>2026-06-09</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>`
).join("\n");
if (block) { sm = sm.replace("</urlset>", block + "\n</urlset>"); fs.writeFileSync(smPath, sm); added = block.split("<url>").length - 1; }

console.log(`Generated ${written} calendar pages. Added ${added} sitemap entries.`);
