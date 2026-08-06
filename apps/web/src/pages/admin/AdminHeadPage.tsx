import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button, ChartContainer, StatTile } from '@marutham/ui';
import { api, type AdminHeadDashboardResponse } from '@marutham/api-client';
import { semantic, colors } from '@marutham/tokens';
import {
  rankedStaffRoles,
  rankedDepartments,
  staffTotal,
  approvalQueue,
  alertKey,
  sortAlerts,
  alertTone,
  fmtNum,
  type ApprovalQueueItem,
  adminRoleKey,
} from '@marutham/lib';
import type { EChartsOption } from 'echarts';
import { EChart } from '../../components/EChart';
import { PlaceholderSection } from '../../components/PlaceholderSection';
import { ToneDot } from '../../components/ToneDot';
import { AdminGeoFilter } from './AdminGeoFilter';
import { useAdminGeo } from './AdminGeoContext';

/**
 * The Admin Head dashboard — Head Office, Technical Admin, HR Admin, HR Manager.
 *
 * The Head Office control panel: who works here, what is waiting for approval, and
 * what has been changing (audit + login activity). Company-wide — unlike
 * operations, this endpoint has no geo scope to report.
 *
 * Ported from legacy frontend/js/dashboard/adminhead.js, the LAST dashboard that
 * existed only in the legacy frontend. Porting it is what unblocks retiring
 * frontend/*.html.
 *
 * MONEY: this endpoint returns none — no rupees, no paise, no conversion. The one
 * money-shaped trap is `approvals.total_pending`, named that way because a key
 * called `total` gets eaten by the money middleware and comes back as "0.00".
 */
export function AdminHeadPage() {
  const { t } = useTranslation();
  const { canFilter, state, district } = useAdminGeo();
  const [data, setData] = useState<AdminHeadDashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = canFilter
        ? { state: state || undefined, district: district || undefined }
        : undefined;
      setData(await api.getAdminHeadDashboard(params));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('admin.head.error'));
    } finally {
      setLoading(false);
    }
  }, [t, canFilter, state, district]);

  useEffect(() => {
    void load();
  }, [load]);

  const roles = useMemo(() => rankedStaffRoles(data?.staff_by_role), [data]);
  const depts = useMemo(() => rankedDepartments(data?.employees_by_dept), [data]);
  const queue = useMemo(() => approvalQueue(data?.approvals), [data]);
  const alerts = useMemo(() => sortAlerts(data?.alerts), [data]);

  /* Staff by role — a RANKED HORIZONTAL BAR, not the donut legacy drew.
   *
   * There are ~15 admin_role values with wildly unequal counts, which makes this a
   * comparison task across many categories: a bar's job. A pie is only honest for
   * part-to-whole at a glance, and fifteen slices cannot be read that way anyway.
   * Horizontal because role names are long words, not dates — they belong on the
   * y-axis where they can be read straight.
   *
   * ONE series → one hue, and therefore no categorical palette: the brand's 6-hue
   * chart palette fails lightness/chroma/CVD validation past its 4th slot, so
   * covering 15 roles with it would have meant cycling hues (forbidden — a hue must
   * mean one thing) or inventing new brand colours. The whole this ranks against is
   * in the subtitle, which is where a bar chart's missing total belongs. */
  const rolesOption = useMemo<EChartsOption>(
    () => ({
      grid: { left: 8, right: 48, top: 8, bottom: 8, containLabel: true },
      tooltip: { trigger: 'item' },
      xAxis: {
        type: 'value',
        minInterval: 1, // people are whole; a "2.5 staff" gridline is a lie
        splitLine: { lineStyle: { color: colors.muted } },
        axisLabel: { show: false },
      },
      yAxis: {
        type: 'category',
        // ECharts draws a category y-axis bottom-up, so the biggest must go last
        // for the ranking to read top-down.
        /* ECharts draws to CANVAS, so these labels are invisible to a DOM sweep —
           they were the last English on this page and only a screenshot found them.
           The VALUE is still r.role; only the tick is spoken. */
        data: roles.map((r) => t(adminRoleKey(r.role), r.role)).reverse(),
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: { color: colors.gray },
      },
      series: [
        {
          type: 'bar',
          barMaxWidth: 14,
          itemStyle: { color: colors.leaf, borderRadius: [0, 4, 4, 0] },
          // Direct-labelled: the count IS the point, and there is no x-axis to read
          // it off (the axis labels are hidden — they would only repeat these).
          label: {
            show: true,
            position: 'right',
            color: colors.gray,
            formatter: (p) => fmtNum(Number(p.value)),
          },
          data: roles.map((r) => r.count).reverse(),
        },
      ],
    }),
    [roles, t],
  );

  /* Employees by department — same form, same reasoning, different question. */
  const deptOption = useMemo<EChartsOption>(
    () => ({
      grid: { left: 8, right: 48, top: 8, bottom: 8, containLabel: true },
      tooltip: { trigger: 'item' },
      xAxis: {
        type: 'value',
        minInterval: 1,
        splitLine: { lineStyle: { color: colors.muted } },
        axisLabel: { show: false },
      },
      yAxis: {
        type: 'category',
        data: depts.map((d) => d.dept).reverse(),
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: { color: colors.gray },
      },
      series: [
        {
          type: 'bar',
          barMaxWidth: 14,
          itemStyle: { color: colors.leaf, borderRadius: [0, 4, 4, 0] },
          label: {
            show: true,
            position: 'right',
            color: colors.gray,
            formatter: (p) => fmtNum(Number(p.value)),
          },
          data: depts.map((d) => d.count).reverse(),
        },
      ],
    }),
    [depts],
  );

  const s = data?.summary;
  const audit = data?.audit;
  const failed = audit?.failed_logins_today ?? 0;
  const updated = data?.generated_at
    ? new Date(data.generated_at).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-primary">{t('admin.head.title')}</h1>
          <p className="text-xs text-fg-muted">
            {t('admin.head.subtitle')}
            {updated ? ` · ${t('admin.head.updated', { time: updated })}` : ''}
          </p>
        </div>
        <Button variant="ghost" onClick={() => void load()} disabled={loading}>
          {t('admin.head.refresh')}
        </Button>
      </header>

      {/* Console-wide State/District drill-down. Scopes the geographic figures
          (staff, employees, districts/states, approvals); the org-wide activity
          and catalogue metrics stay company-wide. */}
      <AdminGeoFilter />

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-danger bg-danger-bg p-4 text-sm text-danger-fg"
        >
          {/403|restricted/i.test(error) ? t('admin.head.denied') : error}
        </div>
      ) : null}

      {/* ── The organisation at a glance ─────────────────────────────────── */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile
          icon="🧑‍💼"
          label={t('admin.head.kpi.employees')}
          value={fmtNum(s?.employees_active ?? 0)}
        />
        <StatTile
          icon="🔑"
          label={t('admin.head.kpi.staffLogins')}
          value={fmtNum(s?.staff_logins ?? 0)}
        />
        <StatTile
          icon="📍"
          label={t('admin.head.kpi.districts')}
          value={fmtNum(s?.districts_active ?? 0)}
        />
        <StatTile
          icon="🗺️"
          label={t('admin.head.kpi.states')}
          value={fmtNum(s?.states_covered ?? 0)}
        />
        <StatTile
          icon="🌾"
          label={t('admin.head.kpi.products')}
          value={fmtNum(s?.products_catalogue ?? 0)}
        />
      </section>

      {/* ── The approval backlog ─────────────────────────────────────────────
          The reason this audience opens the screen. Every queue is listed even at
          zero: "nothing is waiting on me" is the answer they came for as often as
          a number is. */}
      <ChartContainer
        title={t('admin.head.approvals.title')}
        subtitle={t('admin.head.approvals.sub', { count: data?.approvals.total_pending ?? 0 })}
        loading={loading && !data}
        height="auto"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {queue.map((item) => (
            <ApprovalCard key={item.key} item={item} />
          ))}
        </div>
      </ChartContainer>

      {/* ── Who works here ───────────────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartContainer
          title={t('admin.head.staff.title')}
          subtitle={t('admin.head.staff.sub', {
            staff: fmtNum(staffTotal(data?.staff_by_role)),
            roles: roles.length,
          })}
          loading={loading && !data}
          empty={!loading && roles.length === 0 ? t('admin.head.staff.none') : false}
          height="auto"
        >
          {/* Height grows with the rows: 15 roles in a fixed 260px box would overlap
              their own labels. */}
          <EChart option={rolesOption} height={Math.max(200, roles.length * 30 + 40)} />
        </ChartContainer>

        <ChartContainer
          title={t('admin.head.depts.title')}
          subtitle={t('admin.head.depts.sub')}
          loading={loading && !data}
          empty={!loading && depts.length === 0 ? t('admin.head.depts.none') : false}
          height="auto"
        >
          <EChart option={deptOption} height={Math.max(200, depts.length * 30 + 40)} />
        </ChartContainer>
      </div>

      {/* ── Audit & access ───────────────────────────────────────────────────
          The compliance half of the job: who changed what, and who tried to get in. */}
      <ChartContainer
        title={t('admin.head.audit.title')}
        subtitle={t('admin.head.audit.sub')}
        loading={loading && !data}
        height="auto"
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile
            label={t('admin.head.audit.userChanges')}
            value={fmtNum(audit?.user_changes_7d ?? 0)}
          />
          <StatTile
            label={t('admin.head.audit.employeeChanges')}
            value={fmtNum(audit?.employee_changes_7d ?? 0)}
          />
          <StatTile label={t('admin.head.audit.logins')} value={fmtNum(audit?.logins_today ?? 0)} />
          <StatTile
            label={t('admin.head.audit.failedLogins')}
            value={fmtNum(failed)}
            // A failed login is only worth colouring when one has actually happened.
            // A red 0 would cry wolf on every quiet morning.
            accent={failed > 0 ? semantic.light.danger : undefined}
          />
        </div>
      </ChartContainer>

      {/* ── Action items ─────────────────────────────────────────────────── */}
      <ChartContainer title={t('admin.head.alerts.title')} loading={loading && !data} height="auto">
        {alerts.length === 0 ? (
          <p className="text-sm text-fg-muted">{t('admin.head.alerts.none')}</p>
        ) : (
          <ul className="space-y-2">
            {alerts.map((a, i) => (
              <li
                key={`${a.type}-${i}`}
                className="flex items-start gap-2 rounded-lg bg-surface-muted p-3 text-sm"
              >
                <ToneDot tone={alertTone(a.severity)} />
                {/* The server's English sentence is the DEFAULT: an alert type with
                    no key still says something true. */}
                <span className="text-fg">
                  {String(t(alertKey(a.type), { ...a.params, defaultValue: a.message }))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </ChartContainer>

      <PlaceholderSection
        placeholders={data?.placeholders}
        title={t('admin.head.ph.title')}
        subtitle={t('admin.head.ph.sub')}
        loading={loading && !data}
      />
    </div>
  );
}

/**
 * One approval queue.
 *
 * A queue with a screen behind it is a LINK (middle-click, open-in-new-tab: it goes
 * somewhere). A queue without one is a plain card — produce listings are counted by
 * the backend but the React console has no listing-approval screen yet, and a link
 * to a route that does not exist would be a worse lie than the admitted gap.
 */
function ApprovalCard({ item }: { item: ApprovalQueueItem }) {
  const { t } = useTranslation();
  const label = t(`admin.head.approvals.${item.key}`);
  const waiting = item.count > 0;

  const body = (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-bold text-fg">{label}</span>
        <span
          className="text-2xl font-bold tabular-nums"
          style={{ color: waiting ? semantic.light.warning : colors.gray }}
        >
          {fmtNum(item.count)}
        </span>
      </div>
      <p className="mt-1 text-xs text-fg-muted">
        {item.to
          ? t('admin.head.approvals.review')
          : /* Say WHY there is no door, rather than leaving a dead card. */
            t('admin.head.approvals.noScreen')}
      </p>
    </>
  );

  return item.to ? (
    <Link
      to={item.to}
      className="block rounded-xl border border-subtle bg-surface p-4 no-underline hover:border-primary"
    >
      {body}
    </Link>
  ) : (
    <div className="rounded-xl border border-dashed border-subtle bg-surface-muted p-4">{body}</div>
  );
}
