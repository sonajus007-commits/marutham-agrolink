import { useTranslation } from 'react-i18next';

export interface QuickAction {
  id: string;
  icon: string;
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
        {actions.map((a) => (
          <button
            key={a.id}
            type="button"
            className="cons-qa__card"
            onClick={a.onClick}
            disabled={a.disabled}
          >
            <span className="cons-qa__icon" aria-hidden="true">
              {a.icon}
            </span>
            <span className="cons-qa__body">
              <span className="cons-qa__title">{a.title}</span>
              <span className="cons-qa__sub">{a.subtitle}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
