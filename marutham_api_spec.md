# Marutham Agrolink — Backend API Specification (v1)

**What this is:** the list of every action the backend server can perform. Each one is called an **endpoint**. The website and all three mobile apps (Consumer, Farmer, Delivery Agent) talk to these same endpoints. This is the contract everything is built against.

**Plain-English glossary**

- **Endpoint** = one action the backend can do (e.g. "place an order").
- **GET** = read/fetch data. **POST** = create something. **PATCH** = update part of something. **DELETE** = remove.
- **`:id`** = a placeholder for a real id (e.g. `/orders/ORD1234`).
- **Auth required** = caller must be logged in (sends a token). **Role** = which user type may call it.
- **Body** = the data the app sends. **Returns** = what the backend sends back.

---

## 1. AUTHENTICATION

### POST /auth/register

Create a new account (consumer or farmer).

- Body: phone, password, role, name, address fields; (farmer adds aadhar, bank details).
- Returns: the new user's login_id + a success message.

### POST /auth/login

Log in with phone + password.

- Body: phone, password.
- Returns: user profile + an **auth token** (the app stores this and sends it on every later call).

### POST /auth/send-otp / POST /auth/verify-otp

Phone OTP login (production). In sandbox, OTP is mocked/logged.

- Returns: token on success.

### GET /me _(auth required)_

Get the currently logged-in user's profile.

### PATCH /me _(auth required)_

Update own profile (address, etc.).

---

## 2. PRODUCTS (catalogue)

### GET /products

List products. Supports filters: `?group=`, `?district=`, `?available=true`.

- Returns: products with district price + average rating.
- Public (consumers browse before login is fine) or auth — your choice.

### GET /products/:id

One product's full detail, including each farmer's offer + that farmer's rating.

### POST /products _(auth: Head Office only)_

Add a product.

### PATCH /products/:id _(auth: Head Office only)_

Edit a product **including its Active/Inactive status**. (VCO/District are view-only — enforced here.)

### DELETE /products/:id _(auth: Head Office only)_

---

## 3. FARMER LISTINGS

### GET /listings _(auth: farmer)_ — my own listings

### GET /listings?product=:id — offers for a product (used by consumer product page)

### POST /listings _(auth: farmer)_ — list/offer a product (price, qty, time, cutoff)

### PATCH /listings/:id _(auth: farmer)_ — update price/qty/availability

### DELETE /listings/:id _(auth: farmer)_

---

## 4. CART & ORDERS

### POST /orders _(auth: consumer)_

Place an order from the cart.

- Body: items [{product, farmer, qty}], payment method, address.
- Backend computes totals (item total, handling, fee, delivery, savings), creates the order at stage 0 ("Order Placed"), records history, sets fulfilment village from the farmer.
- Returns: the created order (with its code, e.g. ORD1234).

### GET /orders _(auth)_

List orders **scoped to the caller's role**:

- consumer → their own orders
- farmer → orders containing their produce
- VCO → orders in their village
- District/Hub → their district (+ optional village filter)
- Head Office/State/Regional → all (+ optional district filter)
- Delivery Agent → their pickup queue + active trip

### GET /orders/:id _(auth)_

One order's full detail: items, price split, status timeline, agent info, route, QR token.

### POST /orders/:id/cancel _(auth: consumer or admin)_

Cancel (rules: only before it ships, etc.). Triggers refund record if paid.

---

## 5. DELIVERY WORKFLOW (the heart of it)

### POST /orders/:id/pack _(auth: farmer)_

Mark a packed order → stage "Packaged".

### POST /orders/:id/scan _(auth: VCO, Delivery Agent, or Admin)_ ⭐ the role-scoped scan

The single scan action. The backend looks at the order's current stage and the caller's role, then does the correct next step:

- **VCO** (or Admin) scans a _Packaged_ order → **VCO Verified**.
- **Delivery Agent** (or Admin) scans a _VCO Verified_ order → **Picked up** (assigns agent, auto-suggests route hub/direct).
- **Delivery Agent / Admin** scans an in-progress order → advances the next leg (In transit → At Hub → Out for Delivery → Delivered).
- Consumer/Farmer → rejected with a clear message.
- Body: order code (from the QR or typed).
- Returns: {ok, message, newStatus}.

### PATCH /orders/:id/route _(auth: Delivery Agent or Admin)_

Override the route (hub ↔ direct) before "Out for Delivery". Recalculates ETA.

### POST /orders/:id/advance _(auth: Admin)_

Manual stage advance (admin override via buttons, not scan).

### GET /orders/:id/track _(auth: consumer who owns it, or staff)_

Live tracking payload: current stage, route map nodes, agent name/phone/vehicle, ETA. (Mobile agent app later adds live GPS here.)

---

## 6. RATINGS

### POST /orders/:id/items/:itemId/rate _(auth: consumer, after delivery)_

Rate one delivered item 1–5 stars (once). Updates the farmer-product rating average.

### GET /ratings/top?scope=... _(auth: admin / farmer)_

Top-rated products (used for admin recommendation + consumer top-listing).

---

## 7. RETURNS (refund-only)

### POST /orders/:id/return _(auth: consumer, within return window)_

Request a return (full or partial), with reason + optional photos.

### GET /returns _(auth: admin/VCO scoped)_

List returns to inspect.

### PATCH /returns/:id/decide _(auth: VCO/admin)_

Accept or reject the return.

### PATCH /returns/:id/collect _(auth: VCO/agent/admin)_

Mark returned goods collected → triggers refund (product value only).

---

## 8. USERS / ADMIN

### GET /users _(auth: admin, role-scoped)_

List users (VCO → village; District → district; Head Office → all).

### PATCH /users/:id/block _(auth: Head Office only)_

Block/unblock a user.

### GET /dashboard _(auth: admin)_

Role-tiered KPIs (orders, GMV, fees, farmers, returns…), scoped to the caller's area, plus drill-down lists per tile.

---

## 9. PAYOUTS (farmer settlements — integrate Razorpay Route later)

### GET /payouts _(auth: farmer = own; admin = all/scoped)_

### POST /payouts/run _(auth: admin)_ — trigger settlement batch (sandbox first)

---

## Cross-cutting rules (apply everywhere)

- **Every protected endpoint checks the auth token** and the **role** before acting. The role logic mirrors your prototype exactly (e.g. product status = Head Office only; scan steps = VCO/Agent/Admin).
- **Money is in paise** (integers) in all requests/responses.
- **Errors** return a clear message + a status code (400 bad input, 401 not logged in, 403 wrong role, 404 not found).
- **All state lives in the database** (Supabase) — the backend never holds data in memory between calls.
- **Order status changes always write a history row** (for the timeline).

---

## Build order (suggested)

1. Auth (register, login, /me) — nothing works without this.
2. Products + listings (so there's something to browse).
3. Orders (place, list, detail).
4. Delivery workflow (pack, scan, track) — the core differentiator.
5. Ratings, returns, dashboard, payouts.

Build and test each group before moving on. The web app can start calling these as soon as auth + products exist.
