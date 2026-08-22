import { useEffect, useState } from 'react';
import { api } from '@marutham/api-client';

/* Learned autocomplete for the merged Village/Town/City field: the distinct
 * localities people have ALREADY entered in the chosen taluk. There is no village
 * master (deliberately — see migration 017), and delivery routes on pincode +
 * taluk + the GPS pin, so this self-populating list gives dropdown-like help with
 * zero data to source or maintain, and it improves on its own as data accrues.
 * Free text always wins — the datalist only suggests, never constrains.
 *
 * Cached per (state|district|taluk) for the session so re-opening a form or
 * flipping between addresses does not refetch. Empty until a taluk is chosen. */
const cache = new Map<string, string[]>();

export function useVillageSuggestions(
  state?: string | null,
  district?: string | null,
  taluk?: string | null,
): string[] {
  const key = `${state || ''}|${district || ''}|${taluk || ''}`;
  const [list, setList] = useState<string[]>(() => cache.get(key) || []);

  useEffect(() => {
    // Nothing to suggest until the locality is pinned to a taluk.
    if (!state || !district || !taluk) {
      setList([]);
      return;
    }
    const cached = cache.get(key);
    if (cached) {
      setList(cached);
      return;
    }
    let active = true;
    api
      .villageSuggestions(state, district, taluk)
      .then((d) => {
        const villages = d.villages || [];
        cache.set(key, villages);
        if (active) setList(villages);
      })
      // A failed suggestion fetch must never break the form — just no hints.
      .catch(() => active && setList([]));
    return () => {
      active = false;
    };
  }, [key, state, district, taluk]);

  return list;
}
