import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { initI18n } from '@marutham/i18n';
import { queryClient } from './lib/queryClient';
// tailwind.css imports @marutham/tokens/tokens.css itself — the theme mapping
// is meaningless without it. Keep it first so the tokens land before styles.css.
import './tailwind.css';
import './styles.css';
import { App } from './App';

initI18n();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
