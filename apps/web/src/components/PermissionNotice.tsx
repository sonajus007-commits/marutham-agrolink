import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from '@marutham/ui';
import { deniedWhere, onPermissionDenied, type DeviceFeature } from '../native/permissions';

/* Explains a blocked device permission (camera / location) — the one failure a
 * retry can never fix on its own. Mounted once in App; the capture helpers report
 * a denial through native/permissions. Stays until dismissed or 15s pass: long
 * enough to read the settings path, unlike a 3.5s toast. */
export function PermissionNotice() {
  const { t } = useTranslation();
  const [feature, setFeature] = useState<DeviceFeature | null>(null);

  useEffect(() => onPermissionDenied(setFeature), []);
  useEffect(() => {
    if (!feature) return;
    const id = setTimeout(() => setFeature(null), 15_000);
    return () => clearTimeout(id);
  }, [feature]);

  if (!feature) return null;

  const title =
    feature === 'camera'
      ? t('state.perm.cameraTitle', 'Camera access is blocked')
      : t('state.perm.locationTitle', 'Location access is blocked');
  const how =
    deniedWhere() === 'device'
      ? t(
          'state.perm.howDevice',
          'Open your phone’s Settings → Apps → Marutham AgroLink → Permissions, allow it, then try again.',
        )
      : t(
          'state.perm.howBrowser',
          'Click the icon left of the address bar, allow it for this site, then try again.',
        );

  return (
    <div className="permission-notice">
      <Alert tone="warning" title={title} onDismiss={() => setFeature(null)}>
        {how}
      </Alert>
    </div>
  );
}
