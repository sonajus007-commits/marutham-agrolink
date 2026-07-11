import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initI18n } from '@marutham/i18n';
// tailwind.css imports @marutham/tokens/tokens.css itself — the theme mapping
// is meaningless without it. Keep it first so the tokens land before styles.css.
import './tailwind.css';
import './styles.css';
import { App } from './App';

initI18n();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
