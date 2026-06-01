# Deploy allforwardllc.com — Terminal Guide (GitHub → Netlify)

Step-by-step terminal commands to push site updates to your GitHub repo and have Netlify auto-deploy them. Once set up, every future update is just **3 commands**.

Your site folder: `~/Documents/Claude/Projects/allforward/allforwardwebsite`

---

## A. One-time setup (do this once)

### 1. Install the tools (macOS)

```bash
# Install Homebrew if you don't have it
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install git, GitHub CLI, and Netlify CLI
brew install git gh
npm install -g netlify-cli
```

### 2. Sign in to GitHub and Netlify

```bash
gh auth login          # choose: GitHub.com → HTTPS → login with browser
netlify login          # opens a browser to authorize Netlify
```

### 3. Turn the site folder into a Git repo and push it to GitHub

```bash
cd ~/Documents/Claude/Projects/allforward/allforwardwebsite

git init
git add .
git commit -m "Initial commit: All Forward website"

# Create the GitHub repo and push in one step (public repo named allforward-website)
gh repo create allforward-website --public --source=. --remote=origin --push
```

### 4. Connect that repo to Netlify (auto-deploy on every push)

```bash
# Still inside the allforwardwebsite folder:
netlify init
```

Answer the prompts:
- **Create & configure a new site** → yes
- **Team** → your team
- **Site name** → `allforward` (or leave blank for a random name)
- **Build command** → leave blank and press Enter (this is a static HTML site, no build step)
- **Directory to deploy** → `.` (a single dot — the current folder)

That links the GitHub repo to Netlify. From now on, **any push to GitHub auto-publishes**.

### 5. Point your custom domain (one time, in the dashboard)

```bash
netlify open      # opens your site's Netlify dashboard
```

In the dashboard: **Domain management → Add a domain → `allforwardllc.com`**, then follow Netlify's DNS instructions (either point your registrar's nameservers to Netlify, or add the A/CNAME records they show you). HTTPS is issued automatically.

---

## B. Every time you update the site (the routine)

After you change `index.html`, swap the logo, etc., run these three commands from the site folder:

```bash
cd ~/Documents/Claude/Projects/allforward/allforwardwebsite

git add .
git commit -m "Describe what you changed, e.g. updated logo + field manual section"
git push
```

That's it. Netlify detects the push and redeploys in ~30–60 seconds. Watch it:

```bash
netlify watch        # shows the live deploy progress
```

---

## C. Optional: deploy instantly without GitHub

If you just want to push the current folder live immediately (skips Git):

```bash
cd ~/Documents/Claude/Projects/allforward/allforwardwebsite
netlify deploy --prod --dir=.
```

Use this for a quick one-off. The GitHub route in section B is better for keeping a version history.

---

## D. Handy commands

| Command | What it does |
|---|---|
| `git status` | See which files changed before committing |
| `git log --oneline` | View your update history |
| `netlify open` | Open the Netlify dashboard |
| `netlify deploy --prod --dir=.` | Force an immediate production deploy |
| `netlify watch` | Watch the current deploy finish |
| `gh repo view --web` | Open your GitHub repo in the browser |

---

## E. Files in this folder that get deployed

- `index.html` — the site
- `favicon.ico`, `apple-touch-icon.png`, `logo-mark.png` — icons / logo (updated to the new All Forward logo)
- `robots.txt`, `sitemap.xml` — SEO
- `New Logo.png` — source logo (kept for reference)

**Tip:** add a `.gitignore` so junk files don't get committed:

```bash
cd ~/Documents/Claude/Projects/allforward/allforwardwebsite
printf ".DS_Store\nnode_modules/\n*.log\n" > .gitignore
git add .gitignore && git commit -m "Add gitignore" && git push
```

---

### Troubleshooting

- **`git push` asks for a password** → you didn't finish `gh auth login`. Re-run it and choose HTTPS + browser login.
- **Netlify shows the old version** → hard-refresh the browser (Cmd+Shift+R) or run `netlify deploy --prod --dir=.`.
- **Domain not secure / no HTTPS yet** → DNS can take up to a few hours to propagate; Netlify issues the certificate automatically once it resolves.
