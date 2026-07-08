/* ============================================================================
 * dashboard/field.js — Field-worker dashboard for agent.html (mobile-first).
 * Two layouts: VCO (village collections) and Delivery Agent (delivery run).
 * Tile-based, no ECharts (keeps the mobile field app light). Reuses window.Dash
 * tile helpers + a compact field-specific grid. Entry: renderFieldDashboard(el).
 * ========================================================================== */
(function (global) {
  'use strict';
  var D = global.Dash;

  function money(n) { return '₹' + Number(n || 0).toLocaleString('en-IN'); }
  function num(n) { return Number(n || 0).toLocaleString('en-IN'); }

  function ensureFieldStyles() {
    if (D && D.ensureStyles) D.ensureStyles();
    if (document.getElementById('fd-styles')) return;
    var css = ''
      + '#fieldDashboard{margin-bottom:16px}'
      + '.fd-card{background:#fff;border:1px solid var(--border,#BFE0B5);border-radius:14px;padding:14px;box-shadow:var(--shadow,0 2px 16px rgba(26,61,43,.09))}'
      + '.fd-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}'
      + '.fd-head h3{font-size:14px;color:var(--forest);font-weight:800}'
      + '.fd-head .fd-sub{font-size:11px;color:var(--gray)}'
      + '.fd-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}'
      + '@media(max-width:360px){.fd-grid{grid-template-columns:repeat(2,1fr)}}'
      + '.fd-grid .ds-tile{padding:11px 12px}.fd-grid .ds-tile-val{font-size:19px}'
      + '.fd-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}'
      + '.fd-act{flex:1 1 30%;min-width:92px;display:inline-flex;flex-direction:column;align-items:center;gap:3px;padding:10px 6px;background:#f0faf4;border:1.5px solid #c3e6cb;border-radius:11px;font-size:11px;font-weight:700;color:var(--forest);cursor:pointer;font-family:inherit;text-align:center}'
      + '.fd-act:hover{background:#e3f4ea}.fd-act:disabled{background:#f6f7f6;border-color:#e2e6e2;color:#9aa59a;cursor:not-allowed}'
      + '.fd-act .fd-ai{font-size:19px}'
      + '.fd-refresh{padding:5px 11px;background:#f0faf4;border:1.5px solid #c3e6cb;border-radius:9px;font-size:11px;font-weight:700;color:var(--forest);cursor:pointer;font-family:inherit}';
    var st = document.createElement('style');
    st.id = 'fd-styles'; st.textContent = css;
    document.head.appendChild(st);
  }

  function renderFieldDashboard(el) {
    if (!el) return;
    ensureFieldStyles();
    API.getFieldDashboard()
      .then(function (r) { r.role === 'VCO' ? paintVCO(el, r) : paintAgent(el, r); })
      .catch(function (e) {
        el.innerHTML = '<div class="fd-card"><div class="fd-sub">Could not load dashboard: ' + D.esc(e.message) + '</div></div>';
      });
  }

  // ── VCO ───────────────────────────────────────────────────────────────────
  function paintVCO(el, r) {
    var s = r.stats || {}, sc = r.scope || {};
    var h = '<div class="fd-card">';
    h += '<div class="fd-head"><div><h3>🌾 My Village — ' + D.esc(sc.name || '') + '</h3>'
      + '<div class="fd-sub">Collections · live · ' + new Date(r.generated_at).toLocaleTimeString('en-IN') + '</div></div>'
      + '<button class="fd-refresh" onclick="loadFieldDashboard()">↻</button></div>';

    h += '<div class="fd-grid">';
    h += D.statTile('🧺', "Today's Collections", num(s.collections_today), D.C.forest);
    h += D.statTile('🚶', 'Farmers to Visit', num(s.farmers_to_visit), D.C.gold);
    h += D.statTile('✅', 'Products Collected', num(s.products_collected), D.C.green);
    h += D.statTile('⏳', 'Pending Collection', num(s.pending_collection), D.C.gold);
    h += D.statTile('❌', 'Rejected Produce', num(s.rejected_produce), D.C.red);
    h += D.statTile('↩️', 'Returns Pending', num(s.returns_pending), D.C.bloom);
    h += D.statTile('💸', 'Farmer Payments', num(s.farmer_payments), D.C.red, money(s.farmer_payments_amount));
    h += D.statTile('🧑‍🌾', 'Farmers', num(s.farmers_registered), D.C.forest, s.farmers_pending ? s.farmers_pending + ' pending' : null);
    h += D.placeholderTile('🗓️', "Today's Schedule");
    h += D.placeholderTile('🛰️', 'GPS Route');
    h += D.placeholderTile('💰', 'Daily Earnings');
    h += '</div>';

    h += '<div class="fd-actions">'
      + actBtn('📥', 'Collect Produce', true)
      + actBtn('📷', 'Scan QR', typeof scanFromBar === 'function', 'document.getElementById(\'scanInput\').focus()')
      + actBtn('💵', 'Farmer Payment', true)
      + actBtn('🖼️', 'Upload Photos', true)
      + actBtn('➕', 'Create Farmer', true)
      + actBtn('⚠️', 'Report Issue', true)
      + '</div>';
    h += '</div>';
    el.innerHTML = h;
  }

  // ── Delivery Agent ────────────────────────────────────────────────────────
  function paintAgent(el, r) {
    var s = r.stats || {};
    var h = '<div class="fd-card">';
    h += '<div class="fd-head"><div><h3>🛵 My Delivery Run</h3>'
      + '<div class="fd-sub">Today · live · ' + new Date(r.generated_at).toLocaleTimeString('en-IN') + '</div></div>'
      + '<button class="fd-refresh" onclick="loadFieldDashboard()">↻</button></div>';

    h += '<div class="fd-grid">';
    h += D.statTile('📦', "Today's Deliveries", num(s.deliveries_today), D.C.forest);
    h += D.statTile('✅', 'Completed', num(s.completed_today), D.C.green, 'today');
    h += D.statTile('⏳', 'Pending', num(s.pending), D.C.gold);
    h += D.statTile('❌', 'Failed', num(s.failed), D.C.red);
    h += D.statTile('💵', 'COD (today)', money(s.cod_amount), D.C.forest);
    h += D.statTile('💳', 'Digital (today)', money(s.digital_amount), D.C.leaf);
    h += D.statTile('⭐', 'Customer Rating', s.customer_rating != null ? s.customer_rating : '—', D.C.gold);
    h += D.placeholderTile('🧭', 'Distance');
    h += D.placeholderTile('💰', 'Daily Earnings');
    h += D.placeholderTile('⛽', 'Fuel Allowance');
    h += '</div>';

    h += '<div class="fd-sub" style="margin-top:10px">🧭 Navigation & 🔐 OTP verification happen per-order in your queue below.</div>';
    h += '</div>';
    el.innerHTML = h;
  }

  // Quick-action button. `enabled` false → greyed "soon". `onclick` optional JS.
  function actBtn(icon, label, enabled, onclick) {
    if (enabled && onclick) {
      return '<button class="fd-act" onclick="' + onclick + '"><span class="fd-ai">' + icon + '</span>' + D.esc(label) + '</button>';
    }
    // No wired handler yet → show as coming soon (honest; no fake actions).
    return '<button class="fd-act" disabled><span class="fd-ai">' + icon + '</span>' + D.esc(label) + '<span class="ds-ph-badge" style="margin-top:2px">soon</span></button>';
  }

  global.renderFieldDashboard = renderFieldDashboard;
})(window);
