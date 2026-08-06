import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api } from '@marutham/api-client';
import { useAuth } from '../../auth/AuthContext';

/* Shared State / District drill-down for the whole Admin console.
 *
 * One selection, mounted at the shell, so picking a district on Orders carries
 * over to Users, Returns, Payouts… and survives a reload (localStorage). The
 * KPI dashboards (Overview / Executive) read `state`/`district` and refetch
 * server-side; the record lists filter their already-loaded rows with
 * `inGeoScope(rowDistrict)`.
 *
 * A geo-locked role (District Manager / Hub Incharge / VCO / Delivery Agent) is
 * already scoped to its own district by the server, so `canFilter` is false and
 * the bar renders nothing — the server also ignores the params, so the two
 * halves of the guard agree. */

/** admin_roles whose console is locked to their own geography. */
export const GEO_LOCKED_ROLES = ['District Manager', 'Hub Incharge', 'VCO', 'Delivery Agent'];
/** The state the console opens on, unless the DB has no such state. */
export const DEFAULT_STATE = 'Tamil Nadu';

const STORAGE_KEY = 'ma_admin_geo';

/** `district === ''` means "every district in the state" — the overall view. */
export interface AdminGeo {
  state: string;
  district: string;
  setState: (s: string) => void;
  setDistrict: (d: string) => void;
  /** Whether this role may filter at all (false = geo-locked). */
  canFilter: boolean;
  /** State → District → taluk[] reference tree (empty until loaded). */
  tree: Record<string, Record<string, string[]>>;
  states: string[];
  districts: string[];
  /** Is a row (identified by its district) within the current selection? */
  inGeoScope: (rowDistrict?: string | null) => boolean;
}

const Ctx = createContext<AdminGeo | null>(null);

function readStored(): { state: string; district: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const v = JSON.parse(raw);
      if (v && typeof v.state === 'string' && typeof v.district === 'string') return v;
    }
  } catch {
    /* ignore corrupt storage */
  }
  return { state: DEFAULT_STATE, district: '' };
}

export function AdminGeoProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const canFilter = !GEO_LOCKED_ROLES.includes(user?.admin_role || '');

  // Lazy initialisers so localStorage is read once, not on every render.
  const [state, setStateRaw] = useState(() => readStored().state);
  const [district, setDistrict] = useState(() => readStored().district);
  const [tree, setTree] = useState<Record<string, Record<string, string[]>>>({});

  // Load the location tree once, for filterable roles only.
  useEffect(() => {
    if (!canFilter) return;
    let live = true;
    api
      .getLocations()
      .then((r) => {
        if (!live) return;
        const tr = r.tree || {};
        setTree(tr);
        // If the persisted / default state is missing from the DB, fall back to
        // the first one so the dropdown always has a valid value.
        setStateRaw((cur) => (tr[cur] ? cur : Object.keys(tr)[0] || cur));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [canFilter]);

  // Persist the selection so it survives navigation and reloads.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ state, district }));
    } catch {
      /* ignore quota / private-mode errors */
    }
  }, [state, district]);

  // Changing state resets the district back to "all" — a district from the old
  // state is meaningless under the new one.
  const setState = useCallback((s: string) => {
    setStateRaw(s);
    setDistrict('');
  }, []);

  const states = useMemo(() => Object.keys(tree), [tree]);
  const districts = useMemo(() => (tree[state] ? Object.keys(tree[state]) : []), [tree, state]);

  const inGeoScope = useCallback(
    (rowDistrict?: string | null): boolean => {
      if (!canFilter) return true;
      if (district) return rowDistrict === district;
      if (state) {
        const ds = tree[state];
        // Districts for the state not loaded yet → don't hide everything.
        if (!ds) return true;
        return rowDistrict != null && rowDistrict in ds;
      }
      return true;
    },
    [canFilter, district, state, tree],
  );

  const value = useMemo<AdminGeo>(
    () => ({
      state,
      district,
      setState,
      setDistrict,
      canFilter,
      tree,
      states,
      districts,
      inGeoScope,
    }),
    [state, district, setState, canFilter, tree, states, districts, inGeoScope],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAdminGeo(): AdminGeo {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAdminGeo must be used within an AdminGeoProvider');
  return v;
}
