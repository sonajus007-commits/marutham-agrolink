import { useTranslation } from 'react-i18next';
import { Alert, Button } from '@marutham/ui';
import { isTimeoutError } from '@marutham/api-client';

/* The one way a screen says "this didn't load" — with a Retry.
 *
 * It names the cause the user can act on: offline (wait / move), slow (try again),
 * or the server's own message. `error` may be the thrown error or the message
 * string a screen already keeps in state; pass the screen's reload as `onRetry`. */
export function ErrorState({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;

  const title = offline
    ? t('state.error.offlineTitle', 'You’re offline')
    : isTimeoutError(error)
      ? t('state.error.slowTitle', 'The connection is too slow')
      : t('state.error.title', 'Couldn’t load this');
  const body = offline
    ? t('state.error.offlineBody', 'Check your connection, then try again.')
    : isTimeoutError(error)
      ? t('state.error.slowBody', 'It took too long to respond. Please try again.')
      : typeof error === 'string' && error
        ? error
        : error instanceof Error && error.message
          ? error.message
          : t('state.error.body', 'Something went wrong. Please try again.');

  return (
    <Alert
      tone="danger"
      title={title}
      className={className}
      action={
        onRetry ? (
          <Button variant="ghost" onClick={onRetry}>
            {t('state.retry', 'Try again')}
          </Button>
        ) : undefined
      }
    >
      {body}
    </Alert>
  );
}
