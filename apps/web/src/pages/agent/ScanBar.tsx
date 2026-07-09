import { useState, useRef, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@marutham/api-client';
import { useToast } from '../../components/Toast';

export function ScanBar({ onScanned }: { onScanned: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function go() {
    const value = code.trim();
    if (!value) {
      toast(t('agent.scan.enterCode'), 'er');
      return;
    }
    setBusy(true);
    try {
      const res = await api.scanOrder(value);
      toast(res.message || `Advanced to: ${res.newStatus}`, 'ok');
      setCode('');
      onScanned();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Scan failed', 'er');
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') go();
  }

  return (
    <div className="scan-bar">
      <div className="scan-bar__label">📷 {t('agent.scan.label')}</div>
      <div className="scan-bar__row">
        <input
          ref={inputRef}
          id="scanInput"
          className="scan-bar__input"
          type="text"
          placeholder={t('agent.scan.placeholder')}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label={t('agent.scan.label')}
        />
        <button className="scan-bar__go" onClick={go} disabled={busy}>
          {busy ? '⏳' : `→ ${t('agent.scan.go')}`}
        </button>
      </div>
    </div>
  );
}
