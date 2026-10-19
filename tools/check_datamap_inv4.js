#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   check_datamap_inv4.js — datamap v1.35.33 盤點未做項補完（派工 237945451570647040）
   Bruce 10/19 22:3x「Data mapping 的盤點，我們可以自己做、還沒做的，現在就進行。」
         10/19 22:4x「E503 我就可以回答你，實際上它的結果是跟 MNT 的提案是一樣的」
         10/19 22:3x「我之前就說可以改，不用寫 0xE，但是預設的要 0xE。」「501 跟 503 是同一個家族」
   A  EN01 Auto ZigZag Type 1～8：③ line 數＝循環（Type 7／8＝8 條）、每條 line 每格＝E507 xlsm（sft0／sft1 依 z0～z7）；
      ② 表格 Type 7／8 多列 Line 5～8（Auto 唯讀），列名＝③ 列名，Line 5～8 的格子＝另一個 Type 的 Line 1～4 換算（交叉檢查）
   B  EN01 HSD_MAP_INV：欄位 0x391[4]、勾選框 ↔ 暫存器；Auto HSD Type 4＋INV＝1 ⇒ ③ 逐格＝xlsm HSD!H229；
      HSD 其他子類型＋INV＝1 ⇒ 待 RD；INV＝0 與非 HSD 不受影響；Hand 不換算
   C  NB：E501A／E501B／E503 FORCE_DE_SEL 可改不蓋回 0xE、預設 0xE、code 18～29 名稱；DAZ6138／6139 維持舊規則
   用法：node tools/check_datamap_inv4.js [repo]
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path'), fs = require('fs');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const DM = require(path.join(ROOT, 'common/datamap-core.js')); global.TCONDataMap = DM;
const EX = JSON.parse(fs.readFileSync(path.join(__dirname, 'datamap_en01_auto_examples.json'), 'utf8'));
let pass = 0, fail = 0; const fails = [], rep = [];
const ok = (c, m) => { if (c) pass++; else { fail++; if (fails.length < 200) fails.push(m); } };
(async () => {
  const { JSDOM, VirtualConsole } = require(path.join(ROOT, 'node_modules/jsdom'));
  const vc = new VirtualConsole(); const jerr = []; vc.on('jsdomError', e => jerr.push(e.message));
  const dom = await JSDOM.fromFile(path.join(ROOT, 'datamap.html'), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc, beforeParse(win) { win.WebSocket = function () { throw new Error('no ws'); }; } });
  await new Promise(r => dom.window.addEventListener('load', r));
  const w = dom.window, d = w.document, $ = id => d.getElementById(id);
  const fire = (id, v) => { const e = $(id); if (e.type === 'checkbox') e.checked = !!v; else e.value = String(v); e.dispatchEvent(new w.Event('change')); };
  const cmpBlock = (P, L, B, tag) => {   // 非 MUX：位置 p＝ch＋n×b，列＝(k＝L, gi＝j)
    let nn = 0, dd = 0; const ex = [], n = P.period;
    B.cells.forEach(x => {
      const p = x.ch + n * x.b, row = P.rows.filter(r => r.k === L && r.gi === x.j)[0];
      let cell = row && row.names[p];
      if (row && p >= row.names.length) { const c0 = row.names[p % n]; cell = c0 && !c0.off ? { name: DM.linName(c0.t + P.shift * Math.floor(p / n)) } : c0; }
      nn++; if (!cell || cell.off || cell.name !== x.name) { dd++; if (ex.length < 3) ex.push(tag + ' L' + (L + 1) + ' ' + x.col + ' xlsm ' + x.name + ' ≠ ' + (cell ? cell.name : '—')); }
    });
    return { nn, dd, ex };
  };
  fire('dm-model', 'EN01');
  /* ── A：ZigZag Type 1～8 ── */
  let nA = 0, dA = 0;
  for (let z = 0; z < 8; z++) {
    const s = DM.emptyState('EN01'); s.panel = 1; s.subPanel = z; s.rd = 0; s.hand = 0;
    w.dmState.cur = s; w.dmState.en01Seg = null; w.dmRender();
    const P = w.dmPvModel(), pat = DM.EN01_ZZ_SFT[z], per = /^(\d+)\1$/.test(pat) && pat.slice(0, 4) !== pat.slice(4) ? 8 : 4;
    const want = z >= 6 ? 8 : 4;
    ok(P.ok && P.auto && P.nl === want, 'ZZ Type ' + (z + 1) + '：③ line 數 ' + P.nl + '（應 ' + want + '）');
    let nn = 0, dd = 0, ex = [];
    for (let L = 0; L < want; L++) { const r = cmpBlock(P, L, EX[pat.charAt(L) === '1' ? 'zz_sft1' : 'zz_sft0'][0], 'ZZ' + (z + 1)); nn += r.nn; dd += r.dd; ex = ex.concat(r.ex); }
    nA += nn; dA += dd; ok(dd === 0, 'ZZ Type ' + (z + 1) + ' 差 ' + dd + '：' + ex.slice(0, 3).join('；'));
    const svg = d.querySelector('svg[data-nl]');
    ok(svg && +svg.getAttribute('data-nl') >= want, 'ZZ Type ' + (z + 1) + '：③ SVG 列數 ' + (svg && svg.getAttribute('data-nl')));
    // ②：列數、列名
    const tr = [...d.querySelectorAll('tr[id^="dm-etr"]')].map(t => t.querySelector('th span').textContent);
    ok(tr.length === want, 'ZZ Type ' + (z + 1) + '：② 列數 ' + tr.length + '（' + tr.join('、') + '）');
    if (want === 8) ok(tr[4] === 'Line 5（Auto）' && tr[7] === 'Line 8（Auto）', '② Line 5～8 列名：' + tr.slice(4).join('、'));
    const p8 = /列出 Line 1～8/.test($('dm-pvnote').textContent);
    ok(p8 === (want === 8), 'ZZ Type ' + (z + 1) + '：註記 Line 1～8＝' + p8);
    rep.push({ item: 'A', case: 'ZigZag Type ' + (z + 1) + '（' + pat + '）', lines3: P.nl, rows2: tr.length, cells: nn, diff: dd });
  }
  { // ② 交叉：Type 7 Line 5～8＝Type 8 Line 1～4（00001111 vs 11110000）
    const get = (z) => { const s = DM.emptyState('EN01'); s.panel = 1; s.subPanel = z; s.hand = 0; w.dmState.cur = s; w.dmRender(); const o = {}; [0, 6, 12, 18, 24, 30, 36, 42].forEach(r => { const e = $('dm-e' + r + '-0'); o[r] = e ? [...Array(12).keys()].map(c => $('dm-e' + r + '-' + c).value).join(' ') : null; }); return o; };
    const t7 = get(6), t8 = get(7);
    ok(t7[24] === t8[0] && t7[30] === t8[6] && t7[36] === t8[12] && t7[42] === t8[18], '② Type 7 Line 5～8＝Type 8 Line 1～4');
    ok(t7[0] === t8[24] && t7[18] === t8[42], '② Type 7 Line 1～4＝Type 8 Line 5～8');
    ok($('dm-e24-0').disabled, '② Line 5 唯讀');
    rep.push({ item: 'A', case: '② Type 7 Line 5 vs Type 8 Line 1', a: t7[24], b: t8[0] });
  }
  console.log('A ZigZag：8 Type、' + nA + ' 格、差異 ' + dA);
  console.log("B start");
  /* ── B：HSD_MAP_INV ── */
  const F = DM.fieldById('EN01', 'hsdInv');
  ok(F && F.parts[0][0] === 0x391 && F.parts[0][1] === 4 && F.parts[0][2] === 4, 'EN01 hsdInv＝0x391[4]：' + JSON.stringify(F && F.parts));
  ['EM01', 'E503', 'DAZ6138'].forEach(k => ok(!DM.fieldById(k, 'hsdInv'), k + ' 沒有 hsdInv 欄位'));
  { const s = DM.emptyState('EN01'); w.dmState.cur = s; w.dmRender();
    ok(!$('f-hsdInv').closest('.dm-frow').classList.contains('hidden'), 'EN01 顯示 HSD_MAP_INV 列');
    console.log("B1");
    fire('f-hsdInv', 1);
    console.log("B2");
    ok((w.dmState.cur.hsdInv | 0) === 1 && ((w.dmState.img[0x391] | 0) & 0x10) === 0x10, '勾選 ⇒ state 1、0x391 bit4＝1（img=' + (w.dmState.img[0x391] | 0).toString(16) + '）');
    const oth = (w.dmState.img[0x391] | 0) & 0xEF;
    fire('f-hsdInv', 0);
    ok((w.dmState.cur.hsdInv | 0) === 0 && ((w.dmState.img[0x391] | 0) & 0x10) === 0 && ((w.dmState.img[0x391] | 0) & 0xEF) === oth, '取消 ⇒ bit4＝0、其他 bit 不動');
    const img = new Uint8Array(0x2000); img[0x391] = 0x10; const st = DM.decode('EN01', a => img[a] | 0);
    ok((st.hsdInv | 0) === 1, 'decode 0x391=0x10 ⇒ hsdInv 1');
    fire('dm-model', 'EM01'); ok($('f-hsdInv').closest('.dm-frow').classList.contains('hidden'), 'EM01 不顯示 HSD_MAP_INV 列'); fire('dm-model', 'EN01');
  }
  const hsdCase = (sb, inv) => { const s = DM.emptyState('EN01'); s.panel = 2; s.subPanel = sb; s.rd = 1; s.hand = 0; s.hsdInv = inv; w.dmState.cur = s; w.dmState.en01Seg = null; w.dmRender(); return w.dmPvModel(); };
  { const P = hsdCase(1, 1); ok(P.ok && P.auto, 'HSD Type 4＋INV：有畫');
    let nn = 0, dd = 0, ex = []; for (let L = 0; L < 4; L++) { const r = cmpBlock(P, L, EX.hsd4inv[0], 'H229'); nn += r.nn; dd += r.dd; ex = ex.concat(r.ex); }
    ok(dd === 0 && nn > 0, 'HSD Type 4＋INV＝xlsm H229 差 ' + dd + '／' + nn + '：' + ex.join('；'));
    ok(/HSD!H229/.test($('dm-em01lbl').textContent) && /HSD_MAP_INV＝1/.test($('dm-pvtag').textContent), '出處 H229、標題含 INV：' + $('dm-pvtag').textContent);
    const c = $('dm-e0-0'); ok(c && c.value === 'G1', '② L1-1 Data1＝G1（H229 J229）：' + (c && c.value));
    rep.push({ item: 'B', case: 'HSD Type 4＋HSD_MAP_INV＝1 vs E507 HSD!H229', cells: nn, diff: dd });
    const P0 = hsdCase(1, 0); let n0 = 0, d0 = 0; for (let L = 0; L < 4; L++) { const r = cmpBlock(P0, L, EX.hsd4[0], 'H213'); n0 += r.nn; d0 += r.dd; }
    ok(d0 === 0, 'HSD Type 4＋INV 0＝H213 差 ' + d0); rep.push({ item: 'B', case: 'HSD Type 4＋INV＝0 vs H213（不變）', cells: n0, diff: d0 });
    // 對調關係：H229 每格＝H213 同 Data 另一個 SW
    const nm = (B, ch, j) => (B.cells.find(x => x.ch === ch && x.j === j && x.b === 0) || {}).name; let sw = 0;
    for (let ch = 0; ch < 12; ch++) if (nm(EX.hsd4[0], ch, 0) && nm(EX.hsd4[0], ch, 0) === nm(EX.hsd4inv[0], ch, 1) && nm(EX.hsd4[0], ch, 1) === nm(EX.hsd4inv[0], ch, 0)) sw++;
    ok(sw === 12, 'H229＝H213 SW1／SW2 對調（12 個 Data 中 ' + sw + '）'); rep.push({ item: 'B', case: 'H229 是 H213 的 SW1↔SW2', n: sw });
  }
  [0, 2, 3].forEach(sb => { const P = hsdCase(sb, 1); ok(!P.ok && /待 RD/.test(P.noPicWhy || '') && /HSD_MAP_INV＝1/.test(P.noPicWhy || ''), 'HSD sub ' + sb + '＋INV ⇒ 待 RD：' + (P.noPicWhy || '')); rep.push({ item: 'B', case: 'HSD ' + DM.EN01_SUB_NAMES[2][sb] + '＋INV＝1', note: P.noPicWhy }); });
  { const s = DM.emptyState('EN01'); s.panel = 0; s.hand = 0; s.hsdInv = 1; w.dmState.cur = s; w.dmRender(); const P = w.dmPvModel(); const r = cmpBlock(P, 0, EX.normal[0], 'N'); ok(P.ok && r.dd === 0, 'Normal＋INV 不受影響 差 ' + r.dd); }
  { // Hand：INV 不改換算
    const s = DM.emptyState('EN01'); s.panel = 2; s.subPanel = 1; s.rd = 1; s.hand = 1; s.deEn = 1; s.deSel = 2;
    for (let i = 0; i < 288; i++) s['e' + i] = (i * 7) % 48;
    w.dmState.cur = s; w.dmRender(); const A = JSON.stringify(w.dmPvModel().rows.map(r => r.names.map(c => c.name)));
    const s2 = DM.cloneState(s); s2.hsdInv = 1; w.dmState.cur = s2; w.dmRender(); const B = JSON.stringify(w.dmPvModel().rows.map(r => r.names.map(c => c.name)));
    ok(A === B, 'Hand：HSD_MAP_INV 不改 ③'); }
  console.log("C start");
  /* ── C：NB ── */
  for (const k of ['E503', 'E501A', 'E501B', 'DAZ6138', 'DAZ6139']) {
    const fam = DM.nbRm8100x(k);
    fire('dm-model', k);
    ok((w.dmState.cur.deSel | 0) === 0x0E, k + '：預設 FORCE_DE_SEL 0x0E（' + (w.dmState.cur.deSel | 0) + '）');
    const s = DM.cloneState(w.dmState.cur); s.hand = 1; s.deEn = 1; s.deSel = 0x0F; delete s.deRev;
    const n = DM.pyNormalize(k, DM.cloneState(s));
    ok((n.deSel | 0) === (fam ? 0x0F : 0x0E), k + '：Hand 0x0F 未反推 ⇒ pyNormalize 後 ' + (n.deSel | 0).toString(16) + '（應 ' + (fam ? 'f 保留' : 'e 舊規則') + '）');
    ok(DM.nbSel(k, s) === (fam ? 0x0F : 0x0E), k + '：nbSel ' + DM.nbSel(k, s));
    const z = DM.cloneState(s); z.deSel = 0; ok((DM.pyNormalize(k, z).deSel | 0) === 0x0E, k + '：0 ⇒ 補預設 0xE');
    if (fam) {
      // UI：手改 FORCE_DE_SEL 15 後改表格，不被蓋回
      const h = DM.cloneState(w.dmState.cur); h.hand = 1; h.deEn = 1; h.deSel = 0x0E; h.panel = 2; h.subPanel = 0; h.rd = 1; w.dmState.cur = h; w.dmRender();
      ok(!$('f-deSel').disabled && !$('f-deSel').readOnly, k + '：FORCE_DE_SEL 欄位可改');
      fire('f-deSel', 15); ok((w.dmState.cur.deSel | 0) === 15, k + '：手改 15');
      const sel = $('dm-c0-0'); const opt = [...sel.options].map(o => o.value).filter(v => v && v !== '__ns' && v !== sel.value)[0];
      fire('dm-c0-0', opt); ok((w.dmState.cur.deSel | 0) === 15, k + '：改表格後 FORCE_DE_SEL 仍 15（' + (w.dmState.cur.deSel | 0) + '）');
      // code 18～29：名稱存在、不是非標準
      const t = DM.cloneState(w.dmState.cur); t.deSel = 0x0E;
      let std = 0; for (let c = 18; c < 30; c++) { const u = DM.cloneState(t); u.c0 = c; const v = DM.cellView(k, u, 0, 0); if (v.std && /-/.test(v.txt)) std++; }
      ok(std === 12, k + '：code 18～29 都是負 pixel 標準名稱（' + std + '/12）');
      rep.push({ item: 'C', case: k, deSelDefault: '0x0E', keep0F: true, code18_29: std });
    } else rep.push({ item: 'C', case: k + '（不在範圍，維持）', keep0F: false });
  }
  ok(jerr.length === 0, 'jsdom 錯誤：' + jerr.slice(0, 3).join(' | '));
  fs.writeFileSync(path.join(ROOT, 'outputs', 'check_datamap_inv4_report.json'), JSON.stringify(rep, null, 1));
  console.log((fail ? 'FAIL' : 'PASS') + ' ' + pass + '/' + fail);
  fails.slice(0, 40).forEach(f => console.log('  ✗ ' + f));
  process.exit(fail ? 1 : 0);
})();
