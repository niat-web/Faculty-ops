# Deploying FacultyOps

Two separate apps share one MongoDB Atlas database:

| Part | Folder | Host | URL example |
|------|--------|------|-------------|
| Frontend (React/Vite SPA) | `client/` | **Vercel** | `https://facultyops.vercel.app` |
| Backend (Express/Node API) | `server/` | **Northflank** | `https://api-xxxx.northflank.app` |
| Database | — | MongoDB Atlas | (same cluster as before) |

The frontend and backend live on **different domains**, so the session cookie is cross-site. The backend already sends it as `SameSite=None; Secure` when `NODE_ENV=production`, and CORS is locked to the `CLIENT_URL` you set. Both hosts serve HTTPS, which the `Secure` cookie requires.

---

## 1. Backend → Northflank

1. **New Service → Deployment → from Git repo**, pick this repo.
2. **Build:** Dockerfile. Set **Build context / Dockerfile path** to `server/` (the [server/Dockerfile](server/Dockerfile)).
3. **Port:** `4000` (HTTP), make it **public**. Note the public URL Northflank gives you.
4. **Environment variables** (Service → Environment):
   ```
   MONGODB_URI   = <your Atlas SRV string>
   JWT_SECRET    = <long random string, 32+ chars>
   NODE_ENV      = production
   CLIENT_URL    = https://<your-vercel-domain>      # exact origin, no trailing slash
   APP_URL       = https://<your-vercel-domain>      # used in emailed links
   PORT          = 4000
   # optional:
   AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, SES_FROM_EMAIL
   ENCRYPTION_KEY, CRON_SECRET, RETENTION_DAYS
   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI
   ```
   > `CLIENT_URL` may be a comma-separated list if you have multiple frontends (e.g. a preview domain).
5. In **Atlas → Network Access**, allow Northflank's egress (or `0.0.0.0/0` for a quick start).
6. Deploy. Check `https://<backend>/api/health` → `{"ok":true}`.

## 2. Frontend → Vercel

1. **Add New Project**, import this repo.
2. **Root Directory:** `client`. Framework preset: **Vite** (auto). Config is in [client/vercel.json](client/vercel.json).
3. **Environment variable:**
   ```
   VITE_API_URL = https://<your-northflank-backend-domain>
   ```
   (no trailing slash; build-time only — redeploy if you change it).
4. Deploy. Open the Vercel URL and log in.

## 3. After both are up

- Set the backend's `CLIENT_URL`/`APP_URL` to the **final** Vercel domain and redeploy the backend (so CORS + cookies match).
- Cron (optional): schedule POSTs to `https://<backend>/api/cron/reminders` and `/api/cron/digest` with header `x-cron-secret: <CRON_SECRET>` (Northflank Jobs or any scheduler).

---

## Local development

```bash
# terminal 1 — API on :4000
cd server && npm install && npm run dev

# terminal 2 — app on :5173 (proxies /api → :4000, so leave VITE_API_URL blank)
cd client && npm install && npm run dev
```
Open http://localhost:5173.

## Troubleshooting cross-origin auth
- **Login succeeds but you're logged out on refresh** → cookie not stored. Confirm backend `NODE_ENV=production` (so `SameSite=None; Secure`), both sides on HTTPS, and `VITE_API_URL` points at the backend.
- **CORS error in console** → `CLIENT_URL` on the backend must exactly equal the Vercel origin (scheme + host, no path/slash).
- **404s on refresh of a deep link** → the SPA rewrite in `client/vercel.json` handles this; make sure Root Directory is `client`.
