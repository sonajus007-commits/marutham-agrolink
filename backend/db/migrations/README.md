# Database migrations

Every table and column in the database is created by exactly one file in this
directory. They are applied **in filename order**, starting from `001_baseline.sql`
on an empty database — and `npm run db:verify-rebuild` proves it, by doing it.

## Applying them

```bash
npm run db:status          # what is applied, what is pending
npm run db:migrate         # apply every pending migration, in order
npm run db:migrate -- --dry-run   # print the SQL, execute none of it
```

Each migration runs in its own transaction, and the `schema_migrations` row that
records it is written inside that same transaction. Postgres has transactional
DDL, so a migration that fails halfway leaves the schema exactly as it was and
the ledger row dies with it. The ledger cannot claim a migration that did not
land.

This needs **`DATABASE_URL`** in `backend/.env` — Supabase Dashboard → Project
Settings → Database → Connection string → URI. `SUPABASE_SERVICE_KEY` cannot
substitute: it speaks PostgREST, which executes queries, not DDL. That gap is why
this directory spent its first 25 files being pasted into a web SQL editor by
hand.

> Historical note: the `exec_sql` RPC that the old `backend/migrate_*.js` scripts
> called does not exist on this project. Those six scripts never applied anything
> — they printed an error and exited. They have been deleted; their SQL lives here.

## Can we actually rebuild?

```bash
npm run db:verify-rebuild
```

This is the disaster-recovery drill, and the only thing that truly answers the
question. It replays all 25 migrations from `001` into an **empty throwaway
schema**, inside a transaction that is **always rolled back** — so it commits
nothing and is safe to point at the one database that exists. Then it diffs what
Postgres actually built against `schema.json`.

The distinction from `db:coverage` matters. `db:coverage` **parses** the SQL and
compares what it thinks the statements mean. `db:verify-rebuild` **executes**
them. Postgres is the only parser whose opinion counts — and it is the only one
that will notice a CHECK constraint, an index, a trigger or a function, none of
which PostgREST can see.

It works only because no migration names a schema explicitly, so `search_path`
alone redirects every `CREATE` into the sandbox. The runner checks that
assumption before each run and refuses if a migration has grown a `public.`
prefix.

## Knowing what has been applied

**`migrations.schema_migrations`** is the ledger — note the schema. It is
deliberately NOT in `public`: Supabase serves `public` through PostgREST, so a
ledger there would be a 22nd table in your REST API, readable with the anon key,
and — because `schema.json` is generated *from* that API — a table every schema
check would report as untracked drift forever. A schema PostgREST does not serve
sidesteps both problems at once.

Rows carry an **`adopted`** flag: the first 25 migrations were applied by hand,
before a runner existed, so `npm run db:adopt` recorded them as *present, not
executed by us*. A database rebuilt from scratch gets `false` for those same rows,
and that difference is the whole disaster-recovery story.

`db:adopt` refuses to record a migration whose objects are not actually in the
database — otherwise adoption would mark work as done that had never run, and the
column it creates would never appear.

Alongside the ledger, the schema checks report the delta between repo and
database:

```bash
npm run db:check      # does the live database match schema.json?
npm run db:coverage   # can these migrations rebuild the live database?  (parsed)
npm run db:offline    # can these migrations rebuild schema.json?        (no DB needed)
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

`schema.json` is built from PostgREST's OpenAPI document, which cannot see
`pg_catalog`. The **snapshot** therefore knows nothing about CHECK constraints,
indexes, triggers and functions (including the `user_audit_log` trigger), RLS
policies, or sequence ownership.

`db:verify-rebuild` does not close that gap, but it narrows it: those objects are
not *diffed*, but they are **executed**, so a trigger whose function no longer
compiles now fails the drill instead of failing a rebuild you attempt for the
first time in an emergency. It reports how many of each it built.

## Adding a migration

1. Create `NNN_short_name.sql` with the next number. Make it idempotent.
2. `npm run db:migrate` to apply it.
3. `npm run db:snapshot` to refresh `schema.json`.
4. `npm run db:verify-rebuild` to confirm a fresh database would still come out right.
5. Commit the migration **and** the updated `schema.json` together.

A migration that has been applied is **history, not a document**. Editing one
changes its checksum, and the runner will refuse to do anything until you put it
back. Write a new migration instead. Numbering a new file *below* an
already-applied one is refused for the same reason.

## Tombstones

`010_renewal_payment.sql` is a no-op. It targeted the wrong table, was never
applied, and is kept only so the numbering stays stable. See the file for detail.
