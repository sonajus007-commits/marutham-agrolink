import { cookies } from 'next/headers';
import { DEFAULT_LANG, LANG_COOKIE, isLang, type Lang } from '@/lib/dict';

/** The viewer's language from the cookie, defaulting to English. Shared by the
 * server pages so the cookie read is written once. */
export async function getLang(): Promise<Lang> {
  const c = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(c) ? c : DEFAULT_LANG;
}
