import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initI18n } from '@marutham/i18n';
import '@marutham/tokens/tokens.css';
import '@marutham/ui/ui.css';
import './styles.css';
import { App } from './App';

initI18n();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
