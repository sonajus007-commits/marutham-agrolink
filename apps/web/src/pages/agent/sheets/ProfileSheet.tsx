import { useTranslation } from 'react-i18next';
import { Sheet } from '@marutham/ui';
import { ProfileContent } from '../ProfileContent';

/* Thin wrapper kept for any caller that still wants the profile as a slide-over.
 * The portal itself now shows the profile as a first-class PAGE (the "Profile"
 * sidebar/tab), rendering <ProfileContent /> directly. */
export function ProfileSheet({
  open,
  onClose,
  isVCO,
}: {
  open: boolean;
  onClose: () => void;
  isVCO: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Sheet open={open} title={t('agent.profile')} onClose={onClose}>
      <ProfileContent isVCO={isVCO} />
    </Sheet>
  );
}
