// v1.35.5 硬體限制證據（Bruce 10/15「哪一型做不到，就要用硬體限制的窮舉證據說明原因」）
// 用法：node tools/check_datamap_lkrev_proof.js [repo] [型號,…]
// 步驟同驗收：Auto HSD Type 4+Z-Zag(BOE) → 鎖定（CH1 左）→ Benchmark → CH1 最右 → 反推。到不了 0 錯的型號：
//   1) 以最佳候選為底，對每一格窮舉該格「全部下拉選項」（其餘格不動）× Mirror 0／1 × CHRB 0／1，記錄該格能做到的最少錯格；
//   2) 列出這一格在同一個鎖定目標下需要的名稱（＝讓錯格歸零所需，取自 MNT 型號 EM01 同架構的 0 錯解的同一格），以及這型的碼表有沒有這個名稱。
'use strict';
const path = require('path');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const ONLY = process.argv[3] ? process.argv[3].split(',') : ['E501A', 'E501B', 'E503'];
const { JSDOM, VirtualConsole } = require(path.join(ROOT, 'node_modules/jsdom'));
(async () => {
  const LS = {};
  const dom = await JSDOM.fromFile(path.join(ROOT, 'datamap.html'), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: new VirtualConsole(),
    beforeParse(w) { w.WebSocket = function () { throw new Error('no ws'); }; Object.defineProperty(w, 'localStorage', { configurable: true, value: { getItem: k => (k in LS ? LS[k] : null), setItem: (k, v) => { LS[k] = String(v); }, removeItem: k => { delete LS[k]; } } }); } });
  await new Promise(r => dom.window.addEventListener('load', r));
  const w = dom.window, d = w.document, $ = id => d.getElementById(id), B = w.dmBench, S = w.dmState, DM = w.TCONDataMap, A = w.TCONDataMapAuto;
  const fire = (el, v) => { if (v !== undefined) { if (el.type === 'checkbox') el.checked = v; else el.value = v; } el.dispatchEvent(new w.Event('change')); };
  const setModel = k => { if ($('dm-model').value !== k) { fire($('dm-model'), k); if (!$('dm-ask').classList.contains('hidden')) $('dm-ask-yes').click(); } };
  const reset = () => { if ($('dm-pv-lock').getAttribute('data-locked') === '1') $('dm-pv-lock').click(); B.open(false); fire($('dm-pv-first'), 'l'); };
  const view = (m, st, r, c) => { const v = DM.cellView(m, st, r, c); return v.blank ? null : v.txt; };
  const solve = (m, re) => {
    reset(); setModel(m); const L = A.list(m) || []; const i = L.findIndex(x => re.test(x.name)); if (i < 0) return null;
    S.cur = DM.setHand(m, A.apply(m, DM.emptyState(m), i), false); w.dmRender();
    $('dm-pv-lock').click(); B.open(true); fire($('dm-pv-first'), 'r');
    return { R: B.reverse(), name: L[i].name };
  };
  // 參考：EM01 同架構（panel 2／sub 3／rd 1 HSD）0 錯解
  const ref = solve('EM01', /\(25\) HSD\+RRB\/GBG\+LR$/);
  const refT = ref && ref.R.bad === 0 ? [0, 1, 2, 3].map(r => [0, 1, 2, 3, 4, 5].map(c => view('EM01', S.cur, r, c))) : null;
  console.log('參考 EM01 ' + (ref && ref.name) + '：' + (ref && ref.R.txt) + (refT ? '\n  ' + refT.map(x => x.join(' ')).join('｜') : ''));
  for (const m of ONLY) {
    const x = solve(m, /HSD Type 4\+Z-Zag\(BOE\)/); if (!x) { console.log(m + '：無此樣式'); continue; }
    const R = x.R; console.log('\n== ' + m + ' ' + x.name + '：' + R.txt);
    if (!R.bad) continue;
    const pre = DM.cloneState(S.cur), base = R.best, errOf = st => { S.cur = st; const e = B.lockErr(); S.cur = pre; return e ? e.bad : Infinity; };
    const all = {}; let reach = Infinity;
    for (const mir of [0, 1]) for (const cb of [0, 1]) {
      let st0 = DM.cloneState(base); st0.mirror = mir; st0.chrb = cb;
      const RL = DM.fieldById(m, 'rvsL'); if (RL) st0.rvsL = mir ? (1 << RL.bits) - 1 : 0;
      const e0 = errOf(st0); reach = Math.min(reach, e0);
      for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) {
        const opts = DM.cellOptions(m, st0, r, c).map(o => o.name); let best = Infinity, bn = '';
        opts.forEach(n => { const p = DM.pickCell(m, st0, r, c, n); if (!p) return; const e = errOf(p.state); if (e < best) { best = e; bn = n; } });
        const k = r + '-' + c; if (!all[k] || best < all[k].best) all[k] = { best, bn, n: opts.length, opts, mir, cb };
        reach = Math.min(reach, best);
      }
    }
    console.log('  每格窮舉（其餘格＝最佳候選，Mirror×CHRB 4 組）：任一格單獨換成任何選項，最少仍 ' + reach + ' 錯（最佳候選 ' + R.bad + '）');
    for (let r = 0; r < 4; r++) {
      const line = [];
      for (let c = 0; c < 6; c++) { const need = refT ? refT[r][c] : '?', a = all[r + '-' + c], has = a && a.opts.indexOf(need) >= 0; line.push((view(m, base, r, c) || '·') + '→需 ' + need + (has ? '（碼表有）' : '（碼表沒有）')); }
      console.log('  Line ' + ['1-1', '1-2', '2-1', '2-2'][r] + '：' + line.join('、'));
    }
    const U = {}; Object.values(all).forEach(a => a.opts.forEach(n => { const k = /^[RGB](-?\d+)$/.exec(n); if (k) U[+k[1]] = 1; })); const ks = Object.keys(U).map(Number).sort((a, b) => a - b);
    console.log('  ' + m + ' 每格碼表可選 pixel：' + ks[0] + '～' + ks[ks.length - 1] + '（共 ' + Object.keys(U).length + ' 個 pixel 編號）');
  }
  process.exit(0);
})();
