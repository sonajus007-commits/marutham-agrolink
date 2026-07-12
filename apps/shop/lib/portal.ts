/* Where the public shop hands off to the private portal.
 *
 * The portal is the Vite SPA mounted at /app by Express. Same origin, always —
 * the cart (`ma_cart`) and the session (`ma_token`) are origin-scoped
 * localStorage, so these must stay PATHS, never absolute URLs to another host. */
export const PORTAL_LOGIN = '/app/login';
export const PORTAL_REGISTER = '/app/register';
export const PORTAL_SHOP = '/app/consumer';

/** The product a visitor wanted before signing in. Read by the portal. */
export const PENDING_ORDER_KEY = 'ma_pending_order';
