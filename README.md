# Marutham Agrolink

Farm-to-consumer ordering and delivery platform for agricultural produce.

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
├── frontend/       # Static HTML/CSS/JS (served by the backend)
│   ├── index.html  # Login / landing page
│   ├── admin.html
│   ├── farmer.html
│   ├── consumer.html
│   ├── agent.html
│   └── js/
│       ├── config.js  # API_BASE setting (see Deployment note below)
│       └── api.js     # All API calls go through here
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

| Role         | Page             | Access                          |
|--------------|------------------|---------------------------------|
| Admin        | /admin.html      | Full platform management        |
| Farmer       | /farmer.html     | Listings, earnings, orders      |
| Consumer     | /consumer.html   | Browse, order, track            |
| Agent (VCO)  | /agent.html      | Delivery scan and queue         |
