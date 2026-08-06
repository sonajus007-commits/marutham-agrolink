import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Spinner, EmptyState } from '@marutham/ui';
import { api, type RolesResponse } from '@marutham/api-client';
import { can } from '@marutham/lib';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';

type Draft = Record<string, { actions: string[]; scope: string }>;

/** Role & Permission Management — edit the RBAC matrix one role at a time.
 * Reads/writes GET|PATCH /api/roles; the server enforces role_permission_management
 * 'edit' to save, so a view-only role sees the grid disabled. */
export function RolesPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const showToast = useToast();
  const editable = can(user, 'role_permission_management', 'edit');

  const [data, setData] = useState<RolesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [roleId, setRoleId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .getRoles()
      .then((res) => {
        setData(res);
        if (res.roles.length) setRoleId(res.roles[0].id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load roles'));
  }, []);

  // Reset the working draft whenever the selected role changes.
  useEffect(() => {
    if (!data || roleId == null) return;
    const cells = data.matrix[roleId] || {};
    const d: Draft = {};
    for (const m of data.modules) {
      const c = cells[m.key];
      d[m.key] = { actions: c ? [...c.actions] : [], scope: c ? c.scope : 'none' };
    }
    setDraft(d);
  }, [data, roleId]);

  const role = useMemo(() => data?.roles.find((r) => r.id === roleId) || null, [data, roleId]);

  const dirty = useMemo(() => {
    if (!data || roleId == null) return false;
    const cells = data.matrix[roleId] || {};
    return data.modules.some((m) => {
      const orig = cells[m.key] || { actions: [], scope: 'none' };
      const cur = draft[m.key] || { actions: [], scope: 'none' };
      return (
        cur.scope !== orig.scope ||
        [...cur.actions].sort().join(',') !== [...orig.actions].sort().join(',')
      );
    });
  }, [data, roleId, draft]);

  if (error) return <EmptyState>{error}</EmptyState>;
  if (!data) return <Spinner />;

  const toggle = (moduleKey: string, action: string) => {
    if (!editable) return;
    setDraft((d) => {
      const cur = d[moduleKey] || { actions: [], scope: 'none' };
      const has = cur.actions.includes(action);
      const actions = has ? cur.actions.filter((a) => a !== action) : [...cur.actions, action];
      // Turning on any action implies at least 'view'; clearing 'view' clears all.
      let next = actions;
      if (!has && action !== 'view' && !actions.includes('view')) next = ['view', ...actions];
      if (has && action === 'view') next = [];
      return { ...d, [moduleKey]: { ...cur, actions: next } };
    });
  };

  const setScope = (moduleKey: string, scope: string) => {
    if (!editable) return;
    setDraft((d) => ({ ...d, [moduleKey]: { ...(d[moduleKey] || { actions: [] }), scope } }));
  };

  const save = async () => {
    if (roleId == null) return;
    setSaving(true);
    try {
      await api.updateRolePermissions(roleId, draft);
      // Reflect the saved state locally so `dirty` clears without a refetch.
      setData((prev) =>
        prev
          ? {
              ...prev,
              matrix: {
                ...prev.matrix,
                [roleId]: structuredClone(draft) as RolesResponse['matrix'][number],
              },
            }
          : prev,
      );
      showToast(t('admin.roles.saved'));
    } catch (e) {
      showToast(e instanceof Error ? e.message : t('admin.roles.saveError'), 'er');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-fg">{t('admin.roles.title')}</h1>
          <p className="text-sm text-fg-muted">{t('admin.roles.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-fg-muted" htmlFor="role-pick">
            {t('admin.roles.pickRole')}
          </label>
          <select
            id="role-pick"
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-fg"
            value={roleId ?? ''}
            onChange={(e) => setRoleId(Number(e.target.value))}
          >
            {data.roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      </header>

      {!editable && (
        <div className="rounded-md bg-warning-soft px-3 py-2 text-sm text-fg">
          {t('admin.roles.readonly')}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-surface-2 text-left text-2xs uppercase tracking-wide text-fg-muted">
              <th className="sticky left-0 bg-surface-2 px-3 py-2">{t('admin.roles.module')}</th>
              {data.actions.map((a) => (
                <th key={a} className="px-2 py-2 text-center font-semibold">
                  {a}
                </th>
              ))}
              <th className="px-3 py-2">{t('admin.roles.scope')}</th>
            </tr>
          </thead>
          <tbody>
            {data.modules.map((m) => {
              const cell = draft[m.key] || { actions: [], scope: 'none' };
              return (
                <tr key={m.key} className="border-t border-border">
                  <td className="sticky left-0 bg-surface px-3 py-1.5 font-medium text-fg">
                    {m.label}
                  </td>
                  {data.actions.map((a) => (
                    <td key={a} className="px-2 py-1.5 text-center">
                      <input
                        type="checkbox"
                        aria-label={`${m.label} ${a}`}
                        checked={cell.actions.includes(a)}
                        disabled={!editable}
                        onChange={() => toggle(m.key, a)}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-1.5">
                    <select
                      className="rounded border border-border bg-surface px-2 py-1 text-xs text-fg disabled:opacity-60"
                      value={cell.scope}
                      disabled={!editable}
                      onChange={(e) => setScope(m.key, e.target.value)}
                    >
                      {data.scopes.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editable && (
        <div className="flex items-center justify-end gap-3">
          {dirty && <span className="text-xs text-warning-strong">{t('admin.roles.dirty')}</span>}
          {role?.is_system && (
            <span className="text-2xs text-fg-muted">{t('admin.roles.systemRole')}</span>
          )}
          <Button onClick={save} disabled={!dirty || saving}>
            {t('admin.roles.save')}
          </Button>
        </div>
      )}
    </div>
  );
}
