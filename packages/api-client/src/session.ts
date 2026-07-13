/* Session storage.
 *
 * These key NAMES are a contract, not an implementation detail. The legacy HTML
 * pages that originally shared them are gone, but frontend/home.html — the public
 * landing page, and the shop's outage fallback — still reads `ma_token` and
 * `ma_user` directly out of localStorage to decide whether its header says "Login"
 * or sends you to your dashboard.
 *
 * So renaming these breaks the landing page silently: it would simply decide every
 * visitor is signed out. If you change them, change home.html in the same commit. */
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
