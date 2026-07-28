# Collections Dashboard

A standalone React + Vite app for tracking client retainers, one-time
projects, and payment follow-ups.

## Running locally

```bash
npm install
npm run dev
```

Then open the URL it prints (usually http://localhost:5173).

## Deploying to Vercel

**Option A — replace your existing GitHub repo:**
1. Delete everything in your repo except `.git`.
2. Copy all files from this folder into the repo.
3. Commit and push to `main`:
   ```bash
   git add .
   git commit -m "Rebuild as a proper Vite app"
   git push
   ```
4. Vercel will detect it as a Vite project automatically and redeploy.
   No extra configuration needed — build command `npm run build`,
   output directory `dist` are Vite's defaults.

**Option B — deploy directly with the Vercel CLI:**
```bash
npm install -g vercel
vercel --prod
```

## Important: where your data lives

This app saves everything in your **browser's local storage**, tied to
the exact domain you open it on. That means:

- Your data stays on your device — nothing is sent to a server.
- If you open the site on your phone and your laptop, you'll see two
  separate, empty datasets (they don't sync).
- Clearing your browser's site data/cache for this domain will erase
  your records.
- If you ever want data that syncs across devices, that needs a real
  backend (a database) instead of local storage — let me know if you'd
  like that built out.

For a single person checking this from one browser, local storage is
simple and works well. It's just not a shared/multi-device database.
