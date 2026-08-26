'use client';

/* The header "Sign in" control. Opens the login overlay on the current page
 * instead of navigating to /app/login. Styled to match the primary <Button>
 * (Button renders an <a>, which cannot open a modal, so the classes are mirrored
 * here). Falls back to a plain link if somehow rendered outside the provider. */

import { useLoginModal } from './LoginModalProvider';

const CLASSES =
  'inline-flex items-center justify-center gap-2 rounded-full font-semibold no-underline ' +
  'transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 ' +
  'focus-visible:outline-forest-700 motion-safe:hover:-translate-y-0.5 ' +
  'bg-forest-700 text-surface px-4 py-2.5 text-caption whitespace-nowrap md:px-6 ' +
  'shadow-[0_2px_10px_rgba(22,61,47,0.18)] hover:bg-forest-900 hover:shadow-[0_8px_24px_rgba(22,61,47,0.24)]';

export function LoginButton({ label }: { label: string }) {
  const modal = useLoginModal();
  if (!modal) {
    return (
      <a href="/app/login" className={CLASSES}>
        {label}
      </a>
    );
  }
  return (
    <button type="button" onClick={modal.openLogin} className={CLASSES}>
      {label}
    </button>
  );
}
