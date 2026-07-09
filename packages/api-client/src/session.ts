/* Session storage — reuses the SAME localStorage keys as the legacy
 * frontend/js/shared.js so a user can move between the legacy HTML pages and
 * the new React app without logging in twice during the migration. */
import type { User } from './types';

const TOKEN_KEY = 'ma_token';
const USER_KEY = 'ma_user';
const LANG_KEY = 'ma_lang';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): User | null {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
  } catch {
    return null;
  }
}

export function setSession(token: string, user: User): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getLang(): 'en' | 'ta' {
  return (localStorage.getItem(LANG_KEY) as 'en' | 'ta') || 'en';
}

export function setLang(lang: 'en' | 'ta'): void {
  localStorage.setItem(LANG_KEY, lang);
}
