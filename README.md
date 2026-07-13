# Marutham Agrolink

Farm-to-consumer ordering and delivery platform for agricultural produce.

---

## Tech Stack

| Component | Choice | Notes |
|---|---|---|
| **Frontend** | Vanilla HTML/CSS/JS — no framework, **no build step** | Static files served by the backend. One page per role (`index`, `home`, `admin`, `farmer`, `consumer`, `agent`). Shared logic in `frontend/js/` (`config.js`, `shared.js`, `api.js`). |
| **Styling** | Plain CSS with design tokens | `frontend/css/app.css` uses a `:root` token system (`--forest`, `--leaf`, `--gold`, …) plus inline styles. Google Fonts: Outfit, Cormorant Garamond, Noto Serif Tamil, JetBrains Mono. No Tailwind/Bootstrap. |
| **UI** | Hand-built components — no component library | Custom tabs, cards, modals, and dashboard tiles. Reusable dashboard helpers in `frontend/js/dashboard/common.js`. |
| **Database** | **Supabase (PostgreSQL)** | Via `@supabase/supabase-js` v2 with the **service-role key** (server-side only, bypasses RLS). Money stored as integer **paise**, converted to rupees by response middleware (`backend/utils/money.js`). |
| **Authentication** | **JWT + bcrypt** | `jsonwebtoken` (30-day tokens), `bcryptjs` password hashing. Login by phone / `login_id`; `requireAuth` middleware loads the user per request. |
| **Storage** | Object storage by URL reference | The DB stores photo **URLs** (e.g. `return_photos.url`); uploads happen client-side. No server-side upload SDK. |
| **Charts** | **Apache ECharts** (self-hosted) | `echarts@5.5.1` vendored at `frontend/js/vendor/echarts.min.js` (SVG renderer). |
| **Maps** | ECharts geo map + Tamil Nadu districts GeoJSON | Vendored `frontend/js/vendor/tamilnadu-districts.geojson.js`, registered via `echarts.registerMap('tamilnadu', …)` for the choropleth district map. |
| **Backend** | **Node.js + Express** (Express 4) | Serves both the API and the static frontend on one port. Uses `cors`, `dotenv`, `qrcode` (order QR), `ws` (Supabase realtime transport). Dev: `nodemon`. |
| **Notifications** | Email + SMS | Email via `nodemailer` (SMTP, defaults to Gmail); SMS via **MSG91** (`backend/utils/notify.js`). Both fall back to console logging when keys aren't configured. |

> **Conventions to know:** money is **paise everywhere** (auto-converted to rupees by field name — avoid naming API fields `total`/`amount`/`delivery` for non-money values); and there is **no frontend bundler**, so third-party libraries must be **vendored locally** (not loaded from a CDN).

---

## Project Structure

```
marutham-agrolink/
├── backend/        # Node.js / Express API (also serves the frontend)
│   ├── server.js   # Entry point
│   ├── routes/     # API route handlers
│   ├── middleware/ # Auth middleware
│   ├── db/         # Supabase client
│   └── .env        # Secrets — never commit this file
├── apps/
│   ├── web/        # The app — React + Vite + TS. Every signed-in screen, at /app
│   └── shop/       # Public marketplace — Next.js, proxied at /
├── packages/       # Shared workspace packages
│   ├── lib/        # Pure domain logic (framework-free, unit-tested)
│   ├── ui/         # Design-system components
│   ├── tokens/     # Colour / spacing / type tokens
│   ├── api-client/ # Typed API client — every call goes through here
│   └── i18n/       # en + ta translations
├── frontend/       # All that survives of the pre-React site (see below)
│   ├── home.html   # Public landing page; also the shop's outage fallback
│   ├── img/        # Shared logos — the React app loads /img/logo-sm.jpg
│   └── js/config.js # API_BASE = '/api', used by home.html
└── marutham_schema.sql  # Full database schema
```

---

## Local Development Setup

### 1. Prerequisites
- Node.js 18+
- A Supabase project (for the database)

### 2. Install dependencies
```bash
cd backend
npm install
```

### 3. Configure environment
Copy the example file and fill in your values:
```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env`:
```
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key-here
JWT_SECRET=a-long-random-secret-string
PORT=3000
```

### 4. Run the server
```bash
cd backend
npm run dev       # development (auto-restarts on changes)
# or
npm start         # production
```

### 5. Open the app
Visit `http://localhost:3000` in your browser.

The backend serves both the API and the frontend from a single port — no separate frontend server is needed.

---

## API Health Check
```
GET http://localhost:3000/health
→ { "status": "ok" }
```

---

## Deployment (IT Handover)

### What to deploy
Only the `backend/` folder needs to be deployed to the server. It serves the `frontend/` files automatically.

### Steps
1. Copy the project to the server.
2. Run `npm install` inside `backend/`.
3. Create `backend/.env` with production values (do **not** commit this file).
4. Start the server: `node backend/server.js` (or use PM2 / systemd for process management).
5. Point your domain / reverse proxy (Nginx, etc.) to port `3000` (or whatever `PORT` is set to in `.env`).

### No frontend config change needed
`frontend/js/config.js` uses a relative API URL (`API_BASE: ''`), so all API calls automatically go to the same host and port as the page. Changing the domain or port only requires updating the `.env` file — nothing in the frontend code needs to change.

### Recommended: PM2 process manager
```bash
npm install -g pm2
pm2 start backend/server.js --name marutham-agrolink
pm2 save
pm2 startup    # auto-start on server reboot
```

---

## Roles & Pages

Every screen below lives in the React app under `/app`. Signing in at `/app/login`
lands each role on its own home automatically (`roleHome()` in
`apps/web/src/auth/ProtectedRoute.tsx`) — there is no per-role URL to hand out.

| Role                        | Page              | Access                             |
|-----------------------------|-------------------|------------------------------------|
| Admin / management          | /app/admin        | Full platform management           |
| Farmer / Retailer           | /app/farmer       | Listings, earnings, orders         |
| Consumer                    | /app/consumer     | Browse, order, track               |
| Agent (VCO, Delivery Agent) | /app/agent        | Delivery scan and queue            |

Management roles also get a dashboard chosen by `admin_role`: `/app/admin/executive`
(Board/CEO/MD/CFO/CTO), `/app/admin/operations` (District/Regional/State/Zonal),
`/app/admin/adminhead` (Head Office, Technical Admin, HR), and the field dashboard
inside `/app/agent` (VCO, Delivery Agent).

The public landing page (`/`) and the marketplace are separate: `frontend/home.html`
answers at the root, unless the Next.js shop (`apps/shop`) is running, in which case
it is proxied there.
