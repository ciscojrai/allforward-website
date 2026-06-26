// Double-opt-in confirmation endpoint. The link in the confirmation email points
// here with a signed (HMAC) token. We verify the signature — so links can't be
// forged for an address that never received one — then record the subscriber in
// the "ops-alerts-confirmed" form, which is the ONLY list the daily alert engine
// reads. This is what guarantees only verified, consenting addresses get alerts.

import crypto from "node:crypto";

const SITE = "https://allforwardllc.com";
const CONFIRMED_PAGE = "/command-center/alerts-confirmed.html";
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;

function sign(data, secret) { return crypto.createHmac("sha256", secret).update(data).digest("base64url"); }

function page(title, msg, ok) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<link rel="stylesheet" href="/command-center/assets/command-center.css"></head>
<body class="ops"><main><div class="wrap" style="padding:80px 24px;text-align:center;max-width:600px">
<div style="font-size:3rem;margin-bottom:16px">${ok ? "✅" : "⚠️"}</div>
<h2 style="margin:0 0 12px">${title}</h2><p style="color:var(--text-2)">${msg}</p>
<p style="margin-top:28px"><a class="drawer-cta" style="display:inline-block;padding:12px 26px" href="/command-center/">← Back to the Command Center</a></p>
</div></main></body></html>`;
}

export default async (req) => {
  const secret = process.env.ALERT_CONFIRM_SECRET;
  const url = new URL(req.url);
  const d = url.searchParams.get("d") || "";
  const t = url.searchParams.get("t") || "";

  const fail = (msg) =>
    new Response(page("That link didn't work", msg, false), {
      status: 400, headers: { "Content-Type": "text/html" },
    });

  if (!secret) return fail("Server isn't configured yet. Please try again later.");
  if (!d || !t) return fail("The confirmation link is incomplete.");

  // Verify signature (timing-safe).
  const expected = sign(d, secret);
  const a = Buffer.from(t), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return fail("This confirmation link is invalid or has been tampered with.");
  }

  let token;
  try { token = JSON.parse(Buffer.from(d, "base64url").toString("utf8")); }
  catch { return fail("The confirmation link is malformed."); }

  if (!token.ts || Date.now() - token.ts > MAX_AGE_MS) {
    return fail("This confirmation link has expired. Please sign up again.");
  }
  if (!token.e) return fail("The confirmation link is missing an email.");

  // Record into the confirmed list (a separate Netlify form the engine reads).
  try {
    const formBody = new URLSearchParams({
      "form-name": "ops-alerts-confirmed",
      name: token.n || "",
      email: token.e,
      states: (token.s || []).join(","),
      disaster_types: (token.h || []).join(","),
    });
    const res = await fetch(`${SITE}/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formBody.toString(),
    });
    if (!res.ok && res.status !== 200 && res.status !== 302) {
      console.error("confirmed-form post status", res.status);
    }
    console.log(`confirmed subscriber ${token.e}`);
  } catch (e) {
    console.error("confirm record error:", e);
    return fail("We couldn't record your confirmation. Please try the link again.");
  }

  // Success → show the confirmed page.
  return new Response(null, { status: 302, headers: { Location: CONFIRMED_PAGE } });
};
