import{j as e,r as f,n as v,p as w}from"./index-CLlVNxiE.js";import{S as x}from"./search-sKI61QO8.js";const h=[{id:"overview",title:"Overview",group:"Start here",body:`# FacultyOps — Overview

FacultyOps is the NIAT instructor-lifecycle system. It keeps **one trusted record** of every instructor and staff member, tracks their training, and drives the org chart, contribution rollups and lifecycle (onboarding → exit).

## The four roles
What each person sees and can do is controlled entirely by their role.

| Role | Sees | Can do |
|---|---|---|
| **Ops Admin** | Everyone | Everything — edit any record, manage users, columns, settings, remove/restore people. |
| **Senior Manager** | Everyone | Org-wide view, edit directly, **approve** change requests, view audit + org chart. |
| **Capability Manager** | **Only their own reportees** | View & edit their reportees; raise change requests (needs approval); resolve their reportees' exit alerts. |
| **Instructor** | **Only themselves** | Read-only self-view + edit their own training fields on **My Stats**. |

> A Capability Manager is scoped by their **Darwinbox reporting-manager id** — they see exactly the people who report to them in Darwinbox. If that id can't be resolved, the view fails **closed** (no rows) rather than leaking data.

## Where the data comes from
Three sources feed the app. **Everything you see on a page is read from MongoDB.** The other two sources sync **into** Mongo on a schedule, so pages stay fast and keep working even if a source is briefly down.

| Source | What it owns | Into Mongo |
|---|---|---|
| **Darwinbox** (HR) | People: name, email, department, reporting manager, location, DOJ, exit status | **Every hour** (default) |
| **BigQuery** (learning platform) | Training/course progress per module | **Every hour**; Training Stats also overlays it live |
| **MongoDB** (app DB) | Everything the app owns: Contribution, Payroll, Remarks, Access, requests, audit, settings | Serves every page instantly |

> Data can be up to one hour old between syncs. Use **"Refresh from Darwinbox"** on the Master to pull immediately. See **Data & Sync** for the exact matching keys, conflict rules and fallbacks.`},{id:"data-sync",title:"Data & Sync",group:"Start here",body:`# Data & Sync

This is the single most important page to understand: how outside data lands in FacultyOps, which side **wins** a conflict, and what happens when a source is unavailable.

## Cadence
A background job runs **hourly** (default; configurable, \`0\` disables it). The first run is ~30 seconds after the server boots. Each run, in order:

1. **Darwinbox → Mongo** (people)
2. Rebuild the **directory mirror** (used by the Org chart)
3. **Exit-alert detection**
4. Sync **Ops-admin / Senior-Manager** login accounts
5. **BigQuery → Mongo** (training) — runs even if step 1 failed

Ops can also trigger it on demand (Master → **Refresh from Darwinbox**, or the cron endpoint).

## Darwinbox → Mongo (people)
- **Match key: Employee ID only.** Records de-dupe on the normalised Employee ID, so nobody is ever duplicated.
- **Scope:** only instructor-department rows are synced; the rest of the org is filtered out.
- **Darwinbox wins** on every mapped HR field (Name, Email, Department, Role, Location, Phone, DOJ, Qualification, Gender, Reporting Manager, State/District/City, Workspace, exit status).
- **But three guards protect your data:**
  - A **blank** Darwinbox value never wipes existing data.
  - **UID** is fill-only — once set it is never overwritten (it drives BigQuery matching).
  - An email already belonging to another instructor is skipped (no collisions).
- **FacultyOps-managed fields are never touched** (Contribution, Contribution Region, Payroll, HOD Interaction, Access, Remarks, Domain).
- New Employee IDs are **created**; people Darwinbox marks as exited/resigned/terminated become **Exited** (exit date normalised to \`yyyy-mm-dd\`).

## BigQuery → Mongo (training)
- **Match keys, in priority order: UID → Employee ID → email.** UID is compared hyphen-stripped and lowercased on both sides.
- A **course column** links to BigQuery by its **Course ID** (module column \`courseId\` ↔ BigQuery \`course_id\`).
- Each synced cell is stored as \`Status (pct%)\`, e.g. \`In Progress (72%)\`. Status is derived from the %: 100 → Completed, 0 → Not Started, "hold" → On Hold, else In Progress.
- **Zero-match safety:** an instructor who matches **nothing** in a given run is left untouched, so their % never flaps to 0 on a bad run.

## What is live vs. stored
| Page | Reads |
|---|---|
| **Training Stats** | Loads **stored** data instantly, then silently overlays the **freshest BigQuery** numbers. |
| **Master / Exited / Roles / Contribution / Org** | **Stored** Mongo data (refreshed hourly). No live external call on load. |

## Fallback behaviour (when a source is down)
> The app is designed to **degrade gracefully** — a slow or offline source never breaks a page.

- **Manual refresh fails** → it logs the error and serves the **current Mongo data**.
- **Darwinbox unavailable** → the sync writes nothing; existing Mongo data is untouched.
- **BigQuery unavailable / not configured** → training persist is skipped; the **last-known** module statuses are retained.
- **Live Training pull fails** → the grid falls back to the **stored** \`moduleStatus\` and stays usable.`},{id:"master",title:"Instructor Master",group:"Instructors",body:`# Instructor Master

A full spreadsheet of every **active** instructor. **Click an editable (amber-tinted) cell to change it.** Click a **Name** to open the detail drawer.

## Data source
Rows are read from **MongoDB** (kept fresh by the hourly Darwinbox sync). No live external call happens on load. The **Training %** column comes from the hourly BigQuery sync.

## Columns — two kinds
The grid has **Darwinbox-owned** columns (mirrored from HR) and **FacultyOps-managed** columns (yours to edit). Darwinbox-owned columns may *look* editable, but a manual edit is **overwritten on the next hourly sync** — so treat them as read-only.

### Darwinbox-owned (read-only in practice)
| Column | Notes |
|---|---|
| **Employee ID** | Match key. Locked. |
| **Name** | From Darwinbox. |
| **Reporting Manager Employee ID** / **Reporting Manager (Darwin)** | Derived from the Darwinbox manager \`(NW…)\` code. |
| **Department**, **Role** (designation) | Dropdowns, from Darwinbox. |
| **Work Location** (campus), **State / District / City** | From Darwinbox. |
| **Mail ID**, **Phone Number** | From Darwinbox. |
| **DOJ**, **Exit Date** | Dates, from Darwinbox (exit derived). |
| **Qualification**, **Gender**, **Native Language** | From Darwinbox. |
| **UID** | Fill-only; drives BigQuery matching. |
| **June 2026 Workspace** | From Darwinbox. |

### FacultyOps-managed (editable — saved to Mongo, never synced over)
| Column | Type | Values |
|---|---|---|
| **Contribution** | Dropdown | NIAT 1 & 2 (2023 & 2024), NIAT 3 (2025), NIAT 4 (2026), Academy, Central |
| **Contribution Region** | Dropdown | Hindi, Kannada, Malayalam, Marathi, Central, Tamil, Telugu, Work From Home |
| **Payroll** | Dropdown | Nxtwave, University — choosing **University** prompts for the university / campus name and lists the person on **Instructor Moved**. |
| **Domain** | Text | App-managed (sits in the Darwinbox block but is **not** synced). |
| **HOD Interaction** | Text | — |
| **Portal / Assets / Drive Access** | Text | — |
| **Remarks** | Text | — |
| **Lifecycle** | Computed | **Read-only** — see below. |

### Lifecycle (computed, read-only)
Derived from employment status + any finalised exit-alert outcome: **Active**, **University Payroll**, **Consultant → FTE**, **Exit In Progress**, **Exited**.

> Manage which columns appear (add / hide / reorder) under **Settings → Dynamic Fields → Instructor Master columns**.

## Scope
- **Ops Admin / Senior Manager** see **everyone**.
- **Capability Manager** sees **only their reportees** (matched to their Darwinbox reporting-manager id; fails closed if unresolved).

## Sections & actions
- **Tabs:** Active / All / Exited (each with a live count).
- **Search:** name, Employee ID, or email (debounced).
- **Departments** quick-filter (All / None). Which departments are **ticked by default** is set by an Ops Admin under **Settings → Operations → Instructor Master departments** (support departments and Product Team are hidden by default).
- **Payroll visibility** — which payroll types (Nxtwave / University) appear in the grid is set by an Ops Admin under **Settings → Operations → Master payroll visibility** (global; at least one must stay on). The **Instructor Moved** page always shows all University-payroll people regardless.
- **Filters drawer:** Capability Manager, Department, Role, Payroll, Contribution Region, Work Location, Qualification, Gender, Domain, State, Workspace — plus Apply / Clear.
- **Multi-select** → bulk **Edit** (all staff), **Remove** (hide, Ops), **Delete** (Ops). Identity fields are excluded from bulk edit.
- **Row menu (⋮)** (Ops): Edit · Remove (hide) · Delete.
- **Actions menu:** Add instructor (Ops) · Import CSV (Ops) · Export CSV (all — mirrors current filters).
- **Inline edit:** click an amber cell; the editor is type-aware (text / number / date / dropdown).`},{id:"exited",title:"Instructor Exited",group:"Instructors",body:`# Instructor Exited

Everyone who has left NIAT (or is exit-in-progress), with the exit-specific columns.

## Data source
**MongoDB.** A person becomes "exited" when Darwinbox marks their employment status as ended, **or** when a Capability Manager finalises an Exit Alert as **"Actually exited"**.

## Key fields
| Field | Meaning |
|---|---|
| **Exit Date** | Last working day (from Darwinbox). |
| **Type Of Exit** | The exit category (dropdown). |
| **Reason / Indetailed Reason** | Captured on the exit form. |
| *(plus)* | The same profile columns as the Master. |

## Sections & actions
- **Search** by name, Employee ID, email.
- **Filters drawer:** Department, Capability Manager, Type of Exit, Contribution Region, Payroll, Work Location.
- **Exit-date range:** quick presets (Last month · Past 3 / 6 months · Past year) or a custom range.
- **Export CSV** mirrors the active filters.

## Who can edit
Only **Ops / Senior Manager** can click a cell to edit here; Ops may additionally edit the Employee ID.`},{id:"moved",title:"Instructor Moved",group:"Instructors",body:`# Instructor Moved

Everyone who has been **moved to University payroll** — with the university / campus they moved to.

## Data source
**MongoDB** (the live Master mirror). A person appears here whenever their **Payroll = University**, however that was set:
- An **Ops Admin or Capability Manager** setting Payroll → University on the Instructor Master (which prompts for the university name).
- A Capability Manager finalising an **Exit Alert** as "Moved to NxtWave University Payroll".

## How someone is moved (from the Master)
On the Instructor Master, set the **Payroll** cell to **University**. A small pop-up asks for the **university / campus name** — pick one from the admin-managed list (scrollable dropdown) or type a custom one — then **Submit**. This saves Payroll = University and records the university, and the person immediately shows up here.

## What it shows
Name · Employee ID · **University / Campus** · Department · Capability Manager · Status (Active / Exited).

## Search, filters & export
- **Search** by name / Employee ID / university.
- **Filters** drawer (top-right) — Department, University / Campus, Capability Manager and Status, populated from the real values in this table; a badge shows how many are applied and **Clear filters** resets them.
- **Export CSV** downloads the currently-filtered list.

> This page **always lists every University-payroll instructor**, even if University rows are hidden from the Master grid by the payroll-visibility control. A **Capability Manager** sees only their own reportees here.`},{id:"training",title:"Training Stats",group:"Instructors",body:`# Training Stats

A per-track grid of every instructor's course progress and health.

## Data source & loading
- **Course/module columns come live from BigQuery.** The page loads **stored** data instantly, then silently overlays the freshest BigQuery figures (a small "Syncing live progress…" chip appears while it refreshes — no pop-up notification).
- Everything else (names, **Department**, manager, manual columns) is from **MongoDB**. The **Department** is the Darwinbox-synced department for that Employee ID.
- If the live pull fails, the grid falls back to the **stored** module statuses and stays usable.

## Who appears here
Training Stats shows the **same instructor population as the Instructor Master's default view** — the non-teaching support departments are excluded (Delivery Support / Instructor Platform / Product Team, plus anything an Ops Admin hides under **Settings → Operations → Instructor Master departments**). **Removed** people never appear. A **Capability Manager** sees only their own reportees.

## Tracks & modules
Pick the track from the title dropdown. Each track groups its modules under sub-headers.

| Track | Sub-tracks → modules |
|---|---|
| **Tech** | **Frontend:** Static Web, Responsive Design, Modern Responsive UI, JavaScript Sprint, JavaScript Essentials, React JS, Frontend Projects · **Backend:** Python, SQL, Node JS, MongoDB, Developer Foundation, Backend Projects · **DSA:** DSA, DIA, IPS · **Gen AI:** Gen AI, LLM, AI for Finance · **DSML:** ML, Supervised Learning, Deep Learning, ML Projects, NLP, Data Foundation |
| **Mathematical & Aptitude** | Quantitative Aptitude, Numerical Ability, Logical Reasoning, Advanced Aptitude, Mathematics for Computer Science, Probability and Statistics, Linear Algebra and Calculus |
| **English** | Communicative English Foundation, Communicative English Advanced, Communicative English Applied, Language Analytics |

Each module cell shows **Completed / In Progress / On Hold / Not Started** with a %. **Frontend Projects** and **Backend Projects** are **manual** (hand-edited, never BigQuery-synced).

## Column kinds
| Kind | Editable? | Notes |
|---|---|---|
| **BigQuery-synced course columns** | No | Come from the learning platform. |
| **Manual columns** (e.g. project statuses, SEM columns, Remarks) | Yes | Amber cells; SEM columns are multi-select. |
| **Computed** (Health Status, %, Predicted Completion) | No* | Calculated from module statuses + dates. |

\\* **Predicted Completion** accepts a **manual override date** — when set, your override wins.

## How the numbers are computed
- **% Done** = the average of that track's module scores. A live cell like \`In Progress (72%)\` counts as 0.72; a manual cell with no % buckets to Completed = 100%, In Progress = 50%, On Hold = 20%, else 0%. Stored to one decimal (e.g. \`66.7\`).
- **Health Status** compares actual pace against expected pace between **Ongoing Start** and **Track Deadline**:

| Result | When | Colour |
|---|---|---|
| **On Track** | 100% done, **or** ahead / within 10% of expected pace | green |
| **Needs Monitoring** | 10–25% behind expected pace | amber |
| **At Risk** | more than 25% behind pace | red |
| **Not Started** | 0% and inside the window | red |
| **Overdue** | past deadline, or missing start/deadline | grey |
| *(blank)* | track is N/A for this person | — |

> Health labels carry **no emoji** — the **colour** conveys the state (green = healthy, amber = watch, red = act, grey = overdue).

- **Predicted Completion** projects the finish date from the current pace (\`N/A\` if not started; \`Completed\` at 100%).

## Sections & actions
- **Track dropdown** (in the title), **Search** (name / ID), **All managers** filter, **Export CSV** (current filtered table).
- **Filter drawer:** Track, Department, Primary / Secondary / Ongoing Track, Ongoing-start range, deadline range, and Primary / Secondary score-% ranges.
- Manage columns per track under **Settings → Dynamic Fields → Training Stats columns** (a column links to BigQuery by its **Course ID**).`},{id:"roles",title:"Roles",group:"Instructors",body:`# Roles

Counts of people by role, derived from Darwinbox — click a role to open it filtered. (Ops Admin / Senior Manager.)

## How each role is derived
| Role | Rule |
|---|---|
| **Ops Admin** | People in the Darwinbox "Delivery Support (Ops & Central Managers)" department. |
| **Instructor** | Everyone in the other instructor departments. |
| **Capability Manager** | The unique Darwinbox **reporting managers**. |
| **Senior Manager** | An admin-curated list (**Settings → Operations → Senior Managers**). |

## Data source
Counts read from **MongoDB** (the hourly-synced master). **Removed people are never counted.**

## Sections & actions
- **Search** a person to see which role they fall under.
- **Export CSV** of the role counts.
- **Click a role row** → opens the Master filtered to that role. *Exception:* clicking **Capability Manager** opens the **Capability Manager Distribution** page instead.`},{id:"org",title:"Org Chart",group:"Instructors",body:`# Org Chart

A visual hierarchy: **Organization → Ops Admins → Senior Managers → their Capability Managers → reportee counts.** (Ops Admin / Senior Manager.)

## Data source
Built from the **Darwinbox directory mirror in MongoDB** (every employee + their reporting line), plus the curated Senior-Manager list. This lets a manager who isn't on the Instructor Master still be placed under the right Senior Manager.

## Sections & actions
- Each **Capability Manager** card shows how many instructors report to them.
- **Click a Capability Manager** → opens the Master filtered to exactly their reportees.
- **Search manager** — highlights and pans to the match (it never filters the tree away).
- **Expand all / Collapse all**, **wheel-zoom + drag-pan**, **Zoom in / out**, **Reset / fit**, and **Export as PNG**.
- **Removed people (and their counts) never appear.**`},{id:"contribution",title:"Contribution",group:"Instructors",body:`# Contribution

Three rollups over the **same active-instructor population as the Master** — the counts always match the Master's Active tab. Data is from **MongoDB** (hourly-synced); removed people are excluded.

## 1. Contribution Distribution
Every unique **Contribution** value and how many instructors have it.
- The value links to the Master filtered by that contribution.
- **Row menu (⋮):** **Edit / rename** (renames the value across **all** instructors) · **Clear from instructors** (empties it).
- If no Contribution field is defined, a notice explains how to add it.

## 2. Campuswise Instructors
Per campus (read-only): **No. of Instructors**, **University Payroll** count, **Nxtwave Payroll** count, with a grand-total footer. Each campus links to the Master filtered by campus.

## 3. Capability Manager Distribution
Every Darwinbox reporting manager with their **Employee ID** and **Reportees count** (read-only). **"View reportees"** opens the Master filtered to that manager's team.

## Search
Each page has a search box that filters its list (by contribution value / campus / manager).`},{id:"dashboard",title:"Dashboard",group:"Overview pages",body:`# Dashboard

A **role-specific** summary shown on sign-in. Everything is from **MongoDB** (hourly-synced); removed people are excluded from every number.

## Ops Admin
- **Exit-alert banner** (when there are upcoming exits to confirm) + quick links (Instructors / Org / Audit) + notification bell.
- **KPI tiles:** Total instructors · Active · Avg. training % · Pending approvals (→ Requests).
- **Panels:** Lifecycle-status donut (click a slice → Master by status), Training health, Top campuses (→ Master by campus), Manager workload, Completion spread, Joining trend, Workforce, Recent activity (→ Audit), Recently added.

## Senior Manager
Exit-alert banner, a pending-approvals banner, and the same KPI/panels (minus the workforce/audit-only cards).

## Capability Manager
- **Exit-alert banner** for their team.
- **KPIs:** My reportees · Avg training · On track (≥80%) · Deadlines (next 30 days).
- **Panels:** Reportee status, Top performers, **Learners requiring immediate attention** (At Risk + Overdue), Team training health, Upcoming deadlines, and a "Manage all your reportees" link.

## Instructor
Profile card, **training-completion ring**, review score, and a journey stepper (Onboarding → In Training → Confirmed). Shows a friendly empty state if no profile is linked yet.`},{id:"requests",title:"Edit Requests",group:"Overview pages",body:`# Edit Requests

Change requests raised by Capability Managers / Senior Managers and **approved by an Ops Admin (or the assigned Senior Manager)**. Data is in **MongoDB**; every decision is written to the Audit Log.

## Who raises, who approves
- **Ops Admin** edits directly — no request needed.
- **Capability Manager** raises requests → routed to their **Senior Manager**.
- **Senior Manager** raises requests → routed to an **Ops Admin**.

## Flow
1. **New request** (or bundle several edits across instructors into **one batch** from the Master multi-select → Edit). A reason is required; an optional **proof document** (image / PDF) can be attached. The new value is validated at submit time.
2. **Pending** shows each request (and each pending batch) with **Approve / Reject** and a **Comment** action for the approver; a proof link appears when attached.
3. On **approval** each change is applied (the real current value is re-read), written to the Audit Log, and the requester is notified. **Reject** records the decision and deletes the proof.
4. The requester can **withdraw** their own request while it is still Pending.

## History
A searchable **History** table with a filter drawer (Status / Field / Requested by) and **Export CSV**. Statuses are **Pending / Approved / Rejected**.`},{id:"users",title:"Users",group:"Administration",body:`# Users

The **login accounts** (Ops Admin only). This is separate from the Instructor Master — it's about **who can sign in**.

## Data source
**MongoDB** (the User collection). Staff accounts (Ops Admins, Senior Managers) are **auto-created from Darwinbox** as **Pending password** accounts.

## Status — what it means
| Status | Meaning |
|---|---|
| **Active** | Has set a password and can sign in. |
| **Pending password** | Account exists but no password yet — send them an invite. |
| **Inactive** | Access is turned off; they cannot sign in. |

> This "Active" is the **login** status. On the Instructor Master, "Active" means the person is a current **employee**. They are different things — a current employee can have a login account that is still **Pending password**.

## Columns
Name · Email · Role · **Reports to** · Status · Last login · **Live** (an online/offline ping indicator) · Last seen.

## Sections & actions
- **Roles** quick-filter dropdown (All / None).
- **Search** by name / email.
- **Filters drawer:** Role, Reports to, Status, Live (online / offline).
- **Add user** · **Invite pending** (sends set-password links to everyone still Pending).
- **Row menu (⋮):** Send invite · Edit · Delete.
- In the user modal, when the role is **Capability Manager** you also set **Reports to** (their Senior Manager).`},{id:"removed",title:"Removed",group:"Administration",body:`# Removed people

A way to **hide** a person the app is showing wrongly (e.g. Darwinbox still lists them in an instructor department by mistake) — **without deleting anything.** (Ops Admin only.)

## What "Remove" does
Removing a person (Master → **row ⋮ → Remove**, or multi-select → **Remove**) hides them **everywhere**: Master, Exited, Org chart, Training, Roles, Contribution, Dashboard, the Users table, and **all counts**. Their Capability Manager's reportee count drops accordingly.

> Nothing is deleted from Darwinbox or MongoDB — it is purely a **visibility toggle**. The person appears **only** on this Settings → Removed page.

## Restore
- **Search** removed people by name / Employee ID / email (enriched from both Darwinbox and the database).
- **Restore** a single person, or tick several and **Restore selected** to bring them back everywhere.
- A **Source** chip shows whether the person exists in *Darwinbox + DB* or *Database only*.`},{id:"settings",title:"Settings",group:"Administration",body:`# Settings

Ops-only configuration, organised into tabs. Everything is stored in **MongoDB** (a single settings document); changes take effect within **~30 seconds**. The **Documentation** button (top-right) opens this guide in a new tab.

## Dynamic Fields
Define the fields tracked on every profile, and manage the grid columns.
- **Left nav:** Training Stats columns (per track), Instructor Master columns, and each **module/section** with its field counts.
- **Right pane:** the fields in the selected section — Label / Type / Visibility / Scope / In-use — with search and a visibility filter.
- **Define field** (Ops) — set **Label**, **Module** (or create a new one), **Type** (Text / Number / Date / Dropdown / File / Boolean), **Visibility** (Public / Necessary / Sensitive — controls who can see it), **Scope**, options / min / max / regex, and **"Instructors can edit this on My Stats"**.
- **Row menu (⋮):** Edit · Archive (reason required) · Delete. Archived fields sit in a collapsible list.

## Notifications & Emails
Per-event on/off toggles, grouped by recipient role. **In-app** notifications and **email** are controlled independently. See the **Emails & Notifications** page for every event, when it fires, and sample templates.

## System
- **General:** App name, Organisation, Public app URL, Support email; plus **read-only** integration status (Email / AWS SES, Google sign-in, at-rest encryption, scheduled jobs).
- **Password policy / Login protection:** min length, require letters & numbers, max failed attempts, lockout minutes. *(Two-factor auth is per-user under My Account.)*
- **Account Access:** enable / disable each role's ability to sign in. **Ops Admin is always on.** A disabled role sees a "contact your admin" screen.
- **Data & Retention:** retention days, record counts (audit / notifications / logins), **Prune now**, and CSV exports (Instructors, Audit log).

## Operations
- **Senior Managers:** a live Darwinbox search picker to **add** an SM (which also mirrors an inactive login account) and **remove** one.
- **Instructor Master departments:** choose which departments (synced from Darwinbox) are **ticked by default** in the Master's Departments menu. Unticked ones are hidden by default but can still be turned on from the Master. Product Team and the support departments are hidden by default.
- **Master payroll visibility:** two toggles (**Nxtwave** / **University**) that control which payroll types appear in the Instructor Master grid, for everyone (at least one must stay on). Does not affect **Instructor Moved**, which always lists all University-payroll people.
- **Exit Alerts:** the **lead-time** (how many days ahead to alert; presets 2 / 5 / 10) and the **University names** list used in the CM exit modal.
- **Certifications:** controls for the public certificates form — see the **Certifications** page.

## Removed
See the **Removed people** section.`},{id:"emails",title:"Emails & Notifications",group:"Administration",body:`# Emails & Notifications

FacultyOps sends two kinds of message: **in-app notifications** (the bell) and **emails**. Every message maps to an **event key**, and each event can be turned on or off — independently for in-app vs email — under **Settings → Notifications & Emails**. A missing toggle means **on** (default).

## How delivery works
- **In-app** messages appear in the **bell** (top-right) with an unread badge; the full list is on the Notifications page.
- **Emails** are sent through **AWS SES**. If SES isn't configured yet, the app **logs** the email instead of sending it (so everything works end-to-end before secrets are added) — a per-instructor email row still records the attempt.
- An email is skipped if: the event's email toggle is **off**, the recipient turned off their own email notifications, or the recipient has no email address.

## In-app notification events
| Event | Goes to | Fires when |
|---|---|---|
| **New edit request to review** | Senior Manager | A CM raises a change request awaiting approval. |
| **Your request was approved** | Capability Manager | Their request is approved. |
| **Your request was rejected** | Capability Manager | Their request is rejected. |
| **New comment on a request** | Both parties | Someone comments on a request you're part of. |
| **A dynamic field was added** | Ops Admin | A new field / module is created. |
| **Instructor exit alert** | Ops Admin + Senior Manager | An instructor's Darwinbox last-working-day is approaching. |
| **Reminders & weekly digest** | Everyone | Pending-request nudges, exit deadlines, the weekly summary. |

## Email events
| Event | Goes to | Fires when |
|---|---|---|
| **New edit request to review** | Senior Manager | A CM raises a change request. |
| **Your request was approved / rejected** | Capability Manager | Their request is decided. |
| **A new edit request was raised** | Ops Admin | Copy sent to Ops whenever any request is raised. |
| **A dynamic field was added** | Ops Admin | A new field / module is created. |
| **Onboarding welcome** | Instructor | Their status is set to Onboarding. |
| **Submit documents & details** | Instructor | Sent alongside onboarding, to collect documents. |
| **Reporting day (deployed)** | Instructor | Their reporting day is set / they're deployed. |

## Account & invite emails (always sent)
- **Set your FacultyOps password** — sent when a user is invited or "Send invite" is used. Contains a one-time link **valid for 1 hour**.

## The instructor lifecycle emails
The three instructor emails (Onboarding, Documents, Reporting Day) are also visible per-instructor under the profile's **Mails** menu, which shows each email's **last status** (Sent / Skipped / Failed) and lets an admin **re-send** one. Onboarding + Documents auto-send when an instructor enters **Onboarding**; Reporting Day sends when the reporting day is set.

---

## Sample template (with example data)
Below is the **Onboarding welcome** email as it renders for a sample instructor:

> **Sample instructor**
> Name: **Ananya Sharma** · Employee ID: **NW0002991** · Email: **ananya.sharma@niatindia.com** · Reporting day: **14-Jul-2026**

**Subject:** Welcome to NIAT — your onboarding has started

\`\`\`
Welcome aboard! 🎉

Hi Ananya Sharma,

Your onboarding at NIAT has started (Employee ID NW0002991).
Our team will guide you through the next steps. We're excited
to have you!

NIAT — FacultyOps
\`\`\`

The **Submit documents & details** email for the same person:

**Subject:** Action needed: submit your documents & details

\`\`\`
Complete your profile

Hi Ananya Sharma,

To finish your onboarding, please submit your documents and
fill in your details. Reach out to your Capability Manager if
you need the document checklist.

[ Open the portal ]

NIAT — FacultyOps
\`\`\`

The **Reporting day (deployed)** email:

**Subject:** Your reporting day is confirmed

\`\`\`
You're deployed 🚀

Hi Ananya Sharma,

Your reporting day is confirmed: 14-Jul-2026. Please be
available and reach out to your Capability Manager for any
joining instructions.

NIAT — FacultyOps
\`\`\`

And a **request-decision** email (e.g. approval), rendered for the requesting Capability Manager:

> Requester: **Rahul Verma** (Capability Manager)

**Subject:** Your request was approved

\`\`\`
Hi Rahul Verma,

Your change request for Ananya Sharma (Contribution Region)
was approved.

[ Open in CRM ]
\`\`\`

> Every email carries the same simple, branded layout — a heading, a short body, an optional action link, and the **"NIAT — FacultyOps"** footer. The instructor's real name, Employee ID and reporting day are substituted in automatically.`},{id:"certifications",title:"Certifications form",group:"Administration",body:`# Certifications form

A **public** form for collecting instructor certificates. It is **fully admin-controllable** — no developer needed to change what it asks.

## Schema-driven (admin-controllable)
The form **and** the submissions table render entirely from an admin-editable **schema** of sections + fields. From **Settings → Operations → Certifications → Edit certifications form** you can:
- Add / edit / **reorder** sections and fields.
- Choose each field's **type:** Text · Textarea · Email · Number · Date · Dropdown · Radio · Checkbox · **File upload** · Employee-picker.
- Set dropdown / radio options, allowed **file types** (\`accept\`), help text, placeholder, required flag, and where the field is placed.
- The default schema reproduces the original hard-coded form, so nothing is lost.

## The public form
- Reached via a **private UUID link** (Copy / Open / **Regenerate** in Settings — regenerating revokes the old link).
- Two toggles control it: **"Form is open"** and **"Require sign-in"**.
- The **Employee** field searches Darwinbox; required fields are validated; a 10-day "already submitted" guard prevents accidental double submits.

## Where uploads go
- **File fields upload to Google Drive**; only the **Drive link** is stored. All answers are saved to **MongoDB** and mirrored to the legacy columns.
- If Google Drive isn't configured, the **text answers still save** and a warning is shown.
- Submissions appear on each instructor's **profile** (Documents), and in the **submissions table** in Settings (its columns follow the schema).`},{id:"exit-alerts",title:"Exit Alerts",group:"Administration",body:`# Exit Alerts

Catches upcoming instructor exits from Darwinbox and asks the right Capability Manager to confirm the outcome — so a departure is never missed and the lifecycle stays correct.

## Detection
After each hourly Darwinbox sync, the app scans instructor-department employees whose **last working day** falls within the admin-set **lead window** (and isn't older than 30 days). It raises **one alert per (Employee ID, exit date)** — deduped, so it never nags twice.

## Who gets notified
- The alert is routed to the Capability Manager the instructor **reports to in Darwinbox** (falling back to the app's stored manager).
- **Ops Admins and Senior Managers** get an in-app **bell** notification (no email).
- A **rose banner** appears on the relevant staff dashboards.

## Resolving (Capability Manager, or Ops)
The banner opens a modal. Only the **reporting CM** (or an Ops Admin) can finalise; Ops/SM otherwise see it read-only as "Awaiting confirmation". The three outcomes:

| Outcome | Effect |
|---|---|
| **Moved to NxtWave University Payroll** | Not an exit — sets Payroll = University and the chosen university workspace; the person **stays** on the Master. |
| **Actually exited** | Status → Exited; records the last working day; the person moves to **Instructor Exited**. |
| **Exited as Consultant, rejoined Full-Time** | Status → Rehired; the person **stays** on the Master. |

Resolving writes a **Lifecycle-change** audit entry and marks the alert resolved. If the person existed only in Darwinbox, a minimal instructor record is created so the outcome can be recorded.

## Where it's configured
**Settings → Operations → Exit Alerts:** the lead-time (days ahead) and the University-names list used in the modal.`},{id:"audit",title:"Audit Log",group:"Administration",body:`# Audit Log

An **append-only** record of every change in the system (Ops Admin / Senior Manager). Stored in **MongoDB**.

## When entries are written
Automatically whenever a field is edited, a status changes, a request is decided or withdrawn, a user is created / updated, a person is removed / restored, an exit alert is resolved, or a sync runs.

## Each entry shows
**When · Who** (actor + role) **· Action · Instructor · Field · Change** (old → new) **· Reason · Proof** document. Sensitive values are masked.

## Sections & actions
- **Search** across instructor / actor / field / value / reason.
- **Filters drawer:** Action, Department, Capability Manager, Changed by (role), Date range.
- **Export CSV** (mirrors the filters).`}];function g(u,r){const c=[],t=/\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g;let p=0,i,s=0;for(;i=t.exec(u);)i.index>p&&c.push(u.slice(p,i.index)),i[1]!==void 0?c.push(e.jsx("strong",{className:"font-semibold text-slate-900",children:i[1]},`${r}b${s}`)):i[2]!==void 0?c.push(e.jsx("code",{className:"rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.85em] text-brand-700",children:i[2]},`${r}c${s}`)):i[3]!==void 0&&c.push(e.jsx("a",{href:i[4],target:"_blank",rel:"noreferrer",className:"text-brand-600 underline hover:text-brand-700",children:i[3]},`${r}a${s}`)),p=t.lastIndex,s++;return p<u.length&&c.push(u.slice(p)),c}const D=/^(#{1,4}\s|```|>|\s*[-*]\s|\s*\d+\.\s|\|)/;function S({source:u}){const r=u.replace(/\r\n/g,`
`).split(`
`),c=[];let t=0,p=0;const i=s=>c.push(e.jsx("div",{children:s},p++));for(;t<r.length;){const s=r[t];if(!s.trim()){t++;continue}if(s.trim().startsWith("```")){const n=[];for(t++;t<r.length&&!r[t].trim().startsWith("```");)n.push(r[t]),t++;t++,i(e.jsx("pre",{className:"my-3 overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs leading-relaxed text-slate-100",children:e.jsx("code",{children:n.join(`
`)})}));continue}const m=s.match(/^(#{1,4})\s+(.*)$/);if(m){const n=m[1].length,l=g(m[2],`h${t}`);i(n===1?e.jsx("h1",{className:"mb-3 text-2xl font-bold text-slate-900",children:l}):n===2?e.jsx("h2",{className:"mb-2 mt-6 border-b border-slate-100 pb-1.5 text-lg font-bold text-slate-900",children:l}):n===3?e.jsx("h3",{className:"mb-1.5 mt-4 text-xs font-bold uppercase tracking-wide text-brand-700",children:l}):e.jsx("h4",{className:"mb-1 mt-3 text-sm font-semibold text-slate-800",children:l})),t++;continue}if(/^---+$/.test(s.trim())){i(e.jsx("hr",{className:"my-5 border-slate-100"})),t++;continue}if(s.trim().startsWith(">")){const n=[];for(;t<r.length&&r[t].trim().startsWith(">");)n.push(r[t].replace(/^\s*>\s?/,"")),t++;i(e.jsx("blockquote",{className:"my-3 rounded-r-lg border-l-4 border-amber-300 bg-amber-50/70 px-4 py-2.5 text-sm text-slate-700",children:n.map((l,a)=>e.jsx("p",{className:a?"mt-1":"",children:g(l,`q${t}-${a}`)},a))}));continue}if(s.trim().startsWith("|")&&t+1<r.length&&/^\s*\|?[\s:|-]+\|/.test(r[t+1])){const n=s.trim().replace(/^\||\|$/g,"").split("|").map(a=>a.trim());t+=2;const l=[];for(;t<r.length&&r[t].trim().startsWith("|");)l.push(r[t].trim().replace(/^\||\|$/g,"").split("|").map(a=>a.trim())),t++;i(e.jsx("div",{className:"my-3 overflow-x-auto rounded-lg border border-slate-200",children:e.jsxs("table",{className:"w-full text-sm",children:[e.jsx("thead",{className:"bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500",children:e.jsx("tr",{children:n.map((a,o)=>e.jsx("th",{className:"px-4 py-2.5 font-semibold",children:g(a,`th${o}`)},o))})}),e.jsx("tbody",{className:"divide-y divide-slate-100",children:l.map((a,o)=>e.jsx("tr",{className:"hover:bg-slate-50",children:a.map((d,b)=>e.jsx("td",{className:"px-4 py-2.5 align-top text-slate-700",children:g(d,`td${o}-${b}`)},b))},o))})]})}));continue}if(/^\s*[-*]\s+/.test(s)){const n=[];for(;t<r.length&&/^\s*[-*]\s+/.test(r[t]);)n.push(r[t].replace(/^\s*[-*]\s+/,"")),t++;i(e.jsx("ul",{className:"my-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-700 marker:text-brand-400",children:n.map((l,a)=>e.jsx("li",{children:g(l,`ul${t}-${a}`)},a))}));continue}if(/^\s*\d+\.\s+/.test(s)){const n=[];for(;t<r.length&&/^\s*\d+\.\s+/.test(r[t]);)n.push(r[t].replace(/^\s*\d+\.\s+/,"")),t++;i(e.jsx("ol",{className:"my-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-slate-700 marker:text-brand-500 marker:font-semibold",children:n.map((l,a)=>e.jsx("li",{children:g(l,`ol${t}-${a}`)},a))}));continue}const y=[];for(;t<r.length&&r[t].trim()&&!D.test(r[t])&&!/^---+$/.test(r[t].trim());)y.push(r[t]),t++;i(e.jsx("p",{className:"my-2 text-sm leading-relaxed text-slate-700",children:g(y.join(" "),`p${t}`)}))}return e.jsx("div",{children:c})}function k(){const[u,r]=f.useState(h[0].id),[c,t]=f.useState(""),p=f.useMemo(()=>{const a=c.trim().toLowerCase();return a?h.filter(o=>(o.title+" "+o.body).toLowerCase().includes(a)):h},[c]),i=f.useMemo(()=>{const a=[],o=new Map;for(const d of p)o.has(d.group)||(o.set(d.group,[]),a.push(d.group)),o.get(d.group).push(d);return a.map(d=>({group:d,items:o.get(d)}))},[p]),s=h.find(a=>a.id===u)||h[0],m=h.findIndex(a=>a.id===s.id),y=m>0?h[m-1]:null,n=m<h.length-1?h[m+1]:null,l=a=>{var o;r(a),(o=document.getElementById("doc-scroll"))==null||o.scrollTo({top:0})};return e.jsxs("div",{className:"flex h-screen w-full flex-col overflow-hidden bg-white",children:[e.jsxs("header",{className:"flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-5 py-3.5 sm:px-6",children:[e.jsx("span",{className:"flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm",children:e.jsx(v,{className:"h-5 w-5"})}),e.jsxs("div",{className:"min-w-0",children:[e.jsx("h1",{className:"truncate text-lg font-bold leading-tight text-slate-900",children:"FacultyOps Documentation"}),e.jsx("p",{className:"truncate text-xs text-slate-500",children:"How every page works, each field, and where the data comes from."})]}),e.jsxs("span",{className:"ml-auto hidden rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500 sm:inline",children:[h.length," sections"]})]}),e.jsxs("div",{className:"flex min-h-0 flex-1 overflow-hidden",children:[e.jsxs("aside",{className:"flex w-72 shrink-0 flex-col border-r border-slate-200 bg-slate-50/60",children:[e.jsx("div",{className:"shrink-0 border-b border-slate-200 p-3",children:e.jsxs("div",{className:"relative",children:[e.jsx(x,{className:"pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"}),e.jsx("input",{value:c,onChange:a=>t(a.target.value),placeholder:"Search docs…",className:"h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"})]})}),e.jsxs("nav",{className:"min-h-0 flex-1 overflow-y-auto p-2.5",children:[i.map(({group:a,items:o})=>e.jsxs("div",{className:"mb-3",children:[e.jsx("div",{className:"px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400",children:a}),o.map(d=>{const b=u===d.id;return e.jsxs("button",{onClick:()=>l(d.id),className:`group flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition ${b?"bg-brand-600 font-medium text-white shadow-sm":"text-slate-600 hover:bg-white hover:text-slate-900"}`,children:[e.jsx("span",{className:`h-1.5 w-1.5 shrink-0 rounded-full ${b?"bg-white":"bg-slate-300 group-hover:bg-brand-400"}`}),e.jsx("span",{className:"truncate",children:d.title})]},d.id)})]},a)),!p.length&&e.jsxs("div",{className:"px-3 py-6 text-center text-sm text-slate-400",children:["No section matches “",c,"”."]})]})]}),e.jsx("section",{id:"doc-scroll",className:"min-h-0 flex-1 overflow-y-auto bg-white",children:e.jsxs("div",{className:"mx-auto max-w-5xl px-6 py-8 sm:px-10 lg:px-14",children:[e.jsxs("div",{className:"mb-5 flex items-center gap-1.5 text-xs font-medium text-slate-400",children:[e.jsx("span",{children:s.group}),e.jsx(w,{className:"h-3.5 w-3.5"}),e.jsx("span",{className:"text-slate-600",children:s.title})]}),e.jsx(S,{source:s.body}),e.jsxs("div",{className:"mt-12 grid gap-3 border-t border-slate-100 pt-6 sm:grid-cols-2",children:[y?e.jsxs("button",{onClick:()=>l(y.id),className:"flex flex-col items-start rounded-xl border border-slate-200 px-4 py-3 text-left transition hover:border-brand-300 hover:bg-brand-50/40",children:[e.jsx("span",{className:"text-[11px] font-semibold uppercase tracking-wide text-slate-400",children:"← Previous"}),e.jsx("span",{className:"mt-0.5 text-sm font-medium text-slate-800",children:y.title})]}):e.jsx("span",{}),n?e.jsxs("button",{onClick:()=>l(n.id),className:"flex flex-col items-end rounded-xl border border-slate-200 px-4 py-3 text-right transition hover:border-brand-300 hover:bg-brand-50/40 sm:col-start-2",children:[e.jsx("span",{className:"text-[11px] font-semibold uppercase tracking-wide text-slate-400",children:"Next →"}),e.jsx("span",{className:"mt-0.5 text-sm font-medium text-slate-800",children:n.title})]}):e.jsx("span",{})]})]})})]})]})}export{k as default};
