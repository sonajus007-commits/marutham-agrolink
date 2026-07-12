import { Field, Input, Select, FIELD_ERR_CLASS } from '@marutham/ui';
import type { SavedAddress } from '@marutham/lib';
import { useLocations } from '../hooks/useLocations';

/* The address form, shared by the consumer Address Book, the Checkout "deliver
 * somewhere else" panel, and the pre-login Registration form.
 *
 * Controlled: the parent owns the value and the validation errors. State/
 * district/taluk are dependent selects fed by the cached /locations tree.
 *
 * Two error styles, because the two callers validate differently: the address
 * book gets ONE form-level message from validateAddress(); registration faults
 * each field, so it passes an `errors` map. `required` and `labels` are maps for
 * the same reason — a farm's address asks for a Survey Number and insists on a
 * village, a delivery address does neither. */

export type AddressFieldKey =
  | 'house_no' | 'street1' | 'street2' | 'landmark'
  | 'state' | 'district' | 'taluk' | 'village_town' | 'city' | 'pincode';

type AddressFieldMap<T> = Partial<Record<AddressFieldKey, T>>;

export interface AddressFieldsProps {
  value: SavedAddress;
  onChange: (next: SavedAddress) => void;
  /** Show the "Home / Work" nickname field (address book only). */
  showLabel?: boolean;
  /** Show a contact phone for this address (checkout only). */
  showPhone?: boolean;
  /** Show the second street line (registration only). */
  showStreet2?: boolean;
  /** Form-level validation message from validateAddress(). */
  error?: string | null;
  /** Per-field validation messages (registration). */
  errors?: AddressFieldMap<string>;
  /** Extra required markers, on top of the always-required state/district/pincode. */
  required?: AddressFieldMap<boolean>;
  /** Label overrides, e.g. house_no → "House / Survey Number" for a farm. */
  labels?: AddressFieldMap<string>;
}

/** Keep only digits, capped at 6 — the legacy numOnly() + maxlength. */
function pincodeOnly(v: string): string {
  return v.replace(/\D/g, '').slice(0, 6);
}

const DEFAULT_LABELS: Record<AddressFieldKey, string> = {
  house_no: 'House / Flat No.',
  street1: 'Street Line 1',
  street2: 'Street Line 2',
  landmark: 'Landmark',
  state: 'State',
  district: 'District',
  taluk: 'Taluk',
  village_town: 'Village / Town',
  city: 'City',
  pincode: 'Pincode',
};

export function AddressFields({
  value, onChange,
  showLabel = false, showPhone = false, showStreet2 = false,
  error, errors = {}, required = {}, labels = {},
}: AddressFieldsProps) {
  const { states, districtsOf, taluksOf } = useLocations();
  const set = (patch: Partial<SavedAddress>) => onChange({ ...value, ...patch });

  /** Everything <Field> needs for one address key, so no call site re-derives it. */
  const field = (key: AddressFieldKey, alwaysRequired = false) => ({
    label: labels[key] ?? DEFAULT_LABELS[key],
    required: alwaysRequired || required[key] === true,
    error: errors[key] ?? null,
  });

  return (
    <>
      {showLabel ? (
        <Field label="Label (e.g. Home, Work)">
          {(p) => (
            <Input {...p} type="text" placeholder="Home"
              value={value.label || ''} onChange={(e) => set({ label: e.target.value })} />
          )}
        </Field>
      ) : null}

      <Field {...field('house_no')}>
        {(p) => (
          <Input {...p} type="text" autoComplete="address-line1"
            value={value.house_no || ''} onChange={(e) => set({ house_no: e.target.value })} />
        )}
      </Field>

      <Field {...field('street1')}>
        {(p) => (
          <Input {...p} type="text" autoComplete="address-line2"
            value={value.street1 || ''} onChange={(e) => set({ street1: e.target.value })} />
        )}
      </Field>

      {showStreet2 ? (
        <Field {...field('street2')}>
          {(p) => (
            <Input {...p} type="text" placeholder="Area, Colony"
              value={value.street2 || ''} onChange={(e) => set({ street2: e.target.value })} />
          )}
        </Field>
      ) : null}

      <Field {...field('landmark')}>
        {(p) => (
          <Input {...p} type="text" placeholder="Near school, temple…"
            value={value.landmark || ''} onChange={(e) => set({ landmark: e.target.value })} />
        )}
      </Field>

      <Field {...field('state', true)}>
        {(p) => (
          <Select {...p} autoComplete="address-level1" value={value.state || ''}
            /* A new state invalidates the district and taluk below it. */
            onChange={(e) => set({ state: e.target.value, district: '', taluk: '' })}>
            <option value="">— Select State —</option>
            {states.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        )}
      </Field>

      <Field {...field('district', true)}>
        {(p) => (
          <Select {...p} autoComplete="address-level2" value={value.district || ''}
            disabled={!value.state}
            onChange={(e) => set({ district: e.target.value, taluk: '' })}>
            <option value="">— Select District —</option>
            {districtsOf(value.state || '').map((d) => <option key={d} value={d}>{d}</option>)}
          </Select>
        )}
      </Field>

      <Field {...field('taluk')}>
        {(p) => (
          <Select {...p} value={value.taluk || ''} disabled={!value.district}
            onChange={(e) => set({ taluk: e.target.value })}>
            <option value="">— Select Taluk —</option>
            {taluksOf(value.state || '', value.district || '').map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        )}
      </Field>

      <Field {...field('village_town')}>
        {(p) => (
          <Input {...p} type="text"
            value={value.village_town || ''} onChange={(e) => set({ village_town: e.target.value })} />
        )}
      </Field>

      <Field {...field('city')}>
        {(p) => (
          <Input {...p} type="text" autoComplete="address-level2"
            value={value.city || ''} onChange={(e) => set({ city: e.target.value })} />
        )}
      </Field>

      {showPhone ? (
        <Field label="Contact phone">
          {(p) => (
            <Input {...p} type="tel" inputMode="numeric" autoComplete="tel"
              value={value.phone || ''} onChange={(e) => set({ phone: e.target.value.replace(/\D/g, '').slice(0, 10) })} />
          )}
        </Field>
      ) : null}

      <Field {...field('pincode', true)}>
        {(p) => (
          <Input {...p} type="text" inputMode="numeric" autoComplete="postal-code"
            value={value.pincode || ''} onChange={(e) => set({ pincode: pincodeOnly(e.target.value) })} />
        )}
      </Field>

      {/* Form-level: validateAddress() may fault the street, the state, or the pincode. */}
      {error ? <div className={FIELD_ERR_CLASS} role="alert" style={{ marginBottom: 8 }}>{error}</div> : null}
    </>
  );
}
