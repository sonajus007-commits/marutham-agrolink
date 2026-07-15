import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Field, Input, Select, Sheet } from '@marutham/ui';
import { api, type Employee, type EmployeePayload } from '@marutham/api-client';
import { useToast } from '../../components/Toast';
import { ManagerPickerModal } from './ManagerPickerModal';
import {
  EMP_DEPARTMENTS,
  EMP_DESIGNATIONS,
  EMP_EMPLOYMENT_TYPES,
  EMP_GENDERS,
  EMP_STATUSES,
} from './employeeOptions';

interface EmpForm {
  fname: string;
  lname: string;
  gender: string;
  dob: string;
  phone: string;
  email: string;
  aadhar: string;
  house_no: string;
  street1: string;
  street2: string;
  state: string;
  district: string;
  taluk: string;
  pincode: string;
  city: string;
  village_town: string;
  designation: string;
  department: string;
  employment_type: string;
  date_of_joining: string;
  work_state: string;
  work_district: string;
  work_location: string;
  is_manager: boolean;
  reporting_manager: string;
  reporting_manager_emp_id: string;
  status: string;
  notes: string;
  is_board_director: boolean;
  is_hr_admin: boolean;
}

const blank: EmpForm = {
  fname: '',
  lname: '',
  gender: '',
  dob: '',
  phone: '',
  email: '',
  aadhar: '',
  house_no: '',
  street1: '',
  street2: '',
  state: '',
  district: '',
  taluk: '',
  pincode: '',
  city: '',
  village_town: '',
  designation: '',
  department: '',
  employment_type: 'Permanent',
  date_of_joining: '',
  work_state: '',
  work_district: '',
  work_location: '',
  is_manager: false,
  reporting_manager: '',
  reporting_manager_emp_id: '',
  status: 'active',
  notes: '',
  is_board_director: false,
  is_hr_admin: false,
};

const s = (v: unknown) => (v == null ? '' : String(v));

function formFrom(e: Employee): EmpForm {
  return {
    ...blank,
    fname: s(e.fname),
    lname: s(e.lname),
    gender: s(e.gender),
    dob: s(e.dob),
    phone: s(e.phone),
    email: s(e.email),
    aadhar: s(e.aadhar),
    house_no: s(e.house_no),
    street1: s(e.street1),
    street2: s(e.street2),
    state: s(e.state),
    district: s(e.district),
    taluk: s(e.taluk),
    pincode: s(e.pincode),
    city: s(e.city),
    village_town: s(e.village_town),
    designation: s(e.designation),
    department: s(e.department),
    employment_type: s(e.employment_type) || 'Permanent',
    date_of_joining: s(e.date_of_joining),
    work_state: s(e.work_state),
    work_district: s(e.work_district),
    work_location: s(e.work_location),
    is_manager: !!e.is_manager,
    reporting_manager: s(e.reporting_manager),
    reporting_manager_emp_id: s(e.reporting_manager_emp_id),
    status: s(e.status) || 'active',
    notes: s(e.notes),
    is_board_director: !!e.is_board_director,
    is_hr_admin: !!e.is_hr_admin,
  };
}

const digits = (v: string, max: number) => v.replace(/\D/g, '').slice(0, max);

/** '' → undefined so a PATCH leaves the field untouched (matches legacy). */
const orUndef = (v: string) => (v.trim() ? v.trim() : undefined);

type Tree = Record<string, Record<string, string[]>>;

export function EmployeeFormSheet({
  employee,
  open,
  canMintTrust,
  onClose,
  onSaved,
}: {
  employee: Employee | null;
  open: boolean;
  canMintTrust: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const isCreate = employee === null;

  const [form, setForm] = useState<EmpForm>(blank);
  const [tree, setTree] = useState<Tree>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pickMgr, setPickMgr] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(employee ? formFrom(employee) : blank);
    setError(null);
  }, [open, employee]);

  useEffect(() => {
    if (!open || Object.keys(tree).length) return;
    api
      .getLocations()
      .then((res) => setTree(res.tree || {}))
      .catch(() => setTree({}));
  }, [open, tree]);

  const set = <K extends keyof EmpForm>(k: K, v: EmpForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const states = useMemo(() => Object.keys(tree).sort((a, b) => a.localeCompare(b)), [tree]);
  const districtsOf = (st: string) =>
    Object.keys(tree[st] || {}).sort((a, b) => a.localeCompare(b));
  const taluksOf = (st: string, d: string) =>
    (tree[st]?.[d] || []).slice().sort((a, b) => a.localeCompare(b));

  function setState_(st: string) {
    setForm((f) => ({
      ...f,
      state: st,
      district: districtsOf(st).includes(f.district) ? f.district : '',
      taluk: '',
    }));
  }
  function setDistrict_(d: string) {
    setForm((f) => ({
      ...f,
      district: d,
      taluk: taluksOf(f.state, d).includes(f.taluk) ? f.taluk : '',
    }));
  }
  function setWorkState_(st: string) {
    setForm((f) => ({
      ...f,
      work_state: st,
      work_district: districtsOf(st).includes(f.work_district) ? f.work_district : '',
    }));
  }

  async function save() {
    if (!form.fname.trim()) return setError(t('admin.emp.errName'));
    if (form.aadhar && !/^\d{12}$/.test(form.aadhar)) return setError(t('admin.emp.errAadhar'));
    setError(null);

    const body: EmployeePayload = {
      fname: form.fname.trim(),
      lname: orUndef(form.lname),
      gender: orUndef(form.gender),
      dob: orUndef(form.dob),
      phone: orUndef(form.phone),
      email: orUndef(form.email),
      aadhar: orUndef(form.aadhar),
      house_no: orUndef(form.house_no),
      street1: orUndef(form.street1),
      street2: orUndef(form.street2),
      state: orUndef(form.state),
      district: orUndef(form.district),
      taluk: orUndef(form.taluk),
      pincode: orUndef(form.pincode),
      city: orUndef(form.city),
      village_town: orUndef(form.village_town),
      designation: orUndef(form.designation),
      department: orUndef(form.department),
      employment_type: orUndef(form.employment_type),
      date_of_joining: orUndef(form.date_of_joining),
      work_state: orUndef(form.work_state),
      work_district: orUndef(form.work_district),
      work_location: orUndef(form.work_location),
      is_manager: form.is_manager,
      reporting_manager: form.reporting_manager.trim() || null,
      reporting_manager_emp_id: form.reporting_manager_emp_id.trim() || null,
      status: form.status || 'active',
      notes: orUndef(form.notes),
    };
    if (canMintTrust) {
      body.is_board_director = form.is_board_director;
      body.is_hr_admin = form.is_hr_admin;
    }

    setBusy(true);
    try {
      const res = isCreate
        ? await api.createEmployee(body)
        : await api.updateEmployee(employee!.id!, body);
      toast(res.message || (isCreate ? t('admin.emp.created') : t('admin.emp.updated')), 'ok');
      onSaved();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not save employee';
      setError(msg);
      toast(msg, 'er');
    } finally {
      setBusy(false);
    }
  }

  const title = isCreate
    ? t('admin.emp.addTitle')
    : `${t('admin.emp.editTitle')}${employee?.emp_id ? ` · ${employee.emp_id}` : ''}`;

  return (
    <Sheet open={open} title={title} onClose={onClose}>
      <SecHead>{t('admin.emp.identity')}</SecHead>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('admin.emp.fname')} required>
          {(p) => (
            <Input {...p} value={form.fname} onChange={(e) => set('fname', e.target.value)} />
          )}
        </Field>
        <Field label={t('admin.emp.lname')}>
          {(p) => (
            <Input {...p} value={form.lname} onChange={(e) => set('lname', e.target.value)} />
          )}
        </Field>
        <Field label={t('admin.emp.gender')}>
          {(p) => (
            <Select {...p} value={form.gender} onChange={(e) => set('gender', e.target.value)}>
              <option value="">{t('admin.emp.select')}</option>
              {EMP_GENDERS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('admin.emp.dob')}>
          {(p) => (
            <Input
              {...p}
              type="date"
              value={form.dob}
              onChange={(e) => set('dob', e.target.value)}
            />
          )}
        </Field>
        <Field label={t('admin.emp.phone')}>
          {(p) => (
            <Input
              {...p}
              inputMode="numeric"
              value={form.phone}
              onChange={(e) => set('phone', digits(e.target.value, 10))}
            />
          )}
        </Field>
        <Field label={t('admin.emp.email')}>
          {(p) => (
            <Input
              {...p}
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
            />
          )}
        </Field>
        <Field label={t('admin.emp.aadhar')}>
          {(p) => (
            <Input
              {...p}
              inputMode="numeric"
              value={form.aadhar}
              onChange={(e) => set('aadhar', digits(e.target.value, 12))}
              placeholder="123412341234"
            />
          )}
        </Field>
      </div>

      <SecHead>{t('admin.emp.address')}</SecHead>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('admin.emp.houseNo')}>
          {(p) => (
            <Input {...p} value={form.house_no} onChange={(e) => set('house_no', e.target.value)} />
          )}
        </Field>
        <Field label={t('admin.emp.street1')}>
          {(p) => (
            <Input {...p} value={form.street1} onChange={(e) => set('street1', e.target.value)} />
          )}
        </Field>
        <Field label={t('admin.emp.street2')}>
          {(p) => (
            <Input {...p} value={form.street2} onChange={(e) => set('street2', e.target.value)} />
          )}
        </Field>
        <Field label={t('admin.emp.state')}>
          {(p) => (
            <Select {...p} value={form.state} onChange={(e) => setState_(e.target.value)}>
              <option value="">{t('admin.emp.select')}</option>
              {states.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('admin.emp.district')}>
          {(p) => (
            <Select
              {...p}
              value={form.district}
              onChange={(e) => setDistrict_(e.target.value)}
              disabled={!form.state}
            >
              <option value="">{t('admin.emp.select')}</option>
              {districtsOf(form.state).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('admin.emp.taluk')}>
          {(p) => (
            <Select
              {...p}
              value={form.taluk}
              onChange={(e) => set('taluk', e.target.value)}
              disabled={!form.district}
            >
              <option value="">{t('admin.emp.select')}</option>
              {taluksOf(form.state, form.district).map((tk) => (
                <option key={tk} value={tk}>
                  {tk}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('admin.emp.pincode')}>
          {(p) => (
            <Input
              {...p}
              inputMode="numeric"
              value={form.pincode}
              onChange={(e) => set('pincode', digits(e.target.value, 6))}
            />
          )}
        </Field>
        <Field label={t('admin.emp.city')}>
          {(p) => <Input {...p} value={form.city} onChange={(e) => set('city', e.target.value)} />}
        </Field>
        <Field label={t('admin.emp.village')}>
          {(p) => (
            <Input
              {...p}
              value={form.village_town}
              onChange={(e) => set('village_town', e.target.value)}
            />
          )}
        </Field>
      </div>

      <SecHead>{t('admin.emp.company')}</SecHead>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('admin.emp.designation')}>
          {(p) => (
            <Select
              {...p}
              value={form.designation}
              onChange={(e) => set('designation', e.target.value)}
            >
              <option value="">{t('admin.emp.select')}</option>
              {EMP_DESIGNATIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('admin.emp.department')}>
          {(p) => (
            <Select
              {...p}
              value={form.department}
              onChange={(e) => set('department', e.target.value)}
            >
              <option value="">{t('admin.emp.select')}</option>
              {EMP_DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('admin.emp.type')} hint={t('admin.emp.typeHint')}>
          {(p) => (
            <Select
              {...p}
              value={form.employment_type}
              onChange={(e) => set('employment_type', e.target.value)}
            >
              {EMP_EMPLOYMENT_TYPES.map((ty) => (
                <option key={ty} value={ty}>
                  {ty}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('admin.emp.doj')}>
          {(p) => (
            <Input
              {...p}
              type="date"
              value={form.date_of_joining}
              onChange={(e) => set('date_of_joining', e.target.value)}
            />
          )}
        </Field>
        <Field label={t('admin.emp.workState')}>
          {(p) => (
            <Select {...p} value={form.work_state} onChange={(e) => setWorkState_(e.target.value)}>
              <option value="">{t('admin.emp.select')}</option>
              {states.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('admin.emp.workDistrict')}>
          {(p) => (
            <Select
              {...p}
              value={form.work_district}
              onChange={(e) => set('work_district', e.target.value)}
              disabled={!form.work_state}
            >
              <option value="">{t('admin.emp.select')}</option>
              {districtsOf(form.work_state).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <Field label={t('admin.emp.workLocation')}>
        {(p) => (
          <Input
            {...p}
            value={form.work_location}
            onChange={(e) => set('work_location', e.target.value)}
          />
        )}
      </Field>

      <label className="mb-3 flex items-center gap-2 text-sm text-fg">
        <input
          type="checkbox"
          checked={form.is_manager}
          onChange={(e) => set('is_manager', e.target.checked)}
        />
        {t('admin.emp.isManager')}
      </label>

      {/* Reporting manager */}
      <Field label={t('admin.emp.reportsTo')} hint={t('admin.emp.mgrNeedUnit')}>
        {() => (
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={form.reporting_manager || ''}
              placeholder={t('admin.emp.noManager')}
              className="min-w-0 flex-1 cursor-default rounded-base border border-border bg-surface-muted px-2.5 py-2 text-xs text-fg"
            />
            <Button variant="ghost" onClick={() => setPickMgr(true)}>
              {t('admin.emp.selectMgr')}
            </Button>
            {form.reporting_manager ? (
              <button
                type="button"
                aria-label={t('admin.emp.clear')}
                onClick={() =>
                  setForm((f) => ({ ...f, reporting_manager: '', reporting_manager_emp_id: '' }))
                }
                className="cursor-pointer rounded-sm border-0 bg-surface-muted px-2 py-1 text-2xs text-danger hover:bg-danger hover:text-white"
              >
                ✕
              </button>
            ) : null}
          </div>
        )}
      </Field>

      {canMintTrust ? (
        <section className="mb-3 rounded-base border border-leaf/40 bg-surface-muted p-3">
          <h4 className="mb-1 text-xs font-bold text-primary">{t('admin.emp.trustTitle')}</h4>
          <label className="flex items-center gap-2 py-0.5 text-sm text-fg">
            <input
              type="checkbox"
              checked={form.is_board_director}
              onChange={(e) => set('is_board_director', e.target.checked)}
            />
            {t('admin.emp.bodFull')}
          </label>
          <label className="flex items-center gap-2 py-0.5 text-sm text-fg">
            <input
              type="checkbox"
              checked={form.is_hr_admin}
              onChange={(e) => set('is_hr_admin', e.target.checked)}
            />
            {t('admin.emp.hrFull')}
          </label>
          <p className="mt-1 text-2xs text-fg-muted">{t('admin.emp.trustNote')}</p>
        </section>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <Field label={t('admin.emp.statusField')}>
          {(p) => (
            <Select {...p} value={form.status} onChange={(e) => set('status', e.target.value)}>
              {EMP_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {t('admin.emp.st.' + st)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <Field label={t('admin.emp.notes')}>
        {(p) => <Input {...p} value={form.notes} onChange={(e) => set('notes', e.target.value)} />}
      </Field>

      {error ? (
        <div className="mb-2 text-2xs text-danger" role="alert">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button onClick={save} disabled={busy}>
          {busy ? t('admin.emp.saving') : t('admin.emp.save')}
        </Button>
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          {t('admin.emp.cancel')}
        </Button>
      </div>

      <ManagerPickerModal
        open={pickMgr}
        workDistrict={form.work_district}
        department={form.department}
        excludeId={employee?.id}
        onClose={() => setPickMgr(false)}
        onSelect={(m) => {
          const name = `${m.fname || ''} ${m.lname || ''}`.trim();
          setForm((f) => ({
            ...f,
            reporting_manager: `${name} (${m.emp_id})`,
            reporting_manager_emp_id: s(m.emp_id),
          }));
          setPickMgr(false);
        }}
      />
    </Sheet>
  );
}

function SecHead({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 mt-4 border-b border-border-subtle pb-1 text-sm font-bold text-primary first:mt-0">
      {children}
    </h3>
  );
}
