import { describe, it, expect } from 'vitest';
import { emptyRegisterForm, validateRegistration, hasErrors, type RegisterForm } from './register';
import {
  quoteRegistration,
  concessionFor,
  getSubscriptionPlan,
  REGISTRATION_CHARGE_RS,
  SUBSCRIPTION_PLANS,
} from './subscription';

/** A form that passes every rule — each test breaks exactly one thing. */
function validConsumer(): RegisterForm {
  return {
    ...emptyRegisterForm('consumer'),
    fname: 'Kavitha',
    gender: 'Female',
    phone: '9876543210',
    email: 'kavitha@example.com',
    address: {
      house_no: '12',
      street1: 'Bazaar Street',
      village_town: 'Alangudi',
      city: 'Pudukkottai',
      taluk: 'Alangudi',
      district: 'Pudukkottai',
      state: 'Tamil Nadu',
      pincode: '622301',
    },
    password: 'Strong@1234',
    confirm_password: 'Strong@1234',
  };
}

function validFarmer(): RegisterForm {
  return {
    ...validConsumer(),
    role: 'farmer',
    seller_type: 'Farmer',
    aadhar: '123456789012',
    bank_name: 'State Bank of India',
    bank_account: '30123456789',
    confirm_bank_account: '30123456789',
    ifsc: 'SBIN0001234',
    subscription_plan: 'Yearly',
  };
}

function validRetailer(): RegisterForm {
  return {
    ...validConsumer(),
    role: 'farmer',
    seller_type: 'Retailer',
    business_name: 'Sri Murugan Provisions',
    gst_number: '33AABCU9603R1ZX',
    business_type: 'Grocery / General Store',
    subscription_plan: 'Monthly',
  };
}

const withTaluks = { districtHasTaluks: true };

describe('validateRegistration — shared rules', () => {
  it('accepts a complete consumer', () => {
    expect(validateRegistration(validConsumer(), withTaluks)).toEqual({});
  });

  it('requires name, gender, phone, street, city, state, district and pincode', () => {
    // No district picked yet, so the tree offers no taluks to require.
    const errors = validateRegistration(emptyRegisterForm('consumer'), {
      districtHasTaluks: false,
    });
    expect(Object.keys(errors).sort()).toEqual(
      [
        'city',
        'district',
        'fname',
        'gender',
        'password',
        'phone',
        'pincode',
        'state',
        'street1',
      ].sort(),
    );
    // An empty password fails the strength rules but MATCHES the empty confirm.
    expect(errors.confirm_password).toBeUndefined();
  });

  it('rejects a phone that is not 10 digits', () => {
    const f = { ...validConsumer(), phone: '98765' };
    expect(validateRegistration(f, withTaluks).phone).toBe('Enter a valid 10-digit number');
  });

  it('rejects a pincode that is not 6 digits', () => {
    const f = validConsumer();
    f.address = { ...f.address, pincode: '62230' };
    expect(validateRegistration(f, withTaluks).pincode).toBeTruthy();
  });

  it('demands a taluk only when the district lists them', () => {
    const f = validConsumer();
    f.address = { ...f.address, taluk: '' };
    expect(validateRegistration(f, { districtHasTaluks: true }).taluk).toBe('Select a taluk');
    expect(validateRegistration(f, { districtHasTaluks: false }).taluk).toBeUndefined();
  });

  it('lets email be blank but not malformed', () => {
    const blank = { ...validConsumer(), email: '' };
    expect(validateRegistration(blank, withTaluks).email).toBeUndefined();
    const bad = { ...validConsumer(), email: 'kavitha@' };
    expect(validateRegistration(bad, withTaluks).email).toBe('Enter a valid email');
  });

  it('enforces the strong-password rules and the confirmation', () => {
    // Server would accept "secret" (6 chars); the client will not.
    const weak = { ...validConsumer(), password: 'secret', confirm_password: 'secret' };
    expect(validateRegistration(weak, withTaluks).password).toBe('Does not meet requirements');

    const mismatch = { ...validConsumer(), confirm_password: 'Strong@12345' };
    expect(validateRegistration(mismatch, withTaluks).confirm_password).toBe(
      'Passwords do not match',
    );
  });

  it('does not ask a consumer for KYC, a village or a plan', () => {
    const errors = validateRegistration(
      { ...validConsumer(), address: { ...validConsumer().address, village_town: '' } },
      withTaluks,
    );
    expect(errors.village_town).toBeUndefined();
    expect(errors.aadhar).toBeUndefined();
    expect(errors.subscription_plan).toBeUndefined();
  });
});

describe('validateRegistration — Farmer seller', () => {
  it('accepts a complete farmer', () => {
    expect(validateRegistration(validFarmer(), withTaluks)).toEqual({});
  });

  it('requires the village — a farm address has nothing else to route by', () => {
    const f = validFarmer();
    f.address = { ...f.address, village_town: '' };
    expect(validateRegistration(f, withTaluks).village_town).toBe('Required for farmers');
  });

  it('requires a 12-digit Aadhaar and a bank name', () => {
    const f = { ...validFarmer(), aadhar: '1234', bank_name: '' };
    const errors = validateRegistration(f, withTaluks);
    expect(errors.aadhar).toBe('Enter a valid 12-digit Aadhaar');
    expect(errors.bank_name).toBe('Required');
  });

  it('bounds the account number to 9–18 digits and makes it be typed twice', () => {
    const short = { ...validFarmer(), bank_account: '12345', confirm_bank_account: '12345' };
    expect(validateRegistration(short, withTaluks).bank_account).toBeTruthy();

    const typo = { ...validFarmer(), confirm_bank_account: '30123456780' };
    expect(validateRegistration(typo, withTaluks).confirm_bank_account).toBe(
      'Account numbers do not match',
    );
  });

  it('lets IFSC be blank but validates its shape when given', () => {
    const blank = { ...validFarmer(), ifsc: '' };
    expect(validateRegistration(blank, withTaluks).ifsc).toBeUndefined();

    const bad = { ...validFarmer(), ifsc: 'SBI1234' };
    expect(validateRegistration(bad, withTaluks).ifsc).toBe('Enter a valid IFSC');

    // Typed lowercase, still an IFSC.
    const lower = { ...validFarmer(), ifsc: 'sbin0001234' };
    expect(validateRegistration(lower, withTaluks).ifsc).toBeUndefined();
  });

  it('requires a subscription plan', () => {
    const f = { ...validFarmer(), subscription_plan: '' };
    expect(validateRegistration(f, withTaluks).subscription_plan).toBe(
      'Please select a subscription plan',
    );
  });

  it('does not ask a Farmer for business details', () => {
    const errors = validateRegistration(validFarmer(), withTaluks);
    expect(errors.business_name).toBeUndefined();
    expect(errors.gst_number).toBeUndefined();
  });
});

describe('validateRegistration — Retailer seller', () => {
  it('accepts a complete retailer', () => {
    expect(validateRegistration(validRetailer(), withTaluks)).toEqual({});
  });

  it('requires a business name (the server enforces this too)', () => {
    const r = { ...validRetailer(), business_name: '' };
    expect(validateRegistration(r, withTaluks).business_name).toBe('Business name is required');
  });

  it('lets GSTIN be blank but validates its shape when given', () => {
    const blank = { ...validRetailer(), gst_number: '' };
    expect(validateRegistration(blank, withTaluks).gst_number).toBeUndefined();

    const bad = { ...validRetailer(), gst_number: '33AABCU9603R1Z' };
    expect(validateRegistration(bad, withTaluks).gst_number).toBe(
      'Enter a valid 15-character GSTIN',
    );
  });

  it('does not ask a Retailer for Aadhaar, bank details or a village', () => {
    const r = validRetailer();
    r.address = { ...r.address, village_town: '' };
    const errors = validateRegistration(r, withTaluks);
    expect(errors.aadhar).toBeUndefined();
    expect(errors.bank_account).toBeUndefined();
    expect(errors.village_town).toBeUndefined();
  });
});

describe('hasErrors', () => {
  it('is false for a clean form and true once anything faults', () => {
    expect(hasErrors(validateRegistration(validConsumer(), withTaluks))).toBe(false);
    expect(hasErrors(validateRegistration(emptyRegisterForm('farmer'), withTaluks))).toBe(true);
  });
});

describe('subscription quote — mirrors backend/utils/subscriptionPlans.js', () => {
  it('prices every plan the backend catalogue lists', () => {
    expect(SUBSCRIPTION_PLANS.map((p) => [p.name, p.amountRs, p.days])).toEqual([
      ['Monthly', 200, 30],
      ['Quarterly', 550, 90],
      ['Half Yearly', 1100, 180],
      ['Yearly', 2000, 365],
    ]);
  });

  it('gives women and transgender sellers 10% off the plan fee only', () => {
    expect(concessionFor('Female')).toBe(10);
    expect(concessionFor('Transgender')).toBe(10);
    expect(concessionFor('Male')).toBe(0);
    expect(concessionFor(null)).toBe(0);
  });

  it('adds the one-time ₹100 registration charge on top of the plan', () => {
    const q = quoteRegistration('Yearly', 'Male')!;
    expect(q.planFeeRs).toBe(2000);
    expect(q.discountRs).toBe(0);
    expect(q.registrationChargeRs).toBe(REGISTRATION_CHARGE_RS);
    expect(q.totalRs).toBe(2100);
  });

  it('applies the concession to the plan but never to the ₹100', () => {
    const q = quoteRegistration('Yearly', 'Female')!;
    expect(q.discountRs).toBe(200);
    expect(q.planPayableRs).toBe(1800);
    expect(q.totalRs).toBe(1900); // 100 + 1800, NOT 90 + 1800
  });

  it('rounds the discount the same way the server does', () => {
    // ₹550 × 90% = ₹495 exactly; ₹1100 → ₹990. No half-rupee drift.
    expect(quoteRegistration('Quarterly', 'Female')!.planPayableRs).toBe(495);
    expect(quoteRegistration('Half Yearly', 'Transgender')!.planPayableRs).toBe(990);
  });

  it('returns null for an unknown or unselected plan', () => {
    expect(quoteRegistration('', 'Female')).toBeNull();
    expect(quoteRegistration('Lifetime', 'Male')).toBeNull();
    expect(getSubscriptionPlan('Monthly')?.days).toBe(30);
  });
});
