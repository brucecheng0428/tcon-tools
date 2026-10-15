// v1.35.5 畫面驗收（Bruce 10/15「測試只拿反推自己算的分數去比，等於自己驗自己。改成驗畫出來的結果」）
// 用法：node tools/check_datamap_lkrev_dom.js [repo] [型號,…]
// 每個型號 × 全部 Auto 架構 × 鎖定時 CH1 左／右：Auto 選樣式 → 確定此架構 → 開 Benchmark → CH1 換到另一邊 → 自動反推。
// 判定只讀渲染出來的 TFT 接線圖 SVG（#dm-pv-tft rect 的 data-pv＝這格位置、data-dn＝格內寫的名稱、data-phys＝顏色、data-st／.pv-err＝錯誤標記），
// 不呼叫反推演算法的任何函式（不看 R.bad）：
//   套用了（② 有變）⇒ 每一格 data-dn 與鎖定當下逐字相同（R-5 ≠ R5）、顏色相同、0 個 .pv-err、主表每列沒有重複名稱（X 除外）。
//   沒套用（② 沒變）⇒ 列為無解，附「格子可選 pixel 範圍」與第一個錯格；這類由 check_datamap_lkrev_proof 補窮舉證據。
'use strict';
const path = require('path');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const ONLY = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3].split(',') : null;
const { JSDOM, VirtualConsole } = require(path.join(ROOT, 'node_modules/jsdom'));
(async () => {
  const LS = {};
  const vc = new VirtualConsole(); vc.on('jsdomError', e => console.log('jsdomError', e.message));
  const dom = await JSDOM.fromFile(path.join(ROOT, 'datamap.html'), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) { w.WebSocket = function () { throw new Error('no ws'); }; Object.defineProperty(w, 'localStorage', { configurable: true, value: { getItem: k => (k in LS ? LS[k] : null), setItem: (k, v) => { LS[k] = String(v); }, removeItem: k => { delete LS[k]; } } }); } });
  await new Promise(r => dom.window.addEventListener('load', r));
  const w = dom.window, d = w.document, $ = id => d.getElementById(id), B = w.dmBench, S = w.dmState, DM = w.TCONDataMap, A = w.TCONDataMapAuto;
  const fire = (el, v) => { if (v !== undefined) { if (el.type === 'checkbox') el.checked = v; else el.value = v; } el.dispatchEvent(new w.Event('change')); };
  const setModel = k => { if ($('dm-model').value !== k) { fire($('dm-model'), k); if (!$('dm-ask').classList.contains('hidden')) $('dm-ask-yes').click(); } };
  const reset = () => { if ($('dm-pv-lock').getAttribute('data-locked') === '1') $('dm-pv-lock').click(); B.open(false); fire($('dm-pv-first'), 'l'); fire($('dm-pv-stripe'), 'rgb'); fire($('dm-pv-drv'), 'f'); fire($('dm-pv-swap'), false); };
  /* 畫面讀值：只看 SVG */
  const snap = () => { const o = {}; d.querySelectorAll('#dm-pv-tft rect[data-pv]').forEach(r => { o[r.getAttribute('data-pv')] = (r.getAttribute('data-dn') || '') + '/' + (r.getAttribute('data-phys') || '') + '/' + (r.getAttribute('data-tier') || ''); }); return o; };
  const errs = () => d.querySelectorAll('#dm-pv-tft .pv-err, #dm-pv-tft rect[data-st="err"], #dm-pv-tft rect[data-st="conflict"]').length;
  /* 主表讀值：只看 ②-2 下拉目前選的文字 */
  const table = () => [0, 1, 2, 3].map(r => [0, 1, 2, 3, 4, 5].map(c => { const e = $('dm-c' + r + '-' + c); return e && !e.disabled && e.selectedIndex >= 0 ? e.options[e.selectedIndex].textContent : null; }));
  const regs = m => JSON.stringify(DM.fieldsOf(m).map(f => f.id + '=' + (S.cur[f.id] >>> 0)));
  const models = DM.SELECT_KEYS.filter(k => !ONLY || ONLY.includes(k));
  const sum = {}; const bad = [], hard = [], skip = [];
  for (const m of models) {
    setModel(m);
    const L = (A.fam && A.fam(m) ? A.list(m) : null) || [];
    const s0 = sum[m] = { n: 0, ok: 0, hard: 0, bad: 0, skip: 0, none: L.length ? 0 : 1 };
    for (let i = 0; i < L.length; i++) for (const ch of ['l', 'r']) {
      const tag = m + ' ' + L[i].name + ' 鎖定 CH1' + (ch === 'l' ? '左→右' : '右→左');
      reset(); setModel(m); fire($('dm-pv-first'), ch);
      S.cur = DM.setHand(m, A.apply(m, DM.emptyState(m), i), false); w.dmRender();
      if (!$('dm-pv-tft').querySelector('rect[data-pv]')) { s0.skip++; skip.push(tag + '：沒有接線圖'); continue; }
      $('dm-pv-lock').click();
      const lockE = errs(), lockS = snap();
      if (lockE) { s0.skip++; skip.push(tag + '：鎖定當下接線圖已有 ' + lockE + ' 個錯誤標記'); continue; }
      B.open(true); fire($('dm-pv-first'), ch === 'l' ? 'r' : 'l');
      const before = regs(m);
      B.reverse();
      s0.n++;
      const after = snap(), e2 = errs(), applied = regs(m) !== before;
      const same0 = !e2 && Object.keys(lockS).every(k => lockS[k] === after[k]);
      if (applied || same0) {   // same0：換邊後不用改任何暫存器就已經和鎖定時逐格相同
        const diff = Object.keys(lockS).filter(k => lockS[k] !== after[k]).concat(Object.keys(after).filter(k => !(k in lockS)));
        const T = table(), dup = [];
        T.forEach((row, r) => { const seen = {}; row.forEach(n => { if (!n || n === 'X') return; if (seen[n]) dup.push('Line' + r + ' ' + n); seen[n] = 1; }); });
        if (!diff.length && !e2 && !dup.length) s0.ok++;
        else { s0.bad++; bad.push(tag + '：套用後畫面與鎖定不同 ' + diff.length + ' 格' + (diff.length ? '（例 ' + diff.slice(0, 3).map(k => k + ' 鎖定 ' + lockS[k] + ' → 現在 ' + after[k]).join('；') + '）' : '') + '、錯誤標記 ' + e2 + (dup.length ? '、主表重複 ' + dup.join(',') : '')); }
      } else {
        s0.hard++;
        const U = {}; for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) { try { DM.cellOptions(m, S.cur, r, c).forEach(o => { const k = /^[RGB](-?\d+)$/.exec(o.name); if (k) U[+k[1]] = 1; }); } catch (e) {} }
        const ks = Object.keys(U).map(Number).sort((a, b) => a - b);
        hard.push(tag + '：未套用（② 不變）；格子可選 pixel ' + (ks.length ? ks[0] + '～' + ks[ks.length - 1] : '—') + '；結果行「' + (($('dm-bench-revst') || {}).textContent || '') + '」');
      }
    }
  }
  reset();
  console.log('| 型號 | Auto 架構×CH1 組數 | 套用且畫面逐格與鎖定相同 | 未套用（無 0 錯解） | 套用但畫面不同（錯誤） | 鎖定時已有錯（不反推） |\n|---|---|---|---|---|---|');
  models.forEach(m => { const s = sum[m]; console.log('| ' + m + ' | ' + (s.none ? '沒有 Auto 清單' : s.n + s.skip) + ' | ' + s.ok + ' | ' + s.hard + ' | ' + s.bad + ' | ' + s.skip + ' |'); });
  console.log('錯誤 ' + bad.length + '：\n  ' + bad.join('\n  '));
  console.log('未套用 ' + hard.length + '：\n  ' + hard.join('\n  '));
  if (process.argv.includes('-v')) console.log('略過 ' + skip.length + '：\n  ' + skip.join('\n  '));
  console.log('check_datamap_lkrev_dom：' + (bad.length ? 'FAIL ' + bad.length : 'PASS') + '（畫面驗收，不經反推函式）');
  process.exit(bad.length ? 1 : 0);
})();
