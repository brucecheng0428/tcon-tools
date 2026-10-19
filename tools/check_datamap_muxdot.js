#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   check_datamap_muxdot.js — datamap v1.35.32 ③ TFT 接線圖「接點／跨線」幾何檢查（派工 237944910970998784）
   Bruce 10/19 22:3x「通常畫點代表這個地方有三個方向的岔路才會畫…上面 Mux 那邊的點，有些只是一個轉折就畫點，反而三叉路的地方沒有畫點。
   另外，在 Mux 那邊的畫法，應該也要保留垂直線。要跨過水平線的地方要用弧形，就跟下面 TFT 的做法是一樣的」。
   不看程式內部，直接解析畫出來的 SVG（line／path 的 M V H A），整張圖（MUX 區＋TFT 區）逐點檢查：
     A  每個實心點（circle r＜6，不含衝突「!」）所在位置相連方向數 ≥ 3（線段端點＝1、從中間穿過＝2）。
     B  每個相連方向數 ≥ 3 的點都有實心點（三叉沒畫點＝錯）。
     C  水平線與垂直線「兩邊都從中間穿過」的不相連交叉一律要有弧形（沒有弧形的直接十字交叉＝錯）；並統計弧形數。
     D  不同的線不可以在同一條直線上重疊（例：腳位垂直線和別的腳位的 Data 線疊在一起）。
   不算接線的：TFT 符號的 gate 板／通道短線（水平 14px、粗 2）、主循環分隔線（data-sep）、標頭線（y＝18）。
   組合：MNT（EM01／EM02／E512）＋NB（E503／E501A／E501B／DAZ6138／DAZ6139）Auto LTPS sub 0～7（MUX2／MUX3 × normal／zigzag × TYPE 1／2）× Mirror 0／1 × CH1 左／右，
         EN01 Hand MUX2／MUX3（TYPE 1／2）、MUX4、MUX6（TYPE 1／2）× Mirror × CH1 左／右；另抽 Single／Dual（MNT、NB、EN01）確認 TFT 區同一套規則。
   用法：node tools/check_datamap_muxdot.js [repo]
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path');
const ROOT = path.resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(__dirname, '..'));
const DM = require(path.join(ROOT, 'common/datamap-core.js')); global.TCONDataMap = DM;
global.TCONDataMapLOD = require(path.join(ROOT, 'common/datamap-lod.js'));
require(path.join(ROOT, 'common/datamap-auto.js'));
let pass = 0, fail = 0; const fails = [], sum = [], skip = [];
const ok = (c, m) => { if (c) pass++; else { fail++; if (fails.length < 60) fails.push(m); } };
const E = 0.6;

function geom(svg) {
  const segs = [], dots = [], arcs = []; let eid = 0;
  const all = svg.querySelectorAll('line, path, circle');
  all.forEach(e => {
    const tg = e.tagName.toLowerCase(); eid++;
    if (tg === 'circle') { const r = +e.getAttribute('r'); if (r < 6 && !e.hasAttribute('data-bad')) dots.push({ x: +e.getAttribute('cx'), y: +e.getAttribute('cy'), e }); return; }
    if (e.closest('defs')) return;
    if (tg === 'line') {
      if (e.hasAttribute('data-sep')) return;
      const x1 = +e.getAttribute('x1'), y1 = +e.getAttribute('y1'), x2 = +e.getAttribute('x2'), y2 = +e.getAttribute('y2');
      if (y1 === 18 && y2 === 18) return;                                                     // 標頭線
      if (y1 === y2 && Math.abs(x2 - x1) === 14 && +e.getAttribute('stroke-width') === 2) return;   // TFT 符號（gate 板／通道）
      push(x1, y1, x2, y2, eid, e); return;
    }
    const d = e.getAttribute('d') || '', tk = d.match(/[MVHA]|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
    let i = 0, cx = 0, cy = 0, cmd = '';
    while (i < tk.length) {
      if (/[MVHA]/.test(tk[i])) cmd = tk[i++];
      if (cmd === 'M') { cx = +tk[i++]; cy = +tk[i++]; }
      else if (cmd === 'V') { const ny = +tk[i++]; push(cx, cy, cx, ny, eid, e); cy = ny; }
      else if (cmd === 'H') { const nx = +tk[i++]; push(cx, cy, nx, cy, eid, e); cx = nx; }
      else if (cmd === 'A') { i += 5; const nx = +tk[i++], ny = +tk[i++]; arcs.push({ x: (cx + nx) / 2, y: (cy + ny) / 2, v: Math.abs(nx - cx) < E, e }); cx = nx; cy = ny; }
      else i++;
    }
  });
  function push(x1, y1, x2, y2, id, e) {
    if (Math.abs(x1 - x2) < E && Math.abs(y1 - y2) < E) return;
    if (Math.abs(y1 - y2) < E) segs.push({ h: 1, y: y1, x1: Math.min(x1, x2), x2: Math.max(x1, x2), id, e });
    else if (Math.abs(x1 - x2) < E) segs.push({ h: 0, x: x1, y1: Math.min(y1, y2), y2: Math.max(y1, y2), id, e });
  }
  return { segs, dots, arcs };
}
const idx = segs => { const H = new Map(), V = new Map(); segs.forEach(s => { const m = s.h ? H : V, c = Math.round(s.h ? s.y : s.x); for (const k of [c - 1, c, c + 1]) { if (!m.has(k)) m.set(k, []); m.get(k).push(s); } }); return { H, V }; };
const deg = (x, y, segs) => { const I = segs.I || (segs.I = idx(segs)); return deg0(x, y, (I.H.get(Math.round(y)) || []).concat(I.V.get(Math.round(x)) || [])); };
const deg0 = (x, y, segs) => { let n = 0; segs.forEach(s => {
  if (s.h) { if (Math.abs(s.y - y) > E || x < s.x1 - E || x > s.x2 + E) return; n += (Math.abs(x - s.x1) <= E || Math.abs(x - s.x2) <= E) ? 1 : 2; }
  else { if (Math.abs(s.x - x) > E || y < s.y1 - E || y > s.y2 + E) return; n += (Math.abs(y - s.y1) <= E || Math.abs(y - s.y2) <= E) ? 1 : 2; } }); return n; };
const desc = e => { const a = []; for (const at of e.attributes) if (/^data-/.test(at.name)) a.push(at.name + '=' + at.value); return e.tagName + '[' + a.join(' ') + ']'; };

function checkSvg(svg, id, muxTop) {
  const { segs, dots, arcs } = geom(svg); let nA = 0, nB = 0, nC = 0, nD = 0, nArcMux = 0;
  const inMux = y => muxTop !== null && y < muxTop;
  // A：每個點都是三叉以上
  dots.forEach(dt => { const g = deg(dt.x, dt.y, segs); nA++; ok(g >= 3, id + ' A 點在 (' + dt.x.toFixed(1) + ',' + dt.y.toFixed(1) + ') 只有 ' + g + ' 個方向 ' + desc(dt.e)); });
  // B：三叉以上都有點
  const seen = new Set();
  segs.forEach(s => (s.h ? [[s.x1, s.y], [s.x2, s.y]] : [[s.x, s.y1], [s.x, s.y2]]).forEach(([x, y]) => {
    const k = Math.round(x * 2) + ',' + Math.round(y * 2); if (seen.has(k)) return; seen.add(k);
    const g = deg(x, y, segs); if (g < 3) return; nB++;
    ok(dots.some(dt => Math.abs(dt.x - x) <= E && Math.abs(dt.y - y) <= E), id + ' B (' + x.toFixed(1) + ',' + y.toFixed(1) + ') ' + g + ' 個方向相連卻沒畫點' + (inMux(y) ? '（MUX 區）' : ''));
  }));
  // C：不相連的直接十字交叉
  const H = segs.filter(s => s.h), V = segs.filter(s => !s.h);
  V.forEach(v => H.forEach(h => { if (h.id === v.id) return; if (v.x > h.x1 + E && v.x < h.x2 - E && h.y > v.y1 + E && h.y < v.y2 - E) { nC++; ok(false, id + ' C (' + v.x.toFixed(1) + ',' + h.y.toFixed(1) + ') 直接十字交叉沒有弧形：' + desc(v.e) + ' × ' + desc(h.e)); } }));
  arcs.forEach(a => { if (inMux(a.y)) nArcMux++; });
  // D：同一直線重疊
  const grp = new Map(); segs.forEach(s => { const k = (s.h ? 'h' : 'v') + Math.round(s.h ? s.y : s.x); if (!grp.has(k)) grp.set(k, []); grp.get(k).push(s); });
  for (const gs of grp.values()) for (let i = 0; i < gs.length; i++) for (let j = i + 1; j < gs.length; j++) {
    const a = gs[i], b = gs[j]; if (a.id === b.id || a.h !== b.h) continue;
    const ov = a.h ? (Math.abs(a.y - b.y) <= E ? Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1) : -1) : (Math.abs(a.x - b.x) <= E ? Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1) : -1);
    if (ov > 1) { nD++; ok(false, id + ' D 兩條線重疊 ' + ov.toFixed(1) + 'px：' + desc(a.e) + ' ＝ ' + desc(b.e)); }
  }
  const muxDots = dots.filter(dt => inMux(dt.y)).length;
  return { dots: nA, junc: nB, plain: nC, overlap: nD, arcsMux: nArcMux, arcs: arcs.length, muxDots };
}

(async () => {
  const { JSDOM, VirtualConsole } = require(path.join(ROOT, 'node_modules/jsdom'));
  const vc = new VirtualConsole(); const jerr = []; vc.on('jsdomError', e => jerr.push(e.message));
  const dom = await JSDOM.fromFile(path.join(ROOT, 'datamap.html'), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc, beforeParse(win) { win.WebSocket = function () { throw new Error('no ws'); }; } });
  await new Promise(r => dom.window.addEventListener('load', r));
  const w = dom.window, d = w.document, $ = id => d.getElementById(id);
  const fire = (id, v) => { const e = $(id); e.value = v; e.dispatchEvent(new w.Event('change')); };
  const setState = (k, s) => { if (w.dmState.model !== k) fire('dm-model', k); w.dmState.cur = DM.cloneState(s); w.dmPvRender(); };
  const ONLY = process.env.MUXDOT_ONLY ? new RegExp(process.env.MUXDOT_ONLY) : null;
  const run = (id, wantMux) => {
    if (ONLY && !ONLY.test(id)) return;
    for (const fr of [false, true]) {
      fire('dm-pv-first', fr ? 'r' : 'l');
      const svg = $('dm-pv-tft'), P = w.dmPvModel(), tag = id + (fr ? ' CH1右' : '');
      if (/^EN01 Auto/.test(id) && !(P && P.ok)) { skip.push(tag); continue; }   // EN01 Auto 原廠無範例的組合（畫面寫待 RD，③ 不畫）
      ok(P && P.ok, tag + ' 模型可畫');
      if (wantMux !== undefined) ok((P.mux | 0) === wantMux, tag + ' MUX' + wantMux + '（實際 ' + P.mux + '）');
      const g = svg.querySelector('line[data-gate]'), muxTop = P.mux ? (g ? +g.getAttribute('y1') - 30 : null) : null;
      const r = checkSvg(svg, tag, muxTop);
      if (P.mux) { ok(r.arcsMux > 0, tag + ' MUX 區有弧形跨線'); ok(r.muxDots > 0, tag + ' MUX 區有接點'); }
      sum.push([tag, P.mux ? 'MUX' + P.mux + ' T' + P.muxType : 'NG' + P.NG, r.dots, r.junc, r.plain, r.overlap, r.arcsMux, r.muxDots]);
    }
    fire('dm-pv-first', 'l');
  };
  for (const k of ['EM01', 'EM02', 'E512', 'E503', 'E501A', 'E501B', 'DAZ6138', 'DAZ6139']) {
    if (!DM.MODELS[k]) continue;
    for (let sub = 0; sub < 8; sub++) for (const mi of [0, 1]) {
      const s = DM.emptyState(k); s.panel = 3; s.subPanel = sub; s.rd = (sub & 1) ? 1 : 2; s.hand = 0; s.mirror = mi;
      setState(k, s); run(k + ' Auto LTPS sub' + sub + ' mirror' + mi, (sub & 1) ? 2 : 3);
    }
    for (const pan of [0, 2]) { const s = DM.emptyState(k); s.panel = pan; s.subPanel = 0; s.rd = pan === 2 ? 1 : 0; s.hand = 0; setState(k, s); run(k + ' Auto panel' + pan, 0); }
  }
  const en = (rd, ty, mi, mux) => { const s = DM.emptyState('EN01'); s.hand = 1; s.deEn = 1; s.deSel = 1; s.rd = rd; s.mirror = mi; s.rvsL = mi ? 0xFF : 0; if (mux) { s.panel = 3; s.subPanel = (rd === 1 ? 1 : 0) | (ty === 2 ? 4 : 0); } return s; };
  /* EN01 用 Auto（E507 原廠範例接線，A37）：PANEL_MODE 3＋RD 1／2（SUB[0] MUX2／3、SUB[1] zigzag、SUB[2] TYPE）、RD 3＝MUX4、RD 5＝MUX6（TYPE 手動）；另 Hand MUX（同一組 code）確認 Hand 路徑 */
  const ena = (pan, sub, rd, mi) => { const s = DM.emptyState('EN01'); s.hand = 0; s.panel = pan; s.subPanel = sub; s.rd = rd; s.mirror = mi; s.rvsL = mi ? 0xFF : 0; return s; };
  for (const mi of [0, 1]) {
    for (const rd of [1, 2]) for (const zz of [0, 2]) for (const ty of [1, 2]) { setState('EN01', ena(3, (rd === 1 ? 1 : 0) | zz | (ty === 2 ? 4 : 0), rd, mi)); run('EN01 Auto MUX' + (rd + 1) + (zz ? ' zigzag' : ' normal') + ' TYPE' + ty + ' mirror' + mi, rd + 1); }
    w.dmPvMuxType(1); setState('EN01', ena(3, 0, 3, mi)); run('EN01 Auto MUX4 TYPE1 mirror' + mi, 4);
    for (const ty of [1, 2]) { w.dmPvMuxType(ty); setState('EN01', ena(3, 0, 5, mi)); run('EN01 Auto MUX6 TYPE' + ty + ' mirror' + mi, 6); }
    w.dmPvMuxType(1);
    for (const [pan, rd] of [[0, 0], [2, 1]]) { setState('EN01', ena(pan, 0, rd, mi)); run('EN01 Auto panel' + pan + ' mirror' + mi, 0); }
  }
  ok(jerr.length === 0, 'jsdom 錯誤 ' + jerr.slice(0, 3).join(' | '));
  const muxRows = sum.filter(r => /^MUX/.test(r[1]));
  console.log('組合 ' + sum.length + '（MUX ' + muxRows.length + '）；點 ' + sum.reduce((a, r) => a + r[2], 0) + '、三叉以上 ' + sum.reduce((a, r) => a + r[3], 0) + '、直接十字交叉 ' + sum.reduce((a, r) => a + r[4], 0) + '、重疊 ' + sum.reduce((a, r) => a + r[5], 0) + '、MUX 區弧形 ' + sum.reduce((a, r) => a + r[6], 0) + '、MUX 區點 ' + sum.reduce((a, r) => a + r[7], 0));
  if (skip.length) console.log('EN01 Auto 原廠無範例、③ 不畫（略過）：' + skip.join('、'));
  if (process.env.MUXDOT_V) sum.forEach(r => console.log('  ' + r.join(' | ')));
  fails.forEach(f => console.log('  ✗ ' + f));
  console.log((fail ? '✗' : '✓') + ' check_datamap_muxdot: ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})();
