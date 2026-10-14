#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   check_datamap_tft_all.js — datamap v1.28.2：MNT Auto 每個 Panel_mode × sub_panel_mode 組合都要畫得出 TFT 接線圖
   Bruce 2026-10-14：「不對啊，這些都是用預設的設定，所以應該都要有圖才對。」
   驗收：任何 MNT 型號、Hand Mode 關，panel 0～3 × sub 0～7 × FORCE_DE_EN 0／1 × Mirror 0／1 × CHRB 0／1
         ⇒ ③ TFT 接線圖卡有圖；只有「無依據」白名單可以沒圖，且原因直接寫在 TFT 卡（不得寫「見上方 ③」）。
   依據優先序：瑞鼎 Excel（common/datamap-auto.js XL_MNT）＞ RT7／Line OD；兩者都有的組合必須逐條相同（24 條 Data 線名稱）。
   用法：node tools/check_datamap_tft_all.js [repo]
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const DM = require(path.join(ROOT, 'common/datamap-core.js')); global.TCONDataMap = DM;
const LOD = require(path.join(ROOT, 'common/datamap-lod.js')); global.TCONDataMapLOD = LOD;
const A = require(path.join(ROOT, 'common/datamap-auto.js'));
let fail = 0, pass = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PN = ['1D1G', 'Zigzag', 'HSD', 'LTPS'];
/* 無依據白名單：瑞鼎 Excel HSD 分頁只有 sub 0～5（type1／type4／type3-5／type4+zigzag／8pixel／4line-4pixel），原廠 RT7 與 Line OD 也沒有 HSD sub 6、7 */
const NO_BASIS = { '2:6': 'HSD sub 6：Excel／RT7／Line OD 都沒有', '2:7': 'HSD sub 7：Excel／RT7／Line OD 都沒有' };
const MNT = DM.MODEL_KEYS.filter(m => DM.MODELS[m].kind === 'mnt');
const L24 = t => JSON.stringify(LOD.linesN(t, 24).map(r => r.names));

console.log('── ① 純邏輯：Excel 表與 RT7／Line OD 交叉驗證（MNT：' + MNT.join('、') + '）');
for (const m of MNT) {
  for (let p = 0; p < 4; p++) for (let sp = 0; sp < 8; sp++) {
    const s = Object.assign(DM.emptyState(m), { hand: 0, panel: p, subPanel: sp });
    const xw = A.xlsxWire(m, s), i = A.match(m, s), e = i >= 0 ? A.list(m)[i] : null, rw = A.wiring(e);
    if (NO_BASIS[p + ':' + sp]) { ok(!xw.t && !rw && /沒有依據/.test(xw.why), m + ' ' + PN[p] + ' sub' + sp + ' 列在無依據白名單：' + (xw.why || '')); continue; }
    ok(!!xw.t, m + ' ' + PN[p] + ' sub' + sp + '：Excel 有接線');
    if (xw.t && rw) ok(L24(xw.t) === L24(rw), m + ' ' + PN[p] + ' sub' + sp + '：Excel「' + xw.e.name + '」＝RT7／Line OD「' + e.name + '」（24 條 Data 線）');
  }
}
{
  const w = (p, sp) => A.xlsxWire('EM01', Object.assign(DM.emptyState('EM01'), { panel: p, subPanel: sp })).t;
  ok(L24(w(2, 4)) === L24(LOD.TYPES[29]), 'HSD 8pixel（Excel Manual）＝Line OD Type 29');
  ok(L24(w(2, 5)) === L24(LOD.TYPES[30]), 'HSD 4line-4pixel（Excel Manual）＝Line OD Type 30');
  ok(w(3, 1).g === 'dual' && w(3, 0).g === 'tri', 'LTPS mux2＝Dual、mux3＝Tri');
}

console.log('── ② 頁面（jsdom）：每個組合 TFT 卡有圖，或白名單＋原因寫在卡上');
(async () => {
  const { JSDOM, VirtualConsole } = require(path.join(ROOT, 'node_modules/jsdom'));
  const vc = new VirtualConsole(); vc.on('jsdomError', e => { if (!/Could not load|Not implemented/.test(e.message)) { console.log('  jsdomError', e.message); fail++; } });
  const dom = await JSDOM.fromFile(path.join(ROOT, 'datamap.html'), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) { const mem = {}; Object.defineProperty(w, 'localStorage', { configurable: true, get: () => ({ getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } }) });
      w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = function () {}; } });
  await new Promise(r => dom.window.addEventListener('load', r));
  const w = dom.window, d = w.document, $ = id => d.getElementById(id);
  const table = [];
  let n = 0;
  for (const m of MNT) {
    $('dm-model').value = m; $('dm-model').dispatchEvent(new w.Event('change')); await sleep(60);
    const S = w.dmState;
    for (let p = 0; p < 4; p++) for (let sp = 0; sp < 8; sp++) {
      let row = null;
      for (const de of [[0, 0], [1, 0x1F], [1, 0x0E]]) for (const mi of [0, 1]) for (const rb of [0, 1]) {
        Object.assign(S.cur, { hand: 0, panel: p, subPanel: sp, deEn: de[0], deSel: de[1], mirror: mi, chrb: rb });
        w.dmRenderPv(); n++;
        const pic = !$('dm-tftbody').classList.contains('hidden') && d.querySelectorAll('#dm-pv-tft rect').length > 0;
        const note = $('dm-tftnote').textContent, key = p + ':' + sp, tag = m + ' ' + PN[p] + ' sub' + sp + ' de_en' + de[0] + (de[0] ? '/0x' + de[1].toString(16) : '') + ' mir' + mi + ' chrb' + rb;
        if (NO_BASIS[key]) ok(!pic && /沒有依據/.test(note) && !/③/.test(note), tag + '：白名單、卡上寫原因「' + note + '」');
        else ok(pic && $('dm-tftnote').classList.contains('hidden'), tag + '：應有 TFT 圖（' + note + '）');
        if (!row) row = { m, p, sp, pic, tag: $('dm-pvtag').textContent, note };
      }
      table.push(row);
    }
  }

  console.log('── ③ ②-2 說明移除（v1.31.1，Bruce 10/14「很複雜的說明…不是已經說要移除了嗎…『詳細』按鈕…完全不需要」）');
  {
    $('dm-model').value = 'EM02'; $('dm-model').dispatchEvent(new w.Event('change')); await sleep(60);
    const S = w.dmState; for (let i = 0; i < 24; i++) S.cur['c' + i] = i % 12;
    Object.assign(S.cur, { hand: 1, panel: 2, subPanel: 1, deEn: 1, deSel: 0x1F }); w.dmRender(); await sleep(20);
    ok(!$('dm-tdet-tog') && !$('dm-tdet') && !$('dm-tuse') && !$('dm-texp'), '「詳細」按鈕、T 使用分析、依 T 展開整行已刪除（不是收起）');
    ok(!/T 使用分析|依 T 展開|怎麼算|未經實機量測|Python UI 沒有|前循環 R-2|第二組（r2..b3）：短循環/.test((() => { const c = d.body.cloneNode(true); c.querySelectorAll('script,style').forEach(e => e.remove()); return c.textContent; })()), '整頁不再出現長說明字樣');
    ok(!!$('dm-pv-tft') && !!$('dm-bench-tog') && !!$('dm-expx') && !!$('dm-impx') && !!$('dm-pv-lock') && typeof w.TCONDataMap.tUse === 'function', '功能保留：TFT 接線圖、Benchmark、Export／Import、鎖定接線、DM.tUse 計算都在');
    ok($('f-deSelTs').textContent === '0x1F → T1～T9（第 1～9 欄）', 'FORCE_DE_SEL 一行「' + $('f-deSelTs').textContent + '」');
    ok($('dm-tsum').classList.contains('hidden') && $('dm-tsum').getAttribute('data-t') === '1', '沒有警示時不顯示 T1 起始欄說明列（data-t＝1）');
    ok(!$('dm-lg-tt'), '圖例角標說明已刪除');
    Object.assign(S.cur, { hand: 0 }); w.dmRender(); await sleep(20);
  }
  /* 回報清單（每型號 32 組；每組 3×2×2＝12 種 DE／Mirror／CHRB 都跑過） */
  console.log('── 清單（' + n + ' 次 render）');
  for (const r of table) console.log('  ' + r.m + '  ' + PN[r.p].padEnd(6) + ' sub' + r.sp + '  ' + (r.pic ? '有圖  ' + r.tag : '無依據  ' + r.note));
  console.log((fail ? '✗' : '✓') + ' check_datamap_tft_all：' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})();
