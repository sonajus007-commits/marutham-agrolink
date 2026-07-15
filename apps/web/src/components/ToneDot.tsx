import { semantic, colors } from '@marutham/tokens';
import type { StatusTone } from '@marutham/lib';

/**
 * The severity dot beside an alert.
 *
 * `aria-hidden`, and deliberately so: it is a SECOND encoding of a severity the
 * alert's own message already states in words. Colour never carries the meaning
 * alone — a screen reader (or a red-green colourblind reader) loses nothing by
 * skipping it.
 *
 * Lived privately in ExecutivePage and again, identically, in OperationsPage.
 * Admin Head would have made three.
 */
export function ToneDot({ tone }: { tone: StatusTone }) {
  const fill =
    tone === 'success'
      ? semantic.light.success
      : tone === 'warning'
        ? semantic.light.warning
        : tone === 'danger'
          ? semantic.light.danger
          : colors.gray;
  return (
    <span
      aria-hidden="true"
      className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ background: fill }}
    />
  );
}
