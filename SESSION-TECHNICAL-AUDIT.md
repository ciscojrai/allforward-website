# Technical Audit & Activity Summary — All Forward Web Session

> **Scope note:** This audit covers the **web-development session** for the All Forward site
> (Ops Center build, SEO, Google Analytics, Netlify Forms, Resend DNS, alert functions, CSP,
> GitHub visibility). It does **not** include any macOS malware/persistence investigation —
> no `com.lemon.lvoverseas`/CapCut container, no `simple-repair-script.js`, no `AllForwardLLC`
> LaunchAgents, no deleted plists, no Docker/Time Machine work, and **no files were deleted**.
> Those items did not occur in this session and are explicitly marked "not observed" below.

---

## 1. System Errors & Crashes Encountered
- **OpenFEMA HTTP 503 rate-limiting** during batch page generation — `! FEMA fetch failed for TN: FEMA 503`; first run 25/51 live, 26 fallback; throttling hit a contiguous alphabetical block (IL–TN) then recovered (TX–WY live).
- **`ReferenceError: ok is not defined`** in `scripts/generate-ops-pages.js` — threw on the final summary log line *after* all pages/snapshot were written (cosmetic); fixed by replacing `ok` with `fetched + fromCache`.
- **Concurrent-process race** — a second generator was launched before the first finished; both wrote `live-snapshot.json`. Resolved by `kill <pid>` + refactor to a cached/incremental generator.
- **`netlify env:list` interactive-prompt hang** (from pasted terminal output) — re-run in `--json` mode.
- **NHC `CurrentStorms.json` → 503 / browser-CORS block** — expected; the storms module degrades to "—" by design.
- **No `ECONNREFUSED` / port-binding blocks occurred.** Preview server bound to port 8765 cleanly.

## 2. User & AI Mistakes
- **AI:** launched a second `node generate-ops-pages.js` while the first was running → snapshot race (corrected).
- **AI:** first Netlify form-notification save bound to **"Any form"** instead of `ops-alerts` (custom-dropdown click didn't register) → caught on re-inspection, re-saved via keyboard.
- **AI:** clicking the native `<select>` dismissed the notification modal and dropped the typed email → reopened and refilled.
- **AI:** one `Edit` on `ops-center/index.html` failed (stale `old_string` — icon lines between anchors) → re-read, used smaller anchors.
- **Tooling:** `curl`/`wget` blocked by the context-mode hook → switched to `fetch`.
- **User:** pasted **two live secrets** (`nfp_…` Netlify token, `re_…` Resend key) directly into chat — flagged as exposure.
- **No "deceptive browser-extension ad-page download" occurred.** The only extension artifacts were the user's own installed Chrome extensions (e.g. `aitopia`) appearing as benign `chrome-extension://` requests in one network capture — not a download, not malware.

## 3. Security Findings & Risks Identified
- **Unprotected manual-send trigger (real, now fixed):** `disaster-alerts?send=1` would have fired real emails to all subscribers because `ALERT_TRIGGER_KEY` was unset. Now set; public GET returns `"unauthorized — no action taken"`.
- **Missing `.gitignore` `.env` rule (open):** with agents running `git add .`, a stray local `.env` could be committed to the public repo.
- **Public GitHub repo (`ciscojrai/allforward-website`):** scanned current tree **and full history** — **zero** secrets (`re_`, `nfp_`, AWS, private keys); pasted keys not present. Recommended going Private to protect SEO/business logic, not for leak reasons.
- **Secrets pasted in chat:** the Netlify token and Resend key are in the transcript → **rotate**.
- **DNS / email integrity risk (avoided):** Resend tried to add an inbound `MX @` on the root that would have overridden Google Workspace MX — **skipped**; only `send.*` + `resend._domainkey` subdomain records added. Verified root MX still `smtp.google.com`.
- **Headers:** base security headers (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`) added site-wide; **enforcing CSP** added scoped to `/ops-center/*`.
- **NOT OBSERVED:** any macOS persistence mechanism, hidden container, LaunchAgent, or obfuscated script.

## 4. Files & Directories Deleted
- **None.** No files, hidden folders, plists, or config directories were deleted or unlinked in this session.
- Only non-filesystem removal: **one stray `node` generator process killed** (`kill 35108`) — a process, not a file.
- Generated `ops-center/*.html` were **overwritten** by regeneration, not deleted.
- *(Persistent memory references a prior "Complete/ folder file-recovery incident" from June 16 — historical memory, not an event in this session.)*

## 5. Odd Occurrences & Anomalies
- **OpenFEMA throttling that self-recovered mid-run** — a contiguous alphabetical block failed while states before/after succeeded.
- **`live-snapshot.json` timestamp jump** — caused by the two-generator race (02:41 → 02:44 from overlapping writes).
- **Unusually fast DNS propagation** — Resend records resolved publicly in **under 60 seconds** after saving in Squarespace.
- **GA `/g/collect` returned 503** once in a network capture (transient GA-side).
- **NOT OBSERVED:** a deleted app reappearing, mismatched system metadata vs. today's timestamps, or silent background executions (the only background runs were Bash tasks explicitly launched and reported).

## 6. Current Safe State & Hardened Protections
- **Web app (real, current):** enforcing CSP on `/ops-center/*` (allowlist verified live; data + drawer still load); base security headers site-wide; manual-send locked behind `ALERT_TRIGGER_KEY`; double-opt-in (HMAC-signed confirm tokens, verified list only); all 5 Netlify env vars set; `alerts-cron` Scheduled (next run Jun 10 08:00 ET); Resend domain verifying; Google Workspace email intact; no secrets in repo/history.
- **macOS / Docker Desktop / background-task hardening: NOT APPLICABLE** — none was performed in this session.

## 7. Immediate Actionable Next Steps
1. **Add `.gitignore`** with `.env*` (and similar) — prevents accidental secret commits.
2. **Rotate both pasted keys** — regenerate the Netlify PAT and Resend API key, update the Netlify env vars.
3. **Set GitHub repo → Private** (repo → Settings → Danger Zone → Change visibility). Netlify keeps deploying.
4. **Run the live end-to-end test** — signup → confirmation email → click → verify subscriber lands in `ops-alerts-confirmed`.
5. **Confirm Resend domain shows "Verified"** (records are live; awaiting Resend's poll).
6. **Time Machine / malware verification: NOT APPLICABLE** — no security loop of that kind is open from this session.
