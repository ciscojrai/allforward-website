// All Forward — Operations Center daily disaster-alert engine.
//
// Runs once a day (Netlify Scheduled Function). For each subscriber of the
// "ops-alerts" form, it checks OpenFEMA for NEW disaster declarations in the
// states + hazard types they selected, and emails them a digest via Resend.
//
// Dependency-free: uses Node's built-in fetch (Netlify runs Node 18+), so the
// site keeps its zero-build, no-package.json setup.
//
// Required environment variables (set in Netlify → Site config → Env vars):
//   RESEND_API_KEY    — Resend API key (re_...). Used to send email.
//   NETLIFY_AUTH_TOKEN— Netlify personal access token. Reads form submissions.
//   NETLIFY_SITE_ID   — This site's API ID (Netlify → Site config → General).
// Optional:
//   ALERT_FROM        — From address, e.g. "All Forward Ops <alerts@allforwardllc.com>"
//                       (defaults below; the domain must be verified in Resend).
//   ALERT_LOOKBACK_HOURS — how far back to scan OpenFEMA (default 25).
//   ALERT_TRIGGER_KEY — if set, manual ?send=1 must also pass &key=<this> to send.
//
// Schedule: 13:00 UTC daily (~8–9am US Eastern). Change in the config export.
// Manual test: GET /.netlify/functions/disaster-alerts            (dry-run; logs who WOULD be emailed)
//              GET /.netlify/functions/disaster-alerts?send=1&key=<ALERT_TRIGGER_KEY>  (really sends)
// The scheduled daily run always sends (Netlify POSTs it with a next_run body).

export const config = { schedule: "0 13 * * *" };

const FEMA_URL = "https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries";
const FORM_NAME = "ops-alerts";
const DEFAULT_FROM = "All Forward Ops Center <alerts@allforwardllc.com>";
const SITE = "https://allforwardllc.com";

// Subscriber hazard value -> keyword(s) matched (case-insensitively) against
// OpenFEMA incidentType (e.g. "Severe Storm(s)", "Fire", "Snowstorm").
const HAZARD_KEYWORDS = {
  hurricane: ["hurricane", "tropical storm", "typhoon", "coastal storm"],
  flood: ["flood"],
  tornado: ["tornado"],
  wildfire: ["fire"],
  "severe-storm": ["severe storm", "severe ice storm", "straight-line", "thunderstorm"],
  "winter-storm": ["snow", "ice storm", "winter", "freezing", "blizzard"],
  earthquake: ["earthquake"],
  drought: ["drought"],
};

function hazardMatches(selected, incidentType) {
  if (!incidentType) return false;
  const it = incidentType.toLowerCase();
  if (selected.includes("all")) return true;
  for (const h of selected) {
    const kws = HAZARD_KEYWORDS[h];
    if (kws && kws.some((k) => it.includes(k))) return true;
  }
  return false;
}

// Normalize a Netlify submission field that may be a string, comma-string, or array.
function asArray(v) {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === "string") return v.split(",").map((x) => x.trim()).filter(Boolean);
  return [];
}

async function getSubscribers() {
  const token = process.env.NETLIFY_AUTH_TOKEN;
  const siteId = process.env.NETLIFY_SITE_ID;
  if (!token || !siteId) throw new Error("Missing NETLIFY_AUTH_TOKEN or NETLIFY_SITE_ID");
  const h = { Authorization: `Bearer ${token}` };

  const formsRes = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}/forms`, { headers: h });
  if (!formsRes.ok) throw new Error(`Netlify forms list failed: ${formsRes.status}`);
  const forms = await formsRes.json();
  const form = forms.find((f) => f.name === FORM_NAME);
  if (!form) {
    console.log(`No "${FORM_NAME}" form found yet (no submissions).`);
    return [];
  }

  const subs = [];
  for (let page = 1; page <= 20; page++) {
    const res = await fetch(
      `https://api.netlify.com/api/v1/forms/${form.id}/submissions?per_page=100&page=${page}`,
      { headers: h }
    );
    if (!res.ok) throw new Error(`Netlify submissions failed: ${res.status}`);
    const batch = await res.json();
    if (!batch.length) break;
    for (const s of batch) {
      const d = s.data || {};
      const email = (d.email || "").trim();
      if (!email) continue;
      subs.push({
        name: (d.name || "").trim(),
        email,
        states: asArray(d.states).map((x) => x.toUpperCase()),
        hazards: asArray(d.disaster_types).map((x) => x.toLowerCase()),
      });
    }
    if (batch.length < 100) break;
  }
  // De-dupe by email (latest submission wins; later pages are older).
  const byEmail = new Map();
  for (const s of subs) if (!byEmail.has(s.email)) byEmail.set(s.email, s);
  return [...byEmail.values()];
}

async function getRecentDeclarations(lookbackHours) {
  const since = new Date(Date.now() - lookbackHours * 3600 * 1000).toISOString();
  const params = new URLSearchParams({
    $filter: `declarationDate ge '${since}'`,
    $orderby: "declarationDate desc",
    $top: "1000",
    $select: "disasterNumber,state,declarationDate,incidentType,declarationTitle",
  });
  const res = await fetch(`${FEMA_URL}?${params}`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`OpenFEMA failed: ${res.status}`);
  const json = await res.json();
  const rows = json.DisasterDeclarationsSummaries || [];
  // Collapse the per-county rows into one entry per (disasterNumber, state).
  const seen = new Map();
  for (const r of rows) {
    const key = `${r.disasterNumber}-${r.state}`;
    if (!seen.has(key)) {
      seen.set(key, {
        disasterNumber: r.disasterNumber,
        state: r.state,
        incidentType: r.incidentType,
        title: r.declarationTitle,
        date: r.declarationDate,
      });
    }
  }
  return [...seen.values()];
}

function buildEmail(sub, matches) {
  const first = sub.name ? sub.name.split(" ")[0] : "there";
  const items = matches
    .map(
      (m) =>
        `<li style="margin:0 0 10px"><strong>${m.state} — ${m.incidentType}</strong><br>` +
        `${m.title} <span style="color:#7a8aa0">(declared ${String(m.date).slice(0, 10)}, FEMA-${m.disasterNumber})</span></li>`
    )
    .join("");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;background:#0a1422;color:#e8edf5;padding:28px;border-radius:12px;max-width:600px">
    <h2 style="margin:0 0 4px;color:#fff">New FEMA disaster declarations in your states</h2>
    <p style="color:#9fb0c6;margin:0 0 18px">Hi ${first} — these were just declared in the areas and hazards you're tracking.</p>
    <ul style="list-style:none;padding:0;margin:0 0 22px">${items}</ul>
    <a href="${SITE}/ops-center/" style="display:inline-block;background:#f57c00;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:bold">Open the Operations Center →</a>
    <p style="color:#7a8aa0;font-size:13px;margin:22px 0 0">Pursuing recovery funding for one of these? Reply to this email or see <a href="${SITE}/strike-pack.html" style="color:#4fc3f7">the Strike Pack</a>. — Francisco Pellerano, All Forward LLC</p>
    <p style="color:#5a6b82;font-size:11px;margin:14px 0 0">You're receiving this because you activated alerts at allforwardllc.com/ops-center.</p>
  </div>`;
  const text =
    `New FEMA disaster declarations in your states:\n\n` +
    matches.map((m) => `- ${m.state} ${m.incidentType}: ${m.title} (declared ${String(m.date).slice(0, 10)}, FEMA-${m.disasterNumber})`).join("\n") +
    `\n\nOpen the Operations Center: ${SITE}/ops-center/\n— Francisco Pellerano, All Forward LLC`;
  return { html, text };
}

async function sendEmail(to, subject, body) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("Missing RESEND_API_KEY");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.ALERT_FROM || DEFAULT_FROM,
      to: [to],
      subject,
      html: body.html,
      text: body.text,
    }),
  });
  if (!res.ok) throw new Error(`Resend failed for ${to}: ${res.status} ${await res.text()}`);
}

export default async (req) => {
  const lookback = Number(process.env.ALERT_LOOKBACK_HOURS || 25);

  // Decide whether to actually send.
  //  - Scheduled invocation: Netlify sends a POST whose JSON body has `next_run`.
  //    These are the real daily runs → SEND.
  //  - Manual browser/GET: dry-run by default. To force a real send, call
  //    ?send=1 and (if ALERT_TRIGGER_KEY is set) &key=<that value>.
  const method = (req.method || "POST").toUpperCase();
  let scheduled = false;
  let manualSend = false;
  let qs = null;
  try { qs = new URL(req.url).searchParams; } catch { qs = null; }
  if (method === "POST") {
    try { const b = await req.json(); if (b && b.next_run) scheduled = true; } catch { /* no body */ }
  }
  if (qs && qs.get("send") === "1") {
    const key = process.env.ALERT_TRIGGER_KEY;
    if (!key || qs.get("key") === key) manualSend = true;
  }
  const dryRun = !(scheduled || manualSend);

  const summary = { subscribers: 0, declarations: 0, emailsSent: 0, dryRun, errors: [] };
  try {
    const [subscribers, declarations] = await Promise.all([
      getSubscribers(),
      getRecentDeclarations(lookback),
    ]);
    summary.subscribers = subscribers.length;
    summary.declarations = declarations.length;

    for (const sub of subscribers) {
      const matches = declarations.filter(
        (d) => sub.states.includes(d.state) && hazardMatches(sub.hazards, d.incidentType)
      );
      if (!matches.length) continue;
      const subject =
        matches.length === 1
          ? `FEMA alert: ${matches[0].incidentType} declared in ${matches[0].state}`
          : `FEMA alert: ${matches.length} new declarations in your states`;
      if (dryRun) {
        console.log(`[dry-run] would email ${sub.email}: ${matches.length} match(es)`);
      } else {
        try {
          await sendEmail(sub.email, subject, buildEmail(sub, matches));
          summary.emailsSent++;
        } catch (e) {
          summary.errors.push(String(e.message || e));
        }
      }
    }
    console.log("disaster-alerts run:", JSON.stringify(summary));
  } catch (e) {
    summary.errors.push(String(e.message || e));
    console.error("disaster-alerts fatal:", e);
  }

  return new Response(JSON.stringify(summary, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
};
