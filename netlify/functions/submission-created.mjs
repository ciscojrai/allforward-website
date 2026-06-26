// Fires automatically on every Netlify form submission (Netlify event function).
// For the "ops-alerts" signup it sends a double-opt-in confirmation email with a
// signed link. The subscriber only becomes active after clicking it (see confirm.mjs).
// Other forms (and the already-confirmed form) are ignored.

import crypto from "node:crypto";

const SITE = "https://allforwardllc.com";
const DEFAULT_FROM = "All Forward Ops Center <alerts@allforwardllc.com>";

function b64url(s) { return Buffer.from(s).toString("base64url"); }
function sign(data, secret) { return crypto.createHmac("sha256", secret).update(data).digest("base64url"); }
function asArray(v) {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === "string") return v.split(",").map((x) => x.trim()).filter(Boolean);
  return [];
}

async function sendEmail(to, subject, html, text) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("Missing RESEND_API_KEY");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.ALERT_FROM || DEFAULT_FROM, to: [to], subject, html, text }),
  });
  if (!res.ok) throw new Error(`Resend failed: ${res.status} ${await res.text()}`);
}

export default async (req) => {
  try {
    const body = await req.json();
    const payload = body.payload || body;
    if (!payload || payload.form_name !== "ops-alerts") {
      return new Response("ignored");
    }
    const d = payload.data || {};
    const email = String(d.email || "").trim();
    if (!email) return new Response("no email");

    const secret = process.env.ALERT_CONFIRM_SECRET;
    if (!secret) throw new Error("Missing ALERT_CONFIRM_SECRET");

    const token = {
      n: String(d.name || "").trim(),
      e: email,
      s: asArray(d.states).map((x) => x.toUpperCase()),
      h: asArray(d.disaster_types).map((x) => x.toLowerCase()),
      ts: Date.now(),
    };
    const data = b64url(JSON.stringify(token));
    const sig = sign(data, secret);
    const link = `${SITE}/.netlify/functions/confirm?d=${data}&t=${sig}`;

    const html = `<div style="font-family:Arial,Helvetica,sans-serif;background:#0a1422;color:#e8edf5;padding:28px;border-radius:12px;max-width:560px">
      <h2 style="margin:0 0 8px;color:#fff">Confirm your disaster alerts</h2>
      <p style="color:#9fb0c6;margin:0 0 20px">One click and you're set — we'll only email you about FEMA declarations in the states and hazards you chose.</p>
      <a href="${link}" style="display:inline-block;background:#f57c00;color:#fff;text-decoration:none;padding:13px 26px;border-radius:6px;font-weight:bold">Confirm my alerts →</a>
      <p style="color:#7a8aa0;font-size:12px;margin:22px 0 0">If you didn't request this, just ignore this email — no alerts will be sent. Link expires in 7 days.</p>
      <p style="color:#5a6b82;font-size:11px;margin:10px 0 0">All Forward LLC · allforwardllc.com/command-center</p>
    </div>`;
    const text = `Confirm your All Forward disaster alerts by opening this link (expires in 7 days):\n\n${link}\n\nIf you didn't request this, ignore this email.`;

    await sendEmail(email, "Confirm your All Forward disaster alerts", html, text);
    console.log(`confirmation email sent to ${email}`);
    return new Response("ok");
  } catch (e) {
    console.error("submission-created error:", e);
    return new Response("error: " + (e.message || e), { status: 500 });
  }
};
