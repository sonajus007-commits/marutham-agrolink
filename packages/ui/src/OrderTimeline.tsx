import { fmtDate, type OrderHistoryEntry } from '@marutham/lib';
import { cn } from './lib/cn';

/** Status history for an order. Shared by the Agent and Consumer order views. */
export function OrderTimeline({ entries }: { entries: OrderHistoryEntry[] }) {
  if (!entries.length) return null;
  const lastIdx = entries.length - 1;

  return (
    <ol className="m-0 list-none p-0">
      {entries.map((h, i) => (
        <li
          key={`${h.label}-${h.ts ?? i}`}
          // The connecting rail is a ::before on every item but the last, so it
          // spans the gap between dots without needing an extra element.
          className={
            'relative flex gap-2.5 pb-3.5 ' +
            "before:absolute before:left-1 before:top-3 before:bottom-0 before:w-0.5 before:bg-neutral-200 before:content-[''] " +
            'last:before:hidden'
          }
        >
          <span
            className={cn(
              'relative z-[1] mt-[3px] size-2.5 shrink-0 rounded-full',
              i === lastIdx
                ? 'bg-leaf shadow-[0_0_0_3px_var(--focus-ring-strong)]'
                : 'bg-neutral-300',
            )}
            aria-hidden="true"
          />
          <div>
            <div className="text-base font-bold text-primary">{h.label}</div>
            <div className="mt-px text-xs text-fg-muted">{fmtDate(h.ts)}</div>
            {h.note ? <div className="mt-0.5 text-sm italic text-fg-muted">{h.note}</div> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
