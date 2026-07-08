/* ============================================================================
 * dashboard/adminhead.js — Head Office administration / operations control panel.
 * Audience: Head Office (+ Technical Admin / HR Admin / HR Manager for now).
 * Focus: employees, org-wide approvals, staff-by-role, audit activity, master data.
 * Entry: renderAdminHeadDashboard(el). Reuses window.Dash + ECharts.
 * ========================================================================== */
(function (global) {
  'use strict';
  var D = global.Dash;

  function num(n) { return Number(n || 0).toLocaleString('en-IN'); }
  function go(tab) {
    if (typeof openTab === 'function') { var t = document.getElementById('tab-' + tab); openTab(tab, t || null); }
  }

  function renderAdminHeadDashboard(el) {
    D.ensureStyles();
    el.innerHTML = '<div class="spinner"><div class="spin"></div></div>';
    D.disposeAll();
    API.getAdminHeadDashboard()
      .then(function (r) { paint(el, r); })
      .catch(function (e) {
        el.innerHTML = '<div class="empty-state"><p>Could not load admin dashboard: ' + D.esc(e.message) + '</p></div>';
      });
  }

  function paint(el, r) {
    var s = r.summary || {}, ap = r.approvals || {}, au = r.audit || {};
    var roles = r.staff_by_role || [], depts = r.employees_by_dept || [], alerts = r.alerts || [];

    var h = '<div class="ds-wrap">';

    // Header
    h += '<div class="ds-head"><div><h2>🛡️ Admin Control — Head Office</h2>'
      + '<div class="ds-sub">Company-wide administration · live · ' + new Date(r.generated_at || Date.now()).toLocaleTimeString('en-IN') + '</div></div>'
      + '<button class="ds-btn" id="ah-refresh">↻ Refresh</button></div>';

    // Summary
    h += '<div class="ds-grid">';
    h += D.statTile('👔', 'Employees', num(s.employees_active), D.C.forest);
    h += D.statTile('🔑', 'Staff Logins', num(s.staff_logins), D.C.leaf);
    h += D.statTile('🗺️', 'Districts Active', num(s.districts_active), D.C.bloom);
    h += D.statTile('🏢', 'States Covered', num(s.states_covered), D.C.green);
    h += D.statTile('🗂️', 'Master Data (Products)', num(s.products_catalogue), D.C.gold);
    h += D.statTile('📝', 'Pending Approvals', num(ap.total_pending), ap.total_pending > 0 ? D.C.red : D.C.green);
    h += D.placeholderTile('🎫', 'Support Tickets');
    h += D.placeholderTile('⚠️', 'Escalations');
    h += D.placeholderTile('🏬', 'Warehouse Utilization');
    h += '</div>';

    // Approvals + modules
    h += '<div class="ds-card">' + D.sectionTitle('📝', 'Approvals Queue', '<span class="ds-sub">' + num(ap.total_pending) + ' total pending</span>');
    h += '<div class="ds-grid" style="grid-template-columns:repeat(auto-fill,minmax(120px,1fr))">'
      + D.statTile('👔', 'Employees', num(ap.employees_pending), ap.employees_pending > 0 ? D.C.gold : D.C.green)
      + D.statTile('🧑‍🌾', 'Farmers', num(ap.farmers_pending), ap.farmers_pending > 0 ? D.C.gold : D.C.green)
      + D.statTile('🧺', 'Listings', num(ap.listings_pending), ap.listings_pending > 0 ? D.C.gold : D.C.green)
      + '</div>';
    h += '<div class="ops-actions" style="margin-top:12px">'
      + modBtn('employees', '👔', 'Employee Approval', ap.employees_pending)
      + modBtn('registrations', '🧑‍🌾', 'Farmer / Vendor Approval', ap.farmers_pending)
      + modBtn('listings-review', '🧺', 'Listing Approval', ap.listings_pending)
      + modBtn('products', '🗂️', 'Master Data', 0)
      + modBtn('users', '👥', 'Manage Users', 0)
      + '<button class="ops-act ops-act--ph" disabled>📊 Reports <span class="ds-ph-badge">soon</span></button>'
      + '</div></div>';

    // Staff by role + Employees by dept
    h += '<div class="ds-two">';
    h += '<div class="ds-card">' + D.sectionTitle('👥', 'Staff by Role') + '<div id="ah-roles" class="ds-chart"></div></div>';
    h += '<div class="ds-card">' + D.sectionTitle('🏛️', 'Employees by Department');
    if (depts.length) h += '<div id="ah-depts" class="ds-chart"></div>';
    else h += '<div class="ds-sub" style="padding:24px;text-align:center">No department data.</div>';
    h += '</div></div>';

    // Audit & access
    h += '<div class="ds-card">' + D.sectionTitle('🔍', 'Audit & Access');
    h += '<div class="ds-grid" style="grid-template-columns:repeat(auto-fill,minmax(130px,1fr))">'
      + D.statTile('📋', 'User Changes (7d)', num(au.user_changes_7d), D.C.forest)
      + D.statTile('👔', 'Employee Changes (7d)', num(au.employee_changes_7d), D.C.forest)
      + D.statTile('🔓', 'Logins Today', num(au.logins_today), D.C.leaf)
      + D.statTile('🚫', 'Failed Logins Today', num(au.failed_logins_today), au.failed_logins_today > 0 ? D.C.red : D.C.green)
      + '</div></div>';

    // Alerts
    h += '<div class="ds-card">' + D.sectionTitle('🔔', 'Action Items');
    if (alerts.length) {
      h += alerts.map(function (a) {
        var icon = a.severity === 'high' ? '🔴' : a.severity === 'medium' ? '🟠' : '🟡';
        return '<div class="ds-alert ' + D.esc(a.severity) + '">' + icon + '<div>' + D.esc(a.message) + '</div></div>';
      }).join('');
    } else {
      h += '<div class="ds-sub">✅ Nothing pending — all clear.</div>';
    }
    h += '</div>';

    h += '</div>';
    el.innerHTML = h;

    // Charts
    if (roles.length) {
      D.mountChart('ah-roles', D.pieOption(roles.map(function (x) { return { name: x.role, value: x.count }; }), { donut: true }));
    } else {
      var re = document.getElementById('ah-roles'); if (re) re.innerHTML = '<div class="ds-sub" style="padding:24px;text-align:center">No staff yet.</div>';
    }
    if (depts.length) {
      D.mountChart('ah-depts', D.barOption(depts.map(function (x) { return x.dept; }), depts.map(function (x) { return x.count; }),
        { color: D.C.leaf, showLabel: true, rotate: depts.length > 4 ? 25 : 0 }));
    }

    document.getElementById('ah-refresh').onclick = function () { renderAdminHeadDashboard(el); };
    Array.prototype.forEach.call(document.querySelectorAll('.ops-act[data-tab]'), function (b) {
      b.onclick = function () { go(b.getAttribute('data-tab')); };
    });
  }

  function modBtn(tab, icon, label, badge) {
    var b = badge > 0 ? '<span class="ops-badge">' + num(badge) + '</span>' : '';
    return '<button class="ops-act" data-tab="' + tab + '">' + icon + ' ' + D.esc(label) + b + '</button>';
  }

  global.renderAdminHeadDashboard = renderAdminHeadDashboard;
})(window);
