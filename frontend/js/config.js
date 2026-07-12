// ── API configuration ────────────────────────────────────────────────────────
// Relative URL (same host/port as the page), so dev, staging and production all
// work without a change. Only add a host here if the API is ever hosted on a
// DIFFERENT domain than the frontend.
//
// The '/api' prefix is NOT optional. The API used to answer at the root, but the
// root now belongs to the public marketplace (a product page has to be able to
// live at /products/…), so every endpoint moved under /api. Call sites still
// write CONFIG.API_BASE + '/orders' — only this value changed.
const CONFIG = {
  API_BASE: '/api'
};
