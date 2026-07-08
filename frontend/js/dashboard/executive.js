/* ============================================================================
 * dashboard/executive.js — Executive / Business-Overview dashboard.
 * Audience: Board of Director / CEO / Managing Director (Head Office preview).
 * Renders live tiles + ECharts charts + the Tamil Nadu district map, and greys
 * out tiles that have no data source yet. Entry point: renderExecutiveDashboard(el).
 * ========================================================================== */
(function (global) {
  'use strict';
  var D = global.Dash;

  var state = { trend: 'monthly', selectedDistrict: null };

  function money(n) { return '₹' + Number(n || 0).toLocaleString('en-IN'); }
  function num(n) { return Number(n || 0).toLocaleString('en-IN'); }

  function renderExecutiveDashboard(el) {
    D.ensureStyles();
    el.innerHTML = '<div class="spinner"><div class="spin"></div></div>';
    D.disposeAll();
    API.getExecutiveDashboard({ trend: state.trend })
      .then(function (res) { paint(el, res); })
      .catch(function (e) {
        el.innerHTML = '<div class="empty-state"><p>Could not load executive dashboard: ' + D.esc(e.message) + '</p></div>';
      });
  }

  function paint(el, r) {
    var s = r.summary || {}, o = r.orders || {}, cu = r.customers || {}, fa = r.farmers || {};
    var fin = r.financial || {}, lo = r.logistics || {};
    var districts = r.districts || [], cats = r.categories || [], alerts = r.alerts || [];
    var trend = (r.trend && r.trend.points) || [];

    var h = '<div class="ds-wrap">';

    // Header
    h += '<div class="ds-head"><div><h2>📊 Business Overview</h2>'
      + '<div class="ds-sub">Company-wide · live from database · updated ' + new Date(r.generated_at || Date.now()).toLocaleTimeString('en-IN') + '</div></div>'
      + '<button class="ds-btn" id="ds-refresh">↻ Refresh</button></div>';

    // Executive summary tiles
    h += '<div class="ds-grid">';
    h += D.statTile('💰', 'Revenue Today', money(s.revenue_today), D.C.forest);
    h += D.statTile('📅', 'Revenue MTD', money(s.revenue_mtd), D.C.leaf);
    h += D.statTile('📈', 'Revenue YTD', money(s.revenue_ytd), D.C.green);
    h += D.statTile('🛒', 'GMV', money(s.gmv), D.C.gold);
    h += D.statTile('📦', 'Total Orders', num(s.total_orders), D.C.forest, null);
    h += tileWithDelta('🚀', 'Order Growth', s.order_growth_pct);
    h += tileWithDelta('👥', 'Customer Growth', s.customer_growth_pct);
    h += tileWithDelta('🌾', 'Farmer Growth', s.farmer_growth_pct);
    h += D.statTile('🗺️', 'Active Districts', num(s.active_districts), D.C.bloom);
    h += D.placeholderTile('💵', 'Net Profit');
    h += D.placeholderTile('🏦', 'Cash Flow');
    h += D.placeholderTile('📊', 'EBITDA');
    h += '</div>';

    // Business Map + district ranking
    h += '<div class="ds-card">' + D.sectionTitle('🗺️', 'District Performance — Tamil Nadu',
      '<span class="ds-sub">click a district to drill in</span>');
    h += '<div class="ds-two">';
    h += '<div><div id="ds-tn-map" class="ds-map"></div>'
      + '<div class="ds-legend">'
      + '<span><i class="ds-dot" style="background:#5cb85c"></i> Performing</span>'
      + '<span><i class="ds-dot" style="background:#e9c46a"></i> Moderate</span>'
      + '<span><i class="ds-dot" style="background:#e07a68"></i> Needs attention</span>'
      + '<span><i class="ds-dot" style="background:#eef4ea;border:1px solid #cfe0c8"></i> No data</span>'
      + '</div><div id="ds-drill"></div></div>';
    h += '<div><ul class="ds-rank" id="ds-rank">' + districts.map(rankRow).join('') + '</ul></div>';
    h += '</div></div>';

    // Revenue trend
    h += '<div class="ds-card">' + D.sectionTitle('📈', 'Revenue Trend',
      '<div class="ds-seg" id="ds-trend-seg">'
      + segBtn('monthly', 'Monthly') + segBtn('quarterly', 'Quarterly') + segBtn('yearly', 'Yearly')
      + '</div>');
    h += '<div id="ds-trend" class="ds-chart"></div>';
    h += '<div class="ds-sub" style="margin-top:6px">📉 Revenue Forecast — <em>needs integration</em></div>';
    h += '</div>';

    // Orders + Customers
    h += '<div class="ds-two">';
    h += '<div class="ds-card">' + D.sectionTitle('📦', 'Orders');
    h += '<div class="ds-grid" style="grid-template-columns:repeat(auto-fill,minmax(96px,1fr))">'
      + D.statTile('🆕', 'Today', num(o.today), D.C.forest)
      + D.statTile('✅', 'Delivered', num(o.delivered), D.C.green)
      + D.statTile('⏳', 'Pending', num(o.pending), D.C.gold)
      + D.statTile('❌', 'Cancelled', num(o.cancelled), D.C.red)
      + D.statTile('↩️', 'Refunded', num(o.refunded), D.C.bloom)
      + '</div>';
    h += '<div id="ds-orders-pie" class="ds-chart-sm" style="margin-top:8px"></div></div>';

    h += '<div class="ds-card">' + D.sectionTitle('👥', 'Customers');
    h += '<div class="ds-grid" style="grid-template-columns:repeat(auto-fill,minmax(96px,1fr))">'
      + D.statTile('🆕', 'New (MTD)', num(cu.new), D.C.leaf)
      + D.statTile('🔁', 'Repeat', num(cu.repeat), D.C.forest)
      + D.statTile('💚', 'Retention', (cu.retention_pct || 0) + '%', D.C.green)
      + D.statTile('🧺', 'Avg Basket', money(cu.avg_basket), D.C.gold)
      + '</div></div>';
    h += '</div>';

    // Farmers + Product analytics
    h += '<div class="ds-two">';
    h += '<div class="ds-card">' + D.sectionTitle('🌾', 'Farmers');
    h += '<div class="ds-grid" style="grid-template-columns:repeat(auto-fill,minmax(96px,1fr))">'
      + D.statTile('🧑‍🌾', 'Registered', num(fa.registered), D.C.forest)
      + D.statTile('🟢', 'Active', num(fa.active), D.C.green)
      + D.statTile('⚪', 'Inactive', num(fa.inactive), D.C.gray)
      + D.statTile('⭐', 'Avg Rating', fa.avg_rating != null ? fa.avg_rating : '—', D.C.gold)
      + '</div>';
    if ((fa.top || []).length) {
      h += '<div style="margin-top:12px"><div class="ds-sub" style="font-weight:700;margin-bottom:8px">Top Performing Farmers</div><ul class="ds-top">'
        + fa.top.map(function (t, i) { return '<li><span class="t-rank">' + (i + 1) + '</span><span style="flex:1">' + D.esc(t.name) + '</span><span style="color:var(--gray)">' + money(t.revenue) + '</span></li>'; }).join('')
        + '</ul></div>';
    }
    h += '<div class="ds-sub" style="margin-top:10px">😊 Farmer Satisfaction — <em>needs integration</em></div></div>';

    h += '<div class="ds-card">' + D.sectionTitle('🧺', 'Product Categories');
    h += '<div id="ds-cat-pie" class="ds-chart"></div></div>';
    h += '</div>';

    // Logistics
    h += '<div class="ds-card">' + D.sectionTitle('🚚', 'Logistics');
    h += '<div class="ds-grid" style="grid-template-columns:repeat(auto-fill,minmax(130px,1fr))">'
      + D.statTile('⏱️', 'Avg Delivery Time', lo.avg_delivery_mins != null ? lo.avg_delivery_mins + ' min' : '—', D.C.forest)
      + D.statTile('🐢', 'Late Deliveries', num(lo.late_deliveries), D.C.red)
      + D.statTile('🎯', 'Delivery SLA', lo.sla_pct != null ? lo.sla_pct + '%' : '—', D.C.green)
      + D.placeholderTile('🚙', 'Vehicle Utilization')
      + D.placeholderTile('⛽', 'Fuel Cost')
      + '</div></div>';

    // Financial
    h += '<div class="ds-card">' + D.sectionTitle('💼', 'Financial');
    h += '<div class="ds-grid" style="grid-template-columns:repeat(auto-fill,minmax(130px,1fr))">'
      + D.statTile('🏷️', 'Platform Commission', money(fin.platform_commission), D.C.forest)
      + D.statTile('🚚', 'Delivery Income', money(fin.delivery_income), D.C.leaf)
      + D.statTile('📅', 'Subscription Income', money(fin.subscription_income), D.C.gold)
      + D.statTile('⏳', 'Payouts Pending', money(fin.payouts_pending), D.C.red)
      + D.statTile('✅', 'Payouts Paid', money(fin.payouts_paid), D.C.green)
      + D.placeholderTile('📥', 'Receivables')
      + D.placeholderTile('📤', 'Payables')
      + D.placeholderTile('🧾', 'GST')
      + D.placeholderTile('🧮', 'TDS')
      + D.placeholderTile('🏦', 'Bank Balance')
      + '</div></div>';

    // Alerts
    h += '<div class="ds-card">' + D.sectionTitle('🔔', 'Alerts');
    if (alerts.length) {
      h += alerts.map(function (a) {
        var icon = a.severity === 'high' ? '🔴' : a.severity === 'medium' ? '🟠' : '🟡';
        return '<div class="ds-alert ' + D.esc(a.severity) + '">' + icon + '<div>' + D.esc(a.message) + '</div></div>';
      }).join('');
    } else {
      h += '<div class="ds-sub">✅ No active alerts.</div>';
    }
    h += '</div>';

    h += '</div>'; // ds-wrap
    el.innerHTML = h;

    // ── Wire charts + interactions (after DOM exists) ─────────────────────────
    var mapInst = D.mountDistrictMap('ds-tn-map', districts, function (name) { drillDistrict(districts, name); });
    if (!mapInst) {
      // GeoJSON unavailable → replace map with a note; ranking list still shown.
      var mapEl = document.getElementById('ds-tn-map');
      if (mapEl) mapEl.innerHTML = '<div class="ds-sub" style="padding:24px;text-align:center">Map unavailable — see district ranking.</div>';
    }

    // Orders status pie
    D.mountChart('ds-orders-pie', D.pieOption([
      { name: 'Delivered', value: o.delivered || 0 },
      { name: 'Pending', value: o.pending || 0 },
      { name: 'Cancelled', value: o.cancelled || 0 },
      { name: 'Refunded', value: o.refunded || 0 },
    ], { donut: true }));

    // Category pie
    if (cats.length) {
      D.mountChart('ds-cat-pie', D.pieOption(cats.map(function (c) { return { name: c.name, value: c.revenue }; }),
        { fmt: function (v) { return money(v); } }));
    } else {
      var cp = document.getElementById('ds-cat-pie');
      if (cp) cp.innerHTML = '<div class="ds-sub" style="padding:24px;text-align:center">No category sales yet.</div>';
    }

    mountTrend(trend);

    // Refresh
    document.getElementById('ds-refresh').onclick = function () { renderExecutiveDashboard(el); };

    // Trend toggle
    Array.prototype.forEach.call(document.querySelectorAll('#ds-trend-seg button'), function (b) {
      b.onclick = function () { state.trend = b.getAttribute('data-v'); renderExecutiveDashboard(el); };
    });

    // District ranking clicks
    Array.prototype.forEach.call(document.querySelectorAll('#ds-rank li'), function (li) {
      li.onclick = function () { drillDistrict(districts, li.getAttribute('data-d')); };
    });
  }

  function mountTrend(trend) {
    var labels = trend.map(function (p) { return p.label; });
    var vals = trend.map(function (p) { return p.revenue; });
    D.mountChart('ds-trend', D.lineOption(labels, vals, { fmt: function (v) { return money(v); }, rotate: labels.length > 8 ? 30 : 0 }));
  }

  function drillDistrict(districts, name) {
    // name may be a geojson name; match against DB name or its alias.
    var d = districts.filter(function (x) {
      return x.district === name || x.district === 'Kanniyakumari' && name === 'Kanyakumari' || x.district === 'The Nilgiris' && name === 'Nilgiris';
    })[0];
    var box = document.getElementById('ds-drill');
    if (!box) return;
    if (!d) { box.innerHTML = '<div class="ds-drill">' + D.esc(name) + ' — no orders recorded yet.</div>'; return; }
    var rank = districts.indexOf(d) + 1;
    var label = d.status === 'green' ? 'Performing' : d.status === 'amber' ? 'Moderate' : 'Needs attention';
    box.innerHTML = '<div class="ds-drill"><strong>' + D.esc(d.district) + '</strong> · ' + label
      + '<br>Revenue: ' + money(d.revenue) + ' &nbsp;·&nbsp; Orders: ' + num(d.orders)
      + ' &nbsp;·&nbsp; Rank #' + rank + ' of ' + districts.length + '</div>';
    // highlight in list
    Array.prototype.forEach.call(document.querySelectorAll('#ds-rank li'), function (li) {
      li.classList.toggle('on', li.getAttribute('data-d') === d.district);
    });
  }

  function rankRow(d) {
    var color = d.status === 'green' ? '#5cb85c' : d.status === 'amber' ? '#e9c46a' : '#e07a68';
    return '<li data-d="' + D.esc(d.district) + '"><span class="ds-dot" style="background:' + color + '"></span>'
      + '<span class="r-name">' + D.esc(d.district) + '</span>'
      + '<span class="r-val">' + money(d.revenue) + ' · ' + num(d.orders) + '</span></li>';
  }

  function tileWithDelta(icon, label, pct) {
    if (pct == null) return D.statTile(icon, label, '—', D.C.gray, 'vs last month');
    var accent = pct >= 0 ? D.C.green : D.C.red;
    var txt = (pct >= 0 ? '▲ ' : '▼ ') + Math.abs(pct) + '%';
    return D.statTile(icon, label, txt, accent, 'vs last month');
  }

  function segBtn(v, label) {
    return '<button data-v="' + v + '"' + (state.trend === v ? ' class="on"' : '') + '>' + label + '</button>';
  }

  global.renderExecutiveDashboard = renderExecutiveDashboard;
})(window);
