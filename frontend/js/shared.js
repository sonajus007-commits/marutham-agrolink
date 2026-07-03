// ── Session ───────────────────────────────────────────────────────────────────
function getToken()  { return localStorage.getItem('ma_token'); }
function getUser()   { return JSON.parse(localStorage.getItem('ma_user') || 'null'); }
function setSession(token, user) {
  localStorage.setItem('ma_token', token);
  localStorage.setItem('ma_user', JSON.stringify(user));
}
function clearSession() {
  localStorage.removeItem('ma_token');
  localStorage.removeItem('ma_user');
}

// Redirect to login if no token or wrong role.
// expectedRole: 'consumer' | 'farmer' | 'admin' | 'agent' | null (any)
function requireAuth(expectedRole) {
  var token = getToken();
  var user  = getUser();
  if (!token || !user) { window.location.href = 'index.html'; return null; }
  if (expectedRole === 'agent') {
    // Both Delivery Agents and VCOs use agent.html
    if (user.role !== 'admin' || !['Delivery Agent', 'VCO'].includes(user.admin_role)) {
      window.location.href = 'index.html'; return null;
    }
  } else if (expectedRole && user.role !== expectedRole) {
    window.location.href = 'index.html'; return null;
  }
  return user;
}

function doLogout() {
  clearSession();
  window.location.href = 'index.html';
}

// ── Language toggle (used by all pages) ──────────────────────────────────────
var _appLang = localStorage.getItem('ma_lang') || 'en';
function setLang(lang, btn) {
  _appLang = lang;
  localStorage.setItem('ma_lang', lang);
  document.querySelectorAll('.lang-toggle button').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  document.querySelectorAll('[data-en]').forEach(function(el) {
    var t = el.getAttribute('data-' + lang);
    if (t) el.innerHTML = t;
  });
  document.documentElement.lang = lang;
}
function initLang() {
  var lang = _appLang;
  var btn = document.getElementById('lang-' + lang);
  if (btn) { btn.classList.add('active'); if (lang !== 'en') setLang(lang, btn); }
}

// ── Toast ─────────────────────────────────────────────────────────────────────
var _toastTimer = null;
function showToast(msg, type) {
  var el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'toast on ' + (type || 'ok');
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function() { el.classList.remove('on'); }, 3500);
}

// ── Live clock (IST) ─────────────────────────────────────────────────────────
function startClock(elId) {
  function tick() {
    var el = document.getElementById(elId);
    if (!el) return;
    var ist = new Date(Date.now() + 5.5 * 3600000);
    var h = ist.getUTCHours(), m = ist.getUTCMinutes(), s = ist.getUTCSeconds();
    var ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    el.textContent = ('0'+h).slice(-2) + ':' + ('0'+m).slice(-2) + ':' + ('0'+s).slice(-2) + ' ' + ampm + ' IST';
  }
  tick();
  setInterval(tick, 1000);
}

// ── Money formatting ──────────────────────────────────────────────────────────
// Backend returns money as strings like "52.50" (already converted from paise by middleware)
function fmt(val) {
  var n = parseFloat(val);
  if (isNaN(n)) return '—';
  return '₹' + n.toFixed(2).replace(/\.00$/, '');
}

// ── Input helpers ─────────────────────────────────────────────────────────────
function numOnly(el)  { el.value = el.value.replace(/[^0-9]/g, ''); }
function alphaOnly(el){ el.value = el.value.replace(/[^a-zA-Z\s]/g, ''); }
function isValidEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e); }
function isStrongPw(pw) {
  return pw.length >= 8 && /[A-Z]/.test(pw) && /[0-9]/.test(pw) && /[@#$!%*&^()_\-+=]/.test(pw);
}
function showErr(id, msg) {
  var el = document.getElementById(id);
  if (!el) return;
  if (msg) el.textContent = msg;
  el.classList.add('on');
}
function hideErr(id) {
  var el = document.getElementById(id);
  if (el) el.classList.remove('on');
}
function gv(id) {
  var el = document.getElementById(id);
  return el ? el.value.trim() : '';
}
function sv(id, val) {
  var el = document.getElementById(id);
  if (el) el.value = val;
}

// ── Password eye toggle ───────────────────────────────────────────────────────
function togglePw(inputId, btn) {
  var inp = document.getElementById(inputId);
  if (!inp) return;
  if (inp.type === 'password') { inp.type = 'text'; btn.innerHTML = '🙈'; }
  else                         { inp.type = 'password'; btn.innerHTML = '👁'; }
}

// ── Password strength checker ─────────────────────────────────────────────────
var _pwRuleIds = {};
function registerPwRules(inputId, ruleIds) { _pwRuleIds[inputId] = ruleIds; }
function checkPw(inputId) {
  var pw   = document.getElementById(inputId).value;
  var ids  = _pwRuleIds[inputId];
  if (!ids) return;
  var ok   = [pw.length >= 8, /[A-Z]/.test(pw), /[0-9]/.test(pw), /[@#$!%*&^()_\-+=]/.test(pw)];
  ids.forEach(function(id, i) {
    var el = document.getElementById(id);
    if (el) el.classList.toggle('ok', ok[i]);
  });
}

// ── Tab notification badges ───────────────────────────────────────────────────
function setTabBadge(tabId, count) {
  var btn = document.getElementById(tabId);
  if (!btn) return;
  var badge = btn.querySelector('.tab-badge');
  if (count > 0) {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'tab-badge';
      badge.style.cssText = 'background:#c0392b;color:#fff;font-size:9px;font-weight:800;' +
        'padding:1px 5px;border-radius:50px;vertical-align:middle;margin-left:4px;' +
        'min-width:16px;display:inline-block;text-align:center;line-height:14px';
      btn.appendChild(badge);
    }
    badge.textContent = count > 99 ? '99+' : String(count);
  } else {
    if (badge) badge.remove();
  }
}

// ── Tab switcher ─────────────────────────────────────────────────────────────
function switchPanel(panelId, tabEl, containerSel) {
  var container = document.querySelector(containerSel || 'body');
  container.querySelectorAll('.panel').forEach(function(p) { p.classList.remove('on'); });
  container.querySelectorAll('.ptab').forEach(function(t) { t.classList.remove('on'); });
  var panel = document.getElementById(panelId);
  if (panel) panel.classList.add('on');
  if (tabEl) tabEl.classList.add('on');
}

// ── Date helpers ──────────────────────────────────────────────────────────────
function fmtDate(isoStr) {
  if (!isoStr) return '—';
  var d = new Date(isoStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit' });
}
function fmtDateShort(isoStr) {
  if (!isoStr) return '—';
  var d = new Date(isoStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Order status colour ───────────────────────────────────────────────────────
function statusColor(status) {
  var map = {
    'Order Placed': '#f4a261', 'Packaged': '#e9c46a', 'VCO Verified': '#52b788',
    'Picked Up': '#2d6a4f', 'Out for Delivery': '#1a7a4a', 'Delivered': '#155e38',
    'In Transit': '#3a86ff', 'At Hub': '#8338ec', 'Cancelled': '#c0392b'
  };
  return map[status] || '#5a6472';
}

// ── CSV export ───────────────────────────────────────────────────────────────
function downloadCSV(filename, headers, rows) {
  var lines = [headers];
  rows.forEach(function(r) {
    lines.push(r.map(function(v) {
      var s = (v === null || v === undefined) ? '' : String(v);
      return (s.indexOf(',') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0)
        ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(','));
  });
  var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Address builder ───────────────────────────────────────────────────────────
function buildAddress(u) {
  return [u.house_no, u.street1, u.street2, u.landmark, u.village_town,
          u.city, u.district, u.pincode, u.state]
    .filter(Boolean).join(', ');
}

// ── Order pipeline (unified tracker) ──────────────────────────────────────────
// One consistent flow for every order: Order Placed → Delivered. Hub-only stages
// (In Transit, At Hub) are shown for direct orders too, but marked "skipped" and
// bypassed with an arrow so the jump Picked Up → Out for Delivery is visible.
var PIPELINE_STAGES   = ['Order Placed','Packaged','VCO Verified','Picked Up','In Transit','At Hub','Out for Delivery','Delivered'];
var PIPELINE_HUB_ONLY = { 'In Transit': true, 'At Hub': true };

// Build node states from the order's route + current status label.
function buildPipeline(route, currentStatus) {
  var isDirect = (route !== 'hub');
  var curIdx   = PIPELINE_STAGES.indexOf(currentStatus);
  return PIPELINE_STAGES.map(function(label, i) {
    var skipped = isDirect && !!PIPELINE_HUB_ONLY[label];
    var status;
    if (skipped)            status = 'skipped';
    else if (curIdx < 0)    status = 'pending';
    else if (i < curIdx)    status = 'done';
    else if (i === curIdx)  status = 'active';
    else                    status = 'pending';
    return { label: label, status: status, skipped: skipped };
  });
}

// Colour of the connector segment between node i and i+1.
function _pipeGap(nodes, i) {
  var a = nodes[i], b = nodes[i + 1];
  if (a.skipped || b.skipped) return 'dash';
  if (b.status === 'done' || b.status === 'active') return 'green';
  return 'grey';
}
function _pipeConn(kind) {
  if (kind === 'green') return '<div style="flex:1;height:2px;background:#1a7a4a"></div>';
  if (kind === 'dash')  return '<div style="flex:1;height:0;border-top:2px dashed #cbd5e1"></div>';
  return '<div style="flex:1;height:2px;background:#e2e8f0"></div>';
}

// Render the whole tracker widget (horizontally scrollable, fixed node width so
// the bypass arc aligns). `opts.activeColor` overrides the "current step" colour.
function renderPipelineHTML(nodes, opts) {
  opts = opts || {};
  var NODE_W = 66, activeColor = opts.activeColor || '#f4a261';
  var N = nodes.length, totalW = N * NODE_W;

  // contiguous skipped span (single run expected: In Transit + At Hub)
  var s = -1, e = -1;
  for (var k = 0; k < N; k++) { if (nodes[k].skipped) { if (s < 0) s = k; e = k; } }
  var hasSkip = s > 0 && e >= 0 && e < N - 1;

  var html = '<div style="overflow-x:auto;-webkit-overflow-scrolling:touch">';
  html += '<div style="position:relative;width:' + totalW + 'px;min-width:' + totalW + 'px">';

  html += '<div style="display:flex">';
  nodes.forEach(function(node, i) {
    var done = node.status === 'done', active = node.status === 'active', skipped = node.status === 'skipped';
    // Delivered is the terminal success state — show it green (done-style), not orange.
    var green = done || (active && node.label === 'Delivered');
    var dotBg = green ? '#1a7a4a' : active ? activeColor : '#e2e8f0';
    var dotBd = green ? '#1a7a4a' : active ? activeColor : '#cbd5e1';
    var lblCl = green ? '#1a7a4a' : active ? activeColor : '#94a3b8';
    var glow  = green && active ? 'box-shadow:0 0 0 4px rgba(26,122,74,.22);'
              : active          ? 'box-shadow:0 0 0 4px rgba(244,162,97,.22);' : '';

    html += '<div style="width:' + NODE_W + 'px;display:flex;flex-direction:column;align-items:center;flex-shrink:0">';
    html += '<div style="display:flex;align-items:center;width:100%;height:22px">';
    html += (i > 0) ? _pipeConn(_pipeGap(nodes, i - 1)) : '<div style="flex:1"></div>';
    html += '<div style="width:20px;height:20px;border-radius:50%;background:' + dotBg + ';border:2px ' + (skipped ? 'dashed' : 'solid') + ' ' + dotBd + ';display:flex;align-items:center;justify-content:center;flex-shrink:0;' + (skipped ? 'opacity:.55;' : '') + glow + '">';
    html += green ? '<span style="font-size:10px;color:#fff">✓</span>' : (active ? '<span style="font-size:7px;color:#fff">●</span>' : '');
    html += '</div>';
    html += (i < N - 1) ? _pipeConn(_pipeGap(nodes, i)) : '<div style="flex:1"></div>';
    html += '</div>';
    html += '<div style="font-size:8px;text-align:center;margin-top:5px;color:' + lblCl + ';font-weight:' + (active ? '700' : '400') + ';line-height:1.25;max-width:' + (NODE_W - 4) + 'px;' + (skipped ? 'text-decoration:line-through;opacity:.7;' : '') + '">' + node.label + '</div>';
    html += '</div>';
  });
  html += '</div>'; // node row

  // Bottom bypass arc: an under-connector from the node before the skipped span
  // to the node after it (Picked Up → Out for Delivery). Reads cleaner than a jump-over.
  if (hasSkip) {
    var x1 = (s - 1) * NODE_W + NODE_W / 2;   // centre of node before the span
    var x2 = (e + 1) * NODE_W + NODE_W / 2;   // centre of node after the span
    var midX = (x1 + x2) / 2, depth = 20;
    // Orthogonal bracket: down from Picked Up, horizontal across, up into Out for Delivery.
    html += '<svg width="' + totalW + '" height="30" style="display:block;overflow:visible;margin-top:2px">';
    html += '<path d="M ' + x1 + ' 1 L ' + x1 + ' ' + depth + ' L ' + x2 + ' ' + depth + ' L ' + x2 + ' 8" fill="none" stroke="#94a3b8" stroke-width="2" stroke-dasharray="4 3"/>';
    html += '<path d="M ' + (x2 - 4) + ' 8 L ' + (x2 + 4) + ' 8 L ' + x2 + ' 1 Z" fill="#94a3b8"/>';
    html += '<text x="' + midX + '" y="' + (depth + 8) + '" text-anchor="middle" font-size="8" fill="#94a3b8" font-weight="700">skips ahead</text>';
    html += '</svg>';
  }

  html += '</div></div>';
  return html;
}
