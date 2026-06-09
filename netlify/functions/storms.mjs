// Server-side NHC proxy. The National Hurricane Center's CurrentStorms.json blocks
// browser CORS, so the Ops Center can't read it directly — it would show a dash.
// This function fetches it server-side (no CORS) and returns a real active-storm
// count + basic storm info. Genuinely returns 0 in the off-season (not a failure).

export default async (req) => {
  try {
    const r = await fetch("https://www.nhc.noaa.gov/CurrentStorms.json", {
      headers: { "User-Agent": "AllForwardOpsCenter/1.0 (+https://allforwardllc.com)" },
    });
    if (!r.ok) throw new Error("NHC " + r.status);
    const j = await r.json();
    const storms = (j.activeStorms || []).map((s) => ({
      name: s.name,
      classification: s.classification, // TD / TS / HU / PTC / STS ...
      intensity: s.intensity,           // sustained winds (kt)
      lat: s.latitudeNumeric,
      lon: s.longitudeNumeric,
    }));
    return new Response(JSON.stringify({ count: storms.length, storms }), {
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=600" },
    });
  } catch (e) {
    // count:null signals "feed unavailable" to the client (shows a dash, never breaks).
    return new Response(JSON.stringify({ count: null, storms: [], error: String(e.message || e) }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
};
