#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   check_datamap_autounify.js — datamap v1.35.30 全型號 Auto 設定方式統一＋EN01 Auto 接線圖（派工 237801892587515904）
   Bruce 10/19 12:5x「en01應該也有對應的auto mode吧，怎麼現在看來只能用hand mode才能看到跟mux有關的接線圖?」
         10/19 15:0x「為何data mapping v1.35.28，我用en01 auto mode，仍然無法像是其他tcon可以選擇不同預設的data mapping?」
         10/19 16:1x「E503的auto mode做法為何不能像是EM01這種，可以選擇1D1G/ZZag/HSD/LTPS(就是mux)…甚至看能否也開放single gate那一項可以更改，
                     再連動到對應的panel mode的那些選項，盡量讓每一顆tcon的設定模式相同」

   A  EN01 Auto 逐格＝E507 xlsm：每個有原廠範例的 PANEL×SUB×RD 組合（Hand 關）⇒ ③ 模型每條 line、每個 SW、每個循環接到的名稱＝xlsm 輸出格
      （tools/datamap_en01_auto_examples.json，由 E507_rt7_sram_w_hand(1T4P).xlsm 抽出；ZigZag Type 1～8 依 data_sft 表 z0～z7 選 sft0／sft1 範例）。
   B  EN01 Auto 推不出的組合 ⇒ ③ 不畫、寫「此組合原廠無資料（待 RD）」；② 表格 Auto 顯示推得的 code（唯讀）。
   C  全型號 Auto 介面：Hand 關時都是 Panel_mode＋sub_panel_mode 兩個下拉（EM02／E512 另保留 RT7 清單）；逐項切換 ⇒ panel／sub／rd 寫入值、Gate Type 顯示。
   D  Gate Type 在 Auto 可改、與 Panel_mode 雙向連動；Hand 開時 Gate Type 項目與 v1.35.29 相同。
   用法：node tools/check_datamap_autounify.js [repo]
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path'), fs = require('fs');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const DM = require(path.join(ROOT, 'common/datamap-core.js')); global.TCONDataMap = DM;
const LOD = require(path.join(ROOT, 'common/datamap-lod.js')); global.TCONDataMapLOD = LOD;
const AUTO = require(path.join(ROOT, 'common/datamap-auto.js'));
const EX = JSON.parse(fs.readFileSync(path.join(__dirname, 'datamap_en01_auto_examples.json'), 'utf8'));
let pass = 0, fail = 0; const fails = [], report = { A: [], B: [], C: [], D: [] };
const ok = (c, m) => { if (c) pass++; else { fail++; if (fails.length < 300) fails.push(m); } };
const MUXP = { 2: { 1: [[1, 2], [3, 4]], 2: [[1, 3], [2, 4]] }, 3: { 1: [[1, 2, 3], [4, 5, 6]], 2: [[1, 5, 3], [4, 2, 6]] }, 4: { 1: [[1, 3, 5, 7], [2, 4, 6, 8]] }, 6: { 1: [[1, 2, 3, 4, 5, 6], [10, 11, 12, 7, 8, 9]], 2: [[1, 11, 3, 7, 5, 9], [10, 2, 12, 4, 8, 6]] } };
const enc = (M, ty, c, j, b) => 12 * M * (b || 0) + 2 * M * Math.floor(c / 2) + MUXP[M][ty][c % 2][j] - 1;

(async () => {
  const { JSDOM, VirtualConsole } = require(path.join(ROOT, 'node_modules/jsdom'));
  const vc = new VirtualConsole(); const jerr = []; vc.on('jsdomError', e => jerr.push(e.message));
  const dom = await JSDOM.fromFile(path.join(ROOT, 'datamap.html'), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc, beforeParse(win) { win.WebSocket = function () { throw new Error('no ws'); }; } });
  await new Promise(r => dom.window.addEventListener('load', r));
  const w = dom.window, d = w.document, $ = id => d.getElementById(id);
  const fire = (id, v) => { const e = $(id); if (e.type === 'checkbox') e.checked = !!v; else e.value = String(v); e.dispatchEvent(new w.Event('change')); };
  const vis = id => !$(id).classList.contains('hidden');

  /* ── A：EN01 Auto 逐格＝xlsm ── */
  fire('dm-model', 'EN01');
  const CASES = [];
  CASES.push({ nm: 'Normal', st: { panel: 0, subPanel: 0, rd: 0 }, blocks: ['normal'] });
  for (let z = 0; z < 8; z++) CASES.push({ nm: 'ZigZag Type ' + (z + 1), st: { panel: 1, subPanel: z, rd: 0 }, zz: z });
  [['hsd1', 0], ['hsd4', 1], ['hsd35', 2], ['hsd4zz', 3]].forEach(([k, sb]) => CASES.push({ nm: 'HSD ' + DM.EN01_SUB_NAMES[2][sb], st: { panel: 2, subPanel: sb, rd: 1 }, blocks: [k] }));
  for (let sb = 0; sb < 8; sb++) { const M = sb & 1 ? 2 : 3, k = 'mux' + M + '_' + (sb & 2 ? 'z' : 'n') + (sb & 4 ? 2 : 1); CASES.push({ nm: DM.EN01_SUB_NAMES[3][sb], st: { panel: 3, subPanel: sb, rd: M === 2 ? 1 : 2 }, blocks: [k], ty: sb & 4 ? 2 : 1 }); }
  CASES.push({ nm: 'MUX4 normal', st: { panel: 3, subPanel: 0, rd: 3 }, blocks: ['mux4_n1'], ty: 1 });
  CASES.push({ nm: 'MUX4 zigzag', st: { panel: 3, subPanel: 2, rd: 3 }, blocks: ['mux4_z1'], ty: 1 });
  CASES.push({ nm: 'MUX6 normal type1', st: { panel: 3, subPanel: 0, rd: 5 }, blocks: ['mux6_n1'], ty: 1, m6: 1 });
  CASES.push({ nm: 'MUX6 normal type2', st: { panel: 3, subPanel: 0, rd: 5 }, blocks: ['mux6_n2'], ty: 2, m6: 2 });
  CASES.push({ nm: 'MUX6 zigzag type1', st: { panel: 3, subPanel: 2, rd: 5 }, blocks: ['mux6_z1'], ty: 1, m6: 1 });
  let nA = 0, dA = 0;
  for (const cs of CASES) {
    w.dmPvMuxType(cs.m6 || 1);
    const s = DM.emptyState('EN01'); Object.assign(s, cs.st); s.hand = 0; s.deEn = 0; s.deSel = 0;
    w.dmState.cur = s; w.dmState.en01Seg = null; w.dmPvRender();
    const P = w.dmPvModel(), M = P.mux | 0, n = P.period;
    ok(P.ok && P.auto, cs.nm + '：③ 有畫且為 Auto（ok=' + P.ok + ' auto=' + P.auto + ' why=' + (P.noPicWhy || '') + '）');
    if (!P.ok) { report.A.push({ case: cs.nm, ok: false, why: P.noPicWhy }); continue; }
    /* 每條 line 用哪個 xlsm 區塊 */
    const lineBlock = L => {
      if (cs.zz !== undefined) return EX[DM.EN01_ZZ_SFT[cs.zz].charAt(L) === '1' ? 'zz_sft1' : 'zz_sft0'][0];
      const B = EX[cs.blocks[0]]; return B[L % B.length];
    };
    let nn = 0, dd = 0; const ex3 = [], refs = new Set();
    for (const L of [0, 1, 2, 3]) {
      const B = lineBlock(L); refs.add(B.ref);
      B.cells.forEach(x => {
        const p = M ? enc(M, cs.ty || 1, x.ch, x.j, x.b) : x.ch + n * x.b;
        const row = P.rows.filter(r => r.k === L && r.gi === (M ? 0 : x.j))[0];
        let cell = row && row.names[p];
        if (row && p >= row.names.length) { const c0 = row.names[p % n]; cell = c0 && !c0.off ? { name: DM.linName(c0.t + P.shift * Math.floor(p / n)), off: false } : c0; }
        nn++;
        if (!cell || cell.off || cell.name !== x.name) { dd++; if (ex3.length < 3) ex3.push('L' + (L + 1) + ' ' + B.ref.split('!')[0] + '!' + x.col + (+B.ref.split('!')[1].slice(1) + x.ch) + ' xlsm ' + x.name + ' ≠ 網頁 ' + (cell ? cell.name : '—')); }
      });
    }
    nA += nn; dA += dd;
    ok(dd === 0, cs.nm + ' 差 ' + dd + '：' + ex3.join('；'));
    report.A.push({ case: cs.nm, regs: 'PANEL_MODE=' + cs.st.panel + ' SUB=' + cs.st.subPanel + ' RD=' + cs.st.rd + (cs.m6 ? ' MUX6 TYPE ' + cs.m6 : ''), refs: [...refs].join('、'), lines: P.nl, cells: nn, diff: dd, tag: $('dm-pvtag').textContent });
  }
  console.log('A EN01 Auto × xlsm：' + CASES.length + ' 組、' + nA + ' 格、差異 ' + dA);

  /* ── B：推不出的組合、② 表格 Auto 顯示 ── */
  const NONE = [{ nm: 'Tri-Gate（PANEL 0、RD 2）', st: { panel: 0, subPanel: 0, rd: 2 } }, { nm: 'Normal＋RD 1', st: { panel: 0, subPanel: 0, rd: 1 } }, { nm: 'HSD＋RD 0', st: { panel: 2, subPanel: 0, rd: 0 } },
    { nm: 'HSD sub 5', st: { panel: 2, subPanel: 5, rd: 1 } }, { nm: 'MUX6 zigzag type2', st: { panel: 3, subPanel: 2, rd: 5 }, m6: 2 }];
  for (const cs of NONE) {
    w.dmPvMuxType(cs.m6 || 1);
    const s = DM.emptyState('EN01'); Object.assign(s, cs.st); w.dmState.cur = s; w.dmPvRender();
    const P = w.dmPvModel();
    ok(!P.ok && /待 RD/.test(P.noPicWhy || '') && /待 RD/.test($('dm-pvnote').textContent), cs.nm + '：寫待 RD（' + (P.noPicWhy || '') + '）');
    report.B.push({ case: cs.nm, note: P.noPicWhy });
  }
  w.dmPvMuxType(1);
  { // 整頁 render：② 表格＝Auto 推得的 code（MUX3 normal type1：L1-SW1 Data1 code 24＝R1）
    const s = DM.emptyState('EN01'); s.panel = 3; s.subPanel = 0; s.rd = 2; w.dmState.cur = s; w.dmRender();
    const c0 = $('dm-e0-0'), c1 = $('dm-e1-0');
    ok(c0 && c0.value === 'R1' && c0.disabled, '② MUX3 normal type1 Auto L1-SW1 Data1＝R1 唯讀（' + (c0 && c0.value) + '）');
    ok(c1 && c1.value === 'G1', '② L1-SW2 Data1＝G1（' + (c1 && c1.value) + '）');
    ok($('dm-gridnote').classList.contains('hidden'), '② Auto 有範例時不蓋遮罩');
    ok(/MUX3!H97/.test($('dm-em01lbl').textContent), 'Panel 列寫出原廠範例出處：' + $('dm-em01lbl').textContent);
    ok((w.dmState.cur.e0 | 0) === 0, '寫入值不變（S.cur FORCE_SEL 仍 0）');
    report.B.push({ case: '② 表格 MUX3 normal type1', cells: c0 && c0.value + ' / ' + (c1 && c1.value), lbl: $('dm-em01lbl').textContent });
  }

  /* ── C：全型號 Auto 介面 ── */
  const MODELS = ['EM01', 'EM02', 'E512', 'E503', 'E501A', 'E501B', 'DAZ6138', 'DAZ6139', 'DAZ6111', 'DAZ7353', 'EN01'];
  for (const k of MODELS) {
    fire('dm-model', k);
    const s0 = DM.emptyState(k); w.dmState.cur = s0; w.dmRender();
    const pmOpts = [...$('dm-em01pm').options].map(o => o.textContent);
    ok(vis('dm-autorow') && vis('dm-em01box'), k + '：Auto 有 Panel_mode／sub_panel_mode 兩個下拉');
    ok(vis('dm-auto') === (k === 'EM02' || k === 'E512'), k + '：單一清單只有 EM02／E512 保留（RT7 Type）');
    ok(!$('dm-gate').disabled, k + '：Auto 時 Gate Type 可改');
    const rowC = { model: k, panels: pmOpts.join('／'), subs: {}, gate: [...$('dm-gate').options].filter(o => !o.disabled).map(o => o.value).join('／') };
    ok(pmOpts.length === (/^DAZ(6111|7353)$/.test(k) ? 3 : 4), k + ' Panel_mode 項數 ' + pmOpts.length);
    for (let pm = 0; pm < pmOpts.length; pm++) {
      fire('dm-em01pm', pm);
      ok((w.dmState.cur.panel | 0) === pm && !w.dmState.cur.hand, k + ' Panel_mode←' + pm + ' 寫入 panel=' + w.dmState.cur.panel);
      const subs = [...$('dm-em01sub').options].map(o => [+o.value, o.textContent]);
      rowC.subs[pmOpts[pm]] = subs.map(x => x[1]).join('、');
      for (const [sv] of subs) {
        fire('dm-em01sub', sv);
        const c = w.dmState.cur;
        ok((c.panel | 0) === pm && (c.subPanel | 0) === sv, k + ' pm' + pm + ' sub←' + sv + ' 得 ' + c.panel + '/' + c.subPanel);
        const gt = DM.autoGateText(k, c);
        ok($('dm-gate').value === gt, k + ' pm' + pm + ' sub' + sv + ' Gate 顯示 ' + $('dm-gate').value + ' 應 ' + gt);
        if (DM.fieldById(k, 'rd')) {
          let want;
          if (DM.MODELS[k].kind === 'nb') { const e = AUTO.list(k).find(e => (e.set.panel | 0) === pm && (e.set.subPanel | 0) === sv); want = e && e.set.rd !== undefined ? e.set.rd : (c.rd | 0); }
          else want = DM.autoRd(k, c);
          ok((c.rd | 0) === want, k + ' pm' + pm + ' sub' + sv + ' rd=' + c.rd + ' 應 ' + want);
        }
        if (k === 'EN01') { w.dmPvRender(); const P = w.dmPvModel(); ok(P.ok || /待 RD/.test(P.noPicWhy || ''), 'EN01 pm' + pm + ' sub' + sv + ' ③ 有畫或寫待 RD'); }
      }
    }
    report.C.push(rowC);
  }

  /* ── D：Gate Type（Auto）雙向連動；Hand 項目不變 ── */
  for (const k of MODELS) {
    fire('dm-model', k);
    const s0 = DM.emptyState(k); w.dmState.cur = s0; w.dmRender();
    const items = DM.autoGateItems(k), rowD = { model: k, auto: items.join('／'), map: [] };
    for (const it of items) {
      fire('dm-gate', it);
      const c = w.dmState.cur;
      ok(!c.hand || k === 'EN01', k + ' Auto Gate ' + it + ' 不開 Hand');
      ok($('dm-gate').value === it, k + ' Gate 選 ' + it + ' 顯示 ' + $('dm-gate').value);
      ok($('dm-em01pm').value === String(c.panel | 0), k + ' Gate ' + it + ' ⇒ Panel_mode 下拉同步 ' + $('dm-em01pm').value);
      rowD.map.push(it + '→panel ' + (c.panel | 0) + '/sub ' + (c.subPanel | 0) + (DM.fieldById(k, 'rd') ? '/rd ' + (c.rd | 0) : ''));
      /* 反向：Panel_mode 下拉改回 1D1G ⇒ Gate 顯示 Single-Gate */
    }
    fire('dm-em01pm', 0); ok($('dm-gate').value === 'Single-Gate', k + ' Panel_mode 1D1G ⇒ Gate Single-Gate（' + $('dm-gate').value + '）');
    fire('dm-em01pm', 2); ok($('dm-gate').value === 'Dual-Gate', k + ' Panel_mode HSD ⇒ Gate Dual-Gate（' + $('dm-gate').value + '）');
    /* Hand 開：Gate 項目＝v1.35.29（gateItems／EN01_GATES） */
    const sh = DM.emptyState(k); sh.hand = 1; if (k === 'EN01') sh.deEn = 1; w.dmState.cur = sh; w.dmRender();
    const hi = [...$('dm-gate').options].filter(o => !o.disabled).map(o => o.value), want = k === 'EN01' ? DM.EN01_GATES.map(x => x[0]) : DM.gateItems(k);
    ok(JSON.stringify(hi) === JSON.stringify(want), k + ' Hand Gate 項目不變 ' + hi.join('/'));
    rowD.hand = hi.join('／');
    report.D.push(rowD);
  }
  ok(!jerr.length, 'jsdomError ' + jerr.slice(0, 3).join('；'));
  const out = process.env.AUTOUNIFY_OUT || '/tmp';
  fs.writeFileSync(path.join(out, 'autounify_report.json'), JSON.stringify(report, null, 1));
  console.log('pass ' + pass + ' / fail ' + fail);
  fails.slice(0, 40).forEach(f => console.log('  ✗ ' + f));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
