/* ============================================================================
 * dashboard/operations.js — Operations dashboard (district / region scoped).
 * Audience: District Manager & Hub Incharge (district), Regional/State/Zonal
 * (their state), Head Office (all — preview). Entry: renderOperationsDashboard(el).
 * Reuses window.Dash helpers + styles injected by executive.js (ds-* classes).
 * ========================================================================== */
(function (global) {
  'use strict';
  var D = global.Dash;

  function money(n) { return '₹' + Number(n || 0).toLocaleString('en-IN'); }
  function num(n) { return Number(n || 0).toLocaleString('en-IN'); }

  // Quick-action buttons route to existing admin tabs (openTab is global in admin.html).
  function go(tab) {
    if (typeof openTab === 'function') {
      var el = document.getElementById('tab-' + tab);
      openTab(tab, el || null);
    }
  }

  function renderOperationsDashboard(el) {
    D.ensureStyles();
    el.innerHTML = '<div class="spinner"><div class="spin"></div></div>';
    D.disposeAll();
    API.getOperationsDashboard()
      .then(function (res) { paint(el, res); })
      .catch(function (e) {
        el.innerHTML = '<div class="empty-state"><p>Could not load operations dashboard: ' + D.esc(e.message) + '</p></div>';
      });
  }

  function paint(el, r) {
    var sc = r.scope || { level: 'all', name: '' };
    var s = r.summary || {}, del = r.delivery_status || {}, col = r.collections || {};
    var q = r.quality || {}, pay = r.payments || {}, fa = r.farmers || {};
    var agents = r.agents || [], districts = r.districts || [], alerts = r.alerts || [];
    var sb = del.status_breakdown || {};
    var scopeLabel = sc.level === 'district' ? 'District' : sc.level === 'region' ? 'Region / State' : 'All Regions';

    var h = '<div class="ds-wrap">';

    // Header
    h += '<div class="ds-head"><div><h2>🚚 Operations — ' + D.esc(sc.name || '') + '</h2>'
      + '<div class="ds-sub">' + D.esc(scopeLabel) + ' scope · live from database · updated ' + new Date(r.generated_at || Date.now()).toLocaleTimeString('en-IN') + '</div></div>'
      + '<button class="ds-btn" id="ops-refresh">↻ Refresh</button></div>';

    // Summary tiles
    h += '<div class="ds-grid">';
    h += D.statTile('🆕', 'Orders Today', num(s.orders_today), D.C.forest);
    h += D.statTile('💰', "Today's Revenue", money(s.revenue_today), D.C.leaf);
    h += D.statTile('📅', 'Revenue (7d)', money(s.revenue_week), D.C.green);
    h += D.statTile('📦', 'Active Orders', num(s.active_orders), D.C.forest);
    h += D.statTile('✅', 'Delivered Today', num(s.delivered_today), D.C.green);
    h += D.statTile('⏳', 'Pending Deliveries', num(s.pending_deliveries), D.C.gold);
    h += '</div>';

    // Quick actions
    h += '<div class="ds-card">' + D.sectionTitle('⚡', 'Quick Actions');
    h += '<div class="ops-actions">'
      + actionBtn('registrations', '🧑‍🌾', 'Approve Farmers', fa.pending_approval)
      + actionBtn('orders', '🛵', 'Assign Delivery', s.pending_deliveries)
      + actionBtn('returns', '↩️', 'Handle Returns', q.pending_returns)
      + actionBtn('payouts', '💸', 'Farmer Payouts', pay.pending_count)
      + '<button class="ops-act ops-act--ph" disabled>📝 Raise Complaint <span class="ds-ph-badge">soon</span></button>'
      + '<button class="ops-act ops-act--ph" disabled>📦 Transfer Stock <span class="ds-ph-badge">soon</span></button>'
      + '</div></div>';

    // Delivery status + Collections
    h += '<div class="ds-two">';
    h += '<div class="ds-card">' + D.sectionTitle('🛵', 'Delivery Status');
    if (Object.keys(sb).length) {
      h += '<div id="ops-delivery" class="ds-chart"></div>';
    } else {
      h += '<div class="ds-sub" style="padding:20px;text-align:center">No active orders in scope.</div>';
    }
    h += '<div class="ds-sub" style="margin-top:6px">🛰️ Delivery Agents Online — <em>needs integration</em></div>';
    h += '</div>';

    h += '<div class="ds-card">' + D.sectionTitle('🧺', 'Collections');
    h += '<div class="ds-grid" style="grid-template-columns:repeat(auto-fill,minmax(110px,1fr))">'
      + D.statTile('✅', 'Confirmed', num(col.confirmed_listings), D.C.green)
      + D.statTile('📋', 'Listed Active', num(col.listed_active), D.C.forest)
      + D.statTile('🔄', 'Updated Today', num(col.updated_today), D.C.leaf)
      + D.placeholderTile('🏬', 'Hub Stock')
      + '</div></div>';
    h += '</div>';

    // Quality + Payments
    h += '<div class="ds-two">';
    h += '<div class="ds-card">' + D.sectionTitle('🔍', 'Returns & Quality');
    h += '<div class="ds-grid" style="grid-template-columns:repeat(auto-fill,minmax(110px,1fr))">'
      + D.statTile('⏳', 'Pending Returns', num(q.pending_returns), D.C.gold)
      + D.statTile('🚚', 'To Collect', num(q.to_collect), D.C.forest)
      + D.statTile('❌', 'Rejected', num(q.rejected_returns), D.C.red)
      + '</div></div>';

    h += '<div class="ds-card">' + D.sectionTitle('💸', 'Farmer Payments');
    h += '<div class="ds-grid" style="grid-template-columns:repeat(auto-fill,minmax(110px,1fr))">'
      + D.statTile('⏳', 'Pending', num(pay.pending_count), D.C.gold)
      + D.statTile('💰', 'Pending Amount', money(pay.pending_amount), D.C.red)
      + D.statTile('⚠️', 'Overdue (>7d)', num(pay.stale_count), D.C.red)
      + '</div></div>';
    h += '</div>';

    // Farmers + Delivery agents
    h += '<div class="ds-two">';
    h += '<div class="ds-card">' + D.sectionTitle('🌾', 'Farmers');
    h += '<div class="ds-grid" style="grid-template-columns:repeat(auto-fill,minmax(110px,1fr))">'
      + D.statTile('🧑‍🌾', 'Registered', num(fa.registered), D.C.forest)
      + D.statTile('🟢', 'Active', num(fa.active), D.C.green)
      + D.statTile('🕓', 'Pending Approval', num(fa.pending_approval), D.C.gold)
      + D.placeholderTile('🚶', 'Farmer Visits')
      + '</div></div>';

    h += '<div class="ds-card">' + D.sectionTitle('🛵', 'Delivery Agents', '<span class="ds-sub">' + num(del.agents_total) + ' active</span>');
    if (agents.length) {
      h += '<ul class="ds-top" style="max-height:220px;overflow:auto">'
        + agents.map(function (a) {
            return '<li><span class="t-rank" style="background:var(--leaf)">🛵</span>'
              + '<span style="flex:1">' + D.esc(a.name || 'Agent') + (a.vehicle ? ' · <span style="color:var(--gray)">' + D.esc(a.vehicle) + '</span>' : '') + '</span>'
              + '<span style="color:var(--gray)">' + D.esc(a.phone || '') + '</span></li>';
          }).join('')
        + '</ul>';
    } else {
      h += '<div class="ds-sub" style="padding:14px;text-align:center">No active delivery agents in scope.</div>';
    }
    h += '<div class="ds-sub" style="margin-top:8px">🗓️ VCO Attendance — <em>needs integration</em></div>';
    h += '</div>';
    h += '</div>';

    // District rollup (region/all scope only)
    if (districts.length > 1) {
      h += '<div class="ds-card">' + D.sectionTitle('🏙️', 'District Breakdown');
      h += '<div id="ops-districts" class="ds-chart"></div></div>';
    }

    // Alerts
    h += '<div class="ds-card">' + D.sectionTitle('🔔', 'Action Items');
    if (alerts.length) {
      h += alerts.map(function (a) {
        var icon = a.severity === 'high' ? '🔴' : a.severity === 'medium' ? '🟠' : '🟡';
        return '<div class="ds-alert ' + D.esc(a.severity) + '">' + icon + '<div>' + D.esc(a.message) + '</div></div>';
      }).join('');
    } else {
      h += '<div class="ds-sub">✅ Nothing needs attention right now.</div>';
    }
    h += '</div>';

    h += '</div>'; // ds-wrap
    el.innerHTML = h;

    // Charts
    if (Object.keys(sb).length) {
      var labels = Object.keys(sb), vals = labels.map(function (k) { return sb[k]; });
      D.mountChart('ops-delivery', D.barOption(labels, vals, { color: D.C.leaf, showLabel: true, rotate: labels.length > 4 ? 25 : 0 }));
    }
    if (districts.length > 1) {
      D.mountChart('ops-districts', D.comboBarOption(
        districts.map(function (d) { return d.district; }),
        { name: 'Orders', data: districts.map(function (d) { return d.orders; }) },
        { name: 'Pending', data: districts.map(function (d) { return d.pending; }) },
        { rotate: 40 }));
    }

    document.getElementById('ops-refresh').onclick = function () { renderOperationsDashboard(el); };
    Array.prototype.forEach.call(document.querySelectorAll('.ops-act[data-tab]'), function (b) {
      b.onclick = function () { go(b.getAttribute('data-tab')); };
    });
  }

  function actionBtn(tab, icon, label, badge) {
    var b = badge > 0 ? '<span class="ops-badge">' + num(badge) + '</span>' : '';
    return '<button class="ops-act" data-tab="' + tab + '">' + icon + ' ' + D.esc(label) + b + '</button>';
  }

  global.renderOperationsDashboard = renderOperationsDashboard;
})(window);
