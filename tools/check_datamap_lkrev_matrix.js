// v1.35.2 Benchmark 自動反推 全矩陣（Bruce 10/15「這個修改的邏輯要全部都通用…不要針對特定案件修改」）
// 用法：node tools/check_datamap_lkrev_matrix.js [repo] [型號,…]
// 每個有 Auto 清單的型號 × 每個 Auto 樣式（1D1G／Zigzag 各 type／HSD 各 sub／LTPS／Tri…）鎖定（CH1 左、正向、RGB、不對調）→ 開 Benchmark →
// 變更：CH1 右｜BGR｜輸出對調｜SHL 反向｜CH1 右＋BGR＋對調＋SHL（一次改多項）→ 按一次反推。
// 判定：鎖定時 0 呼吸燈的組合，反推後必須 0（呼吸燈＝逐格收到≠鎖定目標）；不是 0 的列出（型號／樣式／變更／剩幾格）＝真的無解或待查，不算成 0。
// 鎖定時就有呼吸燈（接線圖本身衝突）或沒有圖的樣式列為「略過」並寫原因。
'use strict';
const path = require('path');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const ONLY = process.argv[3] ? process.argv[3].split(',') : null;
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
  const HW = { ch1: ['dm-pv-first', 'l', 'r'], bgr: ['dm-pv-stripe', 'rgb', 'bgr'], swap: ['dm-pv-swap', false, true], shl: ['dm-pv-drv', 'f', 'r'] };
  const reset = () => { if ($('dm-pv-lock').getAttribute('data-locked') === '1') $('dm-pv-lock').click(); B.open(false); Object.keys(HW).forEach(k => fire($(HW[k][0]), HW[k][1])); };
  const err = () => d.querySelectorAll('#dm-pv-tft .pv-err').length;
  const CHG = [['ch1'], ['bgr'], ['swap'], ['shl'], ['ch1', 'bgr', 'swap', 'shl']];
  const models = DM.SELECT_KEYS.filter(k => A.fam && A.fam(k) && (!ONLY || ONLY.includes(k)));
  let n = 0, zero = 0, skip = [], nz = [], worse = 0;
  for (const m of models) {
    const L = A.list(m) || [];
    for (let i = 0; i < L.length; i++) {
      for (const chg of CHG) {
        reset(); setModel(m); S.cur = DM.setHand(m, A.apply(m, DM.emptyState(m), i), false); w.dmRender();
        if (!$('dm-pv-tft').querySelector('rect')) { if (chg === CHG[0]) skip.push(m + ' ' + L[i].name + '：沒有接線圖'); continue; }
        $('dm-pv-lock').click(); const e0 = err(); B.open(true);
        if (e0) { if (chg === CHG[0]) skip.push(m + ' ' + L[i].name + '：鎖定時已有 ' + e0 + ' 格呼吸燈（接線圖本身）'); continue; }
        chg.forEach(k => fire($(HW[k][0]), HW[k][2]));
        const e1 = err(), R = B.reverse(), e2 = err(); n++;
        if (e2 === 0 && R && R.bad === 0) zero++; else nz.push(m + ' ' + L[i].name + ' × ' + chg.join('+') + '：改後 ' + e1 + ' → 反推後 ' + e2 + '（' + (R && R.txt) + '）');
        if (e2 > e0 && !(R && R.applied === false)) worse++;   // v1.35.5：有錯不套用 ⇒ 接線圖維持改條件後的樣子，不算變差
        if (R && (R.bad === 0) !== (e2 === 0)) { worse++; nz.push('  ↑ 結果行與接線圖不一致'); }
      }
    }
  }
  reset();
  console.log('略過 ' + skip.length + '：\n  ' + skip.join('\n  '));
  console.log('未達 0（列出，不算成 0）' + nz.length + '：\n  ' + nz.join('\n  '));
  console.log('check_datamap_lkrev_matrix：型號 ' + models.join('、') + '｜' + n + ' 組，反推 0 呼吸燈 ' + zero + '、未達 0 ' + (n - zero) + '、比鎖定時更差／不一致 ' + worse);
  process.exit(worse ? 1 : 0);
})();
