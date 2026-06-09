# All Forward — Netlify Deploy via GitHub (Terminal Guide)

## One-Time Setup (do this once)

### 1. Install Git (if not already)
```bash
git --version
# If not installed: brew install git
```

### 2. Connect your local folder to the GitHub repo
```bash
cd ~/path/to/allforwardwebsite   # navigate to your website folder
git init
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git branch -M main
```

### 3. Connect Netlify to GitHub (do in browser, one time)
1. Go to [netlify.com](https://netlify.com) → **Add new site** → **Import from Git**
2. Choose **GitHub** → select your repo
3. Set **Publish directory** to `/` (root) — since `index.html` is at the root
4. Click **Deploy site**

Netlify will now auto-deploy every time you push to GitHub. ✓

---

## Every Time You Update the Site

### The 3-Command Deploy
```bash
cd ~/path/to/allforwardwebsite

git add .
git commit -m "describe what you changed"
git push
```

Netlify detects the push and deploys automatically — usually live in under 60 seconds.

---

## Common Update Scenarios

### Update index.html (text, SEO, content)
```bash
# 1. Edit index.html in any text editor
# 2. Then:
git add index.html
git commit -m "update hero text and services section"
git push
```

### Add a new file (PDF, image, guide)
```bash
# Drop the file into the allforwardwebsite folder, then:
git add .
git commit -m "add SAM field manual PDF v2"
git push
```

### Update the logo or favicon
```bash
# Replace logo.png or favicon.ico in the folder, then:
git add logo.png favicon.ico
git commit -m "update logo and favicon"
git push
```

### Update sitemap or robots.txt
```bash
git add sitemap.xml robots.txt
git commit -m "update sitemap with new pages"
git push
```

---

## Check Deploy Status
```bash
# See your recent commits
git log --oneline -5

# See what files changed but haven't been committed
git status

# See Netlify deploy in browser
# → netlify.com → your site → Deploys tab
```

---

## Fix a Mistake (undo last commit before pushing)
```bash
git reset --soft HEAD~1
# This undoes the commit but keeps your changes
# Fix what you need, then re-commit and push
```

## Fix a Mistake (already pushed — revert)
```bash
git revert HEAD
git push
# Creates a new commit that undoes the last one — safe for Netlify
```

---

## Full Deploy Workflow (step by step for beginners)

```bash
# Step 1 — go to your site folder
cd ~/Documents/Claude/Projects/allforward/allforwardwebsite

# Step 2 — check what changed
git status

# Step 3 — stage everything
git add .

# Step 4 — commit with a message
git commit -m "update about section, add new PDF"

# Step 5 — push to GitHub (Netlify auto-deploys)
git push

# Step 6 — wait ~60 seconds, then check allforwardllc.com
```

---

## GitHub Credentials (first push only)

If Git asks for a username/password:
1. Go to GitHub → Settings → Developer settings → Personal access tokens → **Tokens (classic)**
2. Generate a token with `repo` scope
3. Use your GitHub username + the token as the password when prompted
4. Or set up SSH keys for passwordless push: `ssh-keygen -t ed25519 -C "your@email.com"`

---

## Netlify Custom Domain (allforwardllc.com)

If your domain isn't connected yet:
1. Netlify → Site settings → Domain management → Add custom domain
2. Add `allforwardllc.com` and `www.allforwardllc.com`
3. Update your DNS at your registrar to point to Netlify's nameservers
4. Netlify auto-provisions SSL (HTTPS) — no extra steps needed

---

## Quick Reference Card

| Action | Command |
|--------|---------|
| See what changed | `git status` |
| Stage all changes | `git add .` |
| Stage one file | `git add filename.html` |
| Commit | `git commit -m "message"` |
| Push (deploy) | `git push` |
| Pull latest from GitHub | `git pull` |
| See recent commits | `git log --oneline -10` |
| Undo last commit (not pushed) | `git reset --soft HEAD~1` |

---

*Built for All Forward — allforwardllc.com*
