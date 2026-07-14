# UAT Test Checklist — Marutham AgroLink v1.0

Walk each role's flows and tick as you go. Accounts and passwords are in
[TEST_ACCOUNTS.md](./TEST_ACCOUNTS.md). Log any failure with: **role, page, what you did,
what you expected, what happened** — then classify it **Critical / High / Medium / Low**
(definitions at the bottom).

Legend: ☐ not tested · ✅ pass · ❌ fail (raise a defect)

---

## Public / anonymous (no login)

- ☐ Home page loads; navigation links work
- ☐ Marketplace lists products; product detail opens
- ☐ Search returns relevant products; empty search handled
- ☐ **Register** as a new seller — validation on required fields, submit succeeds, "under review" message shown
- ☐ **Login** with a valid account; wrong password rejected clearly
- ☐ **Forgot password** — request OTP, reset, log in with the new password
- ☐ Signed-out user cannot reach `/app` admin pages (redirected / blocked)

## Consumer (`CNTNPDK_KAVA01`)

- ☐ Profile loads; edit and save a field
- ☐ Browse shop → add items to cart → cart quantities update
- ☐ Checkout — address, order summary, place order
- ☐ Order appears in **My Orders** with correct status
- ☐ Request a **return** on a delivered order
- ☐ Notifications reflect order events

## Farmer / Seller (`FRTNPDK_MURA01`)

- ☐ Registration → approval state is respected (suspended seller sees the pay screen)
- ☐ List a product; edit price and stock
- ☐ Inventory reflects listed quantities
- ☐ Incoming orders visible; update fulfilment
- ☐ Reports / earnings load with correct figures
- ☐ Profile bank/GST edit goes through a **change request** (not a direct save)

## Delivery Agent (`DATNPDK_SELA01`)

- ☐ Assigned deliveries list loads
- ☐ Move an order through pickup → delivered stages
- ☐ Cannot see orders outside the assigned area

## VCO / Collection Officer (`VCTNPDK_PRIA01`)

- ☐ Village collection intake works
- ☐ Quality / grading capture saves

## Hub Incharge (`HITNPDK_RAMA01`)

- ☐ Collections at the hub visible
- ☐ Dispatch flow works
- ☐ Warehouse / stock view loads

## District / Regional / State managers (`DMTNPDK_ARUA01`, `RMTN_DEEA01`, `SHTN_SENA01`)

- ☐ Role dashboard loads with charts and KPIs
- ☐ Data is scoped to the manager's district/region/state (no leakage across scope)
- ☐ Approvals queue works where applicable

## Head Office / Admin (`HOTN_LAKA01`)

- ☐ **Users** — list, search, filter; block / unblock a user
- ☐ **Employees** — add, approve, reject a pending employee
- ☐ **Employee remove** — remove `ZZQATEST` (`MATN00006`); confirm the dialog states whether a login is revoked; they leave the staff list
- ☐ **Employee restore** — the "Removed" chip lists them; restore brings them back
- ☐ **Approvals** — seller registration approve/reject flows
- ☐ **Audit logs** — user-change trail and login history load (HO-only)
- ☐ **Settings** — ordering window / config changes save
- ☐ Executive dashboards render (all four: executive / operations / admin-head / field)

## Cross-cutting (check on a few pages each)

- ☐ **Responsive** — usable on a narrow (mobile) width; no sideways scroll
- ☐ **Loading / empty / error states** — each shows something sensible, never a blank screen
- ☐ **Success/error messages** — actions confirm ("Saved", "Removed") and errors explain
- ☐ **Language** — English ↔ Tamil toggle switches UI copy
- ☐ **Security** — 11th rapid login attempt is rate-limited (429); a blocked/removed user cannot log in
- ☐ **No console errors** during normal use (open DevTools console)

---

## Severity definitions

| Severity | Meaning |
|----------|---------|
| **Critical** | Blocks a core workflow, corrupts data, or a security hole. Must fix before production. |
| **High** | Major feature broken or wrong, no reasonable workaround. Fix before production. |
| **Medium** | Feature works but with a notable flaw or awkward workaround. Fix when able. |
| **Low** | Cosmetic, copy, or minor polish. Backlog. |

Report defects with the five facts above. Fixes will address the reported defect only, keep
backward compatibility, and add no unrelated changes.
