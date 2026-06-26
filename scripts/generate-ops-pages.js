#!/usr/bin/env node
/* All Forward — Command Center per-state page generator.
 *
 * Reads command-center/states.json (the single source of truth), pulls real
 * historical FEMA declaration data per state from the public OpenFEMA API,
 * and stamps 51 crawlable static pages at command-center/<slug>.html. Live data
 * still hydrates client-side on the main board; these pages exist for SEO and
 * as a no-JS fallback, so all stats are baked into static HTML text.
 *
 * Run:  node scripts/generate-ops-pages.js
 * Safe to re-run. If FEMA is unreachable for a state, that page is still
 * written using the static reference data with a graceful note.
 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OPS = path.join(ROOT, "command-center");
const FEMA = "https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries";
const SITE = "https://allforwardllc.com";
const NOW = new Date();

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function cap(s) { return s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : s; }
function hz(h) { return cap(String(h).replace(/-/g, " ")); }
function fmtDate(s) { if (!s) return "—"; const d = new Date(s); return isNaN(d) ? "—" : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }); }

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchJson(url, attempts = 6) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { headers: { "Accept": "application/json" } });
      if (!res.ok) throw new Error("FEMA " + res.status);
      return await res.json();
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) await sleep(1500 * Math.pow(2, i)); // 1.5,3,6,12,24s
    }
  }
  throw lastErr;
}

async function fetchState(code) {
  const url = FEMA + "?$filter=" + encodeURIComponent("state eq '" + code + "'") +
    "&$orderby=declarationDate desc&$top=1000" +
    "&$select=disasterNumber,declarationType,declarationDate,incidentType,declarationTitle,fyDeclared";
  const j = await fetchJson(url);
  const rows = j.DisasterDeclarationsSummaries || [];
  const seen = {}, uniq = [];
  for (const d of rows) { if (seen[d.disasterNumber]) continue; seen[d.disasterNumber] = 1; uniq.push(d); }
  const cutoff = new Date(NOW); cutoff.setMonth(cutoff.getMonth() - 24);
  const recent = uniq.filter(d => new Date(d.declarationDate) >= cutoff);
  const byType = {};
  for (const d of uniq) { const t = d.incidentType || "Other"; byType[t] = (byType[t] || 0) + 1; }
  const types = Object.keys(byType).map(t => ({ type: t, n: byType[t] })).sort((a, b) => b.n - a.n);
  return { total: uniq.length, recent, types, latest: uniq[0] || null, ok: true };
}

function page(s, stats) {
  const top = (s.risk_profile.top_disasters || [])[0] || "disaster";
  const title = `${s.state} Disaster Recovery & FEMA Funding Guide | Francisco Pellerano · All Forward`;
  const desc = `${s.state} federal disaster recovery brief by Francisco Pellerano of All Forward LLC: ${stats.total != null ? stats.total + " FEMA declarations on record, " : ""}top hazards (${(s.risk_profile.top_disasters || []).map(hz).join(", ")}), CDBG-DR and FEMA funding programs, and the state emergency-management directory.`;
  const url = `${SITE}/command-center/${s.slug}.html`;

  const declRows = (stats.recent || []).slice(0, 12).map(d =>
    `<tr><td>${esc(d.declarationTitle || cap(d.incidentType || "Disaster"))}</td><td>${esc(cap(d.incidentType || "—"))}</td><td>DR-${esc(d.disasterNumber)}</td><td>${esc(fmtDate(d.declarationDate))}</td></tr>`
  ).join("\n") || `<tr><td colspan="4" style="color:var(--text-2)">No federally declared disasters in the last 24 months${stats.ok ? "" : " (live FEMA data unavailable at build time)"}.</td></tr>`;

  const typeRows = (stats.types || []).slice(0, 10).map(t =>
    `<tr><td>${esc(cap(t.type))}</td><td>${t.n}</td></tr>`
  ).join("\n") || `<tr><td colspan="2" style="color:var(--text-2)">Historical breakdown unavailable.</td></tr>`;

  const fundingRows = (s.funding_programs || []).map(p =>
    `<tr><td>${esc(p.program)}</td><td>${esc(p.agency)}</td><td>${esc(String(p.status).replace(/-/g, " "))}</td></tr>`
  ).join("\n");

  const peakRows = Object.keys(s.risk_profile.peak_months || {}).map(k =>
    `<tr><td>${esc(hz(k))}</td><td>${esc(s.risk_profile.peak_months[k])}</td></tr>`
  ).join("\n");

  const orgs = (s.local_orgs || []).map(o =>
    `<li><a href="${esc(o.url)}" target="_blank" rel="noopener">${esc(o.name)}</a></li>`
  ).join("\n");

  const totalTxt = stats.total != null ? String(stats.total) : "—";
  const recentTxt = stats.recent ? String(stats.recent.length) : "—";

  const author = {
    "@type": "Person",
    "name": "Francisco Pellerano",
    "url": `${SITE}/about-francisco-pellerano`,
    "jobTitle": "FEMA-certified Disaster Recovery & Federal Grant Consultant",
    "worksFor": { "@type": "Organization", "name": "All Forward LLC", "url": SITE }
  };
  const ld = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": `${s.state} Disaster Recovery & FEMA Funding Guide`,
    "about": `Federal disaster recovery and FEMA funding in ${s.state}`,
    "url": url,
    "dateModified": NOW.toISOString().slice(0, 10),
    "author": author,
    "publisher": { "@type": "Organization", "name": "All Forward LLC", "url": SITE },
    "breadcrumb": {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Command Center", "item": `${SITE}/command-center/` },
        { "@type": "ListItem", "position": 2, "name": s.state, "item": url }
      ]
    }
  };
  const personLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    "name": "Francisco Pellerano",
    "url": `${SITE}/about-francisco-pellerano`,
    "jobTitle": "FEMA-certified Disaster Recovery & Federal Grant Consultant",
    "worksFor": { "@type": "Organization", "name": "All Forward LLC", "url": SITE },
    "knowsAbout": ["FEMA Public Assistance", "HUD CDBG-DR", "Hazard Mitigation", `Disaster Recovery in ${s.state}`, "Federal Grant Management"]
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-H9P6XK24RX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-H9P6XK24RX');
</script>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="author" content="Francisco Pellerano">
<link rel="canonical" href="${url}">
<meta name="robots" content="index,follow">
<link rel="icon" href="/favicon.ico">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(s.state)} Disaster Recovery & FEMA Funding | Francisco Pellerano · All Forward">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/og-image.jpg">
<meta property="article:author" content="Francisco Pellerano">
<link rel="stylesheet" href="assets/command-center.css">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<script type="application/ld+json">${JSON.stringify(personLd)}</script>
</head>
<body class="ops">
<header class="ops-header">
  <div class="wrap">
    <div class="ops-title">
      <span class="live-dot" aria-hidden="true"></span>
      <div><h1>The Command Center</h1><span class="sub">Live U.S. Disaster Intel</span></div>
    </div>
    <div class="brand">
      <select class="lang-selector" id="global-lang-select" aria-label="Select Language" onchange="window.setGlobalLanguage(this.value)">
        <option value="en">🇺🇸 EN</option><option value="es">🇪🇸 ES</option><option value="fr">🇫🇷 FR</option><option value="de">🇩🇪 DE</option><option value="it">🇮🇹 IT</option><option value="pt">🇵🇹 PT</option><option value="ar">🇸🇦 AR</option><option value="zh-CN">🇨🇳 ZH</option><option value="el">🇬🇷 EL</option>
      </select>
      <a class="home-link" href="/"><img src="/logo.png" alt="All Forward logo"></a>
    </div>
  </div>
</header>
<main class="wrap">
  <div class="sp-hero">
    <div class="crumb"><a href="/command-center/">Command Center</a> › ${esc(s.state)}</div>
    <h1>${esc(s.state)} Disaster Recovery &amp; FEMA Funding</h1>
    <p class="lede">Federal disaster recovery intelligence for ${esc(s.state)} (${esc(s.code)}) — historical FEMA declarations, hazard risk profile, and the federal funding programs that follow a disaster. Need to pursue recovery work here? <strong>Francisco Pellerano</strong> and the All Forward team help organizations win and manage FEMA, HUD, and CDBG-DR funding.</p>
    <p class="byline" style="font-size:.82rem;color:var(--text-2);margin-top:10px">By <a href="/about-francisco-pellerano"><strong>Francisco Pellerano</strong></a> — FEMA-certified disaster recovery &amp; federal grant consultant, All Forward LLC.</p>
  </div>

  <div class="sp-grid">
    <div class="sp-card"><div class="kpis">
      <div class="kpi"><div class="n">${totalTxt}</div><div class="t">FEMA declarations on record</div></div>
      <div class="kpi"><div class="n">${recentTxt}</div><div class="t">Declarations · last 24 mo</div></div>
    </div></div>
    <div class="sp-card">
      <h2>Top Hazards</h2>
      <p style="margin:0;color:var(--text-2)">${(s.risk_profile.top_disasters || []).map(h => `<span class="chip hz" style="display:inline-block;margin:3px 4px 0 0">${esc(hz(h))}</span>`).join("")}</p>
    </div>

    <div class="sp-card full">
      <h2>Recent FEMA Declarations (last 24 months)</h2>
      <table class="sp"><thead><tr><th>Title</th><th>Incident</th><th>Disaster #</th><th>Declared</th></tr></thead>
      <tbody>${declRows}</tbody></table>
    </div>

    <div class="sp-card">
      <h2>Historical Declarations by Incident Type</h2>
      <table class="sp"><thead><tr><th>Incident type</th><th>Declarations</th></tr></thead>
      <tbody>${typeRows}</tbody></table>
    </div>
    <div class="sp-card">
      <h2>Peak Hazard Months</h2>
      <table class="sp"><thead><tr><th>Hazard</th><th>Peak window</th></tr></thead>
      <tbody>${peakRows || '<tr><td colspan="2" style="color:var(--text-2)">—</td></tr>'}</tbody></table>
    </div>

    <div class="sp-card full">
      <h2>Federal Recovery Funding Programs</h2>
      <table class="sp"><thead><tr><th>Program</th><th>Agency</th><th>Availability</th></tr></thead>
      <tbody>${fundingRows}</tbody></table>
      <p style="font-size:.74rem;color:var(--text-2);margin:12px 0 0">Availability reflects program eligibility. FEMA PA/IA and HMGP are unlocked by a Presidential declaration; HUD CDBG-DR is appropriated by Congress for catastrophic events.</p>
    </div>

    <div class="sp-card">
      <h2>State Emergency Management</h2>
      <ul style="margin:0;padding-left:18px;line-height:2">${orgs}</ul>
    </div>
    <div class="sp-card sp-cta">
      <h2>Pursuing recovery work in ${esc(s.state)}?</h2>
      <p style="color:var(--text-2)">All Forward helps you stand up, win, and manage federal recovery funding — from declaration to closeout.</p>
      <a class="drawer-cta" href="/strike-pack.html?state=${esc(s.code)}&hazard=${esc(top)}">Get the ${esc(s.state)} Strike Pack →</a>
      <a class="drawer-cta gold" href="/#services">See All Forward services</a>
    </div>
  </div>
</main>
<footer class="ops-footer">
  <div class="wrap">
    <div>© ${NOW.getFullYear()} All Forward LLC · <a href="/">allforwardllc.com</a> · <a href="/about-francisco-pellerano">Francisco Pellerano</a>
      <div class="disclaimer">Compiled by Francisco Pellerano. Historical figures sourced from FEMA OpenFEMA (public). Stamped ${esc(fmtDate(NOW))}. For situational awareness and planning only — not an official emergency service.</div>
    </div>
    <div><a href="/command-center/">← Command Center</a></div>
  </div>
</footer>
<style>.skiptranslate,.goog-te-banner-frame,#goog-gt-tt,.goog-te-balloon-frame{display:none!important}body{top:0!important}[dir="rtl"]{text-align:right}[dir="rtl"] .lang-selector{direction:ltr}</style>
<div id="google_translate_element" style="display:none;"></div>
<script>function googleTranslateElementInit(){new google.translate.TranslateElement({pageLanguage:'en',includedLanguages:'en,es,fr,de,it,pt,ar,zh-CN,el',layout:google.translate.TranslateElement.InlineLayout.SIMPLE},'google_translate_element')}</script>
<script src="//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit"></script>
<script>(function(){var s=localStorage.getItem("ops-language")||"en";window.addEventListener("DOMContentLoaded",function(){var sel=document.getElementById("global-lang-select");if(sel)sel.value=s;if(s==="ar")document.documentElement.setAttribute("dir","rtl")});window.setGlobalLanguage=function(v){localStorage.setItem("ops-language",v);document.documentElement.setAttribute("dir",v==="ar"?"rtl":"ltr");var g=document.querySelector(".goog-te-combo");if(g){g.value=v;g.dispatchEvent(new Event("change"))}else window.location.reload()};var t=setInterval(function(){var g=document.querySelector(".goog-te-combo");if(g){clearInterval(t);if(g.value!==s){g.value=s;g.dispatchEvent(new Event("change"))}}},150);setTimeout(function(){clearInterval(t)},8000)})()</script>
</body>
</html>
`;
}

async function main() {
  const data = JSON.parse(fs.readFileSync(path.join(OPS, "states.json"), "utf8"));
  const states = data.states || [];
  // Full-payload cache (default): the FEMA data for each state is cached in
  // .fema-cache.json so template/SEO changes re-render every page WITHOUT re-hitting
  // FEMA (which rate-limits batch runs hard). FORCE=1 refetches everything.
  const force = process.env.FORCE === "1";
  const cachePath = path.join(OPS, ".fema-cache.json");
  let cache = {};
  if (!force && fs.existsSync(cachePath)) {
    try { cache = JSON.parse(fs.readFileSync(cachePath, "utf8")); } catch (e) {}
  }
  const snapshot = {};
  let fetched = 0, fromCache = 0, failed = 0;
  for (const s of states) {
    let stats;
    if (!force && cache[s.code] && cache[s.code].total != null) {
      stats = cache[s.code];            // re-render from cache, no network
      fromCache++;
      process.stdout.write("=");
    } else {
      try {
        stats = await fetchState(s.code);
        cache[s.code] = stats;
        fetched++;
      } catch (e) {
        console.warn("  ! FEMA fetch failed for " + s.code + ": " + e.message);
        stats = { total: null, recent: [], types: [], latest: null, ok: false };
        failed++;
      }
      await sleep(3000); // be polite to OpenFEMA — wide spacing avoids batch throttling
      process.stdout.write(".");
    }
    fs.writeFileSync(path.join(OPS, s.slug + ".html"), page(s, stats));
    snapshot[s.code] = {
      total: stats.total,
      recent: stats.recent ? stats.recent.length : null,
      latest: stats.latest ? { title: stats.latest.declarationTitle, type: stats.latest.incidentType, date: stats.latest.declarationDate, dr: stats.latest.disasterNumber } : null
    };
  }
  fs.writeFileSync(cachePath, JSON.stringify(cache));
  console.log("\n(" + fromCache + " re-rendered from cache, " + fetched + " fetched live, " + failed + " fallback)");
  snapshot._generated = NOW.toISOString();
  fs.writeFileSync(path.join(OPS, "live-snapshot.json"), JSON.stringify(snapshot, null, 0));
  console.log("\nGenerated " + states.length + " pages (" + (fetched + fromCache) + " with FEMA data, " + failed + " fallback). Snapshot + cache written.");
}

main().catch(e => { console.error(e); process.exit(1); });
