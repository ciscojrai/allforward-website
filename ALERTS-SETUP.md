# Ops Center — Disaster Alert Engine Setup

The daily alert engine lives at `netlify/functions/disaster-alerts.mjs`. Once a
day it reads everyone who signed up via the **Activate Alerts** form, checks
OpenFEMA for new disaster declarations in the states + hazards they chose, and
emails each subscriber a digest. It's already deployed — it just won't send
until the three environment variables below are set.

## What it does

1. **Reads subscribers** from the `ops-alerts` Netlify form (name, email, states, hazards).
2. **Polls OpenFEMA** for declarations in the last ~25 hours.
3. **Matches** each declaration against each subscriber's states + hazard types.
4. **Emails** only the people with a match, via Resend, with a link back to `/ops-center/`.

Built on Node's built-in `fetch` — no npm packages, so the zero-build site stays zero-build.

## One-time setup (~15 min)

### 1. Resend (email sending)
1. Create an account at [resend.com](https://resend.com).
2. **Add & verify your domain** `allforwardllc.com` (DNS records in your registrar). This lets mail send from `alerts@allforwardllc.com`.
3. Create an API key → copy it (starts with `re_`).

### 2. Netlify personal access token (reading form submissions)
1. Netlify → **User settings → Applications → Personal access tokens → New access token**.
2. Copy it (you only see it once).

### 3. Site ID
Netlify → your site → **Site configuration → General → Site information → API ID**. Copy it.

### 4. Add environment variables
Netlify → your site → **Site configuration → Environment variables** → add:

| Key | Value |
|-----|-------|
| `RESEND_API_KEY` | `re_...` from step 1 |
| `NETLIFY_AUTH_TOKEN` | token from step 2 |
| `NETLIFY_SITE_ID` | API ID from step 3 |
| `ALERT_FROM` *(optional)* | `All Forward Ops Center <alerts@allforwardllc.com>` |
| `ALERT_TRIGGER_KEY` *(optional)* | any random string — guards the manual send URL |

Then **redeploy** (Deploys → Trigger deploy) so the function picks up the vars.

## Test it without spamming anyone

- **Dry run** (logs who *would* be emailed, sends nothing):
  `https://allforwardllc.com/.netlify/functions/disaster-alerts`
  Returns JSON like `{ "subscribers": 3, "declarations": 5, "emailsSent": 0, "dryRun": true }`.
- **Real manual send** (only if you want to fire it now):
  `https://allforwardllc.com/.netlify/functions/disaster-alerts?send=1&key=<ALERT_TRIGGER_KEY>`

Check **Netlify → Functions → disaster-alerts → logs** to see each run's summary.

## Schedule

Runs daily at **13:00 UTC** (~8–9am US Eastern). Change the cron in the
`export const config = { schedule: "0 13 * * *" }` line at the top of the function.

## Good to know / future upgrades

- **Dedupe window:** the job scans a rolling ~25h window and runs once daily, so
  each declaration is normally emailed once. A declaration landing right at the
  window boundary could, in rare cases, send on two consecutive days. To make it
  exact, add **Netlify Blobs** to record already-sent `disasterNumber`s (small follow-up).
- **Hazard mapping** lives in `HAZARD_KEYWORDS` in the function — extend it if FEMA
  introduces incident types you want routed to a specific hazard bucket.
- **T0 reminder:** independent of this engine, turn on **Netlify → Forms → form
  notifications** so you also get a raw email for every new signup.
