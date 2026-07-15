# ADR-001 — Frontend Framework: React + Vite vs Next.js

Status: **proposal, awaiting approval.** No implementation has begun.
Date: 2026-07-10 · Reviewed against commit `e988e67`
Supersedes: §13 of `docs/architecture-review.md`

---

## 1. Final Recommendation

**Adopt Next.js — for the public marketplace, which does not exist yet. Do not migrate
the authenticated portals.**

Concretely: a new `apps/shop` (Next.js, App Router, SSR/ISR) serves the homepage, category
browsing, product catalogue, and search. The existing `apps/web` (React + Vite) continues to
serve the consumer, farmer, delivery, and admin portals. Both consume the same
`packages/ui`, `tokens`, `api-client`, `lib`, and `i18n`. Both call the same Express REST API.

This is not a compromise position. It follows from one fact established below: the surface
that needs Next.js has not been built, and the surface that has been built does not need it.

---

## 2. Technical Justification

### 2.1 A correction to my previous recommendation

In `docs/architecture-review.md` I argued against Next.js partly on the grounds that Server
Components would need the user's JWT server-side, forcing cookie sessions and a BFF layer
that duplicates the Express RBAC.

**That objection was wrong, and I want to be explicit about why**, because it was the load-
bearing argument. The pages that need server rendering — homepage, category, product detail,
search — are _anonymous_. They need no JWT. The pages that need the JWT — cart, checkout,
seller console, dashboards — need no server rendering. The split is clean, and it falls
exactly along the line the business already draws. There is no BFF, and no cookie session.

What I got right, and what still holds, is that migrating the _working portals_ to the App
Router buys nothing. That part of the recommendation is unchanged.

The reason my earlier analysis reached the wrong conclusion is that I reviewed the repository,
and the repository has no public marketplace. Every route in `apps/web/src/App.tsx` is behind
`ProtectedRoute`. I concluded there was no SEO surface. In fact there is no SEO surface _yet_ —
which is a statement about the schedule, not the architecture.

### 2.2 The catalogue is already SSR-ready

This is the finding that makes the recommendation cheap, and I did not expect it.

`backend/routes/products.js` already exposes two **public, unauthenticated** endpoints:

```js
router.get('/',    async (req, res) => { … })   // no requireAuth
router.get('/:id', async (req, res) => { … })   // no requireAuth
```

`GET /products` returns every product with `product_district_prices` and a computed
`avg_rating`. `GET /products/:id` returns the product plus live farmer listings — price,
quantity, seller name, village, per-seller rating. That is the complete data set for an
indexable product detail page, available to a Next.js server component today, with **zero
backend changes**.

By contrast `GET /listings` is `router.use(requireAuth)` — fully gated. The line between
public catalogue and private inventory is already drawn correctly in the backend.

### 2.3 The cart handoff is free, if the origin is shared

The obvious objection to running two frontends is the shopper who browses the public
catalogue, fills a cart, and only then logs in.

`CartContext.tsx` persists to `localStorage` under `ma_cart`. `packages/api-client/src/session.ts`
persists the session under `ma_token` / `ma_user`, and its header comment explains that these
keys are deliberately shared with the legacy site so users move between stacks without logging
in twice.

**localStorage is scoped by origin.** Serve Next.js at `/` and the Vite SPA at `/app` behind one
reverse proxy, and the cart and session carry across for free — via the exact mechanism the
codebase already uses to bridge legacy HTML and React. The handoff cost is a proxy config,
not code.

This makes the single-origin deployment a hard requirement of the recommendation, not a
preference. See Risk 2.

### 2.4 The design system is framework-independent

Tailwind, shadcn/ui, Lucide, and the token work all live in `packages/ui` and `packages/tokens`.
They are consumed identically by a Vite app and a Next.js app. **None of that work depends on
this decision**, and none of it needs to be redone if you later fold the portals into Next.js.

This is what de-risks the whole plan: the expensive work (13–20 days of tokenization and
component rebuild, per the architecture review) is decided independently, benefits both apps,
and is not a bet on a framework.

---

## 3. Comparison Against Your Stated Criteria

| Criterion                      | React + Vite                                       | Next.js                                                               | Recommendation                              |
| ------------------------------ | -------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------- |
| Public marketplace performance | CSR: blank HTML → JS → fetch → paint               | SSR/ISR: HTML on first byte, cached at edge                           | **Next.js** — decisive                      |
| Product catalogue pages        | Client-fetched, unindexable                        | Server-rendered, ISR-cacheable                                        | **Next.js** — decisive                      |
| SEO                            | No crawlable HTML, no metadata, no structured data | `generateMetadata`, schema.org, sitemap, hreflang en/ta               | **Next.js** — decisive                      |
| Consumer shopping experience   | Fine once loaded                                   | Faster first load; identical afterwards                               | Next.js, modestly                           |
| Seller portal                  | Works today, tested                                | Same code as client components                                        | **Vite** — no gain from switching           |
| Admin dashboards               | Works; ECharts is client-only                      | Must be `'use client'` + `ssr:false` anyway                           | **Vite** — Next.js adds only friction       |
| Mobile app compatibility       | Shared packages are DOM-free and port to RN        | Identical; RSC has no RN story                                        | **Tie** (packages carry it, not the app)    |
| Express REST integration       | Vite dev proxy → Express                           | Next `rewrites` → Express. API routes _not_ used, per your constraint | Tie                                         |
| Maintainability                | One framework, one router                          | Two frameworks if split; one if full migration                        | **Vite** for portals                        |
| 5–10 year scalability          | Vite/react-router are stable, slow-moving          | Next.js gives SSR headroom; App Router churn is a real cost           | Next.js for public, with eyes open          |
| Development complexity         | Lower                                              | Server/client component boundary is a genuine ongoing tax             | **Vite** for portals                        |
| Deployment                     | Express serves static `/app`                       | Adds a Node process + reverse proxy                                   | **Vite** simpler; cost is small and bounded |
| Long-term maintenance cost     | Lowest                                             | Higher, but paid only on the surface that earns it                    | Split contains the cost                     |

Read down that table and the shape of the answer is visible: **Next.js wins the first three
rows decisively and loses or ties almost everything else.** The first three rows are the public
marketplace. That is the scope of the recommendation.

### A calibrated note on the SEO upside

You named Amazon Fresh, BigBasket, Blinkit, and Instamart. Worth being precise about where
organic search actually pays in that category, because it is not uniform.

Quick-commerce and grocery are overwhelmingly app-first and repeat-purchase. Thin product pages
with volatile inventory and hyperlocal pricing attract little durable organic traffic — Google
does not rank ten thousand near-identical "buy tomatoes online" pages. Where organic value
concentrates is the homepage, **category and collection pages**, and content (recipes, seasonality,
provenance, farmer stories).

Two things specific to Marutham do look genuinely valuable. **Tamil-language content is an
underserved search surface**, and `packages/i18n` already ships `en`/`ta` — Next.js `hreflang`
and localized routes turn existing translations into indexable pages. And **farmer provenance**
— named growers, villages, ratings — is exactly the differentiated content BigBasket cannot
publish. That is a real SEO moat, and it is already in the `/products/:id` payload.

So: build SSR for the homepage, categories, product pages, and content. Do not expect it to
move the needle on the transactional funnel, which will be app-driven. Next.js is still the
right call — first-byte performance on the public storefront justifies it independently of SEO.

### The third door, briefly

React Router v7 framework mode (formerly Remix) offers SSR as an _incremental upgrade_ from
react-router 6, which `apps/web` already uses. It would deliver server rendering without a
second framework. I am not recommending it: your team has stated a Next.js preference, shadcn/ui
is Next-first, and the hiring pool over a 5–10 year horizon is deeper. But it is the option with
the lowest migration cost, and you should know it exists before committing.

---

## 4. Benefits and Drawbacks of the Recommendation

**Benefits**

- **Zero migration cost for the framework decision.** The public marketplace is net-new. Nothing
  is ported. The 15–25 day full-migration estimate from the architecture review disappears.
- Working, tested portals are not touched. No regression risk to Agent, Consumer, or Farmer.
- The public catalogue ships against existing public endpoints.
- Cart and session bridge for free on a shared origin, reusing a mechanism already in production.
- Next.js enters the stack on a low-stakes surface. If the App Router proves painful, the blast
  radius is one app that has no authenticated state.
- Express, Supabase, RBAC, and the REST contract are untouched, as you required.
- The Admin build — a third of remaining effort — chooses its framework _later_, with months of
  real Next.js experience informing the choice.

**Drawbacks — stated plainly**

- **Two frontend frameworks.** Two build configs, two dependency trees, two deploys. This is the
  real cost and I will not minimize it. It is contained only because the boundary is absolute:
  Next.js is anonymous and public; Vite is authenticated and private. If that line ever blurs,
  the split becomes a liability.
- Shared layout chrome (header, footer, nav) must be built in `packages/ui` and consumed twice.
  This is good discipline and it is also extra work.
- A shared origin becomes a deployment constraint. Hosting the shop on Vercel and the API
  elsewhere breaks the free cart handoff.
- Server/client component discipline is a new skill for the team, on a real surface.
- Two routers means a full-page navigation when a shopper crosses `/` → `/app`. Acceptable at the
  login boundary; unacceptable anywhere else.

---

## 5. Migration Effort

One engineer, working days. ±40%. Sizing, not commitment.

| Work                                                                      | Days      | Depends on |
| ------------------------------------------------------------------------- | --------- | ---------- |
| **Phase 0 — Design system** (framework-independent)                       |           |            |
| Tokenize: `tokens.ts` → generated `tokens.css`, retire 358 hex literals   | 3–5       | —          |
| Tailwind v4 + `@theme` projection                                         | 2–3       | tokenize   |
| shadcn/ui rebuild of 17 components + Lucide                               | 8–12      | Tailwind   |
| **Phase 1 — Public marketplace**                                          |           |            |
| `apps/shop` scaffold: Next.js, TS, Tailwind, shared packages              | 2–3       | Phase 0    |
| Home, category browse, product detail (SSR + ISR)                         | 6–9       | scaffold   |
| Search UI + backend search/pagination endpoints                           | 4–6       | —          |
| **Phase 2 — SEO & performance**                                           |           |            |
| Metadata, schema.org `Product`/`Offer`, sitemap, robots, `hreflang` en/ta | 4–6       | Phase 1    |
| Core Web Vitals, image pipeline (Supabase Storage → `next/image`)         | 3–4       | Phase 1    |
| **Phase 3 — Integration**                                                 |           |            |
| Reverse proxy, single origin, cart + session handoff, E2E                 | 2–3       | Phase 1    |
| **Subtotal to a live public marketplace**                                 | **34–51** |            |
| _Portals continue on Vite in parallel: Consumer 2C, Farmer 3C, Admin_     | _26–40_   | Phase 0    |

The framework decision itself contributes **zero** days. Everything above is work you would do
under either choice, except the ~2–3 day Next.js scaffold and the ~2–3 day proxy.

For contrast: migrating the existing portals to Next.js would add **15–25 days** and deliver no
user-visible change. That is the option I am recommending against.

---

## 6. Risks

| #   | Risk                                                                         | Severity | Mitigation                                                                                                                                                                                                     |
| --- | ---------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Two frameworks drift — divergent patterns, duplicated components             | **High** | Absolute boundary: Next.js = anonymous only. All UI in `packages/ui`. Shared ESLint/TS config. Revisit at Admin.                                                                                               |
| 2   | Split origin breaks the free cart/session handoff                            | **High** | Single origin via reverse proxy is a **requirement**. If the shop must live on Vercel, budget 3–5 days for an explicit token/cart handoff.                                                                     |
| 3   | `GET /products/:id` publicly returns farmer `fname`, `lname`, `village_town` | **High** | Today this is unindexed. SSR puts grower names and villages into Google. Decide _before_ launch whether that is intended transparency or a privacy exposure. It is currently neither documented nor consented. |
| 4   | `GET /products` has no pagination and joins prices + ratings for every row   | Medium   | Fine at hundreds of products; will not hold at thousands. Add pagination + a search endpoint in Phase 1.                                                                                                       |
| 5   | Prices vary by district → the ISR cache key is (product × district)          | Medium   | SSG the product shell; hydrate district price client-side. Or ISR only the top N districts. Decide before building.                                                                                            |
| 6   | Next.js App Router churn over a 5–10 year horizon                            | Medium   | Real, and a genuine argument for Vite. Contained by keeping Next.js on one stateless app.                                                                                                                      |
| 7   | SEO returns underperform expectations for quick-commerce                     | Medium   | Justify Next.js on first-byte performance, which is certain; treat organic traffic as upside. Invest in category + Tamil content, not thin product pages.                                                      |
| 8   | Team learns server/client component boundaries on a live surface             | Low      | The public app has no authenticated state — the hardest RSC problems never arise.                                                                                                                              |
| 9   | Supabase Auth decision still open (`architecture-review.md` §11)             | **High** | Independent of this ADR. Public marketplace is anonymous and unblocked either way.                                                                                                                             |

Risk 3 is the one I would raise first in a review. It exists today, in production code, and this
plan amplifies it from "reachable via API" to "indexed by Google."

---

## 7. Incremental Migration Plan

Each stage is independently shippable and independently revertible.

**Stage 0 — Design system.** `packages/tokens` and `packages/ui`. Nothing else moves. Feature
freeze, per your instruction. Output: shadcn/ui + Lucide + Marutham theme, consumed by the
existing Vite portals with no visual regression. _Framework decision not yet exercised._

**Stage 1 — `apps/shop` skeleton.** Next.js App Router, TypeScript, Tailwind, importing
`@marutham/ui` and `@marutham/api-client`. One route: `/` rendering the homepage against the
public `GET /products`. Deployed behind the proxy at `/`, with legacy `home.html` still available
as a fallback. **This is the go/no-go gate.** If Next.js is wrong for this team, you learn it here,
having spent 2–3 days.

**Stage 2 — Catalogue.** Category browse and product detail, SSR with ISR. Add the backend search
and pagination endpoints. The shop is now a real storefront.

**Stage 3 — SEO.** Metadata, structured data, sitemap, `hreflang` for `en`/`ta`, image pipeline.
Measure Core Web Vitals. Resolve Risk 3 before the sitemap ships.

**Stage 4 — Integration.** Single origin. Verify the `ma_cart` / `ma_token` handoff end-to-end:
browse anonymously → add to cart → click Login → land in `/app/consumer` with the cart intact.

**Stage 5 — Portals continue on Vite.** Consumer 2C, Farmer 3C, then Admin. Unaffected by
Stages 1–4.

**Stage 6 — Decision point, deferred.** Before Admin begins, revisit whether the portals should
fold into `apps/shop`. By then Next.js will have been in production for months. Decide with
evidence rather than with this document. **My expectation is that the answer will be no** — Admin
is dashboards and tables behind a login, which is precisely the workload where the App Router
costs more than it returns — but the decision should be made then, not now.

---

## 8. Estimated Timeline

One engineer. Calendar weeks, assuming the feature freeze holds through Stage 0.

| Weeks    | Stage   | Milestone                                                     |
| -------- | ------- | ------------------------------------------------------------- |
| 1–3      | Stage 0 | Design system live; portals restyled, no regressions          |
| 4        | Stage 1 | **Go/no-go**: Next.js homepage in production behind the proxy |
| 5–7      | Stage 2 | Public catalogue: categories, product pages, search           |
| 8–9      | Stage 3 | SEO complete; Lighthouse/CWV measured; Risk 3 resolved        |
| 9        | Stage 4 | Single origin; cart survives the login boundary               |
| 10+      | Stage 5 | Portals resume on Vite (Consumer 2C → Farmer 3C → Admin)      |
| ~Week 16 | Stage 6 | Framework decision for Admin, made with production evidence   |

**Public marketplace live: roughly week 9**, or week 6 if Stage 0 runs in parallel with a second
engineer. Two engineers do not compress Stage 0 — it is a serial refactor of shared components.

---

## 9. What This ADR Does Not Decide

- **Supabase Auth.** Still open; see `architecture-review.md` §11. The public marketplace is
  anonymous, so it does not block. The core finding stands: users authenticate by `login_id` or
  `phone`, `email` is nullable and non-unique, and because RBAC stays in Express, Supabase Auth
  would replace roughly fifteen lines of `jwt.verify`.
- **`apps/admin` as a separate app.** Recommend not splitting; route-level lazy loading solves the
  bundle-size problem without a second deploy.
- **Whether farmer names and villages should be publicly indexable.** Product decision. Blocks
  Stage 3.
