# Marutham AgroLink — Architecture Review & Migration Plan

Status: **proposal, awaiting approval.** No implementation has begun.
Date: 2026-07-10 · Reviewed against commit `e988e67`.

---

## 1. Architecture Review

The brief assumes a vanilla HTML/CSS/JS frontend. That is only half true today. A
React + TypeScript + pnpm monorepo already exists and three of the four user roles
have been migrated into it. The migration is a strangler-fig in progress, not a
greenfield decision.

**What exists**

| Area              | State                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------- |
| Monorepo          | pnpm workspaces — `apps/web` + 5 packages (`ui`, `lib`, `tokens`, `api-client`, `i18n`) |
| Frontend (new)    | React 18, TypeScript strict, Vite 5, react-router 6, served at `/app`                   |
| Frontend (legacy) | ~13,100 lines of HTML/JS/CSS still live at `/`                                          |
| Backend           | Express 4, 17 route modules, 11 util modules, RBAC in `backend/middleware/auth.js`      |
| Database          | Supabase Postgres, 24 ordered migrations, `schema.json` snapshot + `db:check` verifier  |
| Auth              | Express-issued JWT, bcrypt, session in `localStorage`                                   |
| Charts            | ECharts via `apps/web/src/components/EChart.tsx`                                        |
| Maps              | ECharts + GeoJSON, bundled by `apps/web` (`src/assets/tn-districts.geo.json`)           |
| Tests             | Vitest (`packages/lib`), `node:test` (backend), CI on push + PR                         |

**Migration progress by role — COMPLETE.**

The strangler-fig finished: every signed-in screen is React, under `/app`. The
legacy pages below were deleted (~12.6k lines) once the last dashboard was ported.

| Role            | Was                        | Now                                                     |
| --------------- | -------------------------- | ------------------------------------------------------- |
| Agent           | `agent.html` (896 ln)      | `/app/agent` — incl. the field dashboard                |
| Consumer        | `consumer.html` (2,047 ln) | `/app/consumer`                                         |
| Farmer          | `farmer.html` (1,593 ln)   | `/app/farmer`                                           |
| Admin           | `admin.html` (4,855 ln)    | `/app/admin` — incl. executive / operations / adminhead |
| Login + sign-up | `index.html` (1,043 ln)    | `/app/login`, `/app/register`                           |

What survives under `frontend/` is NOT legacy debt — each file is load-bearing:
`home.html` (public landing page and the shop's outage fallback), `img/` (the React
app loads `/img/logo-sm.jpg` on four pages) and `js/config.js` (`API_BASE = '/api'`,
which `home.html` needs). See the static-mount comment in `backend/server.js`.

**Code quality.** The backend is in good shape: routes are thin, money handling has
been through a dedicated paise/rupee correction, and the schema is reproducible and
verified in CI. `packages/lib` is pure, tested TypeScript. The weak seam is styling
and the component layer, covered next.

---

## 2. Technology Gap Analysis

| Target requirement         | Today                                           | Gap                                        | Is it "configuration"? |
| -------------------------- | ----------------------------------------------- | ------------------------------------------ | ---------------------- |
| React + TypeScript         | ✅ React 18, TS strict                          | none                                       | —                      |
| Monorepo, packages         | ✅ pnpm workspaces                              | none                                       | —                      |
| Next.js / App Router / RSC | Vite + react-router                             | **framework swap**                         | ❌ rewrite             |
| Tailwind CSS               | 513 lines hand CSS                              | not installed                              | ❌ restyle             |
| shadcn/ui                  | 17 hand-built components                        | not installed                              | ❌ rebuild             |
| Lucide Icons               | **no icon library at all**                      | not installed                              | ✅ mostly config       |
| Design tokens              | 20 colours, 2 radii, 2 shadows                  | **358 hex literals vs 16 `var(--)` uses**  | ❌ tokenize            |
| Dark theme                 | none                                            | no `prefers-color-scheme`, no `data-theme` | ❌ build               |
| Supabase Auth              | Express JWT + bcrypt                            | **identity model mismatch — see §11**      | ❌ data migration      |
| RBAC in Express            | ✅ `requireAuth` / `requireRole`                | none                                       | —                      |
| Chart wrapper package      | one component in `apps/web`                     | extract to `packages/charts`               | ✅ move                |
| Maps package               | GeoJSON in legacy JS only                       | build `packages/maps`                      | ❌ build               |
| Feature-first folders      | role-first `pages/{agent,consumer,farmer}`      | partial                                    | ✅ move                |
| Mobile-ready packages      | `lib`/`api-client`/`tokens`/`i18n` are DOM-free | `ui` is web-only                           | partial                |

**The headline correction to the brief.** Of the twelve gaps, three are genuinely
configuration (Lucide, chart extraction, folder moves). The rest are engineering
work of a week or more each. "The inputs already exist and need to be configured"
is accurate for the monorepo and React; it is not accurate for Tailwind, shadcn/ui,
the design system, or Supabase Auth. I would rather say that now than discover it
in week three.

The single fact that governs the styling work: **358 hard-coded hex values against
16 distinct CSS variables.** The design system was parked once already for exactly
this reason. Installing Tailwind and shadcn/ui on top of that does not fix it — it
adds a third styling system beside the two that exist. Tokenization has to come
first, or the theming is cosmetic.

---

## 3. Current vs Target Stack

| Layer        | Current              | Target (brief)     | Recommended                    | Why                                            |
| ------------ | -------------------- | ------------------ | ------------------------------ | ---------------------------------------------- |
| Framework    | React + Vite         | Next.js App Router | **React + Vite**               | §13                                            |
| Language     | TypeScript           | TypeScript         | TypeScript                     | —                                              |
| Routing      | react-router 6       | App Router         | react-router 6                 | authed SPA, no SEO surface                     |
| Styling      | hand CSS             | Tailwind           | **Tailwind v4**                | CSS-first `@theme` matches existing token file |
| Components   | 17 hand-built        | shadcn/ui          | shadcn/ui in `packages/ui`     | single source, as briefed                      |
| Icons        | none                 | Lucide             | Lucide                         | —                                              |
| Backend      | Express 4            | Express 4          | Express 4                      | —                                              |
| AuthN        | Express JWT + bcrypt | Supabase Auth      | **decision required**          | §11                                            |
| AuthZ        | Express RBAC         | Express RBAC       | Express RBAC                   | —                                              |
| DB / Storage | Supabase             | Supabase           | Supabase                       | —                                              |
| Charts       | ECharts              | ECharts            | `packages/charts`              | —                                              |
| Maps         | ECharts + GeoJSON    | ECharts + GeoJSON  | `packages/maps`, config-driven | —                                              |

---

## 4. Migration Strategy

Phase 1 of the brief (review) is this document. The phases below replace Phases 2–4,
reordered so that the blocking work comes first.

**Phase 2A — Tokenize (prerequisite, blocks everything else)**
Make `packages/tokens/src/tokens.ts` the single source of truth and generate
`tokens.css` from it. Today the two files are kept in sync by hand — the file says so
in a comment. Extend the scale to cover typography, spacing, elevation, and a dark
palette. Replace the 358 hex literals with token references. Nothing visual changes.

**Phase 2B — Tailwind v4**
Install Tailwind, project the tokens into `@theme` so `bg-leaf` and `text-charcoal`
resolve to the same values the CSS variables already carry. Both systems coexist;
`ui.css` is migrated last.

**Phase 2C — shadcn/ui into `packages/ui`**
Rebuild the 17 components behind their _existing exported API_ so `apps/web` does not
change. Add Lucide. shadcn's default look is deliberately generic — the brief rejects
generic — so the Marutham theme is applied through tokens at this step, not later.

**Phase 2D — Extract `packages/charts` and `packages/maps`**
Move `EChart.tsx`; build the map registry (§8).

**Phase 3 — Shared shell**
Header, sidebar, footer, nav, breadcrumbs, login, dashboard skeleton — on the new
component library.

**Phase 4 — Modules, in this order**
Consumer 2C → Farmer 3C → **Admin** (the 4,852-line page) → folder restructure to
feature-first.

Folders move _last_, once nothing else is in flight. Restructuring while three
modules are half-migrated maximizes conflict for zero user-visible gain.

**Freeze rule.** Phases 2A–2C touch every component in the app. Feature work should
pause for their duration, per your instruction to park ongoing changes. CI already
runs typecheck + test + build on every push; that is the regression net.

---

## 5. Estimated Effort

One engineer, working days. Ranges are ±40% — treat as sizing, not commitment.

| Phase | Work                                                                  | Days      |
| ----- | --------------------------------------------------------------------- | --------- |
| 2A    | Tokenize; generate `tokens.css` from `tokens.ts`; retire 358 literals | 3–5       |
| 2B    | Tailwind v4 + `@theme` projection                                     | 2–3       |
| 2C    | shadcn/ui rebuild of 17 components + Lucide                           | 8–12      |
| 2D    | `packages/charts`, `packages/maps`                                    | 3–4       |
| —     | Dark theme + accessibility pass                                       | 3–5       |
| 3     | Shared shell (header/sidebar/nav/login/dashboard)                     | 5–8       |
| 4     | Consumer 2C                                                           | 3–5       |
| 4     | Farmer 3C                                                             | 3–5       |
| 4     | **Admin module**                                                      | 20–30     |
| 4     | Feature-first restructure                                             | 3–5       |
|       | **Subtotal**                                                          | **53–82** |
| opt   | Auth capabilities on Express (reset, verify, MFA)                     | 6–10      |
| opt   | Supabase Auth migration, _if approved_                                | +10–15    |
| opt   | Next.js migration, _if approved_                                      | +15–25    |

Admin alone is a third of the total. It is the schedule.

---

## 6. Risk Assessment

| #   | Risk                                                                                             | Severity | Mitigation                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------- |
| 1   | shadcn rebuild regresses working Agent/Consumer/Farmer flows                                     | **High** | Swap components behind unchanged `packages/ui` exports; feature freeze; CI typecheck+test+build; manual pass per role |
| 2   | Three styling systems coexist mid-migration (`app.css`, `ui.css`, Tailwind) → specificity fights | High     | Tokenize first; migrate `ui.css` last; scope Tailwind preflight                                                       |
| 3   | Legacy `frontend/css/app.css` duplicates the palette and will drift                              | Medium   | Generate it from `tokens.ts`, or freeze legacy styling entirely                                                       |
| 4   | Single Supabase project, no production, **no rebuild path from repo**                            | **High** | Verify migrations 001–024 actually reproduce the schema (`db:check`) _before_ any auth work; snapshot first           |
| 5   | Supabase Auth cannot represent `login_id` identities (§11)                                       | **High** | Decision gate before any code                                                                                         |
| 6   | Next.js migration forks routing _and_ the auth model for no user-visible gain                    | Medium   | Recommend declining; see §13                                                                                          |
| 7   | Admin is 4,852 lines of untyped HTML/JS with no tests                                            | High     | Migrate after the component library is stable; port role dashboards first (they already have JS modules)              |
| 8   | `tokens.ts` / `tokens.css` sync is manual and already documented as a hazard                     | Medium   | Phase 2A generates one from the other                                                                                 |

---

## 7. Folder Structure Proposal

The brief's `apps/admin` split is not recommended yet. Admin shares the session,
the API client, and the component library with `apps/web`; splitting it now means two
builds, two deploys, and a cross-app auth story, to solve a problem (bundle size)
that route-level lazy loading solves for free. Split when a separate team owns it.

```text
apps/
  web/                 # all roles, route-split and lazily loaded
  mobile/              # future React Native

packages/
  ui/                  # shadcn/ui + Marutham theme — the only component source
  tokens/              # tokens.ts is source of truth; tokens.css is generated
  charts/              # ECharts wrappers
  maps/                # GeoJSON registry + hierarchy
  api-client/          # typed REST client (exists)
  lib/                 # pure business logic, tested (exists)
  i18n/                # en / ta (exists)

backend/               # Express 4 — unchanged
database/              # migrations, schema snapshot
docs/
```

---

## 8. Feature-Based Architecture Proposal

Inside `apps/web/src`, replace role-first `pages/{agent,consumer,farmer}` with:

```text
features/
  auth/  dashboard/  farmers/  consumers/  orders/  inventory/
  logistics/  subscriptions/  finance/  reports/  analytics/
  notifications/  settings/
shared/
  ui/  hooks/  services/  utils/  types/  constants/
```

Each feature owns its pages, components, hooks, services, types, validation, tests.

**Map hierarchy.** `packages/maps` exposes a registry keyed by level so new states are
added by dropping in GeoJSON and a config entry — no code change, as required:

```text
country → state → district → taluk → village → hub → farmer
```

Only Tamil Nadu's GeoJSON ships initially; the registry is lazy, so unused states
cost nothing in the bundle.

---

## 9. Design System Proposal

`tokens.ts` becomes the source; `tokens.css` and the future React Native theme are
generated from it. Scales to add: typography, spacing, elevation, motion, dark palette.

The brief's palette maps cleanly onto what already exists — this is a renaming and an
extension, not a rebrand:

| Brief                 | Existing token | Value     |
| --------------------- | -------------- | --------- |
| Marutham Blossom Pink | `--bloom`      | `#CB4E86` |
| Fresh Leaf Green      | `--leaf`       | `#4E9F3D` |
| Harvest Gold          | `--gold`       | `#d4a843` |
| Warm White            | `--cream`      | `#f7f3ee` |
| Soft Grey             | `--gray`       | `#5a6472` |
| Charcoal              | `--text`       | `#1c2820` |

Two things the brief leaves implicit and should not: pink is currently used _sparingly_
as an accent (offers, farmer's choice) and the comment in `tokens.css` says so. Promoting
it to "signature accent" is a real visual change to shipped screens — worth confirming.
And there is no dark palette at all today; it must be authored, not derived, if contrast
ratios are to meet WCAG AA.

---

## 10. Component Library Proposal

`packages/ui` is already the single source — 17 components, consumed by all three
migrated roles. That principle is established; the task is to re-found it on shadcn/ui.

Existing: `Badge` `Button` `Card` `EmptyState` `Field` `FilterChips` `KpiCard` `Modal`
`OrderPipeline` `OrderProgress` `OrderTimeline` `QtyStepper` `Sheet` `Spinner`
`StarRating` `StatTile`

Missing, per the brief: Table, Tabs, Accordion, Breadcrumbs, Pagination, DatePicker,
FileUpload, Toast, Skeleton, Search, Dialog, Notifications, Chart container, Map container.

Note that `OrderPipeline`, `OrderProgress`, `OrderTimeline`, `QtyStepper`, and
`StarRating` are **domain** components, not primitives. shadcn has no equivalent; they
should keep their current implementations and simply be restyled. Only the primitives
are genuinely replaceable.

---

## 11. Authentication & Authorization Strategy

**This is the decision that most needs your input, and my finding contradicts the brief.**

The brief says "Replace the custom authentication implementation with Supabase Auth
where feasible" and "Preserve existing users where possible." The blocker is not
preservation. It is that **Supabase Auth cannot express this application's identity model.**

What the schema says (`001_baseline.sql`):

```sql
login_id       text unique not null,   -- e.g. CNTNPDK_KAVA01
phone          text unique not null,
password_hash  text not null,
email          text,                   -- nullable, NOT unique
```

Users authenticate with a **generated login ID or a phone number**. `backend/routes/auth.js`
matches on `phone.eq.{x},login_id.eq.{x}`. Email is optional and not unique, so it cannot
serve as an identity for the farmer and consumer populations. Supabase Auth is email- or
phone-first.

The three routes out, and what each actually costs:

1. **Synthetic emails** (`FRTNPDK_RAM01@…internal`). Works mechanically. But it disables
   password reset and email verification for precisely the users who lack an email —
   which is the entire reason the brief wants Supabase Auth. Self-defeating.
2. **Phone auth.** `phone` is unique and not null, so identities backfill cleanly. Requires
   a paid SMS provider, ongoing per-message cost, and converts a password login into an OTP
   login — a product change, not a technical one.
3. **Require email for everyone.** A product decision about rural smallholder farmers, not
   an architecture decision. Not mine to make.

And note what Supabase Auth would actually replace. `requireAuth` does five things:
verify the JWT, load the user row, reject blocked accounts, apply farmer approval gates
(`pending_review` / `rejected` / `suspended → needs_payment`), and attach delegated
HR-Admin / Board-Director trust flags. Supabase Auth replaces **only the first**. Because
the brief correctly keeps RBAC in Express, every remaining line stays. Net saving is roughly
fifteen lines of `jwt.verify`.

The genuine wins — password reset, email verification, MFA, refresh-token rotation,
session revocation — are all obtainable on the existing Express JWT. `nodemailer` is
already a dependency.

One argument does cut the other way, and it is a good one: there is no production
environment, so today's users are test data. A migration will never again be this cheap.
If email or phone is destined to become the universal identity, doing it now is right.
If `login_id` remains the identity for farmers, Supabase Auth will never fit, and adopting
it means maintaining a shadow identity table forever.

**Recommendation: defer Supabase Auth.** Spend 6–10 days adding reset, verification, and
TOTP MFA to the Express JWT. Keep AuthN and AuthZ separate, as briefed. Revisit only if the
product decides on a universal email/phone identity — and then do it as a dedicated,
tested migration with a rollback path, not as part of a frontend restyle.

---

## 12. Mobile Readiness Assessment

Better than the brief assumes. Four of five packages are already DOM-free and would port
to React Native today:

| Package      | RN-portable | Note                                                        |
| ------------ | ----------- | ----------------------------------------------------------- |
| `lib`        | ✅          | pure TS, tested                                             |
| `api-client` | ⚠️          | pure except `localStorage` in `session.ts` — inject storage |
| `tokens`     | ✅          | `tokens.ts` is plain objects                                |
| `i18n`       | ✅          | i18next runs on RN                                          |
| `ui`         | ❌          | DOM + CSS; shadcn/ui is Radix, web-only                     |

Three consequences worth stating plainly. `session.ts` hard-codes `localStorage` — swap it
for an injected storage adapter and `api-client` becomes portable for the cost of an hour.
shadcn/ui will **not** run on React Native, so what mobile shares is design tokens, the API
layer, business logic, and component _patterns_ — never component code. That is what the
brief asks for, so this is fine, but it should be said out loud rather than discovered.
And ECharts is web-only; `packages/charts` should therefore keep its prop contract in a
separate types module so an RN chart library can implement the same interface.

Making `tokens.ts` the generated source (Phase 2A) is what turns "mobile-ready" from an
aspiration into a fact.

---

## 13. Final Recommendation

**Do not migrate to Next.js. Stay on React + Vite.** The brief invites this argument, so
here it is:

- **No SEO or RSC surface.** Every screen behind `/app` is authenticated, per-user, and
  role-gated. Server Components render on a server that would need the user's JWT; today
  that JWT lives in `localStorage` as a bearer token. Adopting RSC forces cookie sessions
  and a BFF layer that would duplicate the Express RBAC the brief explicitly wants kept in
  Express.
- **The strangler-fig depends on it.** Express serves legacy HTML at `/` and the SPA at
  `/app` via Vite's `base: '/app/'`. Next.js needs its own Node server; you would run and
  deploy two, and coordinate `basePath` against the legacy routes, throughout the migration.
- **It buys nothing the app needs.** Routing, code-splitting, and env handling already work.
  The cost is rewriting react-router, six React contexts, and the dev proxy.
- **It hurts mobile.** Server Components have no React Native story. Vite keeps the shared
  packages honest.

If the public marketing site (`home.html`, `marutham_homepage_sample.html`) ever needs SEO,
put _that_ on Next.js as a separate app. It has no authentication and no shared state — the
one place where the framework earns its cost.

**Accept from the brief, in order:** Tailwind v4, shadcn/ui in `packages/ui`, Lucide, the
design system, `packages/charts`, `packages/maps`, feature-first folders, dark theme.

**Sequence that matters:** tokenize before Tailwind, Tailwind before shadcn, shadcn before
the shared shell, shell before modules, Admin before the folder restructure.

**Two decisions block Phase 2A** — the Next.js question above, and the Supabase Auth
question in §11.
