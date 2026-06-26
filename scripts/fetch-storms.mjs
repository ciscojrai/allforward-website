// Build-time NHC storm fetch — replaces the per-visitor netlify/functions/storms.mjs.
// Run on a schedule by .github/workflows/update-storms.yml; writes the static file
// command-center/storms.json, which command-center.js reads directly (no Netlify function,
// zero invocation cost). Mirrors the transform the old function used so the client
// shape is unchanged: { count, storms: [{name, classification, intensity, lat, lon}] }.
//
// Cost discipline: the file is rewritten ONLY when the storm data changes. Off-season
// (0 storms) the data is identical every run, so nothing is committed and Netlify never
// redeploys. updated_at is refreshed only alongside a real data change, so it can't cause
// spurious hourly commits.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../command-center/storms.json", import.meta.url));
const NHC = "https://www.nhc.noaa.gov/CurrentStorms.json";

function dataKey(obj) {
  // Compare only the storm data — never updated_at — so timestamp churn can't trigger a commit.
  return JSON.stringify({ count: obj.count, storms: obj.storms });
}

async function main() {
  let res;
  try {
    res = await fetch(NHC, {
      headers: { "User-Agent": "AllForwardOpsCenter/1.0 (+https://allforwardllc.com)" },
    });
    if (!res.ok) throw new Error("NHC HTTP " + res.status);
  } catch (e) {
    // Don't overwrite last-known-good on a feed outage. Warn (visible in the Actions run)
    // and exit 0 so the workflow stays green and the existing file is preserved.
    console.log(`::warning::NHC fetch failed (${e.message}); keeping last-known-good storms.json`);
    return;
  }

  const j = await res.json();
  const storms = (j.activeStorms || []).map((s) => ({
    name: s.name,
    classification: s.classification, // TD / TS / HU / PTC / STS ...
    intensity: s.intensity,           // sustained winds (kt)
    lat: s.latitudeNumeric,
    lon: s.longitudeNumeric,
  }));
  const next = { count: storms.length, storms };

  let prev = null;
  try {
    prev = JSON.parse(readFileSync(OUT, "utf8"));
  } catch {
    // No existing file (first run) — fall through and write.
  }

  if (prev && dataKey(prev) === dataKey(next)) {
    console.log(`No change (${next.count} active system${next.count === 1 ? "" : "s"}); nothing to write.`);
    return;
  }

  const payload = { ...next, updated_at: new Date().toISOString() };
  writeFileSync(OUT, JSON.stringify(payload, null, 2) + "\n");
  console.log(`Wrote storms.json — ${next.count} active system${next.count === 1 ? "" : "s"}.`);
}

main().catch((e) => {
  console.log(`::warning::Unexpected error (${e.message}); keeping last-known-good storms.json`);
});
