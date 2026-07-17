import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal } from '@marutham/ui';
import { api } from '@marutham/api-client';
import {
  addressProblemKey,
  addressSummary,
  addressTitle,
  removeAddress,
  setDefaultAddress,
  upsertAddress,
  validateAddress,
  type SavedAddress,
} from '@marutham/lib';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import { AddressFields } from '../../components/AddressFields';

const EMPTY: SavedAddress = {
  label: '',
  house_no: '',
  street1: '',
  landmark: '',
  state: '',
  district: '',
  taluk: '',
  village_town: '',
  city: '',
  pincode: '',
};

export function AddressBook() {
  const { t } = useTranslation();
  const { user, updateUser } = useAuth();
  const toast = useToast();
  const addresses = (user?.delivery_addresses as SavedAddress[]) || [];

  /** The label is the user's own word for the place; only our fallback is ours to say. */
  const titleOf = (a: SavedAddress, i: number) =>
    addressTitle(a, i, (n) => t('consumer.addr.nth', 'Address {{n}}', { n }));

  /** null = form closed; -1 = adding; >=0 = editing that index. */
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<SavedAddress>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Index pending deletion — deleting is irreversible, so it gets a confirm. */
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  /**
   * There is no addresses endpoint — the whole book is replaced via
   * PATCH /auth/me. We always send a list derived from the freshest `user` and
   * adopt the server's response, so a concurrent tab's write is overwritten
   * rather than merged. Acceptable for a per-user list; a real endpoint would
   * be the fix if this ever gets contentious.
   */
  async function persist(next: SavedAddress[], message: string) {
    setBusy(true);
    try {
      const res = await api.patchMe({ delivery_addresses: next });
      updateUser(res.user);
      toast(message, 'ok');
      return true;
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : t('consumer.addr.saveFailed', 'Could not save address');
      setError(msg);
      toast(msg, 'er');
      return false;
    } finally {
      setBusy(false);
    }
  }

  function openAdd() {
    setDraft({
      ...EMPTY,
      state: (user?.state as string) || '',
      district: (user?.district as string) || '',
    });
    setError(null);
    setEditing(-1);
  }

  function openEdit(i: number) {
    setDraft({ ...EMPTY, ...addresses[i] });
    setError(null);
    setEditing(i);
  }

  async function save() {
    const problem = validateAddress(draft);
    if (problem) return setError(t(addressProblemKey(problem)));
    setError(null);
    const entry: SavedAddress = { ...draft, label: draft.label?.trim() || 'Home' };
    const next = upsertAddress(addresses, entry, editing === -1 ? null : editing);
    if (await persist(next, t('consumer.addr.saved', 'Address saved.'))) setEditing(null);
  }

  async function remove(i: number) {
    if (
      await persist(removeAddress(addresses, i), t('consumer.addr.removed', 'Address removed.'))
    ) {
      setConfirmDelete(null);
      // The form may have been editing the row that just shifted out from under it.
      if (editing !== null && editing >= 0) setEditing(null);
    }
  }

  async function makeDefault(i: number) {
    await persist(
      setDefaultAddress(addresses, i),
      t('consumer.addr.defaultUpdated', 'Default address updated.'),
    );
  }

  return (
    <section className="ord-card">
      <div className="prof-cardhead">
        <h3>📍 {t('consumer.addr.title', 'Address Book')}</h3>
        {editing === null ? (
          <button className="prof-addbtn" onClick={openAdd}>
            + {t('consumer.addr.add', 'Add')}
          </button>
        ) : null}
      </div>

      {addresses.length === 0 ? (
        <p className="prof-empty">{t('consumer.addr.none', 'No saved addresses yet.')}</p>
      ) : (
        <ul className="addr-list">
          {addresses.map((a, i) => (
            <li key={i} className={`addr-item${a.is_default ? ' is-default' : ''}`}>
              <div className="addr-item__main">
                <div className="addr-item__title">
                  {titleOf(a, i)}
                  {a.is_default ? (
                    <span className="addr-item__badge">
                      {t('consumer.addr.default', 'Default')}
                    </span>
                  ) : null}
                </div>
                <div className="addr-item__line">{addressSummary(a) || '—'}</div>
              </div>
              <div className="addr-item__actions">
                {!a.is_default ? (
                  <button
                    className="addr-btn addr-btn--default"
                    disabled={busy}
                    onClick={() => makeDefault(i)}
                  >
                    {t('consumer.addr.makeDefault', 'Default')}
                  </button>
                ) : null}
                <button className="addr-btn" disabled={busy} onClick={() => openEdit(i)}>
                  {t('consumer.addr.edit', 'Edit')}
                </button>
                <button
                  className="addr-btn addr-btn--danger"
                  disabled={busy}
                  aria-label={t('consumer.addr.deleteAria', 'Delete {{name}}', {
                    name: titleOf(a, i),
                  })}
                  onClick={() => setConfirmDelete(i)}
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing !== null ? (
        <div className="prof-form">
          <h4 className="prof-form__title">
            {editing === -1
              ? t('consumer.addr.addTitle', 'Add address')
              : t('consumer.addr.editTitle', 'Edit {{name}}', {
                  name: titleOf(addresses[editing], editing),
                })}
          </h4>
          <AddressFields value={draft} onChange={setDraft} showLabel showPin error={error} />
          <div className="prof-actions">
            <Button onClick={save} disabled={busy}>
              {busy
                ? t('consumer.addr.saving', 'Saving…')
                : t('consumer.addr.save', 'Save Address')}
            </Button>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={busy}>
              {t('common.cancel', 'Cancel')}
            </Button>
          </div>
        </div>
      ) : null}

      <Modal
        open={confirmDelete !== null}
        title={t('consumer.addr.deleteTitle', 'Delete this address?')}
        closeLabel={t('common.close', 'Close')}
        onClose={() => setConfirmDelete(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)} disabled={busy}>
              {t('consumer.addr.keep', 'Keep it')}
            </Button>
            <Button
              variant="danger"
              onClick={() => confirmDelete !== null && remove(confirmDelete)}
              disabled={busy}
            >
              {busy ? t('consumer.addr.deleting', 'Deleting…') : t('common.delete', 'Delete')}
            </Button>
          </>
        }
      >
        {confirmDelete !== null && addresses[confirmDelete] ? (
          <p style={{ fontSize: 12, color: 'var(--gray)', lineHeight: 1.6 }}>
            <strong>{titleOf(addresses[confirmDelete], confirmDelete)}</strong> —{' '}
            {addressSummary(addresses[confirmDelete]) || '—'}
            {addresses[confirmDelete].is_default && addresses.length > 1
              ? ` ${t('consumer.addr.defaultWarning', 'This is your default address; the next one will become the default.')}`
              : ''}
          </p>
        ) : null}
      </Modal>
    </section>
  );
}
