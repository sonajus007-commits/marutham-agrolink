import type { ReactNode, CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

/* Tint for the action's icon chip — kept to the brand hues, mirroring StatTile. */
export type QaTone = 'green' | 'leaf' | 'pink' | 'gold';
const TONE_VAR: Record<QaTone, string> = {
  green: '--forest',
  leaf: '--leaf',
  pink: '--accent',
  gold: '--gold',
};

export interface QuickAction {
  id: string;
  icon: ReactNode;
  tone?: QaTone;
  title: string;
  subtitle: string;
  onClick: () => void;
  /** Greyed + non-interactive when the action has nothing to act on yet. */
  disabled?: boolean;
}

/**
 * The dashboard's action row — the "what do you want to do next" band that the
 * grocery apps put above the fold. Every card routes to a real, existing feature
 * (Shop, Orders, an in-flight order); nothing here is a placeholder. Cards a user
 * can't act on yet (Track with no live order, Buy Again with no history) are
 * disabled rather than hidden, so the row keeps a stable four-up shape.
 */
export function QuickActions({ actions }: { actions: QuickAction[] }) {
  const { t } = useTranslation();
  return (
    <section className="cons-qa" aria-label={t('consumer.home.quickActions')}>
      <h2 className="cons-section-title">{t('consumer.home.quickActions')}</h2>
      <div className="cons-qa__grid">
        {actions.map((a) => {
          const v = TONE_VAR[a.tone ?? 'green'];
          return (
            <button
              key={a.id}
              type="button"
              className="cons-qa__card"
              onClick={a.onClick}
              disabled={a.disabled}
            >
              <span
                className="cons-qa__icon ma-chip"
                aria-hidden="true"
                style={{ '--chip-hue': `var(${v})` } as CSSProperties}
              >
                {a.icon}
              </span>
              <span className="cons-qa__body">
                <span className="cons-qa__title">{a.title}</span>
                <span className="cons-qa__sub">{a.subtitle}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
