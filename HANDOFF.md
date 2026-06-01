# HANDOFF — finish All Forward deploy (toxiccheatcode-style)

You are Claude Code running on the user's Mac in this folder:
`~/Documents/Claude/Projects/allforward/allforwardwebsite`

## Goal
Get **allforwardllc.com** serving THIS folder via a **GitHub repo connected to Netlify with continuous deploy** — the same simple setup as the user's `toxiccheatcode` site (GitHub account: **ciscojrai**). After this, the only thing the user ever does to update the site is `git push`.

## Current state (already done)
- All site files in this folder are final and correct, including the company logo, which is now **embedded inline as a data URI inside `index.html`** (nav + footer) so it cannot 404. Do NOT revert that.
- `netlify.toml` is set to a static publish (`publish = "."`, no build, no redirects). Leave as-is.
- A GitHub repo already exists: **github.com/ciscojrai/allforward-website** (default branch `master`). It may be STALE / missing the inline-logo fix — re-push from this folder to be safe.
- The domain's DNS is already pointed at Netlify from the registrar (Squarespace). Do not change DNS.

## Things to clean up / avoid
- There is a throwaway Netlify project named **stellular-pony-bb1611** created earlier via CLI. The user wants it GONE.
- `allforwardllc.com` is currently still attached to a DIFFERENT old Netlify project, which causes "Another project is already using this domain." That domain must be removed from the old project before it can attach to the new GitHub-connected one.
- Do not use pasted API tokens. Use browser-based auth (`gh auth login`, and the Netlify dashboard or `netlify login`).

## Steps for you to execute
1. **Push latest files to GitHub** (make the repo match this folder):
   ```
   cd ~/Documents/Claude/Projects/allforward/allforwardwebsite
   git add -A
   git commit -m "Final site: inline logo, clean netlify config"
   git push origin master    # if remote/auth missing: gh auth login, then add remote and push
   ```
   Confirm the pushed `index.html` contains `data:image/png;base64` (the inline logo).

2. **Connect Netlify to the repo (continuous deploy)** — preferred via dashboard so it uses the GitHub App:
   - app.netlify.com → Add new site → **Import an existing project** → GitHub → `ciscojrai/allforward-website`
   - Build command: **(blank)**, Publish directory: **`.`** → Deploy.
   (CLI alternative: `netlify login` then `netlify init` and link to the existing repo.)

3. **Free up the domain**: in Netlify → **Domains** tab, find the old project holding `allforwardllc.com` → remove the domain from it. Then delete the **stellular-pony-bb1611** project.

4. **Attach the domain** to the new GitHub-connected site: Domain management → Add domain → `allforwardllc.com` (+ `www`). DNS is already set, so let Netlify verify and auto-issue HTTPS.

5. **Verify**: load https://allforwardllc.com — the All Forward logo should show in the nav and footer, brand reads "All Forward" (no "LLC"), and the SAM.gov Field Manual section links to Gumroad.

## After this
Future updates = edit files in this folder → `git add -A && git commit -m "..." && git push`. Netlify auto-deploys in ~30–60s. No tokens, no CLI deploys, no Manus.
