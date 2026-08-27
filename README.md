# HealthPrep CBT — Allied Health Exam Prep PWA

Offline-first Computer-Based Testing and exam-prep PWA for Nigerian allied
health licensing exam candidates: **Nursing**, **Community Health
(CHEW/JCHEW)**, **Pharmacy Technician**, **Medical Lab Tech**, and **Public
Health**.

Built with Vue 3 (`<script setup>` + TypeScript), Vite, Dexie.js
(IndexedDB), Pinia, Tailwind CSS, and `vite-plugin-pwa` (Workbox).

## Features

- **Authentication** — local-first registration/login (Name, Email,
  Password, and a mandatory Course selection). Passwords are hashed with a
  per-user salt via Web Crypto (`src/utils/crypto.ts`) and never stored in
  plaintext. Session persists in `localStorage` (`src/stores/auth.ts`). All
  routes except `/login` and `/register` require an authenticated session —
  the router guard in `src/router/index.ts` redirects unauthenticated
  visitors to `/login` (preserving their intended destination via
  `?redirect=`).
  - **Course selection at registration**: the sign-up form has a mandatory
    dropdown of departments (Nursing, CHEW, Pharmacy Technician, Medical Lab
    Tech, Public Health) sourced from `db.departments`. Submitting without a
    selection is blocked client-side. Because the course is set at
    registration, new users skip the separate department-picker screen and
    land straight on the dashboard.
  - **Test account**: a hardcoded demo account (`user@example.com` /
    `password123`, pre-enrolled in Nursing with starting credits) is seeded
    idempotently at boot via `ensureDemoUserSeeded()` in `src/db/index.ts`.
    The login screen shows these credentials in a small note below the
    form — tapping it autofills the fields.
- **Dashboard** (`/home`) — credit balance, a leaderboard snippet (top 3),
  weak-area preview, and an enrolled-subjects grid.
- **Leaderboard** (`/leaderboard`) — ranks every account registered on this
  device against a seeded set of seeded mock competitors. Score = correct
  answers × 10 + streak bonus + lifetime credits earned
  (`src/composables/useLeaderboard.ts`).
- **Buy Credit** (in Wallet) — pick a credit package, pick Paystack (Titan
  Trust) or Flutterwave, get a mock virtual account (account number, bank
  name, amount, reference), then tap **Verify Payment** to simulate
  confirmation and credit the wallet. This is a UI/logic mockup — there's no
  real payment gateway call.

- **Admin Portal** (`/admin`, `/admin/users`, `/admin/content`,
  `/admin/leaderboard`) — a role-gated back office for managing the
  platform. See below.

## Admin Portal

A hardcoded admin account (`admin@example.com` / `admin12345`, shown on the
login screen) unlocks a separate portal with its own sidebar shell
(`src/components/AdminShell.vue`):

| Page | Route | Purpose |
|------|-------|---------|
| Dashboard | `/admin` | Platform stats — students, departments, courses, subjects, questions, exams, payments, revenue — plus a merged Recent Activity feed (signups, exam completions, successful payments) |
| Users | `/admin/users` | Search/list every registered account, with a credit-adjustment modal (add or deduct, logged as a wallet transaction) |
| Academic | `/admin/academic` | Full CRUD for Departments, Courses, and Subjects, with activate/deactivate toggles and delete guards that respect the Department → Course → Subject → Question hierarchy |
| Content | `/admin/content` | Pick a department → subject, add/edit/delete questions by hand, or bulk-import via CSV (see below) |
| Payments | `/admin/payments` | Payment Dashboard (totals, revenue, success/pending/failed/refunded counts, daily/weekly/monthly/yearly breakdown) + a searchable, filterable, paginated Payment Records table with a details drawer and refund action |
| Leaderboard | `/admin/leaderboard` | Add/edit/delete the seeded mock competitor rows shown on the public leaderboard |

**Role & access control**: `User.role` is `'student' | 'admin'`.
Self-registration always creates a `'student'`; the admin account is seeded
once via `ensureAdminUserSeeded()`. The router guard treats any route with
`meta.requiresAdmin` as off-limits to non-admins (bounced to `/home`) and
off-limits to signed-out visitors (bounced to `/login`). Admins also skip
the department-selection requirement entirely, since they have no
department/exam context of their own.

### Academic hierarchy: Department → Course → Subject → Questions

`Course` is a new tier between `Department` and `Subject`
(`src/types/healthApp.ts`). Every seeded department gets one default "Core
Programme" course at boot so existing subjects always have somewhere to
attach; `ensureAcademicBackfill()` in `src/db/index.ts` retrofits this onto
any department/subject that predates the Course tier, so nothing breaks for
data seeded by an earlier version of this app. `Subject.departmentId` is
kept (denormalized from its course) purely for backward compatibility with
code that already queries subjects by department — `updateSubject()`
keeps it in sync automatically if a subject's course changes.
`Department`/`Course`/`Subject` all gained `isActive`; the student-facing
pickers (`DepartmentSelectView`, `SubjectListView`, `HomeDashboardView`)
filter on it, so deactivating something in Academic Management actually
hides it from students rather than just being a UI label.

### CSV Bulk Question Import

`AdminImportQuestionsModal.vue` (opened from the Content page) covers the
full flow: **Download sample CSV template** → **Upload** → **Validate**
→ **Preview** (every row shown with per-row errors, e.g. `Unknown subject
"Foo" under "Nursing"`) → **Import** → **Success/failure summary**. Column
resolution reuses the exact same `createQuestion()` used by the manual
"Add Question" form — department/subject are matched by name
(case-insensitive), and topics are auto-created via `resolveOrCreateTopic()`
if they don't already exist, so an admin doesn't need to pre-create every
topic before importing. CSV parsing/export both go through one shared
utility (`src/utils/csv.ts`, wrapping `papaparse`) rather than two separate
implementations.

### Payments

`Payment` (`src/types/healthApp.ts`) is a new table that's the source of
truth for the Wallet's "Buy Credit" flow: a `pending` row is created the
moment a mock virtual account is generated, and flipped to `successful`
(linked to the resulting `WalletTransaction` id) once "Verify Payment" mock-
confirms it. This is deliberately a separate model from `WalletTransaction`
rather than overloading it — `Payment` is the Naira-denominated financial
record (reference, gateway, status, timestamps); `WalletTransaction`
remains the credit ledger. Admins can refund a successful payment from the
Payment Records details drawer, which reverses the credited amount from the
user's wallet (clamped at 0) and flips the status to `refunded`.
`ensurePaymentsSeed()` seeds ~14 historical mock payments (mixed
gateways/statuses/dates) attributed to the demo account so the dashboard
isn't empty on first boot — every number displayed is still computed live
from the `payments` table (`computePaymentStats()`), only those initial
rows are fabricated sample data, same pattern as the seeded question bank.

## Design system

The visual language is built around the subject matter — clinical vital
signs — rather than a generic edtech look.

- **Palette:** `canvas` `#F5F8F7` (paper), `ink` `#0B1F1E` (deep teal-black
  text/panels), `brand` `#0F7A72` (clinical teal, primary), `brand-deep`
  `#083F3B` (hero/gradient), `pulse` `#2EE6B8` (signature mint — live data,
  success), `coral` `#FF5C4D` (alerts, timer warning, weak topics), `gold`
  `#F2A93B` (credits/gamification only).
- **Type:** Space Grotesk (display/scores), IBM Plex Sans (body/UI), IBM
  Plex Mono (numeric readouts) — loaded via Google Fonts in `index.html`.
- **Signature convention — the "readout":** any live/numeric value (exam
  timer, credit balance, streak, score, palette numbers) renders as a dark
  teal chip with mono digits (`.readout` in `src/style.css`). This is
  functional, not decorative: mono-in-a-dark-chip consistently means "this
  number is live" everywhere in the app.
- **Signature motif — the pulse-line:** `src/components/PulseLine.vue` is a
  reusable animated ECG waveform used in the department-picker hero and the
  results-screen score reveal, tying the "vitals" metaphor together without
  literal medical clip-art.

All tokens live in `tailwind.config.js` (`colors`, `fontFamily`,
`boxShadow`, `keyframes`) — change them there to re-theme the whole app.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

```bash
npm run build       # type-checks then builds to dist/ (includes service worker)
npm run preview     # serves the production build locally
npm run typecheck   # vue-tsc only, no build
```

The app has been built and type-checked end-to-end as part of this
scaffold — `npm run build` produces `dist/sw.js`, `dist/manifest.webmanifest`,
and all route chunks with zero TypeScript errors.

## How the pieces fit together

```
index.html
  └─ src/main.ts            seeds IndexedDB, mounts Vue + Pinia + Router
      └─ src/App.vue        shell: router-view + bottom nav
          └─ src/router/    route table + "has picked a department" guard
              └─ src/views/ one view per screen, each a thin wrapper that
                             loads data from Dexie and/or hosts a component
```

| View                     | Route                          | Purpose |
|--------------------------|---------------------------------|---------|
| `LoginView`              | `/login`                         | Sign in (public route) |
| `RegisterView`           | `/register`                      | Create account (public route) |
| `DepartmentSelectView`   | `/`                               | First-run track picker (Nursing, CHEW, Pharm Tech…) |
| `HomeDashboardView`      | `/home`                          | Credits, leaderboard snippet, weak-area preview, enrolled subjects |
| `LeaderboardView`        | `/leaderboard`                   | Full Rank / User / Score ranking |
| `SubjectListView`        | `/subjects/:departmentId`        | Browse all subjects in a track, download for offline |
| `ExamSetupView`          | `/exam/:subjectId/start`         | Choose Practice / Timed Drill / Full Mock, spends credits |
| `ExamSessionView`        | `/exam/session/:examSessionId`   | Hosts `CbtExamView.vue` full-screen |
| `ResultsView`            | `/exam/results/:examSessionId`   | Hosts `PerformanceDashboard.vue` |
| `WeakAreasView`          | `/weak-areas`                    | Full topic-mastery breakdown + one-tap targeted drill |
| `WalletView`             | `/wallet`                        | Credit balance, Buy Credit, transaction history, referral code, sign out |

### Auth

There's no backend — `src/stores/auth.ts` provisions and authenticates
`User` records directly in IndexedDB. `register()` hashes the password with
a random salt and rejects duplicate emails; `login()` verifies the hash;
`logout()` clears the stored session id. The router guard
(`src/router/index.ts`) calls `initAuth()` before every navigation to
restore the session from `localStorage`, then enforces:
1. unauthenticated + non-public route → redirect to `/login`
2. authenticated + `/login` or `/register` → redirect to `/home` or `/`
3. authenticated but no department chosen yet → redirect to `/`

### Data flow for an exam

1. `ExamSetupView` builds an `ExamSession` (shuffled `questionOrder`,
   duration, credit cost) and writes it to `db.exam_sessions`.
2. `ExamSessionView` renders `CbtExamView.vue`, which loads that session's
   questions, spins up `timer.worker.ts`, and writes every answer/flag to
   `db.user_responses` optimistically as the candidate works.
3. On submit (manual or auto via worker `EXPIRED`), `CbtExamView` grades the
   session, updates `db.exam_sessions`, and emits `exam-submitted`.
4. `ExamSessionView` rewards credits via the wallet store, refreshes topic
   mastery, then routes to `ResultsView`.
5. `ResultsView` renders `PerformanceDashboard.vue`, which re-runs
   `useWeakAreaEngine` for the weak/strong topic breakdown and builds the
   shareable canvas performance card.

## The student-count bug (root cause + fix)

`User.role` was added to the schema in a later iteration of this app than
the one where the first real accounts got created. Any account created
before that point has `role === undefined` in IndexedDB — adding a field to
a TypeScript interface doesn't retroactively rewrite already-stored
records. `computeAdminStats()` was filtering with `u.role === 'student'`,
an exact match that silently excluded every one of those legacy accounts:
`totalUsers` could be nonzero while `totalStudents` showed 0, even though
every one of those users genuinely is a student.

Fix, in two layers:
1. **`ensureUserRoleBackfill()`** (`src/db/index.ts`, run at boot in
   `main.ts`) — finds any user whose `role` isn't exactly `'admin'` or
   `'student'` and sets it explicitly (`'admin'` only for the seeded admin
   email, `'student'` otherwise). This fixes the data once, so every other
   place that reads `user.role` directly is also correct.
2. **`computeAdminStats()` itself was hardened** to count students as
   "anyone who isn't an admin" (`u.role !== 'admin'`) rather than an exact
   string match — a second line of defense so the same class of bug can't
   silently reoccur if another field gets added the same way in the future.

Verified with a runtime smoke test (`fake-indexeddb`, not just the type
checker): a legacy user record with no `role` field was inserted, confirmed
to reproduce the bug (`totalStudents` excludes it before backfill), then
confirmed fixed after `ensureUserRoleBackfill()` runs.

## Known gaps (flagged intentionally, not fixed here)

- **Question content**: `src/db/index.ts` still *seeds* placeholder
  questions (`[Sample] Topic — practice question #N`) on first boot, but
  the Admin Portal's Content page (`/admin/content`) is now the real
  pipeline for replacing them — no code changes needed to add real exam
  questions going forward.
- **PWA icons**: `public/pwa-*.png` are solid-color placeholders generated
  for this scaffold — swap in real branded icons before release.
- **No backend**: everything is local-first/offline by design, including
  auth. If you add a server later, `User.passwordHash`/`passwordSalt` and
  `src/stores/auth.ts` are the intended integration seams — swap the local
  hash-and-compare logic for real API calls without touching the router
  guard or any view.
- **Buy Credit is a mockup**: the virtual account screen and "Verify
  Payment" button simulate a Paystack/Flutterwave bank-transfer flow with a
  timed delay — there's no real gateway integration, webhook, or reference
  verification against a live transaction.
- **Leaderboard is single-device**: "real" entries are whichever accounts
  have registered on this browser/device; there's no server to aggregate
  scores across devices.
- **No "promote to admin" UI**: the only admin account is the seeded one;
  granting admin rights to a real registered user would need a small
  addition to the Users page.
- **Refunds don't reverse spent credits**: `refundPayment()` clamps the
  wallet balance at 0 — if a student already spent the purchased credits on
  a mock exam unlock before the refund, the balance can't go negative, so
  the refund is partial in that edge case. This is called out in code
  comments in `src/db/index.ts`.
- **CSV import is single-table**: it resolves department/subject by exact
  (case-insensitive) name match and auto-creates missing topics, but it
  won't create a missing department or subject for you — those still need
  to exist first via Academic Management, which is a deliberate guard
  against silently spawning duplicate departments from a typo in a
  spreadsheet.
