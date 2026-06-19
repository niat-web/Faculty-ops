# Instructor Lifecycle CRM

A production-ready, full-stack CRM that replaces scattered spreadsheets with **one
secure, role-aware profile per instructor** — covering the entire lifecycle from
joining to exit. Built per PRD v3.0.

## Tech stack
- **Next.js 14** (App Router) — landing page + authenticated app + API routes in one deployable
- **MongoDB** via **Mongoose** (flexible documents suit the dynamic-field requirement)
- **AWS SES** for email notifications (graceful no-op until keys are added)
- **Tailwind CSS + lucide-react + recharts** for a modern, responsive UI
- **JWT** httpOnly-cookie sessions, **bcrypt** password hashing

## Quick start (zero config)

```bash
npm install
npm run dev          # http://localhost:3000
```

With **no `MONGODB_URI`**, the app boots an **in-memory MongoDB** and auto-seeds a
demo organization — so it runs instantly. To use your own database, set `MONGODB_URI`
in `.env` (copy from `.env.example`) and run `npm run seed` once.

### Demo accounts (password: `password`)
| Role | Email | Access |
|------|-------|--------|
| Ops Admin | `ops@org.in` | everything; manages fields, users, assignments |
| Senior Manager | `sm1@org.in`, `sm2@org.in` | org-wide incl. sensitive; approves requests |
| Capability Manager | `cm1@org.in` … `cm4@org.in` | own reportees only, necessary fields, request-only |

## Configuration — `.env`
Copy `.env.example` → `.env`. Everything is optional for local dev:

| Var | Purpose |
|-----|---------|
| `MONGODB_URI` | MongoDB connection (Atlas etc.). Blank → in-memory dev DB. |
| `JWT_SECRET` | Session signing secret (set a long random value in prod). |
| `APP_URL` | Base URL used in email links. |
| `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `SES_FROM_EMAIL` | AWS SES email. Without them, emails are logged, not sent. |

> You can paste real credentials into `.env` at any time — no code changes needed.

## Features
- **Landing page** — public marketing page with features, roles, lifecycle, CTA.
- **RBAC** — enforced at **row level** (managers see only their reportees) and **field
  level** (PUBLIC / NECESSARY / SENSITIVE visibility tiers). Out-of-scope profiles 404.
- **Dashboard** — role-aware stats + lifecycle & campus charts + recent activity.
- **Instructor profiles** — tabbed modules (Personal, Hiring, Training, Deployment,
  Performance, Lifecycle, Exit), inline edit/request, notes, lifecycle timeline, audit.
- **Edit-request workflow** — CMs submit change + reason + proof → routed to their
  Senior Manager → approve/reject → applied + notified. Ops **cannot** approve
  (separation of duties).
- **Dynamic fields** — add/retire fields without a developer; GLOBAL vs INSTANCE scope;
  required visibility; archive = soft-delete (data retained).
- **Assignments** — per-instructor and **bulk** reassignment with preserved history.
- **Users** — Ops creates users; CMs are linked to a Senior Manager for routing.
- **Audit log** — append-only; who/what/when/why/proof. No edit/delete path anywhere.
- **Notifications** — in-app bell + page, plus AWS SES email.
- **CSV export** — respects the viewer's field visibility (Instructors + Audit log).
- **CSV bulk import** (Ops) — download a schema-matched template → upload → **validate &
  reconcile** every row (create vs. update, type checks, manager matching, unknown-column
  detection, error/warning per row) → commit. Matching is by Employee ID; bad rows are skipped.
- **Filter toolbars** at the top of every list page — Instructors (search, status, campus,
  manager, min training %, with a progress bar + active-filter chips), Audit (search + action
  type), Requests (search + status), Users (search + role), Fields (search + module + visibility).

## Verified end-to-end
Login/auth, RBAC row scoping (Ops 16 / CM 4), field-level hiding (Payroll & Interview
hidden from CMs, shown to Ops), non-reportee → 404, edit-request → SM approval →
value applied → audit row → CM notified, Ops-only field creation (CM blocked 403),
SES-less email fallback, CSV export (sensitive columns excluded for CMs), and bulk/
single reassignment (scope shifts correctly). All pass against a running server.

## Deploy
Deploy to Vercel (or any Node host). Set the `.env` variables in the host's dashboard,
point `MONGODB_URI` at MongoDB Atlas, add SES keys, and run `npm run seed` once to
create the first Ops admin (configurable via `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`).

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the design and data model.
