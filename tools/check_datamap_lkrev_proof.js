// v1.35.6 硬體限制證據（Bruce 10/15「哪一型做不到，就要用硬體限制的窮舉證據說明原因」）
// 用法：node tools/check_datamap_lkrev_proof.js [repo] [型號,…]
// 步驟同驗收：Auto 架構 → 鎖定（CH1 左）→ Benchmark → CH1 最右 → 反推。對每個到不了 0 錯（未套用）的架構：
//   1) 以最佳候選為底，對每一格窮舉該格全部下拉選項（其餘格不動）× Mirror 0／1 × CHRB 0／1，記錄能做到的最少錯格；
//   2) 參考解：找 EM01（碼表較寬的 MNT）同一個 panel／sub／rd 的 Auto 架構，若它 0 錯，取它每一格的名稱＝同一個鎖定目標下這格需要的名稱，
//      逐格比對這一型的碼表有沒有這個名稱；需要的名稱不在碼表 ⇒ 硬體做不到。
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
  const key = (m, i) => { const s = A.apply(m, DM.emptyState(m), i); return [s.panel | 0, s.subPanel | 0, s.rd | 0].join('/'); };
  const solve = (m, i) => {
    reset(); setModel(m);
    S.cur = DM.setHand(m, A.apply(m, DM.emptyState(m), i), false); w.dmRender();
    if (!$('dm-pv-tft').querySelector('rect[data-pv]')) return null;
    $('dm-pv-lock').click(); B.open(true); fire($('dm-pv-first'), 'r');
    return B.reverse();
  };
  setModel('EM01'); const LE = A.list('EM01') || [], refIdx = {};
  LE.forEach((x, i) => { const k = key('EM01', i); if (!(k in refIdx)) refIdx[k] = i; });
  const refCache = {};
  const refOf = k => {
    if (k in refCache) return refCache[k];
    if (!(k in refIdx)) return (refCache[k] = null);
    const R = solve('EM01', refIdx[k]);
    return (refCache[k] = R && R.bad === 0 ? { name: LE[refIdx[k]].name, T: [0, 1, 2, 3].map(r => [0, 1, 2, 3, 4, 5].map(c => view('EM01', S.cur, r, c))) } : { name: LE[refIdx[k]].name, T: null, txt: R && R.txt });
  };
  for (const m of ONLY) {
    setModel(m); const L = A.list(m) || [];
    for (let i = 0; i < L.length; i++) {
      const k = key(m, i), R = solve(m, i);
      if (!R) { console.log(m + ' ' + L[i].name + '：沒有接線圖'); continue; }
      if (R.bad === 0) { console.log(m + ' ' + L[i].name + '：0 錯（已套用）'); continue; }
      if (R.bad === -1) { console.log(m + ' ' + L[i].name + '：' + R.txt + '（強制 Hand 後 Gate／週期與鎖定的 Auto 架構不同，Hand 表格表示不出這個架構）'); continue; }
      const pre = DM.cloneState(S.cur), base = R.best, errOf = st => { S.cur = st; const e = B.lockErr(); S.cur = pre; return e ? e.bad : Infinity; };
      const all = {}; let reach = Infinity;
      for (const mir of [0, 1]) for (const cb of [0, 1]) {
        const st0 = DM.cloneState(base); st0.mirror = mir; st0.chrb = cb;
        const RL = DM.fieldById(m, 'rvsL'); if (RL) st0.rvsL = mir ? (1 << RL.bits) - 1 : 0;
        reach = Math.min(reach, errOf(st0));
        for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) {
          const opts = DM.cellOptions(m, st0, r, c).map(o => o.name); let best = Infinity;
          opts.forEach(n => { const p = DM.pickCell(m, st0, r, c, n); if (!p) return; const e = errOf(p.state); if (e < best) best = e; });
          const kk = r + '-' + c; if (!all[kk]) all[kk] = { opts }; reach = Math.min(reach, best);
        }
      }
      const ref = refOf(k), miss = [];
      if (ref && ref.T) for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) { const need = ref.T[r][c], a = all[r + '-' + c]; if (need && a && a.opts.indexOf(need) < 0) { const cur = view(m, base, r, c); if (!a.opts.length && cur === need) continue; miss.push('Line ' + ['1-1', '1-2', '2-1', '2-2'][r] + ' Data ' + (c + 1) + ' 需 ' + need + (a.opts.length ? '（碼表沒有）' : '（這格不能獨立設定，目前跟著別列＝' + (cur || '—') + '）')); } }
      const U = {}; Object.values(all).forEach(a => a.opts.forEach(n => { const q = /^[RGB](-?\d+)$/.exec(n); if (q) U[+q[1]] = 1; })); const ks = Object.keys(U).map(Number).sort((a, b) => a - b);
      console.log(m + ' ' + L[i].name + '：最佳 ' + R.bad + ' 錯；逐格窮舉 × Mirror × CHRB 最少仍 ' + reach + ' 錯；碼表可選 pixel ' + ks[0] + '～' + ks[ks.length - 1] +
        '；參考 EM01 ' + (ref ? ref.name + (ref.T ? ' 0 錯解' : '（' + ref.txt + '）') : '無同架構') + (miss.length ? '；碼表沒有的需要名稱 ' + miss.length + ' 格：' + miss.join('、') : (ref && ref.T ? '；需要的名稱碼表都有（非碼表限制，待查）' : '')));
    }
  }
  process.exit(0);
})();
