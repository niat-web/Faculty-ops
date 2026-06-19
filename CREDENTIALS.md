# Credentials & Environment Variables

Everything you need to configure for **FacultyOps**. Copy `.env.example` → `.env`
and fill these in. The app runs locally with almost none of them set (it falls
back to an in-memory database and logs emails to the console).

> ⚠️ Never commit `.env`. It is git-ignored. Share secrets through a vault, not chat.

---

## 1. Core — required for production

| Variable | Required | What it is / where to get it |
|---|---|---|
| `MONGODB_URI` | ✅ Prod | MongoDB connection string. From **MongoDB Atlas → Database → Connect → Drivers**. Include the DB name, e.g. `...mongodb.net/instructor_crm`. Leave blank locally to use the in-memory DB. |
| `JWT_SECRET` | ✅ Prod | Secret used to sign login sessions. Generate a long random string: `openssl rand -hex 32`. |
| `APP_URL` | ✅ Prod | Public base URL of the app, e.g. `https://crm.yourdomain.com`. Used in email links and the Google redirect URI. Defaults to `http://localhost:3000`. |

---

## 2. Email (AWS SES) — optional

Without these, emails (approvals, reminders, password resets) are **logged to the
console** instead of sent. Add them to send real email.

| Variable | What it is / where to get it |
|---|---|
| `AWS_REGION` | SES region, e.g. `ap-south-1`. |
| `AWS_ACCESS_KEY_ID` | IAM access key with `ses:SendEmail`. **AWS Console → IAM → Users → Security credentials.** |
| `AWS_SECRET_ACCESS_KEY` | Secret for the above access key. |
| `SES_FROM_EMAIL` | A **verified** SES sender address/domain, e.g. `no-reply@yourdomain.com`. Verify in **AWS Console → SES → Verified identities**. |

---

## 3. Google sign-in (OAuth) — optional

Enables the **"Continue with Google"** button. Until set, the button shows a
friendly "not set up yet" message. Sign-in only succeeds for an email that
**already exists** as an active user (access stays admin-managed).

| Variable | What it is / where to get it |
|---|---|
| `GOOGLE_CLIENT_ID` | OAuth client ID. |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret. |
| `GOOGLE_REDIRECT_URI` | Optional. Only set if your callback differs from the default. |

### How to get the Google credentials
1. Go to **Google Cloud Console → APIs & Services → Credentials**.
2. **Configure the OAuth consent screen** (Internal is fine for an org) — scopes `email`, `profile`, `openid`.
3. **Create Credentials → OAuth client ID → Web application.**
4. Under **Authorized redirect URIs**, add exactly:
   - `http://localhost:3000/api/auth/google/callback` (local)
   - `https://<your-domain>/api/auth/google/callback` (production)
5. Copy the **Client ID** and **Client secret** into `.env`.
6. The redirect URI defaults to `${APP_URL}/api/auth/google/callback`. Override with `GOOGLE_REDIRECT_URI` only if needed.

---

## 4. Security & operations — optional

| Variable | Default | What it is |
|---|---|---|
| `ENCRYPTION_KEY` | (off) | Enables AES-256-GCM **encryption-at-rest** for sensitive fields (payroll, UID, etc.). Use `openssl rand -hex 32`. New sensitive values encrypt on write; existing plaintext stays readable. |
| `CRON_SECRET` | (off) | Shared secret the scheduler sends to trigger reminders. Send as header `x-cron-secret: <value>` or `?secret=<value>` to `/api/cron/reminders`. Ops Admins can also run it in-app. |
| `RETENTION_DAYS` | `1095` | Retention window (days) for exited instructors used by `npm run retention`. |

### Reminders scheduling
- **Vercel:** `vercel.json` already defines a daily cron at 06:00 hitting `/api/cron/reminders`.
- **Self-hosted:** add a cron job, e.g.
  `curl -H "x-cron-secret: $CRON_SECRET" https://<your-domain>/api/cron/reminders`

---

## 5. Seed / bootstrap — optional

| Variable | Default | Used by |
|---|---|---|
| `SEED_ADMIN_EMAIL` | `ops@org.in` | `npm run seed` (full demo org). |
| `SEED_ADMIN_PASSWORD` | `password` | `npm run seed`. |

To create just a super-admin on a real DB: `npm run create-admin`
(override with `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME`).

---

## Quick checklist for going live
- [ ] `MONGODB_URI` → your Atlas cluster (+ DB name)
- [ ] `JWT_SECRET` → long random value
- [ ] `APP_URL` → your real domain
- [ ] (email) `AWS_*` + `SES_FROM_EMAIL`, sender verified in SES
- [ ] (Google) `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`, redirect URI registered
- [ ] (security) `ENCRYPTION_KEY`, `CRON_SECRET`
- [ ] Run `npm run create-admin` once to create your first login
- [ ] Add the production IP/`0.0.0.0/0` in **Atlas → Network Access**
- [ ] Remove demo/test data (users `*@crm.com` except your real admin; instructors `NW10001–NW10006`)
