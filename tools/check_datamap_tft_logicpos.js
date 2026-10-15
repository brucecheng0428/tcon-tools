#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   check_datamap_tft_logicpos.js — 快照格式 2 的「位置不隨設定變」驗證（Bruce 10/15）
   Bruce：「切換 Mirror、CH1 左右、RGB／BGR、Single／Dual／Tri 時，位置編號不變、只有內容變；抽幾組驗證給我看。」
   對指定型號（預設 EM01）依序切換：基準（Single）、Mirror、CH1 在右、BGR、Driver 反向、Dual、Tri，
   每次用 tools/datamap_tft_logic.js 取出「位置 → 內容」，檢查：
     ・格子位置剛好是 第 1~N 列 × 第 0~(M−1) 欄 的完整方格（沒有缺、沒有重複）；
     ・和基準比：列數、欄數、位置集合是否相同；內容有幾格改變；列出幾格前後內容。
   用法：node tools/check_datamap_tft_logicpos.js [repo] [型號]
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path');
const args = process.argv.slice(2);
const ROOT = path.resolve(args[0] || path.join(__dirname, '..')), MODEL = args[1] || 'EM01';
const { JSDOM, VirtualConsole } = require(path.join(ROOT, 'node_modules/jsdom'));
const DM = require(path.join(ROOT, 'common/datamap-core.js')); global.TCONDataMap = DM;
global.TCONDataMapLOD = require(path.join(ROOT, 'common/datamap-lod.js'));
const TL = require('./datamap_tft_logic.js');
(async () => {
  const vc = new VirtualConsole(); vc.on('jsdomError', e => console.log('jsdomError', e.message));
  const dom = await JSDOM.fromFile(path.join(ROOT, 'datamap.html'), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc, beforeParse(win) { win.WebSocket = function () { throw new Error('no ws'); }; } });
  await new Promise(r => dom.window.addEventListener('load', r));
  const w = dom.window, d = w.document, $ = id => d.getElementById(id);
  const fire = (id, v) => { const e = $(id); e.value = v; e.dispatchEvent(new w.Event('change')); };
  fire('dm-model', MODEL);
  const has = id => !!DM.fieldById(MODEL, id);
  const base = () => { const s = DM.emptyState(MODEL); DM.fieldsOf(MODEL).forEach(f => { const m = /^([cxe])(\d+)$/.exec(f.id); if (m) s[f.id] = ((+m[2]) * 7 + 3) % 30 & ((1 << f.bits) - 1); }); s.hand = 1; s.panel = 0; if (has('lineEn')) s.lineEn = 1; return s; };
  const shot = (st, ui) => {
    fire('dm-pv-first', ui.first || 'l'); fire('dm-pv-stripe', ui.stripe || 'rgb'); fire('dm-pv-drv', ui.drv || 'f');
    w.dmState.cur = DM.cloneState(st); w.dmState.xTouched = true; w.dmRender();
    const svg = $('dm-pv-tft'); return TL.tftLogic(svg && svg.children.length ? svg : null);
  };
  const cellsOf = T => Object.keys(T.map).filter(k => /^N\d+M-?\d+$/.test(k));
  const grid = T => { const c = cellsOf(T), N = new Set(), M = new Set(); c.forEach(k => { const m = /^N(\d+)M(-?\d+)$/.exec(k); N.add(+m[1]); M.add(+m[2]); }); const nN = N.size, nM = M.size, m0 = Math.min(...M), m1 = Math.max(...M), full = c.length === nN * nM && Math.min(...N) === 1 && Math.max(...N) === nN && m1 - m0 === nM - 1; return { nN, nM, m0, m1, full, n: c.length }; };
  /* 軸驗證：每一格的軸名稱（data-name）換回子像素軸位置 sp（R1＝0；BGR 只換 pixel 內順序），必須＝原點 sp＋M ⇒ 欄號＝固定的實體位置 */
  const axisLin = (sp, bgr) => { const m = ((sp % 3) + 3) % 3; return sp - m + (bgr ? 2 - m : m); };
  const spOf = (T, k, bgr) => { const m = /名稱 ([^｜]*)/.exec(T.sum[k] || ''); return m && m[1] ? axisLin(DM.linIdx(m[1]), bgr) : null; };
  const axisChk = (T, bgr) => { let o = null, bad = 0, n = 0; cellsOf(T).forEach(k => { const sp = spOf(T, k, bgr); if (sp === null) return; const M = +/M(-?\d+)$/.exec(k)[1]; if (o === null) o = sp - M; n++; if (sp - M !== o) bad++; }); return { o, bad, n }; };
  const S0 = base();
  const V = [
    ['基準 Single', S0, {}],
    ['Mirror＝1', Object.assign(DM.cloneState(S0), { mirror: 1 }), {}],
    ['CH1 在右', S0, { first: 'r' }],
    ['RGB→BGR', S0, { stripe: 'bgr' }],
    ['Driver 反向', S0, { drv: 'r' }],
    ['Dual', DM.setGate(MODEL, DM.cloneState(S0), 'Dual-Gate'), {}],
    ['Tri', DM.setGate(MODEL, DM.cloneState(S0), 'Tri-Gate'), {}],
    ['Tri（② 格值全 0）', (() => { const s = DM.setGate(MODEL, DM.cloneState(S0), 'Tri-Gate'); if (s) DM.fieldsOf(MODEL).forEach(f => { if (/^[cxe]\d+$/.test(f.id)) s[f.id] = 0; }); return s; })(), {}],
  ].filter(v => v[1] && !(v[0].startsWith('Mirror') && !has('mirror')));
  const gateV = nm => /^(Dual|Tri)/.test(nm);   // Bruce 10/15：Gate 類型只要求「列號」不變；欄號原點跟著 ② 表格在該 Gate 下的解讀（同一組 code 在 Dual 是不同 pixel）
  const T0 = shot(V[0][1], V[0][2]), A0 = axisChk(T0, false);
  let bad = 0;
  console.log('型號 ' + MODEL + '（' + path.basename(ROOT) + '）；第 0 欄＝子像素軸 ' + DM.linName(A0.o));
  V.forEach(([nm, st, ui]) => {
    const T = shot(st, ui), g = grid(T), cs = cellsOf(T), bgr = ui.stripe === 'bgr', A = axisChk(T, bgr);
    if (!g.n) { console.log('・' + nm + '：此設定沒有 TFT 圖（' + ($('dm-tftnote').textContent || '').slice(0, 60) + '）'); return; }
    const both = cs.filter(k => T0.map[k] !== undefined), chg = both.filter(k => T0.map[k] !== T.map[k]);
    const g0 = grid(T0), ok = g.full && A.bad === 0 && (gateV(nm) ? g.nN === g0.nN : A.o === A0.o);
    if (!ok) bad++;
    console.log('・' + nm + '：第 1~' + g.nN + ' 列' + (g.nN === g0.nN ? '（列號同基準）' : '（✗ 列數和基準不同）') + ' × 第 ' + g.m0 + '~' + g.m1 + ' 欄（' + g.n + ' 格，完整方格 ' + (g.full ? '✓' : '✗') + '）；軸名稱逐格核對 ' + A.n + ' 格 ' + (A.bad ? '✗ ' + A.bad + ' 格不符' : '✓') + '，第 0 欄＝' + (A.o === null ? '—' : DM.linName(A.o)) + (A.o === A0.o ? '（同基準）' : (gateV(nm) ? '（Gate 不同，② 解讀的最小 pixel 不同）' : '（✗ 和基準不同）')) + '；和基準同位置 ' + both.length + ' 格，內容改變 ' + chg.length + ' 格');
    ['N1M0', 'N1M1', 'N1M2', 'N2M0'].forEach(k => { if (T.sum[k] !== undefined) console.log('    ' + k.replace(/^N(\d+)M(-?\d+)$/, '第 $1 列、第 $2 欄') + '：' + T.sum[k]); });
  });
  console.log(bad ? '✗ 有設定的位置編號和基準不一致' : '✓ 所有設定：格子是完整方格、每格軸名稱＝原點＋欄號；Mirror／CH1／RGB↔BGR／Driver 切換第 0 欄是同一顆實體 subpixel；Gate 切換列號不變');
  process.exit(bad ? 1 : 0);
})();
