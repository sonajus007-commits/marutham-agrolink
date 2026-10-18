import { useTranslation } from 'react-i18next';
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
import { defaultAddressIndex } from '@marutham/lib';
import type { Product, Offer, Rating, SavedAddress } from '@marutham/lib';
import { useAuth } from '../../auth/AuthContext';
import { getCurrentPosition } from '../../native/geolocation';

/** Radius choices around the buyer in their home district; null = whole district. */
export const RADIUS_OPTIONS = [10, 25, 50, null] as const;
export type RadiusKm = (typeof RADIUS_OPTIONS)[number];
const DEFAULT_RADIUS: RadiusKm = 25;

export interface BuyerPin {
  lat: number;
  lng: number;
  /** Where the pin came from — the default saved address, or a one-off GPS fix. */
  source: 'address' | 'gps';
}

const sameDistrict = (a?: string | null, b?: string | null) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

interface ConsumerData {
  products: Product[];
  productById: Record<string, Product>;
  offersByProduct: Record<string, Offer[]>;
  ratingsMap: Record<string, Rating>;
  ratingsByFP: Record<string, Rating>;
  district: string;
  setDistrict: (d: string) => void;
  /** The buyer's own district (default address, else profile) — where the radius applies. */
  homeDistrict: string;
  /** Distances are measured from here; null until located (or location refused). */
  buyerPin: BuyerPin | null;
  radiusKm: RadiusKm;
  setRadiusKm: (r: RadiusKm) => void;
  /** True when the radius is actually narrowing the offers (home district + a pin). */
  radiusApplies: boolean;
  loading: boolean;
  error: string | null;
  /** Re-fetch the current district's catalogue (the error state's Retry). */
  reload: () => void;
  /** Saved-product ids for the heart toggle; toggleSaved flips one (optimistic). */
  savedIds: Set<string>;
  isSaved: (productId: string) => boolean;
  toggleSaved: (productId: string) => void;
}

const Ctx = createContext<ConsumerData | null>(null);

export function ConsumerDataProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  // The buyer's pin: the default saved address's map pin, else ask the device once.
  const addrs = (user?.delivery_addresses as SavedAddress[]) || [];
  const defIdx = defaultAddressIndex(addrs);
  const defAddr = defIdx === null ? null : addrs[defIdx];
  const homeDistrict = (defAddr?.district as string) || (user?.district as string) || 'Pudukkottai';
  const addrLat = typeof defAddr?.lat === 'number' ? defAddr.lat : null;
  const addrLng = typeof defAddr?.lng === 'number' ? defAddr.lng : null;
  const [gpsPin, setGpsPin] = useState<BuyerPin | null>(null);
  const hasAddrPin = addrLat !== null && addrLng !== null;
  useEffect(() => {
    if (hasAddrPin) return;
    let active = true;
    // Best-effort and never blocking: a refusal just means no km labels.
    getCurrentPosition().then((c) => {
      if (active && c) setGpsPin({ lat: c.lat, lng: c.lng, source: 'gps' });
    });
    return () => {
      active = false;
    };
  }, [hasAddrPin]);
  const buyerPin = useMemo<BuyerPin | null>(
    () =>
      addrLat !== null && addrLng !== null
        ? { lat: addrLat, lng: addrLng, source: 'address' }
        : gpsPin,
    [addrLat, addrLng, gpsPin],
  );

  const [district, setDistrict] = useState<string>(homeDistrict);
  const [radiusKm, setRadiusKm] = useState<RadiusKm>(DEFAULT_RADIUS);
  const [products, setProducts] = useState<Product[]>([]);
  const [rawOffers, setOffers] = useState<Record<string, Offer[]>>({});
  const [ratingsMap, setRatingsMap] = useState<Record<string, Rating>>({});
  const [ratingsByFP, setRatingsByFP] = useState<Record<string, Rating>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  // Load the saved-products set once (best-effort — a failure just leaves hearts empty).
  useEffect(() => {
    let active = true;
    api
      .getWishlist()
      .then((res) => {
        if (active) setSavedIds(new Set((res.items || []).map((i) => i.product_id)));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const isSaved = useCallback((id: string) => savedIds.has(id), [savedIds]);

  // Optimistic toggle: flip the set now, call the API, roll back only on failure.
  const toggleSaved = useCallback(
    (id: string) => {
      const wasSaved = savedIds.has(id);
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (wasSaved) next.delete(id);
        else next.add(id);
        return next;
      });
      const call = wasSaved ? api.removeWishlist(id) : api.addWishlist(id);
      call.catch(() => {
        setSavedIds((prev) => {
          const next = new Set(prev);
          if (wasSaved) next.add(id);
          else next.delete(id);
          return next;
        });
      });
    },
    [savedIds],
  );

  const load = useCallback(
    async (dist: string, pin: BuyerPin | null) => {
      setLoading(true);
      setError(null);
      try {
        const [prodRes, offerRes, ratingRes] = await Promise.all([
          api.getProducts({ available: 'true', district: dist }),
          api.getDistrictListings(dist, pin),
          api.getTopRatings().catch(() => ({ top_ratings: [] })),
        ]);
        setProducts(prodRes.products || []);
        setOffers(offerRes.by_product || {});

        const rMap: Record<string, Rating> = {};
        const rFP: Record<string, Rating> = {};
        (ratingRes.top_ratings || []).forEach((r) => {
          const pid = r.product_id || r.product?.id;
          const fid = r.farmer?.id;
          if (!pid) return;
          const avg = parseFloat(String(r.avg_rating));
          if (!rMap[pid] || avg > rMap[pid].avg_rating)
            rMap[pid] = { avg_rating: avg, num_ratings: r.num_ratings };
          if (fid) rFP[`${fid}_${pid}`] = { avg_rating: avg, num_ratings: r.num_ratings };
        });
        setRatingsMap(rMap);
        setRatingsByFP(rFP);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : t('consumer.shop.loadFailed', 'Could not load products'),
        );
      } finally {
        setLoading(false);
      }
      // `t` is a dependency: without it this closure keeps the language it was
      // created in, and the fallback would still be English after a switch.
    },
    [t],
  );

  useEffect(() => {
    load(district, buyerPin);
  }, [district, buyerPin, load]);

  // In the buyer's own district the radius narrows what they see; another district
  // (e.g. Trichy) shows all of it, nearest first. Offers with no seller pin have
  // no distance — they stay visible rather than vanish for want of a map pin.
  const radiusApplies = !!buyerPin && radiusKm !== null && sameDistrict(district, homeDistrict);
  const offersByProduct = useMemo(() => {
    const out: Record<string, Offer[]> = {};
    for (const [pid, list] of Object.entries(rawOffers)) {
      const kept = radiusApplies
        ? list.filter((o) => o.distance_km == null || o.distance_km <= (radiusKm as number))
        : list;
      if (kept.length) out[pid] = kept;
    }
    return out;
  }, [rawOffers, radiusApplies, radiusKm]);

  const productById = useMemo(() => {
    const m: Record<string, Product> = {};
    products.forEach((p) => {
      m[p.id] = p;
    });
    return m;
  }, [products]);

  const value = useMemo<ConsumerData>(
    () => ({
      products,
      productById,
      offersByProduct,
      ratingsMap,
      ratingsByFP,
      district,
      setDistrict,
      homeDistrict,
      buyerPin,
      radiusKm,
      setRadiusKm,
      radiusApplies,
      loading,
      error,
      reload: () => void load(district, buyerPin),
      savedIds,
      isSaved,
      toggleSaved,
    }),
    [
      load,
      products,
      productById,
      offersByProduct,
      ratingsMap,
      ratingsByFP,
      district,
      homeDistrict,
      buyerPin,
      radiusKm,
      radiusApplies,
      loading,
      error,
      savedIds,
      isSaved,
      toggleSaved,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useConsumerData(): ConsumerData {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useConsumerData must be used within <ConsumerDataProvider>');
  return ctx;
}
