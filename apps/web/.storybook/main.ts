import type { StorybookConfig } from '@storybook/react-vite';

// Storybook for the @marutham/ui component library, hosted from apps/web because
// this is where the full styling pipeline lives (Tailwind v4 + tokens.css). The
// builder merges apps/web/vite.config.ts automatically, so the workspace aliases
// (@marutham/*) and the @tailwindcss/vite plugin come along — the react-vite
// framework already guards against double-adding the React plugin.
const config: StorybookConfig = {
  framework: { name: '@storybook/react-vite', options: {} },
  stories: ['../src/**/*.stories.@(ts|tsx|mdx)'],
  addons: ['@storybook/addon-a11y'],
  viteFinal: async (cfg) => {
    // The app builds under base '/app/' so Express can serve the SPA there; Storybook
    // serves at the server root, so reset it or every asset URL 404s.
    cfg.base = '/';
    // The app's PWA plugin rides in with the merged config and would build a service
    // worker for the catalog too — precaching Storybook's own runtime, which is over
    // workbox's size limit and fails the build. The catalog is not an installable app.
    cfg.plugins = (cfg.plugins ?? [])
      .flat()
      .filter(
        (p) => !(p && typeof p === 'object' && 'name' in p && /^vite-plugin-pwa/.test(p.name)),
      );
    return cfg;
  },
};

export default config;
