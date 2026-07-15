# Deployment & Environment Setup — Marutham AgroLink v1.0

How to stand the application up from a clean checkout. Two processes run: the **backend
API** (Express, serves `/api` + the built React console at `/app` + the static home page)
and optionally the **Next.js shop** (public marketplace). The backend runs fine alone;
without the shop, the static `home.html` is served as the landing page.

## Prerequisites

- **Node.js 20+**
- **pnpm** via Corepack (`corepack enable`) — the monorepo uses it
- A **Supabase project** (Postgres + PostgREST). One project is enough for UAT.

## 1. Install

```bash
corepack enable
pnpm install --frozen-lockfile        # monorepo (frontend + shared packages)
npm --prefix backend ci               # backend deps
```

## 2. Configure environment

Copy the template and fill it in:

```bash
cp backend/.env.example backend/.env
```

Required for the app to boot:

| Key                    | What it is                                                      |
| ---------------------- | --------------------------------------------------------------- |
| `SUPABASE_URL`         | Supabase project URL                                            |
| `SUPABASE_SERVICE_KEY` | Service-role key (server-side only — never ship to the browser) |
| `JWT_SECRET`           | Long random string; signs auth tokens                           |
| `PORT`                 | API port (default 3000)                                         |

Required for **migrations** (the server never uses it, the migration runner does):

| Key            | What it is                                                                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL` | Direct Postgres URI. Use the **session pooler** string, **port 5432**. See the notes in `.env.example` — the password in the string is literal. |

Security (set before any non-local deploy):

| Key                | What it is                                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| `CORS_ORIGINS`     | Comma-separated browser origins allowed to call the API. Blank = open (same-origin only).                |
| `TRUST_PROXY_HOPS` | Number of reverse proxies in front of the server (default 1). The rate limiter needs the real client IP. |

Optional (features degrade gracefully if unset):

| Key                | Effect if unset                                             |
| ------------------ | ----------------------------------------------------------- |
| `SMTP_*`           | Email (approvals, OTP) disabled — logged to console instead |
| `MSG91_*`          | SMS disabled — OTP logged to console                        |
| `SHOP_URL`         | Public shop proxy off — static `home.html` served instead   |
| `DATA_GOV_API_KEY` | Daily mandi price sync skipped                              |

## 3. Build the database from empty

```bash
cd backend
npm run db:migrate          # applies every migration → full schema
npm run db:seed             # reference data + one login per role
```

Verify the schema was built correctly from migrations alone (optional but recommended):

```bash
npm run db:verify-rebuild   # replays all migrations into a throwaway schema and diffs
```

> The database is the repository's to define: every schema change is a versioned file in
> `backend/db/migrations/`. Do not run schema SQL by hand — add a migration and re-run
> `db:migrate`, then `db:snapshot` and commit the updated `schema.json`.

## 4. Build the frontend

```bash
pnpm build                  # builds the React console → apps/web/dist
pnpm build:shop             # builds the Next.js shop (only if you run it)
```

## 5. Run

```bash
cd backend && npm start     # API + console at http://localhost:3000  (console at /app)
```

If running the shop, start it separately and point `SHOP_URL` at it.

## 6. Confirm it's healthy

```bash
curl -s http://localhost:3000/api/config/stats            # → 200 with JSON counts
curl -sD - -o /dev/null http://localhost:3000/api/config/stats | grep -i x-frame-options
```

Then open `http://localhost:3000/app` and log in with any account from
[TEST_ACCOUNTS.md](./TEST_ACCOUNTS.md).

## Deploying a public UAT URL on Render (recommended)

The repo ships a `render.yaml` blueprint that builds the console and serves everything as
one web service. The build/start commands in it are verified. What only you can do is the
account + secrets — Render can't be given the Supabase service key by anyone but you.

1. **Create a Render account** at render.com (free tier is fine for UAT; free instances
   sleep when idle and wake on the next request — the first hit after a nap is slow).
2. **New → Blueprint**, connect the GitHub repo `sonajus007-commits/marutham-agrolink`.
   Render reads `render.yaml` and proposes the `marutham-agrolink` service.
3. **Fill the secrets** it prompts for (all marked `sync:false`, so they live only in
   Render, never in git). At minimum:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `JWT_SECRET` — copy from `backend/.env`.
   - Leave `CORS_ORIGINS` blank for now; after the first deploy Render gives you a URL
     (e.g. `https://marutham-agrolink.onrender.com`) — set `CORS_ORIGINS` and `APP_URL`
     to it and redeploy.
4. **Deploy.** When it's live, the app is at `https://<your-service>.onrender.com/app`.
   The nine seed accounts already exist in the database, so testers can log in
   immediately — no seeding step needed (the DB is the same Supabase project).
5. **Health check:** `https://<your-service>.onrender.com/api/config/stats` → 200.

> **Read this before sharing the URL.** A public deploy points at the SAME Supabase
> project you develop against — it is the real/only database. The seed accounts use the
> weak shared password `Seed@1234`, and `HOTN_LAKA01` is full Head Office admin. On a
> public URL, anyone who finds it and tries the obvious seed login gets admin over real
> data. For a time-boxed UAT on test data this is usually an acceptable, deliberate risk
> — but **change the Head Office password off the default before sharing the link widely**,
> and take the service down when UAT ends. See KNOWN_LIMITATIONS.md.

### Generic host (VM / other PaaS)

- Set every required env var in the host's config, **not** in a committed file.
- Set `NODE_ENV=production`, `CORS_ORIGINS` to the real frontend origin, and
  `TRUST_PROXY_HOPS` to match the host's proxy layer (most PaaS = 1).
- Build: `corepack enable && pnpm install --frozen-lockfile && pnpm build && npm --prefix backend ci`
- Start: `node backend/server.js` (from the repo root — paths resolve from `__dirname`).
- Run `npm run db:migrate` once per deploy that introduces a migration.
- The process is stateless apart from the DB; it is safe to restart. It self-heals: an
  unhandled error is logged and the process stays up rather than crashing.
