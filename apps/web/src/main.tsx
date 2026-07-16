import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { initI18n } from '@marutham/i18n';
import { initSentry, AppErrorBoundary } from './sentry';
import { queryClient } from './lib/queryClient';
import { initNative } from './native';
import { startOfflineSync } from '@marutham/api-client';
// tailwind.css imports @marutham/tokens/tokens.css itself — the theme mapping
// is meaningless without it. Keep it first so the tokens land before styles.css.
import './tailwind.css';
import './styles.css';
import { App } from './App';

// Before anything renders, so a crash during startup is still reported.
initSentry();
initI18n();
// Native (Capacitor) setup — points the API at the real backend, wires the Android
// back button. A no-op in the browser, so it costs the web build nothing.
void initNative();
// Offline write queue: replay any mutations parked while the device was offline,
// and keep replaying whenever connectivity returns. A no-op with an empty queue,
// and works in both the PWA and the Capacitor webview (no service worker needed).
startOfflineSync();

// Runtime accessibility audit — DEV ONLY. axe checks what static linting cannot:
// computed colour contrast, ARIA that only resolves at render, focus order. The
// import is dynamic and guarded by import.meta.env.DEV, so it is tree-shaken out of
// the production build entirely and never ships to users. Violations print to the
// browser console while you work.
if (import.meta.env.DEV) {
  void Promise.all([import('react'), import('react-dom'), import('@axe-core/react')]).then(
    ([React, ReactDOM, axe]) => {
      axe.default(React.default, ReactDOM.default, 1000);
    },
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </AppErrorBoundary>
  </StrictMode>,
);
