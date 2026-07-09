import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLang, setLang } from '@marutham/api-client';
import { resources, type AppLanguage } from './resources';

/* Initialise i18next once. Language is read from / written to the same
 * `ma_lang` localStorage key the legacy site uses, so the two stay in sync. */
export function initI18n() {
  if (!i18n.isInitialized) {
    i18n.use(initReactI18next).init({
      resources,
      lng: getLang(),
      fallbackLng: 'en',
      interpolation: { escapeValue: false },
    });
    document.documentElement.lang = getLang();
  }
  return i18n;
}

export function changeLanguage(lang: AppLanguage) {
  setLang(lang);
  document.documentElement.lang = lang;
  return i18n.changeLanguage(lang);
}

export { resources };
export type { AppLanguage };
export default i18n;
