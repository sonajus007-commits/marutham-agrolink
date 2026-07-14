# UAT Test Accounts

Every role has a ready-to-use login, created by `npm run db:seed` (idempotent — safe to
re-run). All accounts share one password.

**Password (all accounts):** `Seed@1234`
**Location:** Pudukkottai, Tamil Nadu (`PDK` / `TN`)

Log in at `/app` (or the deployed URL) using the **Login ID** below, or the phone number.

| Role | Login ID | Phone | What they can do |
|------|----------|-------|------------------|
| Consumer | `CNTNPDK_KAVA01` | 9811100001 | Shop, cart, checkout, orders, returns |
| Farmer / Seller | `FRTNPDK_MURA01` | 9811100002 | List produce, inventory, pricing, orders, reports |
| Delivery Agent | `DATNPDK_SELA01` | 9811100003 | Assigned deliveries, pickup/drop stages |
| VCO (Collection Officer) | `VCTNPDK_PRIA01` | 9811100004 | Village collections, quality intake |
| District Manager | `DMTNPDK_ARUA01` | 9811100005 | District operations, oversight |
| Hub Incharge | `HITNPDK_RAMA01` | 9811100006 | Hub collections, dispatch, warehouse |
| Regional Manager | `RMTN_DEEA01` | 9811100007 | Regional dashboards, approvals |
| State Head | `SHTN_SENA01` | 9811100008 | State-level admin, employee tracker |
| Head Office | `HOTN_LAKA01` | 9811100009 | Full admin: users, roles, approvals, audit, settings |

## Notes for testers

- **Public / anonymous** flows (home, marketplace, registration, forgot-password) need no
  login — open the site signed out.
- **Head Office** (`HOTN_LAKA01`) is the account for the admin console: the employee
  tracker, user management, approvals, audit logs, and the executive dashboards.
- The **employee remove/restore** flow (Admin → Employees) has a dedicated fixture,
  `ZZQATEST / Delete Me` (Employee ID `MATN00006`), safe to remove and restore.
- These are **seed** accounts for testing only. They are not real staff and carry no real
  personal data. Do not use `Seed@1234` for any account that will exist in production.
- To reset a forgotten seed password, either re-run the seed against an empty database, or
  use the **Forgot Password** flow (sends an OTP to the account's email/phone if SMTP/SMS
  is configured).
