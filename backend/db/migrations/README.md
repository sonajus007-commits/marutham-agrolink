# Database migrations

Every table and column in the database is created by exactly one file in this
directory. They are applied **in filename order**, starting from `001_baseline.sql`
on an empty database.

## Applying them

**By hand, in the Supabase SQL editor.** There is no automation, and none is
possible from this repo:

- `psql` is not installed and there is no `DATABASE_URL` or database password —
  `backend/.env` carries only `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`.
- The Supabase JS client speaks PostgREST, which executes queries, not DDL.
- The `exec_sql` RPC that the old `backend/migrate_*.js` scripts called **does
  not exist** on this project. Those six scripts never applied anything — they
  printed an error and exited. They have been deleted; their SQL lives here.

So: open each unapplied file in order, paste, run. Every migration is written to
be idempotent (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`), so
re-running one is safe.

## Knowing what has been applied

There is no `schema_migrations` table, and deliberately so: with hand-applied
migrations, a bookkeeping table is one more thing to forget to update, and it
would drift from reality. **The database is the record.** The repo holds the
expectation, and the tooling reports the delta:

```bash
npm run db:check      # does the live database match schema.json?
npm run db:coverage   # can these migrations rebuild the live database?
npm run db:offline    # can these migrations rebuild schema.json?   (no DB needed)
npm run db:snapshot   # refresh schema.json from the live database
```

`backend/db/schema.json` is a committed snapshot of every table, column, type,
nullability, default, primary key and foreign key. `db:offline` runs in CI, so a
column that reaches the database without a migration fails the build.

### Why this matters

`users.delivery_addresses` was referenced by `PATCH /auth/me` for months while
the column did not exist. Every address save returned a 500, and the checkout's
saved-address picker was permanently empty. Nothing noticed, because nothing
compared the code's expectations to the database.

`npm run db:check` now prints exactly that:

```
✘ MISSING COLUMN  users.delivery_addresses — a migration has not been applied
```

`farmer_listings.images` was the mirror image: it existed in the database, added
by hand, created by no migration. A rebuilt database would have silently lost
every product photo. `npm run db:coverage` found it; `024_farmer_listing_images.sql`
fixes it.

## What is NOT covered

The snapshot is built from PostgREST's OpenAPI document, which cannot see
`pg_catalog`. It therefore knows nothing about:

- CHECK constraints
- indexes
- triggers and functions (including the `user_audit_log` trigger)
- row-level security policies
- sequence ownership

Those live in the migration SQL and are applied with it, but they are **not
verified**. For a truly complete baseline, run `pg_dump --schema-only` once you
have direct database credentials, and replace `001_baseline.sql` with it.

## Adding a migration

1. Create `NNN_short_name.sql` with the next number. Make it idempotent.
2. Apply it in the Supabase SQL editor.
3. `npm run db:snapshot` to refresh `schema.json`.
4. `npm run db:coverage` to confirm the repo and the database agree.
5. Commit the migration **and** the updated `schema.json` together.

## Tombstones

`010_renewal_payment.sql` is a no-op. It targeted the wrong table, was never
applied, and is kept only so the numbering stays stable. See the file for detail.
