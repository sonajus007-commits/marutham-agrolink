// Global setup for Vitest component tests (referenced from vite.config.ts).
//
// - jest-dom adds the DOM matchers (`toBeInTheDocument`, `toHaveAttribute`, …).
// - `cleanup` unmounts anything React rendered so one test can't leak DOM into
//   the next; Vitest doesn't do this for us the way a jsdom-per-file runner would.
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
