import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Field, Input, INPUT_CLASS, FIELD_ERR_CLASS } from '@marutham/ui';
import { api } from '@marutham/api-client';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';

/* The farmer's public-profile opt-in (migration 050 + PATCH
 * /farmers/me/public-profile). A grower is anonymised on public pages by
 * default; here they can CHOOSE to appear on the public "Meet our farmers"
 * page, with a short story and an optional photo. Nothing is shown publicly
 * unless the toggle is on. Retailers don't get a "farmer" public profile. */
export function PublicProfileCard() {
  const { t } = useTranslation();
  const { user, updateUser } = useAuth();
  const toast = useToast();

  const [enabled, setEnabled] = useState(!!user?.public_profile);
  const [bio, setBio] = useState(user?.public_bio || '');
  const [photo, setPhoto] = useState(user?.public_photo_url || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user || user.seller_type === 'Retailer') return null;

  async function save() {
    const p = photo.trim();
    if (p && !/^https:\/\//.test(p)) return setError(t('farmer.public.photoHint'));
    setError(null);
    setBusy(true);
    try {
      const nextBio = bio.trim() || null;
      const nextPhoto = p || null;
      await api.setPublicProfile({
        public_profile: enabled,
        public_bio: nextBio,
        public_photo_url: nextPhoto,
      });
      if (user) {
        updateUser({
          ...user,
          public_profile: enabled,
          public_bio: nextBio,
          public_photo_url: nextPhoto,
        });
      }
      toast(t('farmer.public.saved'), 'ok');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-md font-bold text-primary">🌾 {t('farmer.public.title')}</h3>
        <span
          className={`rounded-full px-2 py-0.5 text-2xs font-bold ${
            enabled ? 'bg-primary-soft text-primary' : 'bg-surface-muted text-fg-muted'
          }`}
        >
          {enabled ? t('farmer.public.on') : t('farmer.public.off')}
        </span>
      </div>

      <p className="mt-1 text-2xs text-fg-muted">{t('farmer.public.desc')}</p>

      <label className="mt-3 flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          aria-label={t('farmer.public.toggle')}
          className="h-4 w-4"
        />
        <span className="text-sm font-semibold text-fg">{t('farmer.public.toggle')}</span>
      </label>

      {enabled ? (
        <div className="mt-3 flex flex-col gap-1">
          <Field label={t('farmer.public.bio')}>
            {(fp) => (
              <textarea
                {...fp}
                rows={3}
                maxLength={600}
                className={INPUT_CLASS}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder={t('farmer.public.bioPlaceholder')}
              />
            )}
          </Field>
          <Field label={t('farmer.public.photo')} hint={t('farmer.public.photoHint')}>
            {(fp) => (
              <Input
                {...fp}
                type="url"
                inputMode="url"
                value={photo}
                onChange={(e) => setPhoto(e.target.value)}
                placeholder="https://…"
              />
            )}
          </Field>
        </div>
      ) : null}

      {error ? (
        <div className={FIELD_ERR_CLASS} role="alert">
          {error}
        </div>
      ) : null}

      <p className="mt-3 text-2xs text-fg-muted">{t('farmer.public.note')}</p>

      <Button className="mt-3" onClick={save} disabled={busy}>
        {busy ? '…' : t('farmer.public.save')}
      </Button>
    </Card>
  );
}
