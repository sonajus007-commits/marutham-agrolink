import { useTranslation } from 'react-i18next';

/* "Skip to main content" — the first Tab stop on every screen. Hidden until it
 * receives keyboard focus, then jumps past the header and side navigation to the
 * shell's <main id="main">. Every portal shell (consumer, farmer, agent,
 * admin AppShell) and the login/register screens carry that id. */
export function SkipLink() {
  const { t } = useTranslation();
  return (
    <a className="skip-link" href="#main">
      {t('a11y.skipToContent', 'Skip to main content')}
    </a>
  );
}
