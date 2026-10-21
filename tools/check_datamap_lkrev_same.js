// v1.37.0 自動反推 MNT／NB 結果不變（Bruce 10/21 派工 238563327454375936：「MNT 結果須與現行逐格相同」）
// 用法：node tools/check_datamap_lkrev_same.js <新版 repo> <舊版 repo（例 origin/main 的 worktree）> [輸出 json]
//   兩版各跑同一組情境：每個非 EN01 型號 × 起點（Auto 前 3 種＋MNT Hand 樣式 3 種）× Driver／面板變更 6 種，鎖定 → Benchmark → 改設定 → 自動反推，
//   比 ① 反推後 ② 全部欄位（state 逐欄）② bad／applied ③ 結果行（去掉 v1.37.0 新增的「共 N 組 0 錯解」尾巴）。時間上限設 60 秒（兩版相同，避免時間截斷造成差異）。
'use strict';
const path = require('path'), fs = require('fs');
const NEW = path.resolve(process.argv[2]), OLD = path.resolve(process.argv[3]), OUT = process.argv[4] || '/tmp/lkrev_same.json';
const { JSDOM, VirtualConsole } = require(path.join(NEW, 'node_modules/jsdom'));
async function run(ROOT) {
  const LS = {}, errs = [];
  const vc = new VirtualConsole(); vc.on('jsdomError', e => errs.push(e.message));
  const dom = await JSDOM.fromFile(path.join(ROOT, 'datamap.html'), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) { w.WebSocket = function () { throw new Error('no ws'); }; Object.defineProperty(w, 'localStorage', { configurable: true, value: { getItem: k => (k in LS ? LS[k] : null), setItem: (k, v) => { LS[k] = String(v); }, removeItem: k => { delete LS[k]; } } }); } });
  await new Promise(r => dom.window.addEventListener('load', r));
  const w = dom.window, d = w.document, $ = id => d.getElementById(id), B = w.dmBench, DM = w.TCONDataMap, A = w.TCONDataMapAuto;
  const S = () => w.dmState;
  const fire = (el, v) => { if (v !== undefined) { if (el.type === 'checkbox') el.checked = v; else el.value = v; } el.dispatchEvent(new w.Event('change')); };
  const setModel = k => { if ($('dm-model').value !== k) { fire($('dm-model'), k); if (!$('dm-ask').classList.contains('hidden')) $('dm-ask-yes').click(); } };
  const HW = { swap: ['dm-pv-swap', false, true], shl: ['dm-pv-drv', 'f', 'r'], bgr: ['dm-pv-stripe', 'rgb', 'bgr'], ch1: ['dm-pv-first', 'l', 'r'] };
  const hwReset = () => { if ($('dm-pv-lock').getAttribute('data-locked') === '1') $('dm-pv-lock').click(); B.open(false); Object.keys(HW).forEach(k => fire($(HW[k][0]), HW[k][1])); };
  B.budget(60000);
  const out = {};
  const models = DM.MODEL_KEYS.filter(m => DM.MODELS[m].kind !== 'en01');
  const CHG = [['swap'], ['shl'], ['bgr'], ['ch1'], ['swap', 'bgr'], ['shl', 'ch1']];
  for (const m of models) {
    const starts = [];
    const L = (A && A.fam(m)) ? A.list(m) : [];
    for (let i = 0; i < Math.min(3, L.length); i++) starts.push({ nm: 'Auto ' + L[i].name, go: () => { S().cur = DM.setHand(m, A.apply(m, S().cur, i), false); w.dmRender(); } });
    if (DM.MODELS[m].kind === 'mnt') [33, 24, 29].forEach(k => { if (DM.PRESETS[k]) starts.push({ nm: 'Hand ' + DM.PRESETS[k].name, go: () => { S().cur = DM.applyPreset(m, S().cur, k); w.dmRender(); } }); });
    for (const st of starts) for (const chg of CHG) {
      const tag = m + ' ' + st.nm + ' × ' + chg.join('+');
      try {
        hwReset(); setModel(m); st.go();
        $('dm-pv-lock').click(); B.open(true);
        chg.forEach(k => fire($(HW[k][0]), HW[k][2]));
        const t0 = Date.now(), R = B.reverse(), dt = Date.now() - t0;
        out[tag] = { st: JSON.stringify(S().cur), bad: R && R.bad, applied: R && R.applied, txt: R && String(R.txt).replace(/；共 \d+ 組 0 錯解.*$/, ''), ms: dt };
      } catch (e) { out[tag] = { err: e.message }; }
    }
  }
  hwReset();
  return { out, errs };
}
(async () => {
  const t = Date.now();
  const a = await run(NEW), b = await run(OLD);
  const keys = Object.keys(b.out); let same = 0, diff = 0; const D = [];
  keys.forEach(k => { const x = a.out[k], y = b.out[k]; const eq = x && y && x.st === y.st && x.bad === y.bad && x.applied === y.applied && x.txt === y.txt && !x.err && !y.err; if (eq) same++; else { diff++; D.push(k + '：新 ' + JSON.stringify(x && { bad: x.bad, applied: x.applied, txt: x.txt, err: x.err }) + ' ／ 舊 ' + JSON.stringify(y && { bad: y.bad, applied: y.applied, txt: y.txt, err: y.err }) + (x && y && x.st !== y.st ? '（state 不同）' : '')); } });
  const zero = keys.filter(k => b.out[k] && b.out[k].bad === 0).length, msN = keys.map(k => (a.out[k] || {}).ms || 0), msO = keys.map(k => (b.out[k] || {}).ms || 0);
  fs.writeFileSync(OUT, JSON.stringify({ new: a.out, old: b.out }, null, 1));
  console.log('情境 ' + keys.length + '（舊版 0 錯 ' + zero + '）；逐欄相同 ' + same + '、不同 ' + diff + '；jsdomError 新 ' + a.errs.length + '／舊 ' + b.errs.length);
  console.log('反推耗時（jsdom，含套用後重畫）新 最大 ' + Math.max(...msN) + ' ms、合計 ' + msN.reduce((p, q) => p + q, 0) + ' ms；舊 最大 ' + Math.max(...msO) + ' ms、合計 ' + msO.reduce((p, q) => p + q, 0) + ' ms；總時間 ' + Math.round((Date.now() - t) / 1000) + ' s');
  D.slice(0, 30).forEach(x => console.log('  ✗ ' + x));
  console.log((diff || a.errs.length ? 'FAIL' : 'PASS') + ' ' + same + '/' + keys.length);
  process.exit(diff || a.errs.length ? 1 : 0);
})();
