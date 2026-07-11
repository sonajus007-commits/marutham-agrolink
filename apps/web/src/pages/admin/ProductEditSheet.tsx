import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Field, INPUT_CLASS, Input, Modal, Sheet, SELECT_CLASS } from '@marutham/ui';
import { api, type AdminDistrictPrice, type ProductPayload, type ProductPriceInput } from '@marutham/api-client';
import type { Product } from '@marutham/lib';
import { useToast } from '../../components/Toast';

interface Form {
  code: string;
  name: string;
  regional_name: string;
  product_group: string;
  category: string;
  sub_type: string;
  unit: string;
  platform_fee_pct: string;
  exotic: boolean;
  available: boolean;
}

interface PriceRow { district: string; market_price_rs: string; handling_rs: string }

const blankForm: Form = {
  code: '', name: '', regional_name: '', product_group: '', category: '', sub_type: '',
  unit: '', platform_fee_pct: '5', exotic: false, available: true,
};

function formFrom(p: Product): Form {
  return {
    code: String(p.code ?? ''),
    name: p.name ?? '',
    regional_name: p.regional_name ?? '',
    product_group: p.product_group ?? '',
    category: p.category ?? '',
    sub_type: p.sub_type ?? '',
    unit: p.unit ?? '',
    platform_fee_pct: p.platform_fee_pct != null ? String(p.platform_fee_pct) : '5',
    exotic: !!p.exotic,
    available: p.available !== false,
  };
}

function pricesFrom(p: Product): PriceRow[] {
  const rows = (p.product_district_prices as AdminDistrictPrice[] | undefined) || [];
  return rows
    .map((r) => ({
      district: r.district,
      market_price_rs: r.market_price != null ? String(parseFloat(String(r.market_price))) : '',
      handling_rs: r.handling != null ? String(parseFloat(String(r.handling))) : '0',
    }))
    .sort((a, b) => a.district.localeCompare(b.district));
}

/** Digits + one dot; kept as a string so "3." survives mid-typing. */
const numeric = (v: string) => v.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');

export function ProductEditSheet({
  product,
  open,
  canEdit,
  districts,
  onClose,
  onChanged,
}: {
  /** null = create a new product. */
  product: Product | null;
  open: boolean;
  canEdit: boolean;
  districts: string[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const isCreate = product === null;

  const [form, setForm] = useState<Form>(blankForm);
  const [prices, setPrices] = useState<PriceRow[]>([]);
  // Districts already persisted on this product, and the persisted ones the user
  // has removed this session — deleted server-side on Save (the price PUT only
  // upserts, so a removal needs an explicit DELETE).
  const [savedDistricts, setSavedDistricts] = useState<Set<string>>(new Set());
  const [removedSaved, setRemovedSaved] = useState<Set<string>>(new Set());
  const [addDistrict, setAddDistrict] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    const initial = product ? pricesFrom(product) : [];
    setForm(product ? formFrom(product) : blankForm);
    setPrices(initial);
    setSavedDistricts(new Set(initial.map((r) => r.district)));
    setRemovedSaved(new Set());
    setAddDistrict('');
    setError(null);
    setShowDelete(false);
  }, [open, product]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const usedDistricts = new Set(prices.map((p) => p.district));
  const availableDistricts = districts.filter((d) => !usedDistricts.has(d));

  function addPriceRow() {
    if (!addDistrict) return;
    setPrices((rows) => [...rows, { district: addDistrict, market_price_rs: '', handling_rs: '0' }].sort((a, b) => a.district.localeCompare(b.district)));
    // Re-adding a district that was slated for deletion cancels the delete.
    setRemovedSaved((s) => { const n = new Set(s); n.delete(addDistrict); return n; });
    setAddDistrict('');
  }
  function setPrice(district: string, field: 'market_price_rs' | 'handling_rs', v: string) {
    setPrices((rows) => rows.map((r) => (r.district === district ? { ...r, [field]: numeric(v) } : r)));
  }
  function removePriceRow(district: string) {
    setPrices((rows) => rows.filter((r) => r.district !== district));
    // A persisted district must be deleted server-side on Save, not just hidden.
    if (savedDistricts.has(district)) setRemovedSaved((s) => new Set(s).add(district));
  }

  async function save() {
    if (!form.name.trim()) return setError(t('admin.prod.errName'));
    if (!form.unit.trim()) return setError(t('admin.prod.errUnit'));
    if (isCreate && !form.code.trim()) return setError(t('admin.prod.errCode'));
    setError(null);

    const payload: ProductPayload = {
      name: form.name.trim(),
      regional_name: form.regional_name.trim() || null,
      product_group: form.product_group.trim() || null,
      category: form.category.trim() || null,
      sub_type: form.sub_type.trim() || null,
      unit: form.unit.trim(),
      exotic: form.exotic,
      platform_fee_pct: form.platform_fee_pct ? parseFloat(form.platform_fee_pct) : 0,
      available: form.available,
    };
    if (isCreate) payload.code = form.code.trim();

    // Rows with a positive market price are the only ones the endpoint accepts.
    const priceInput: ProductPriceInput[] = prices
      .filter((r) => parseFloat(r.market_price_rs) > 0)
      .map((r) => ({ district: r.district, market_price_rs: parseFloat(r.market_price_rs), handling_rs: parseFloat(r.handling_rs) || 0 }));

    setBusy(true);
    try {
      const res = isCreate ? await api.createProduct(payload) : await api.updateProduct(product!.id, payload);
      const id = isCreate ? res.product.id : product!.id;
      if (priceInput.length > 0) await api.saveProductPrices(id, priceInput);
      // Persisted districts the user removed — the PUT can't delete, so do it here.
      for (const district of removedSaved) await api.deleteProductPrice(id, district);
      toast(isCreate ? t('admin.prod.created') : t('admin.prod.updated'), 'ok');
      onChanged();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not save product';
      setError(msg);
      toast(msg, 'er');
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    if (!product) return;
    setBusy(true);
    try {
      await api.deleteProduct(product.id);
      toast(t('admin.prod.deleted'), 'ok');
      onChanged();
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not delete product', 'er');
    } finally {
      setBusy(false);
      setShowDelete(false);
    }
  }

  const ro = !canEdit;
  const title = isCreate ? t('admin.prod.create') : product?.name || t('admin.prod.editTitle');

  return (
    <Sheet open={open} title={title} onClose={onClose}>
      {ro ? <p className="mb-3 rounded-base bg-surface-muted px-3 py-2 text-2xs text-fg-muted">{t('admin.prod.readonly')}</p> : null}

      {isCreate ? (
        <Field label={t('admin.prod.field.code')} required>
          {(p) => <Input {...p} value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="TOMATO" />}
        </Field>
      ) : null}

      <Field label={t('admin.prod.field.name')} required>
        {(p) => <Input {...p} value={form.name} onChange={(e) => set('name', e.target.value)} disabled={ro} />}
      </Field>
      <Field label={t('admin.prod.field.regionalName')}>
        {(p) => <Input {...p} value={form.regional_name} onChange={(e) => set('regional_name', e.target.value)} disabled={ro} className="tamil" />}
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={t('admin.prod.field.group')}>
          {(p) => <Input {...p} value={form.product_group} onChange={(e) => set('product_group', e.target.value)} disabled={ro} />}
        </Field>
        <Field label={t('admin.prod.field.unit')} required>
          {(p) => <Input {...p} value={form.unit} onChange={(e) => set('unit', e.target.value)} placeholder="kg" disabled={ro} />}
        </Field>
        <Field label={t('admin.prod.field.category')}>
          {(p) => <Input {...p} value={form.category} onChange={(e) => set('category', e.target.value)} disabled={ro} />}
        </Field>
        <Field label={t('admin.prod.field.subType')}>
          {(p) => <Input {...p} value={form.sub_type} onChange={(e) => set('sub_type', e.target.value)} disabled={ro} />}
        </Field>
        <Field label={t('admin.prod.field.fee')}>
          {(p) => <Input {...p} inputMode="decimal" value={form.platform_fee_pct} onChange={(e) => set('platform_fee_pct', numeric(e.target.value))} disabled={ro} />}
        </Field>
      </div>

      <div className="mb-3 flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm text-fg">
          <input type="checkbox" checked={form.exotic} onChange={(e) => set('exotic', e.target.checked)} disabled={ro} />
          {t('admin.prod.field.exotic')}
        </label>
        <label className="flex items-center gap-2 text-sm text-fg">
          <input type="checkbox" checked={form.available} onChange={(e) => set('available', e.target.checked)} disabled={ro} />
          {t('admin.prod.field.available')}
        </label>
      </div>

      {/* District prices */}
      <section className="mb-3 rounded-base border border-border-subtle bg-surface p-3">
        <h3 className="mb-2 text-sm font-bold text-primary">📍 {t('admin.prod.prices')}</h3>
        {prices.length === 0 ? <p className="mb-2 text-2xs text-fg-muted">{t('admin.prod.noPrices')}</p> : null}
        <div className="flex flex-col gap-2">
          {prices.map((r) => (
            <div key={r.district} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm text-fg">{r.district}</span>
              <div className="flex items-center gap-1">
                <span className="text-2xs text-fg-muted">₹</span>
                <input className={`${INPUT_CLASS} w-20 text-xs`} inputMode="decimal" value={r.market_price_rs} onChange={(e) => setPrice(r.district, 'market_price_rs', e.target.value)} placeholder={t('admin.prod.market')} disabled={ro} aria-label={`${r.district} ${t('admin.prod.market')}`} />
              </div>
              {!ro ? (
                <button type="button" onClick={() => removePriceRow(r.district)} aria-label={t('admin.prod.removeRow')} className="cursor-pointer rounded-sm border-0 bg-surface-muted px-2 py-1 text-2xs text-danger hover:bg-danger hover:text-white">✕</button>
              ) : null}
            </div>
          ))}
        </div>
        {!ro && availableDistricts.length > 0 ? (
          <div className="mt-2 flex items-center gap-2">
            <select className={`${SELECT_CLASS} min-w-0 flex-1`} value={addDistrict} onChange={(e) => setAddDistrict(e.target.value)} aria-label={t('admin.prod.selectDistrict')}>
              <option value="">— {t('admin.prod.selectDistrict')} —</option>
              {availableDistricts.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <Button variant="ghost" onClick={addPriceRow} disabled={!addDistrict}>+ {t('admin.prod.addDistrict')}</Button>
          </div>
        ) : null}
      </section>

      {error ? <div className="mb-2 text-2xs text-danger" role="alert">{error}</div> : null}

      {!ro ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={save} disabled={busy}>{busy ? t('admin.prod.saving') : t('admin.prod.save')}</Button>
          <Button variant="ghost" onClick={onClose} disabled={busy}>{t('admin.prod.cancel')}</Button>
          {!isCreate ? (
            <Button variant="danger" onClick={() => setShowDelete(true)} disabled={busy} className="ml-auto">{t('admin.prod.delete')}</Button>
          ) : null}
        </div>
      ) : (
        <Button variant="ghost" onClick={onClose}>{t('admin.prod.cancel')}</Button>
      )}

      <Modal
        open={showDelete}
        title={t('admin.prod.deleteConfirm')}
        subtitle={product?.name}
        onClose={() => setShowDelete(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowDelete(false)} disabled={busy}>{t('admin.prod.cancel')}</Button>
            <Button variant="danger" onClick={doDelete} disabled={busy}>{busy ? '…' : t('admin.prod.delete')}</Button>
          </>
        }
      >
        <p className="text-sm text-fg">{t('admin.prod.deleteConfirmBody')}</p>
      </Modal>
    </Sheet>
  );
}
