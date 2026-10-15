// v1.35.5 固定測試（Bruce 10/15 實機回報：E503 HSD Type 4+Z-Zag(BOE) 鎖定 → CH1 最右 → 自動反推「最少 56 格錯」還被套用到主表）
// 用法：node tools/check_datamap_lkrev_hsd.js [repo]
// E503／EM01／EM02 × HSD Type 4+Z-Zag(BOE)（panel 2、sub 3、rd 1 的 Auto 樣式）× 鎖定時 Mirror 0／1 × 鎖定時 CH1 左／右 → CH1 換到另一邊 → 自動反推：
//   A 0 錯 ⇒ 套用（R.applied）、接線圖 0 呼吸燈、Hand 開。
//   B 有錯 ⇒ 不套用：② 全部暫存器（含 Hand）與按下前完全相同、R.applied＝false、結果行寫「未套用」、列出錯格（R.wrong）。
//   C MNT（EM01／EM02）鎖定時 0 呼吸燈的組合必須 0 錯（Bruce 舉的 EM01 HSD 與同型 EM02）。
//   D E503 到不了 0 的組合：列出最佳候選與可選 pixel 範圍（證據），不算成 0。
'use strict';
const path = require('path');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const { JSDOM, VirtualConsole } = require(path.join(ROOT, 'node_modules/jsdom'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } return c; };
(async () => {
  const LS = {};
  const vc = new VirtualConsole(); vc.on('jsdomError', e => { console.log('jsdomError', e.message); fail++; });
  const dom = await JSDOM.fromFile(path.join(ROOT, 'datamap.html'), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) { w.WebSocket = function () { throw new Error('no ws'); }; Object.defineProperty(w, 'localStorage', { configurable: true, value: { getItem: k => (k in LS ? LS[k] : null), setItem: (k, v) => { LS[k] = String(v); }, removeItem: k => { delete LS[k]; } } }); } });
  await new Promise(r => dom.window.addEventListener('load', r));
  const w = dom.window, d = w.document, $ = id => d.getElementById(id), B = w.dmBench, S = w.dmState, DM = w.TCONDataMap, A = w.TCONDataMapAuto;
  const fire = (el, v) => { if (v !== undefined) { if (el.type === 'checkbox') el.checked = v; else el.value = v; } el.dispatchEvent(new w.Event('change')); };
  const setModel = k => { if ($('dm-model').value !== k) { fire($('dm-model'), k); if (!$('dm-ask').classList.contains('hidden')) $('dm-ask-yes').click(); } };
  const reset = () => { if ($('dm-pv-lock').getAttribute('data-locked') === '1') $('dm-pv-lock').click(); B.open(false); ['l'].forEach(v => fire($('dm-pv-first'), v)); fire($('dm-pv-stripe'), 'rgb'); fire($('dm-pv-drv'), 'f'); fire($('dm-pv-swap'), false); };
  const err = () => d.querySelectorAll('#dm-pv-tft .pv-err').length;
  const regs = m => JSON.stringify(DM.fieldsOf(m).map(f => f.id + '=' + (S.cur[f.id] >>> 0)));
  const list = [];
  for (const m of ['E503', 'EM01', 'EM02']) {
    setModel(m);
    const L = A.list(m) || [];
    let idx = L.findIndex(x => /HSD Type 4\+Z-Zag\(BOE\)/.test(x.name));
    if (idx < 0) idx = L.findIndex(x => { const s = A.apply(m, DM.emptyState(m), L.indexOf(x)); return (s.panel | 0) === 2 && (s.subPanel | 0) === 3 && (s.rd | 0) === 1 && /HSD/.test(x.name) && !/RB_chg/.test(x.name); });
    if (!ok(idx >= 0, m + '：找不到 HSD Type 4+Z-Zag(BOE)（panel 2／sub 3／rd 1）樣式')) continue;
    for (const mir of [0, 1]) for (const ch of ['l', 'r']) {
      const tag = m + ' ' + L[idx].name + ' Mirror' + mir + ' 鎖定 CH1' + (ch === 'l' ? '左→右' : '右→左');
      reset(); setModel(m); fire($('dm-pv-first'), ch);
      const s = DM.setHand(m, A.apply(m, DM.emptyState(m), idx), false);
      s.mirror = mir; const RL = DM.fieldById(m, 'rvsL'), RH = DM.fieldById(m, 'rvsH');
      if (RL) s.rvsL = mir ? (1 << RL.bits) - 1 : 0; if (RH) s.rvsH = mir ? (1 << RH.bits) - 1 : 0;
      S.cur = s; w.dmRender();
      $('dm-pv-lock').click(); const e0 = err(); B.open(true);
      if (e0) { list.push(tag + '：鎖定時已有 ' + e0 + ' 格呼吸燈（接線圖本身），略過'); continue; }
      fire($('dm-pv-first'), ch === 'l' ? 'r' : 'l');
      const before = regs(m), e1 = err(), R = B.reverse(), e2 = err();
      if (!ok(R && typeof R.bad === 'number', tag + '：沒有反推結果')) continue;
      if (R.bad === 0) {
        ok(R.applied === true && e2 === 0 && (S.cur.hand | 0) === 1, tag + '：0 錯應套用且 0 呼吸燈、Hand 開（applied ' + R.applied + '，接線圖 ' + e2 + '）');
        list.push(tag + '：0 錯（' + R.txt + '）');
      } else {
        ok(R.applied === false, tag + '：有錯不應套用');
        ok(regs(m) === before, tag + '：有錯時 ② 全部暫存器（含 Hand）應與按下前相同');
        ok(e2 === e1, tag + '：有錯時接線圖應維持按下前（' + e1 + ' → ' + e2 + '）');
        ok(/未套用/.test(R.txt) && Array.isArray(R.wrong) && R.wrong.length > 0, tag + '：結果行要寫未套用並列出錯格');
        ok(DM.MODELS[m].kind !== 'mnt', tag + '：MNT 這組應能 0 錯（' + R.txt + '）');
        const U = {}; for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) DM.cellOptions(m, R.best || S.cur, r, c).forEach(o => { const k = /^[RGB](-?\d+)$/.exec(o.name); if (k) U[+k[1]] = 1; });
        const ks = Object.keys(U).map(Number).sort((a, b) => a - b);
        const bt = [0, 1, 2, 3].map(r => [0, 1, 2, 3, 4, 5].map(c => { const v = DM.cellView(m, R.best, r, c); return v.blank ? '·' : v.txt; }).join(' ')).join('｜');
        list.push(tag + '：無 0 錯解、未套用；最佳 ' + R.bad + ' 格（' + R.txt + '）；最佳候選 ' + bt + '；格子可選 pixel ' + ks[0] + '～' + ks[ks.length - 1] + '；錯格例 ' + R.wrong.slice(0, 6).map(x => x.want + '→' + x.got).join('、'));
      }
    }
  }
  reset();
  console.log(list.map(x => '  ' + x).join('\n'));
  console.log('check_datamap_lkrev_hsd：' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})();
