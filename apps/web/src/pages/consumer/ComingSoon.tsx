import { useTranslation } from 'react-i18next';

interface ComingItem {
  key: string;
  icon: string;
  label: string;
}

/**
 * Wallet, Reward Points, Cashback and Market Prices — features the buyer
 * dashboard is designed to hold but that have no backend yet. They render as
 * dashed, em-dashed tiles that say "Coming soon", never a fabricated 0 or a mock
 * balance: the same rule the admin PlaceholderSection follows, because a number a
 * user might act on has to be real. When the endpoints land, these tiles become
 * live KPI cards in place.
 */
export function ComingSoon() {
  const { t } = useTranslation();
  const items: ComingItem[] = [
    { key: 'wallet', icon: '👛', label: t('consumer.home.cs.wallet') },
    { key: 'rewards', icon: '🎁', label: t('consumer.home.cs.rewards') },
    { key: 'cashback', icon: '💸', label: t('consumer.home.cs.cashback') },
    { key: 'market', icon: '📈', label: t('consumer.home.cs.market') },
  ];

  return (
    <section aria-labelledby="cons-cs-title">
      <div className="cons-fresh__head">
        <div>
          <h2 id="cons-cs-title" className="cons-section-title">
            {t('consumer.home.comingSoonTitle')}
          </h2>
          <p className="cons-fresh__sub">{t('consumer.home.comingSoonSub')}</p>
        </div>
      </div>
      <div className="cons-cs__grid">
        {items.map((it) => (
          <div key={it.key} className="cons-cs__tile">
            <span className="cons-cs__icon" aria-hidden="true">
              {it.icon}
            </span>
            <span className="cons-cs__value" aria-hidden="true">
              —
            </span>
            <span className="cons-cs__label">{it.label}</span>
            <span className="cons-cs__note">{t('consumer.home.comingSoon')}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
