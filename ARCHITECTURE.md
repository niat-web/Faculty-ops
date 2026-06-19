# Instructor Lifecycle CRM — Architecture & Design

Engineering design derived from PRD v3.0. Source of truth for how the system is built.

## 1. Stack
| Layer | Choice | Why |
|-------|--------|-----|
| App | Next.js 14 (App Router) | Landing + app + API in one deployable |
| ORM | Mongoose | Flexible documents fit the dynamic-field requirement |
| DB | MongoDB (Atlas in prod; in-memory in dev) | `MONGODB_URI` swaps between them |
| Auth | JWT in httpOnly cookie (`jose`) + bcrypt | Internal users, no public signup |
| Email | AWS SES (`@aws-sdk/client-ses`) | Graceful no-op without keys |
| UI | Tailwind + lucide-react + recharts | Modern, responsive, friendly |
| Files | local `./uploads` (dev) → S3-compatible (prod) | Proof documents |

## 2. Roles & RBAC
Four roles, enforced at **row** and **field** level (`src/lib/rbac.js`, `src/lib/enums.js`):
- `OPS_ADMIN` — full edit; manages fields, users, mapping. Cannot approve requests (separation of duties).
- `SENIOR_MANAGER` — org-wide incl. sensitive; approves/rejects; direct edits.
- `CAPABILITY_MANAGER` — own reportees only (`currentManagerId == self`), necessary fields only, request-only.
- `INSTRUCTOR` — self only (matched by email), necessary fields. (Read-only, optional.)

**Field visibility tiers:** PUBLIC(0) / NECESSARY(1) / SENSITIVE(2). A role sees a field iff
its tier ≥ the field's tier. CM/Instructor tier = 1, SM/Ops tier = 2.

**Row scope:** `instructorScopeFilter(user)` returns a Mongo filter ANDed into every
instructor query. Out-of-scope profile reads return 404 (existence not leaked).

## 3. Data model (MongoDB collections)
- **User** — login + role; `managerId` links a CM to its Senior Manager (approval routing).
- **Instructor** — `employeeId`, `name`, `status`, `campus`, `currentManagerId`,
  `assignments[]` (history), `values` (Map: fieldKey→string for dynamic fields),
  `notes[]`, `lifecycle[]`.
- **FieldDefinition** — dynamic schema: `key`, `label`, `module`, `type`, `visibility`,
  `scope` (GLOBAL|INSTANCE), `options[]`, `archivedAt`/`archiveReason` (soft delete).
- **EditRequest** — proposed change + reason + proof + status + approver + decision.
- **AuditLog** — append-only; who/what/when/why/proof. No update/delete path exposed.
- **Notification** — in-app rows; email sent in parallel via SES.

## 4. Key flows
- **Approval:** CM submits (`/api/requests`) → routed to `user.managerId` → SM decides
  (`/api/requests/decide`) → on approve, `applyFieldChange` writes value + AuditLog + notifies CM.
- **Dynamic fields:** Ops/SM add (`/api/fields/define`) with required visibility + GLOBAL/INSTANCE
  scope; archive (`/api/fields/archive`) is soft + mandatory reason.
- **Reassignment:** Ops/SM (`/api/mapping/reassign`) closes the active assignment, opens a new one,
  updates `currentManagerId`; supports bulk. History preserved.
- **Lifecycle:** Ops/SM change status (`/api/lifecycle`); appends a `lifecycle[]` event + audit.

## 5. Invariants
- AuditLog is append-only.
- A CM never reads a row outside its active reportee set, nor a SENSITIVE field.
- A CM mutation only lands via an approved EditRequest.
- Field deletion is soft; historical values survive.
- Exactly one active assignment (no `endedAt`) per instructor.

## 6. Local dev
No `MONGODB_URI` → `src/lib/db.js` boots `mongodb-memory-server` and auto-seeds via
`src/lib/seedData.js`. Set `MONGODB_URI` + run `npm run seed` for a real database.
