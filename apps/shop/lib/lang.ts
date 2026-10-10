import { headers } from 'next/headers';
import { DEFAULT_LANG, isLang, type Lang } from '@/lib/dict';
import { LANG_HEADER } from '@/lib/locale';

/** The page's language, decided by its URL: middleware.ts stamps every page
 *  request with it (/ta/* → Tamil, everything else → English). Shared by the
 *  server pages so the read is written once. */
export async function getLang(): Promise<Lang> {
  const h = (await headers()).get(LANG_HEADER);
  return isLang(h) ? h : DEFAULT_LANG;
}
