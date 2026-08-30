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
import type { Product, Offer, Rating } from '@marutham/lib';
import { useAuth } from '../../auth/AuthContext';

interface ConsumerData {
  products: Product[];
  productById: Record<string, Product>;
  offersByProduct: Record<string, Offer[]>;
  ratingsMap: Record<string, Rating>;
  ratingsByFP: Record<string, Rating>;
  district: string;
  setDistrict: (d: string) => void;
  loading: boolean;
  error: string | null;
  /** Saved-product ids for the heart toggle; toggleSaved flips one (optimistic). */
  savedIds: Set<string>;
  isSaved: (productId: string) => boolean;
  toggleSaved: (productId: string) => void;
}

const Ctx = createContext<ConsumerData | null>(null);

export function ConsumerDataProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [district, setDistrict] = useState<string>((user?.district as string) || 'Pudukkottai');
  const [products, setProducts] = useState<Product[]>([]);
  const [offersByProduct, setOffers] = useState<Record<string, Offer[]>>({});
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
    async (dist: string) => {
      setLoading(true);
      setError(null);
      try {
        const [prodRes, offerRes, ratingRes] = await Promise.all([
          api.getProducts({ available: 'true', district: dist }),
          api.getDistrictListings(dist),
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
    load(district);
  }, [district, load]);

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
      loading,
      error,
      savedIds,
      isSaved,
      toggleSaved,
    }),
    [
      products,
      productById,
      offersByProduct,
      ratingsMap,
      ratingsByFP,
      district,
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
