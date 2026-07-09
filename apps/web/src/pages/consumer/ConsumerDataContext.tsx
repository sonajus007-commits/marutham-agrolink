import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
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
}

const Ctx = createContext<ConsumerData | null>(null);

export function ConsumerDataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [district, setDistrict] = useState<string>((user?.district as string) || 'Pudukkottai');
  const [products, setProducts] = useState<Product[]>([]);
  const [offersByProduct, setOffers] = useState<Record<string, Offer[]>>({});
  const [ratingsMap, setRatingsMap] = useState<Record<string, Rating>>({});
  const [ratingsByFP, setRatingsByFP] = useState<Record<string, Rating>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (dist: string) => {
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
        if (!rMap[pid] || avg > rMap[pid].avg_rating) rMap[pid] = { avg_rating: avg, num_ratings: r.num_ratings };
        if (fid) rFP[`${fid}_${pid}`] = { avg_rating: avg, num_ratings: r.num_ratings };
      });
      setRatingsMap(rMap);
      setRatingsByFP(rFP);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load products');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(district);
  }, [district, load]);

  const productById = useMemo(() => {
    const m: Record<string, Product> = {};
    products.forEach((p) => { m[p.id] = p; });
    return m;
  }, [products]);

  const value = useMemo<ConsumerData>(
    () => ({ products, productById, offersByProduct, ratingsMap, ratingsByFP, district, setDistrict, loading, error }),
    [products, productById, offersByProduct, ratingsMap, ratingsByFP, district, loading, error],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useConsumerData(): ConsumerData {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useConsumerData must be used within <ConsumerDataProvider>');
  return ctx;
}
