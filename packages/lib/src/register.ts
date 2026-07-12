/* Sign-up domain — the pure half of the pre-login registration form.
 *
 * The client validates far harder than POST /auth/register does (the server
 * only insists on phone/password/role/fname, a 6-char password and a 6-digit
 * pincode). Those extra rules — Aadhaar, IFSC, GSTIN, matching bank accounts —
 * are what keep an unreviewable application out of the Head Office queue, so
 * they live here as testable data rather than as regexes sprinkled through JSX.
 * Ported from the legacy `doRegister()` in frontend/index.html.
 *
 * Validation messages are English, like validateAddress() — the screen chrome is
 * translated, the field faults are not (yet). */
import type { AddressObject } from './format';
import { isStrongPassword } from './password';
import { PINCODE_RE } from './address';

export type RegisterRole = 'consumer' | 'farmer';
/** A `farmer` account is one of two kinds; the server calls it seller_type. */
export type RegisterSellerType = 'Farmer' | 'Retailer';

export const GENDERS = ['Male', 'Female', 'Transgender'] as const;

export const BUSINESS_TYPES = [
  'Grocery / General Store',
  'Organic Store',
  'Wholesale Distributor',
  'Farm Supply Shop',
  'Food Processor',
  'Other',
] as const;

const PHONE_RE = /^\d{10}$/;
const AADHAAR_RE = /^\d{12}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export interface RegisterForm {
  role: RegisterRole;
  seller_type: RegisterSellerType;
  fname: string;
  lname: string;
  gender: string;
  phone: string;
  country_code: string;
  email: string;
  /** House/street/state/district/taluk/pincode — fed to <AddressFields>. */
  address: AddressObject;
  password: string;
  confirm_password: string;
  // Seller — Farmer
  aadhar: string;
  bank_name: string;
  bank_account: string;
  confirm_bank_account: string;
  ifsc: string;
  // Seller — Retailer
  business_name: string;
  gst_number: string;
  business_type: string;
  // Seller — chosen at signup, paid after approval
  subscription_plan: string;
}

export function emptyRegisterForm(role: RegisterRole = 'consumer'): RegisterForm {
  return {
    role,
    seller_type: 'Farmer',
    fname: '', lname: '', gender: '', phone: '', country_code: '+91', email: '',
    address: { house_no: '', street1: '', street2: '', landmark: '', village_town: '', city: '', taluk: '', district: '', state: '', pincode: '' },
    password: '', confirm_password: '',
    aadhar: '', bank_name: '', bank_account: '', confirm_bank_account: '', ifsc: '',
    business_name: '', gst_number: '', business_type: '',
    subscription_plan: '',
  };
}

export type RegisterField =
  | 'fname' | 'gender' | 'phone' | 'email'
  | 'street1' | 'state' | 'district' | 'taluk' | 'city' | 'pincode' | 'village_town'
  | 'password' | 'confirm_password'
  | 'aadhar' | 'bank_name' | 'bank_account' | 'confirm_bank_account' | 'ifsc'
  | 'business_name' | 'gst_number'
  | 'subscription_plan';

export type RegisterErrors = Partial<Record<RegisterField, string>>;

export interface RegisterValidateOptions {
  /** True when the chosen district actually lists taluks — only then is one required. */
  districtHasTaluks: boolean;
}

/** Faults on the form, keyed by field. Empty object = ready to submit. */
export function validateRegistration(form: RegisterForm, opts: RegisterValidateOptions): RegisterErrors {
  const e: RegisterErrors = {};
  const a = form.address;
  const trim = (v?: string | null) => (v || '').trim();

  if (!trim(form.fname)) e.fname = 'Required';
  if (!form.gender) e.gender = 'Please select your gender';
  if (!PHONE_RE.test(form.phone)) e.phone = 'Enter a valid 10-digit number';
  if (form.email && !EMAIL_RE.test(form.email)) e.email = 'Enter a valid email';

  if (!trim(a.street1)) e.street1 = 'Required';
  if (!a.state) e.state = 'Select a state';
  if (!a.district) e.district = 'Select a district';
  // A district with no taluks in the tree can't demand one.
  if (opts.districtHasTaluks && !a.taluk) e.taluk = 'Select a taluk';
  if (!trim(a.city)) e.city = 'Required';
  if (!PINCODE_RE.test(a.pincode || '')) e.pincode = 'Enter a 6-digit pincode';

  if (!isStrongPassword(form.password)) e.password = 'Does not meet requirements';
  if (form.password !== form.confirm_password) e.confirm_password = 'Passwords do not match';

  if (form.role === 'farmer') {
    if (!form.subscription_plan) e.subscription_plan = 'Please select a subscription plan';

    if (form.seller_type === 'Farmer') {
      // A farm's village is its address — the delivery agent has nothing else to go on.
      if (!trim(a.village_town)) e.village_town = 'Required for farmers';
      if (!AADHAAR_RE.test(form.aadhar)) e.aadhar = 'Enter a valid 12-digit Aadhaar';
      if (!trim(form.bank_name)) e.bank_name = 'Required';
      if (form.bank_account.length < 9 || form.bank_account.length > 18) {
        e.bank_account = 'Enter a valid account number (9–18 digits)';
      }
      if (form.bank_account !== form.confirm_bank_account) {
        e.confirm_bank_account = 'Account numbers do not match';
      }
      // IFSC is optional, but a wrong one silently breaks every payout.
      if (form.ifsc && !IFSC_RE.test(form.ifsc.toUpperCase())) e.ifsc = 'Enter a valid IFSC';
    } else {
      if (!trim(form.business_name)) e.business_name = 'Business name is required';
      if (form.gst_number && !GSTIN_RE.test(form.gst_number.toUpperCase())) {
        e.gst_number = 'Enter a valid 15-character GSTIN';
      }
    }
  }

  return e;
}

export function hasErrors(errors: RegisterErrors): boolean {
  return Object.keys(errors).length > 0;
}
