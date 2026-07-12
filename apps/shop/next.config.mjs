/** @type {import('next').NextConfig} */
const nextConfig = {
  // Workspace packages ship TypeScript source, not a build — Next must compile them.
  transpilePackages: ['@marutham/lib', '@marutham/tokens'],
  // Express is the single front door (see backend/server.js): the browser only
  // ever talks to :3000, which proxies the shop's routes here. That keeps the
  // shop and the /app portal on ONE ORIGIN, which is not a preference — the cart
  // (`ma_cart`) and the session (`ma_token`) live in origin-scoped localStorage,
  // so a visitor who signs in must land back holding what they picked.
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
