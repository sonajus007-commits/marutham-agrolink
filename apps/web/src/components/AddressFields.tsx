import { Field } from '@marutham/ui';
import type { SavedAddress } from '@marutham/lib';
import { useLocations } from '../hooks/useLocations';

/* The address form, shared by the consumer Address Book and the Checkout
 * "deliver somewhere else" panel — and reusable by Farmer/Admin later.
 *
 * Controlled: the parent owns the value and the validation error. State/district/
 * taluk are dependent selects fed by the cached /locations tree. */

export interface AddressFieldsProps {
  value: SavedAddress;
  onChange: (next: SavedAddress) => void;
  /** Show the "Home / Work" nickname field (address book only). */
  showLabel?: boolean;
  /** Show a contact phone for this address (checkout only). */
  showPhone?: boolean;
  /** Form-level validation message from validateAddress(). */
  error?: string | null;
}

/** Keep only digits, capped at 6 — the legacy numOnly() + maxlength. */
function pincodeOnly(v: string): string {
  return v.replace(/\D/g, '').slice(0, 6);
}

export function AddressFields({ value, onChange, showLabel = false, showPhone = false, error }: AddressFieldsProps) {
  const { states, districtsOf, taluksOf } = useLocations();
  const set = (patch: Partial<SavedAddress>) => onChange({ ...value, ...patch });

  return (
    <>
      {showLabel ? (
        <Field label="Label (e.g. Home, Work)">
          {(p) => (
            <input {...p} className="ma-input" type="text" placeholder="Home"
              value={value.label || ''} onChange={(e) => set({ label: e.target.value })} />
          )}
        </Field>
      ) : null}

      <Field label="House / Flat No.">
        {(p) => (
          <input {...p} className="ma-input" type="text" autoComplete="address-line1"
            value={value.house_no || ''} onChange={(e) => set({ house_no: e.target.value })} />
        )}
      </Field>

      <Field label="Street Line 1">
        {(p) => (
          <input {...p} className="ma-input" type="text" autoComplete="address-line2"
            value={value.street1 || ''} onChange={(e) => set({ street1: e.target.value })} />
        )}
      </Field>

      <Field label="Landmark">
        {(p) => (
          <input {...p} className="ma-input" type="text" placeholder="Near school, temple…"
            value={value.landmark || ''} onChange={(e) => set({ landmark: e.target.value })} />
        )}
      </Field>

      <Field label="State" required>
        {(p) => (
          <select {...p} className="ma-select" autoComplete="address-level1" value={value.state || ''}
            /* A new state invalidates the district and taluk below it. */
            onChange={(e) => set({ state: e.target.value, district: '', taluk: '' })}>
            <option value="">— Select State —</option>
            {states.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
      </Field>

      <Field label="District" required>
        {(p) => (
          <select {...p} className="ma-select" autoComplete="address-level2" value={value.district || ''}
            disabled={!value.state}
            onChange={(e) => set({ district: e.target.value, taluk: '' })}>
            <option value="">— Select District —</option>
            {districtsOf(value.state || '').map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
      </Field>

      <Field label="Taluk">
        {(p) => (
          <select {...p} className="ma-select" value={value.taluk || ''} disabled={!value.district}
            onChange={(e) => set({ taluk: e.target.value })}>
            <option value="">— Select Taluk —</option>
            {taluksOf(value.state || '', value.district || '').map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
      </Field>

      <Field label="Village / Town">
        {(p) => (
          <input {...p} className="ma-input" type="text"
            value={value.village_town || ''} onChange={(e) => set({ village_town: e.target.value })} />
        )}
      </Field>

      <Field label="City">
        {(p) => (
          <input {...p} className="ma-input" type="text" autoComplete="address-level2"
            value={value.city || ''} onChange={(e) => set({ city: e.target.value })} />
        )}
      </Field>

      {showPhone ? (
        <Field label="Contact phone">
          {(p) => (
            <input {...p} className="ma-input" type="tel" inputMode="numeric" autoComplete="tel"
              value={value.phone || ''} onChange={(e) => set({ phone: e.target.value.replace(/\D/g, '').slice(0, 10) })} />
          )}
        </Field>
      ) : null}

      <Field label="Pincode" required>
        {(p) => (
          <input {...p} className="ma-input" type="text" inputMode="numeric" autoComplete="postal-code"
            value={value.pincode || ''} onChange={(e) => set({ pincode: pincodeOnly(e.target.value) })} />
        )}
      </Field>

      {/* Form-level: validateAddress() may fault the street, the state, or the pincode. */}
      {error ? <div className="ma-field__err" role="alert" style={{ marginBottom: 8 }}>{error}</div> : null}
    </>
  );
}
