# Known Limitations & Post-UAT Backlog — v1.0

What is deliberately deferred, and why, as of the v1.0 UAT handover. None of these block
UAT. They are recorded so nothing is a surprise and so they can be scheduled after UAT.

## Environment

- **One Supabase project.** UAT runs on the same database that development uses. This is a
  deliberate decision for v1.0 (no separate infrastructure is provisioned). Consequences:
  UAT test data and dev data share a database, and the seed accounts (`Seed@1234`) live
  there. Before production, provision a separate project and re-run `db:migrate` + `db:seed`
  into it — the schema and seed are fully reproducible from the repo, so this is a
  configuration step, not a rebuild.
- **Seed accounts are not production-safe.** The nine role logins share one weak password.
  They exist for testing. Delete or rotate them before go-live.

## Security — post-UAT hardening (v1.0 closed the High items)

Done in v1.0: rate limiting on auth, security headers (helmet), CORS allowlist, login-input
validation, bcrypt(12), immediate token revocation on block/remove. Remaining, lower
priority:

- **Content-Security-Policy is off.** helmet's CSP and COEP are disabled because this server
  also serves the static frontend and proxies the Next shop, and a strict policy would block
  their assets. A tuned CSP is worth adding once the asset origins are enumerated.
- **JWT lifetime is 30 days, no refresh/rotation.** A leaked token is usable for a month.
  Mitigated by the server re-reading the user row every request (a blocked/removed user is
  cut off immediately regardless of token validity). A refresh-token flow with shorter access
  tokens is the production improvement.
- **Rate limiter is in-memory.** Correct for a single API process. If the API is ever scaled
  to multiple processes/instances, the limiter needs a shared store (e.g. Redis) or each
  instance counts separately.

## Operational

- **CI has no database.** The static gates run in CI (typecheck, tests against a fake
  Supabase, schema-offline check, unchecked-read check, builds). The DB-connected checks
  (`db:verify-rebuild`, `db:check-embeds`) must be run locally against a real Postgres — they
  cannot gate every PR until CI has a throwaway database.
- **1000-row PostgREST cap.** Some dashboard aggregations read up to PostgREST's default
  1000-row page. On large datasets these figures could undercount. Fine at UAT data volumes;
  revisit with server-side aggregation or pagination before large-scale production data.

## Accessibility

- **Three known contrast issues** in the design system (form-related), flagged by the token
  contrast gate's exemption list. They are WCAG contrast shortfalls, not broken functionality.
  Scheduled with the design-system polish pass.

## Product scope (intentionally not in v1.0)

- **Mobile application** — planned as v2.0, to begin only after production sign-off.
- **Dark theme** is authored in tokens but not wired to a user-facing switcher. Enabling it
  needs a design review first.
- **Online payment gateway** — checkout records orders; payment reconciliation is manual /
  bank-transfer based per the current business flow.

## How UAT defects will be handled

Each reported defect is classified Critical / High / Medium / Low (see
[UAT_CHECKLIST.md](./UAT_CHECKLIST.md)). Only the reported defect is fixed — no unrelated
refactoring, backward compatibility maintained. Critical and High are resolved before the
Release Candidate; Medium and Low are triaged into this backlog.
