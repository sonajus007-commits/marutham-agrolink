/* ============================================================================
 * dashboard/common.js — shared building blocks for the role-based dashboards.
 * Requires: js/vendor/echarts.min.js and (for the map) js/vendor/tamilnadu-districts.geojson.js
 * Uses the Marutham palette from css/app.css. No external/CDN dependencies.
 * ========================================================================== */
(function (global) {
  'use strict';

  // ── Brand palette (mirrors css/app.css :root tokens) ──────────────────────
  var C = {
    forest: '#1a3d2b', leaf: '#4E9F3D', sage: '#74C25C', mint: '#A8D5A2',
    gold:   '#d4a843', bloom: '#CB4E86', sun: '#f4a261',
    green:  '#1a7a4a', amber: '#d4a843', red: '#c0392b',
    gray:   '#5a6472', grid: '#e6efe6', text: '#1c2820',
  };
  // Categorical series palette (distinct, brand-anchored).
  var SERIES = [C.leaf, C.gold, C.bloom, C.sun, C.sage, C.forest, '#3b82c4', '#9c6ade'];

  // Live ECharts instances keyed by container id, so re-renders can dispose cleanly.
  var charts = {};

  function disposeAll() {
    Object.keys(charts).forEach(function (id) {
      try { charts[id].dispose(); } catch (e) {}
      delete charts[id];
    });
    global.removeEventListener('resize', resizeAll);
  }
  function resizeAll() {
    Object.keys(charts).forEach(function (id) { try { charts[id].resize(); } catch (e) {} });
  }

  // Create (or replace) a chart in the given element and apply the option.
  function mountChart(elId, option) {
    var el = document.getElementById(elId);
    if (!el || !global.echarts) return null;
    if (charts[elId]) { try { charts[elId].dispose(); } catch (e) {} }
    var inst = global.echarts.init(el, null, { renderer: 'svg' });
    inst.setOption(option);
    charts[elId] = inst;
    global.addEventListener('resize', resizeAll);
    return inst;
  }

  var baseGrid = { left: 8, right: 12, top: 24, bottom: 8, containLabel: true };
  var axisText = { color: C.gray, fontSize: 11 };

  // ── Chart option builders ─────────────────────────────────────────────────
  function barOption(labels, values, opts) {
    opts = opts || {};
    return {
      color: [opts.color || C.leaf],
      grid: baseGrid,
      tooltip: { trigger: 'axis', valueFormatter: opts.fmt },
      xAxis: { type: 'category', data: labels, axisLabel: Object.assign({ interval: 0, rotate: opts.rotate || 0 }, axisText), axisTick: { show: false }, axisLine: { lineStyle: { color: C.grid } } },
      yAxis: { type: 'value', axisLabel: axisText, splitLine: { lineStyle: { color: C.grid } } },
      series: [{ type: 'bar', data: values, barMaxWidth: 34, itemStyle: { borderRadius: [5, 5, 0, 0] }, label: opts.showLabel ? { show: true, position: 'top', color: C.gray, fontSize: 10, formatter: opts.fmt } : undefined }],
    };
  }

  function lineOption(labels, values, opts) {
    opts = opts || {};
    return {
      color: [opts.color || C.forest],
      grid: baseGrid,
      tooltip: { trigger: 'axis', valueFormatter: opts.fmt },
      xAxis: { type: 'category', boundaryGap: false, data: labels, axisLabel: Object.assign({ interval: 'auto', rotate: opts.rotate || 0 }, axisText), axisTick: { show: false }, axisLine: { lineStyle: { color: C.grid } } },
      yAxis: { type: 'value', axisLabel: axisText, splitLine: { lineStyle: { color: C.grid } } },
      series: [{ type: 'line', data: values, smooth: true, showSymbol: true, symbolSize: 6, lineStyle: { width: 3 }, areaStyle: { opacity: 0.12 } }],
    };
  }

  function pieOption(pairs, opts) {
    opts = opts || {};
    return {
      color: SERIES,
      tooltip: { trigger: 'item', valueFormatter: opts.fmt },
      legend: { type: 'scroll', bottom: 0, textStyle: axisText, itemWidth: 10, itemHeight: 10 },
      series: [{
        type: 'pie', radius: opts.donut ? ['45%', '70%'] : '68%', center: ['50%', '44%'],
        avoidLabelOverlap: true, itemStyle: { borderColor: '#fff', borderWidth: 2 },
        label: { show: false }, labelLine: { show: false },
        data: pairs.map(function (p) { return { name: p.name, value: p.value }; }),
      }],
    };
  }

  // Grouped bars: districts revenue + orders on twin axes (for comparisons).
  function comboBarOption(labels, seriesA, seriesB, opts) {
    opts = opts || {};
    return {
      color: [C.leaf, C.gold],
      grid: baseGrid,
      tooltip: { trigger: 'axis' },
      legend: { top: 0, textStyle: axisText, itemWidth: 12, itemHeight: 8 },
      xAxis: { type: 'category', data: labels, axisLabel: Object.assign({ interval: 0, rotate: opts.rotate || 40 }, axisText), axisTick: { show: false }, axisLine: { lineStyle: { color: C.grid } } },
      yAxis: [
        { type: 'value', name: seriesA.name, nameTextStyle: axisText, axisLabel: axisText, splitLine: { lineStyle: { color: C.grid } } },
        { type: 'value', name: seriesB.name, nameTextStyle: axisText, axisLabel: axisText, splitLine: { show: false } },
      ],
      series: [
        { name: seriesA.name, type: 'bar', data: seriesA.data, barMaxWidth: 22, itemStyle: { borderRadius: [4, 4, 0, 0] } },
        { name: seriesB.name, type: 'bar', yAxisIndex: 1, data: seriesB.data, barMaxWidth: 22, itemStyle: { borderRadius: [4, 4, 0, 0] } },
      ],
    };
  }

  // ── Tamil Nadu district map ───────────────────────────────────────────────
  var mapReady = false;
  // DB district name → GeoJSON district name (geojson uses 2011-census spellings).
  var DIST_ALIAS = { 'Kanniyakumari': 'Kanyakumari', 'The Nilgiris': 'Nilgiris' };
  var STATUS_COLOR = { green: '#5cb85c', amber: '#e9c46a', red: '#e07a68' };

  function ensureTNMap() {
    if (mapReady || !global.echarts || !global.TN_DISTRICTS_GEOJSON) return mapReady;
    global.echarts.registerMap('tamilnadu', global.TN_DISTRICTS_GEOJSON);
    mapReady = true;
    return true;
  }

  // districts: [{ district, revenue, orders, status }]. onClick(name) optional.
  function mountDistrictMap(elId, districts, onClick) {
    if (!ensureTNMap()) return null;  // caller falls back to ranking list
    var byName = {};
    districts.forEach(function (d) {
      var gname = DIST_ALIAS[d.district] || d.district;
      byName[gname] = d;
    });
    var data = Object.keys(byName).map(function (gname) {
      var d = byName[gname];
      return { name: gname, value: d.revenue, orders: d.orders, itemStyle: { areaColor: STATUS_COLOR[d.status] || '#cbd5c0' } };
    });
    var option = {
      tooltip: {
        trigger: 'item',
        formatter: function (p) {
          if (!p.data) return p.name + '<br/>No data';
          return '<strong>' + p.name + '</strong><br/>Revenue: ₹' + (p.data.value || 0) + '<br/>Orders: ' + (p.data.orders || 0);
        },
      },
      series: [{
        type: 'map', map: 'tamilnadu', nameProperty: 'district', roam: true,
        emphasis: { label: { show: false }, itemStyle: { areaColor: C.gold } },
        itemStyle: { areaColor: '#eef4ea', borderColor: '#cfe0c8', borderWidth: 0.6 },
        select: { itemStyle: { areaColor: C.sage } },
        data: data,
      }],
    };
    var inst = mountChart(elId, option);
    if (inst && onClick) inst.on('click', function (params) { onClick(params.name); });
    return inst;
  }

  // ── HTML tile helpers ─────────────────────────────────────────────────────
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  // Live stat tile.
  function statTile(icon, label, value, accent, sub) {
    accent = accent || C.forest;
    return '<div class="ds-tile" style="border-top-color:' + accent + '">' +
      '<div class="ds-tile-top"><span class="ds-tile-icon">' + icon + '</span>' +
      (sub ? '<span class="ds-tile-sub">' + esc(sub) + '</span>' : '') + '</div>' +
      '<div class="ds-tile-val" style="color:' + accent + '">' + esc(value) + '</div>' +
      '<div class="ds-tile-lbl">' + esc(label) + '</div></div>';
  }

  // Greyed placeholder tile — never shows fabricated numbers.
  function placeholderTile(icon, label) {
    return '<div class="ds-tile ds-tile--ph">' +
      '<div class="ds-tile-top"><span class="ds-tile-icon">' + icon + '</span>' +
      '<span class="ds-ph-badge">Needs integration</span></div>' +
      '<div class="ds-tile-val ds-ph-val">—</div>' +
      '<div class="ds-tile-lbl">' + esc(label) + '</div></div>';
  }

  // Inject shared dashboard styles once (ds-* classes used by all profiles).
  function ensureStyles() {
    if (document.getElementById('ds-styles')) return;
    var css = ''
      + '.ds-wrap{display:flex;flex-direction:column;gap:16px}'
      + '.ds-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}'
      + '.ds-head h2{font-size:19px;color:var(--forest);font-weight:800}'
      + '.ds-head .ds-sub{font-size:12px;color:var(--gray)}'
      + '.ds-sub{font-size:12px;color:var(--gray)}'
      + '.ds-btn{padding:7px 14px;background:#f0faf4;border:1.5px solid #c3e6cb;border-radius:10px;font-size:12px;font-weight:700;color:var(--forest);cursor:pointer;font-family:inherit}'
      + '.ds-btn:hover{background:#e3f4ea}'
      + '.ds-seg{display:inline-flex;background:#eef4ea;border-radius:9px;padding:3px}'
      + '.ds-seg button{border:none;background:none;padding:5px 12px;font-size:12px;font-weight:700;color:var(--gray);cursor:pointer;border-radius:7px;font-family:inherit}'
      + '.ds-seg button.on{background:var(--forest);color:#fff}'
      + '.ds-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px}'
      + '.ds-tile{background:#fff;border:1px solid var(--border);border-top:3px solid var(--forest);border-radius:12px;padding:13px 14px;box-shadow:var(--shadow)}'
      + '.ds-tile-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}'
      + '.ds-tile-icon{font-size:17px}.ds-tile-sub{font-size:11px}'
      + '.ds-tile-val{font-size:22px;font-weight:800;line-height:1.1;word-break:break-word}'
      + '.ds-tile-lbl{font-size:11px;color:var(--gray);margin-top:3px;font-weight:600}'
      + '.ds-tile--ph{border-top-color:#d4dbd2;background:repeating-linear-gradient(135deg,#fafbfa,#fafbfa 10px,#f4f6f4 10px,#f4f6f4 20px)}'
      + '.ds-ph-badge{font-size:9px;font-weight:700;color:#94a3b8;background:#eef1ee;border:1px solid #dde3dd;border-radius:20px;padding:2px 7px;text-transform:uppercase;letter-spacing:.3px}'
      + '.ds-ph-val{color:#b6c0b6 !important}'
      + '.ds-card{background:#fff;border:1px solid var(--border);border-radius:14px;padding:16px;box-shadow:var(--shadow)}'
      + '.ds-sec-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}'
      + '.ds-sec-head h3{font-size:14px;color:var(--forest);font-weight:800}'
      + '.ds-chart{width:100%;height:260px}.ds-chart-sm{width:100%;height:210px}.ds-map{width:100%;height:420px}'
      + '.ds-two{display:grid;grid-template-columns:1.3fr 1fr;gap:16px}'
      + '@media(max-width:820px){.ds-two{grid-template-columns:1fr}}'
      + '.ds-legend{display:flex;gap:14px;flex-wrap:wrap;font-size:11px;color:var(--gray);margin-top:8px}'
      + '.ds-legend span{display:inline-flex;align-items:center;gap:5px}'
      + '.ds-dot{width:10px;height:10px;border-radius:50%;display:inline-block}'
      + '.ds-rank{list-style:none;display:flex;flex-direction:column;gap:7px;max-height:360px;overflow:auto}'
      + '.ds-rank li{display:flex;align-items:center;gap:9px;font-size:12px;cursor:pointer;padding:6px 8px;border-radius:8px}'
      + '.ds-rank li:hover,.ds-rank li.on{background:#f0faf4}'
      + '.ds-rank .r-name{flex:1;font-weight:600;color:var(--text)}.ds-rank .r-val{color:var(--gray)}'
      + '.ds-top{list-style:none;display:flex;flex-direction:column;gap:9px}'
      + '.ds-top li{display:flex;align-items:center;gap:10px;font-size:12px}'
      + '.ds-top .t-rank{width:20px;height:20px;border-radius:50%;background:var(--forest);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0}'
      + '.ds-alert{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-radius:10px;font-size:12px;margin-bottom:8px}'
      + '.ds-alert.high{background:#fef2f2;border:1px solid #fca5a5;color:#b91c1c}'
      + '.ds-alert.medium{background:#fffbeb;border:1px solid #fcd34d;color:#92400e}'
      + '.ds-alert.low{background:#f8fafc;border:1px solid #e2e8f0;color:var(--gray)}'
      + '.ds-drill{margin-top:10px;background:#f0faf4;border:1px solid #c3e6cb;border-radius:10px;padding:11px 13px;font-size:12px;color:var(--text)}'
      // operations quick-actions
      + '.ops-actions{display:flex;flex-wrap:wrap;gap:10px}'
      + '.ops-act{position:relative;display:inline-flex;align-items:center;gap:6px;padding:10px 16px;background:#f0faf4;border:1.5px solid #c3e6cb;border-radius:11px;font-size:13px;font-weight:700;color:var(--forest);cursor:pointer;font-family:inherit}'
      + '.ops-act:hover{background:#e3f4ea}'
      + '.ops-act--ph{background:#f6f7f6;border-color:#e2e6e2;color:#9aa59a;cursor:not-allowed}'
      + '.ops-badge{background:var(--red,#c0392b);color:#fff;border-radius:20px;font-size:11px;font-weight:700;padding:1px 7px;margin-left:2px}';
    var st = document.createElement('style');
    st.id = 'ds-styles'; st.textContent = css;
    document.head.appendChild(st);
  }

  function sectionTitle(icon, text, right) {
    return '<div class="ds-sec-head"><h3>' + icon + ' ' + esc(text) + '</h3>' +
      (right ? '<div class="ds-sec-right">' + right + '</div>' : '') + '</div>';
  }

  // Delta chip for growth %.
  function deltaChip(pct) {
    if (pct == null) return '';
    var up = pct >= 0;
    var col = up ? C.green : C.red;
    return '<span style="color:' + col + ';font-weight:700;font-size:12px">' + (up ? '▲ ' : '▼ ') + Math.abs(pct) + '%</span>';
  }

  global.Dash = {
    C: C, esc: esc,
    mountChart: mountChart, disposeAll: disposeAll,
    barOption: barOption, lineOption: lineOption, pieOption: pieOption, comboBarOption: comboBarOption,
    mountDistrictMap: mountDistrictMap, ensureTNMap: ensureTNMap,
    statTile: statTile, placeholderTile: placeholderTile, sectionTitle: sectionTitle, deltaChip: deltaChip,
    ensureStyles: ensureStyles,
  };
})(window);
