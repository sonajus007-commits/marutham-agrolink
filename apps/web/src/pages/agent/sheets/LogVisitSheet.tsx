import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet, Spinner, ActionBar, SELECT_CLASS, INPUT_CLASS } from '@marutham/ui';
import {
  api,
  FARMER_VISIT_PURPOSES,
  type FarmerLite,
  type FarmerVisitPurpose,
} from '@marutham/api-client';
import { useToast } from '../../../components/Toast';

/* Log a field visit to a farmer (migration 061). A VCO opens this from the overview,
 * picks a farmer they manage, states the purpose and an optional note. It feeds the
 * operations dashboard's field-visit count. Online-only — like scan, the picker needs
 * a live farmer list, so this is not an offline-queued action. */
export function LogVisitSheet({
  open,
  onClose,
  onLogged,
}: {
  open: boolean;
  onClose: () => void;
  /** A visit was recorded — let the caller refresh any visit-derived counts. */
  onLogged?: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();

  const [farmers, setFarmers] = useState<FarmerLite[]>([]);
  const [loading, setLoading] = useState(false);
  const [farmerId, setFarmerId] = useState('');
  const [purpose, setPurpose] = useState<FarmerVisitPurpose>('collection');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  // Load the caller's farmers each time the sheet opens; reset the form on close so a
  // half-filled visit never carries into the next one.
  useEffect(() => {
    if (!open) {
      setFarmerId('');
      setPurpose('collection');
      setNotes('');
      return;
    }
    let live = true;
    setLoading(true);
    api
      .getFarmers()
      .then((r) => {
        if (live) setFarmers(r.farmers || []);
      })
      .catch(() => {
        if (live) toast(t('agent.visit.loadFailed', 'Could not load your farmers.'), 'er');
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [open, t, toast]);

  const farmerName = (f: FarmerLite) =>
    `${f.fname || ''}${f.lname ? ' ' + f.lname : ''}`.trim() ||
    f.phone ||
    t('agent.visit.unnamed', 'Farmer');

  async function submit() {
    if (!farmerId) {
      toast(t('agent.visit.pickFarmer', 'Choose a farmer first.'), 'er');
      return;
    }
    setBusy(true);
    try {
      await api.logFarmerVisit({ farmer_id: farmerId, purpose, notes: notes.trim() || undefined });
      toast(t('agent.visit.logged', 'Visit logged.'), 'ok');
      onLogged?.();
      onClose();
    } catch (e) {
      toast(
        e instanceof Error ? e.message : t('agent.visit.failed', 'Could not log the visit.'),
        'er',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      title={`🌾 ${t('agent.visit.title', 'Log a farmer visit')}`}
      onClose={onClose}
    >
      {loading ? (
        <Spinner />
      ) : (
        <div className="flex flex-col gap-4">
          <div>
            <label
              htmlFor="visit-farmer"
              className="mb-1 block text-2xs font-bold uppercase tracking-wide text-fg-muted"
            >
              {t('agent.visit.farmer', 'Farmer')}
            </label>
            {farmers.length === 0 ? (
              <p className="text-sm text-fg-muted">
                {t('agent.visit.noFarmers', 'No farmers in your area yet.')}
              </p>
            ) : (
              <select
                id="visit-farmer"
                className={SELECT_CLASS}
                value={farmerId}
                onChange={(e) => setFarmerId(e.target.value)}
              >
                <option value="">— {t('agent.visit.choose', 'Choose a farmer')} —</option>
                {farmers.map((f) => (
                  <option key={f.id} value={f.id}>
                    {farmerName(f)}
                    {f.village_town ? ` · ${f.village_town}` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label
              htmlFor="visit-purpose"
              className="mb-1 block text-2xs font-bold uppercase tracking-wide text-fg-muted"
            >
              {t('agent.visit.purpose', 'Purpose')}
            </label>
            <select
              id="visit-purpose"
              className={SELECT_CLASS}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value as FarmerVisitPurpose)}
            >
              {FARMER_VISIT_PURPOSES.map((p) => (
                <option key={p} value={p}>
                  {t(`agent.visit.purposes.${p}`, p)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="visit-notes"
              className="mb-1 block text-2xs font-bold uppercase tracking-wide text-fg-muted"
            >
              {t('agent.visit.notes', 'Notes (optional)')}
            </label>
            <textarea
              id="visit-notes"
              className={INPUT_CLASS}
              rows={3}
              value={notes}
              maxLength={1000}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('agent.visit.notesPlaceholder', 'What happened on the visit?')}
            />
          </div>

          <ActionBar sticky>
            <button
              className="confirm-btn"
              style={{
                marginTop: 0,
                boxShadow: 'none',
                borderRadius: 12,
                padding: 14,
                fontSize: 14,
              }}
              onClick={submit}
              disabled={busy || !farmerId}
            >
              {busy
                ? `⏳ ${t('agent.visit.busy', 'Logging…')}`
                : `✓ ${t('agent.visit.cta', 'Log visit')}`}
            </button>
          </ActionBar>
        </div>
      )}
    </Sheet>
  );
}
