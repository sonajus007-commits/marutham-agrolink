import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet } from '@marutham/ui';
import { api } from '@marutham/api-client';
import { statusKey } from '@marutham/lib';
import { useToast } from '../../components/Toast';
import { scannerAvailable, scanQrCode } from '../../native/scanner';

/* The scan-first entry the field roles reach from anywhere via the ScanFab. In the
 * phone app a camera button reads the order QR (native/scanner); everywhere, a large
 * auto-focused code field takes a typed code or a hardware keyboard-wedge scanner's
 * code + Enter. One code → one step forward (POST /orders/:id/scan), the same action
 * the per-order buttons take.
 *
 * Online-only by design: this is the "grab any order and advance it" entry, where the
 * agent is choosing which order — unlike the deliver/verify sheets, which carry a
 * specific order's stage and so are offline-queueable. */
export function ScanSheet({
  open,
  onClose,
  onScanned,
}: {
  open: boolean;
  onClose: () => void;
  onScanned: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const camera = scannerAvailable();

  // Fresh field each open. Focus it so a wedge scanner's keystrokes land immediately —
  // but not in the phone app, where focusing would throw the keyboard over the
  // camera button.
  useEffect(() => {
    if (!open) return;
    setCode('');
    setBusy(false);
    if (camera) return;
    const id = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(id);
  }, [open, camera]);

  async function scanWithCamera() {
    setBusy(true);
    const r = await scanQrCode();
    if (r.kind === 'code') {
      setCode(r.code);
      await go(r.code);
      return;
    }
    setBusy(false);
    if (r.kind === 'installing') {
      toast(t('agent.scan.installing', 'Getting the scanner ready. Try again in a minute.'), 'nfo');
    } else if (r.kind === 'failed') {
      toast(t('agent.scan.cameraFailed', "Couldn't open the camera. Type the code instead."), 'er');
    }
  }

  async function go(scanned?: string) {
    const value = (scanned ?? code).trim();
    if (!value) {
      toast(t('agent.scan.enterCode', 'Enter an order code'), 'er');
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const res = await api.scanOrder(value);
      // Build the message from the returned status so it speaks the user's language,
      // rather than echoing the server's English prose.
      toast(
        t('agent.advanced', 'Advanced to: {{status}}', {
          status: t(statusKey(String(res.newStatus ?? '')), String(res.newStatus ?? '')),
        }),
        'ok',
      );
      onScanned();
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('agent.scan.failed', 'Scan failed'), 'er');
      setBusy(false);
      inputRef.current?.select();
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') go();
  }

  return (
    <Sheet
      open={open}
      title={t('agent.scan.title', 'Scan an order')}
      onClose={onClose}
      backLabel={t('common.back', 'Back')}
    >
      <div className="scan-sheet">
        {camera ? (
          <>
            <button className="scan-sheet__camera" onClick={scanWithCamera} disabled={busy}>
              📷 {t('agent.scan.camera', 'Scan QR with camera')}
            </button>
            <div className="scan-sheet__or">{t('agent.scan.orType', 'or type the order code')}</div>
          </>
        ) : (
          <div className="scan-sheet__hint">
            {t('agent.scan.hint', 'Type the order code, or use a barcode scanner, to advance it.')}
          </div>
        )}
        <input
          ref={inputRef}
          className="scan-sheet__input"
          type="text"
          inputMode="text"
          autoComplete="off"
          placeholder={t('agent.scan.placeholder', 'ORD-CBE-250626-001 or paste ID')}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label={t('agent.scan.label', 'Scan / Enter Order Code')}
        />
        <button className="scan-sheet__go" onClick={() => go()} disabled={busy}>
          {busy ? `⏳ ${t('agent.scan.busy', 'Scanning…')}` : `→ ${t('agent.scan.go', 'Go')}`}
        </button>
      </div>
    </Sheet>
  );
}
