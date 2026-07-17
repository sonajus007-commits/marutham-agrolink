// Global setup for Vitest component tests (referenced from vite.config.ts).
//
// - jest-dom adds the DOM matchers (`toBeInTheDocument`, `toHaveAttribute`, …).
// - `cleanup` unmounts anything React rendered so one test can't leak DOM into
//   the next; Vitest doesn't do this for us the way a jsdom-per-file runner would.
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { initI18n } from '@marutham/i18n';

/* Real resources, not a stub. Without an instance react-i18next warns on every
 * render and t() falls back to the inline default — so a component whose key is
 * missing from resources.ts would still render its default and pass, which is the
 * one failure this could catch. Initialised, a test asserts what ships. */
initI18n();

afterEach(() => {
  cleanup();
});
