import { fmtDate, type OrderHistoryEntry } from '@marutham/lib';

/** Status history for an order. Shared by the Agent and Consumer order views. */
export function OrderTimeline({ entries }: { entries: OrderHistoryEntry[] }) {
  if (!entries.length) return null;
  const lastIdx = entries.length - 1;

  return (
    <ol className="ma-timeline">
      {entries.map((h, i) => (
        <li key={`${h.label}-${h.ts ?? i}`} className={`ma-timeline__item${i === lastIdx ? ' is-current' : ''}`}>
          <span className="ma-timeline__dot" aria-hidden="true" />
          <div>
            <div className="ma-timeline__label">{h.label}</div>
            <div className="ma-timeline__time">{fmtDate(h.ts)}</div>
            {h.note ? <div className="ma-timeline__note">{h.note}</div> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
