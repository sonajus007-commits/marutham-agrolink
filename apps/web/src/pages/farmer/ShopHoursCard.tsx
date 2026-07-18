import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Field, Select } from '@marutham/ui';
import { api } from '@marutham/api-client';
import {
  SHOP_BAND_OPEN,
  SHOP_BAND_CLOSE,
  shopHourOptions,
  shopHoursLabel,
  validateShopHours,
  formatHour12,
} from '@marutham/lib';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';

/* Retailer trading window — the shop-side counterpart to the farmer's per-listing
 * cutoff.
 *
 * A farmer says "this harvest stops taking orders at 6 PM" on each listing. A
 * retailer is a shop: their hours are the same for everything they sell, so they
 * are set ONCE here and every listing inherits them (users.shop_open_hour /
 * shop_close_hour, migration 035).
 *
 * Rendered only for seller_type === 'Retailer'. A farmer has no shop hours, and
 * showing them an empty required field would be asking for something that does not
 * apply to them.
 */
export function ShopHoursCard() {
  const { t } = useTranslation();
  const { user, updateUser } = useAuth();
  const toast = useToast();

  const savedOpen = (user?.shop_open_hour as number | null) ?? null;
  const savedClose = (user?.shop_close_hour as number | null) ?? null;

  // '' rather than a default hour: unset must stay visibly unset, so the retailer
  // chooses their real hours instead of silently inheriting 8–8.
  const [open, setOpen] = useState<string>(savedOpen == null ? '' : String(savedOpen));
  const [close, setClose] = useState<string>(savedClose == null ? '' : String(savedClose));
  const [busy, setBusy] = useState(false);

  const hours = shopHourOptions();
  const openNum = open === '' ? null : Number(open);
  const closeNum = close === '' ? null : Number(close);
  const problem = validateShopHours(openNum, closeNum);
  const dirty = openNum !== savedOpen || closeNum !== savedClose;

  const problemText = (p: NonNullable<typeof problem>) =>
    p === 'required'
      ? t('farmer.shopHours.errRequired', 'Choose when your shop opens and closes.')
      : p === 'order'
        ? t('farmer.shopHours.errOrder', 'Opening time must be before closing time.')
        : t('farmer.shopHours.errBand', 'Shop hours must be between {{from}} and {{to}}.', {
            from: formatHour12(SHOP_BAND_OPEN),
            to: formatHour12(SHOP_BAND_CLOSE),
          });

  async function save() {
    if (problem) return;
    setBusy(true);
    try {
      const res = await api.patchMe({ shop_open_hour: openNum, shop_close_hour: closeNum });
      updateUser(res.user);
      toast(t('farmer.shopHours.saved', 'Shop hours saved.'), 'ok');
    } catch (e) {
      toast(
        e instanceof Error ? e.message : t('farmer.shopHours.failed', 'Could not save shop hours.'),
        'er',
      );
    } finally {
      setBusy(false);
    }
  }

  const current = shopHoursLabel(savedOpen, savedClose);

  return (
    <Card>
      <h3 className="mb-1 text-sm font-bold text-primary">
        🏪 {t('farmer.shopHours.title', 'Shop available time')}
      </h3>
      <p className="mb-3 text-2xs text-fg-muted">
        {t(
          'farmer.shopHours.hint',
          'When customers can order and collect. Applies to everything you sell.',
        )}
      </p>

      {/* Unset is not a neutral state for a retailer — they cannot trade until this
          is answered, so say so rather than showing a blank pair of dropdowns. */}
      {current ? (
        <p
          className="mb-3 rounded-sm px-2 py-1.5 text-2xs font-semibold"
          style={{ background: 'var(--success-bg)', color: 'var(--success-fg)' }}
        >
          {t('farmer.shopHours.current', 'Currently open {{window}}', { window: current })}
        </p>
      ) : (
        <p
          className="mb-3 rounded-sm px-2 py-1.5 text-2xs font-semibold"
          style={{ background: 'var(--warning-bg)', color: 'var(--warning-fg)' }}
          role="alert"
        >
          {t('farmer.shopHours.unset', 'Required — set your hours before you list products.')}
        </p>
      )}

      <div className="flex gap-3">
        <Field label={t('farmer.shopHours.opens', 'Opens')}>
          {(p) => (
            <Select {...p} value={open} onChange={(e) => setOpen(e.target.value)}>
              <option value="">{t('farmer.shopHours.choose', '— Select —')}</option>
              {hours.map((h) => (
                <option key={h.hour} value={h.hour}>
                  {h.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('farmer.shopHours.closes', 'Closes')}>
          {(p) => (
            <Select {...p} value={close} onChange={(e) => setClose(e.target.value)}>
              <option value="">{t('farmer.shopHours.choose', '— Select —')}</option>
              {hours.map((h) => (
                <option key={h.hour} value={h.hour}>
                  {h.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      {/* Only nag once they have started: an untouched empty form is not an error
          the retailer has made yet. */}
      {problem && dirty ? (
        <p className="mt-2 text-2xs text-danger" role="alert">
          {problemText(problem)}
        </p>
      ) : null}

      <Button
        block
        className="mt-3"
        disabled={busy || !!problem || !dirty}
        onClick={() => void save()}
      >
        {busy ? '…' : t('farmer.shopHours.save', 'Save Shop Hours')}
      </Button>
    </Card>
  );
}
