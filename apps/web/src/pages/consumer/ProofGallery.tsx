import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@marutham/ui';
import { api, type OrderProof } from '@marutham/api-client';
import { fmtDate } from '@marutham/lib';

/**
 * Consumer-facing delivery-proof viewer (closes Phase 2). The field photos the VCO
 * takes at collection ('verify') and the delivery agent takes at hand-off ('delivery')
 * are stored server-side (migration 060) and already readable by the order's owner via
 * GET /orders/:id/proofs. This surfaces them as a thumbnail grid with a tap-to-enlarge
 * lightbox in the consumer order sheet.
 *
 * Self-contained and best-effort: it fetches its own proofs, and renders NOTHING when
 * there are none or the fetch fails — an order with no photos yet simply shows no card,
 * so it can be dropped in unconditionally. Only the heavy image data URIs are pulled
 * here, on demand, never on the order list.
 */
export function ProofGallery({ orderId }: { orderId: string }) {
  const { t, i18n } = useTranslation();
  const [proofs, setProofs] = useState<OrderProof[]>([]);
  const [zoom, setZoom] = useState<OrderProof | null>(null);

  useEffect(() => {
    let active = true;
    api
      .getOrderProofs(orderId)
      .then((r) => {
        if (active) setProofs(r.proofs || []);
      })
      .catch(() => {
        /* best-effort: no photos card if we can't load them */
      });
    return () => {
      active = false;
    };
  }, [orderId]);

  if (!proofs.length) return null;

  const kindLabel = (kind: OrderProof['kind']) =>
    kind === 'verify'
      ? t('consumer.proof.collected', 'Collected from farm')
      : t('consumer.proof.delivered', 'Delivered to you');

  return (
    <div className="ord-card">
      <h3 style={{ margin: '0 0 4px' }}>📷 {t('consumer.proof.title', 'Delivery photos')}</h3>
      <p className="proof-sub">
        {t('consumer.proof.sub', 'Photos taken by our team as your order moved to you.')}
      </p>
      <div className="proof-grid">
        {proofs.map((p) => (
          <button
            key={p.id}
            type="button"
            className="proof-thumb"
            onClick={() => setZoom(p)}
            aria-label={`${kindLabel(p.kind)} — ${fmtDate(p.created_at, i18n.language)}`}
          >
            <img src={p.image} alt={kindLabel(p.kind)} loading="lazy" />
            <span className="proof-thumb__tag">{kindLabel(p.kind)}</span>
          </button>
        ))}
      </div>

      <Modal
        open={!!zoom}
        title={zoom ? kindLabel(zoom.kind) : ''}
        subtitle={zoom ? fmtDate(zoom.created_at, i18n.language) : undefined}
        onClose={() => setZoom(null)}
        closeLabel={t('common.close', 'Close')}
      >
        {zoom ? (
          <div className="proof-zoom">
            <img src={zoom.image} alt={kindLabel(zoom.kind)} />
            {zoom.lat != null && zoom.lng != null ? (
              <a
                className="proof-zoom__loc"
                href={`https://www.google.com/maps/search/?api=1&query=${zoom.lat},${zoom.lng}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                📍 {t('consumer.proof.viewLocation', 'View location')}
              </a>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
