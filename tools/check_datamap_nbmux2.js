#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   check_datamap_nbmux2.js — datamap v1.36.3 NB Hand MUX2 與 Auto 統一（派工 238148574474215424；Bruce 10/20「NB 的部分就處理…可以確定的地方就先處理」）
   由 check_datamap_mntclose.js（派工 238115258781999104 覆核用）複製改成：MUX2＋rd 3 照 v1.36.2 判 mismatch（NB model RD_MODE 沒定義 3，列待問 RD），
   另加 E 段：NB Hand MUX2 × Mirror、NB Hand MUX3（表格不適用提示、Gate 文字 MUX3）、DAZ6111／7353 panel 3 不當 MUX。
   ── 以下為原說明 ──
   C1  Hand＋LTPS MUX2 表格不顯示（gateOf e50x 分支只認 panel 3＋rd 2／3）：
       A  gateOf 規則矩陣：MNT 3＋NB E50x 5 型號 × panel 0～3 × sub 0～7 × rd 0～3 × triGate 0／1 ⇒ 期望值（本檔獨立寫的規則）；
          panel 0～2 與 panel 3 非 MUX2 的結果與 v1.36.1 舊式逐一相同（不影響 Single／Dual／Tri）。
       B  頁面（jsdom）：EM01／EM02／E512 Gate Type 選 MUX2 ⇒ 表格顯示 4 列 Line n-SW1／SW2、沒有 mismatch 提示、③ MUX2 三層；
          E503／E501A／E501B Hand panel 3＋sub 奇數＋rd 1 ⇒ 表格 4 列、③ MUX2 三層。
       C  Auto＝Hand：同一組 panel／sub 的 Auto ③（原廠表）pixel ⇒ 填回 Hand 表格（MNT 用 同事A／瑞鼎 Excel force_sel；NB 由 Auto ③ 名稱反填）⇒ Hand ③ 每條 Data 線名稱與 Auto 相同；
          rd 1（網頁寫法）與 rd 2（原廠 MNT Tool 寫法）都比。
   C2  E512 FORCE_DE_SEL＝rt7+0x45[5:0]（E512_ModelFile_20250902152136.model:16283-16288），不再寫 +0x02[7:4]：
       D  欄位位址／位寬＝EM01／EM02；encode 只動 0x4C5 mask 0x3F，0x482 的 [7:4]（nml_4line_4pix_en 等）不被寫；deSelTs 6 bit 規則同 EM02。
   用法：node tools/check_datamap_mntclose.js [repo]
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const DM = require(path.join(ROOT, 'common/datamap-core.js')); global.TCONDataMap = DM;
const LOD = require(path.join(ROOT, 'common/datamap-lod.js')); global.TCONDataMapLOD = LOD;
const A = require(path.join(ROOT, 'common/datamap-auto.js'));
let pass = 0, fail = 0; const fails = [], cnt = {};
const ok = (c, m, g) => { cnt[g] = (cnt[g] || 0) + 1; if (c) pass++; else { fail++; if (fails.length < 300) fails.push(m); } };
const MNT = ['EM01', 'EM02', 'E512'], NB = ['E503', 'E501A', 'E501B', 'DAZ6138', 'DAZ6139'].filter(k => DM.MODELS[k] && DM.MODELS[k].sem === 'e50x');
const PT = { 2: { 1: [[1, 2], [3, 4]], 2: [[1, 3], [2, 4]] }, 3: { 1: [[1, 2, 3], [4, 5, 6]], 2: [[1, 5, 3], [4, 2, 6]] } };
const enc = (M, ty, c, j) => { const n = 6 * M, b = Math.floor(c / 6), ci = c - b * 6; return n * b + 2 * M * Math.floor(ci / 2) + PT[M][ty][ci % 2][j] - 1; };

/* v1.36.1 舊式（只用來比對「其他組合不變」） */
function oldGate(k, s) { if (!s.hand) return 'off'; const p = s.panel | 0, r = s.rd | 0;
  if (p <= 1 && r === 0) return 'single'; if (p === 2 && r === 1) return 'dual'; if (p === 3 && (r === 2 || r === 3)) return 'tri'; return 'mismatch'; }
/* 期望：MUX2（panel 3＋SUB[0]＝1、不是 BOE Tri-Gate；DAZ6138／6139 沒有 SUB 欄位⇒不是 MUX2）＋rd 1～3 ⇒ dual，rd 0 ⇒ mismatch；其餘同舊式 */
function wantGate(k, s) { if (!s.hand) return 'off'; const p = s.panel | 0, r = s.rd | 0, hasSub = !!DM.fieldById(k, 'subPanel');
  const mux2 = p === 3 && hasSub && ((s.subPanel | 0) & 1) && !(DM.MODELS[k].kind === 'mnt' && s.triGate);
  if (mux2) return (r === 1 || r === 2) ? 'dual' : 'mismatch'; return oldGate(k, s); }   // v1.36.3：rd 3 未定義（待問 RD）⇒ 維持 v1.36.2 mismatch

/* ── A ── */
for (const k of MNT.concat(NB)) for (const hand of [0, 1]) for (let p = 0; p <= 3; p++) for (let sb = 0; sb < 8; sb++) for (let rd = 0; rd <= 3; rd++) for (const tri of DM.MODELS[k].kind === 'mnt' ? [0, 1] : [0]) {
  const s = DM.emptyState(k); s.hand = hand; s.panel = p; if (DM.fieldById(k, 'subPanel')) s.subPanel = sb; s.rd = rd; if (DM.MODELS[k].kind === 'mnt') s.triGate = tri;
  const g = DM.gateOf(k, s), w = wantGate(k, s), id = k + ' hand' + hand + ' p' + p + ' sub' + sb + ' rd' + rd + ' tri' + tri;
  ok(g === w, 'A ' + id + '：' + g + ' 期望 ' + w, 'A');
  const isMux2 = w !== oldGate(k, s) || (p === 3 && DM.fieldById(k, 'subPanel') && (sb & 1) && !(DM.MODELS[k].kind === 'mnt' && tri));
  if (!isMux2) ok(g === oldGate(k, s), 'A0 非 MUX2 不變 ' + id + '：' + g + ' 舊 ' + oldGate(k, s), 'A0');
  if (g === 'dual' && p === 3) { const lb = DM.rowsFor(k, s).map(x => x.label.replace(/（.*$/, '')).join(',');
    ok(lb === 'Line 1-SW1,Line 1-SW2,Line 2-SW1,Line 2-SW2', 'A 列名 ' + id + '：' + lb, 'A'); }
}
/* Gate 選單 MUX2 寫入後一定是 dual（MNT） */
for (const k of MNT) for (let from = 0; from <= 3; from++) for (let sb = 0; sb < 8; sb++) {
  const s0 = DM.emptyState(k); s0.hand = 1; s0.panel = from; s0.subPanel = sb; const ns = DM.setGate(k, s0, 'MUX2');
  ok(ns && ns.rd === 1 && DM.gateOf(k, ns) === 'dual' && DM.gateText(k, ns) === 'MUX2', 'A 選 MUX2 ' + k + ' from p' + from + ' sub' + sb + ' ⇒ ' + (ns && DM.gateOf(k, ns)), 'A');
  const n3 = DM.setGate(k, s0, 'MUX3'); ok(DM.gateOf(k, n3) === 'tri', 'A 選 MUX3 仍 tri ' + k, 'A');
}

/* ── D：E512 FORCE_DE_SEL ── */
{ const f = k => DM.fieldById(k, 'deSel'), e = f('E512'), m = f('EM02');
  ok(JSON.stringify(e.parts) === JSON.stringify([[0x0480 + 0x45, 5, 0]]) && e.bits === 6, 'D E512 deSel parts ' + JSON.stringify(e.parts) + ' bits ' + e.bits, 'D');
  ok(JSON.stringify(e.parts) === JSON.stringify(m.parts) && e.name === m.name, 'D E512＝EM02 同位址', 'D');
  ok(f('EM01').parts[0][0] - DM.MODELS.EM01.rt7 === 0x45, 'D EM01 也是 +0x45', 'D');
  for (let v = 0; v < 64; v++) {
    const s = DM.emptyState('E512'); s.hand = 1; s.deEn = 1; s.deSel = v;
    const regs = DM.encode('E512', s), r45 = regs.find(x => x.reg === 0x4C5), r02 = regs.find(x => x.reg === 0x482);
    ok(r45 && r45.mask === 0x3F && (r45.val & 0x3F) === v, 'D encode deSel ' + v + ' ⇒ 0x4C5 ' + JSON.stringify(r45), 'D');
    ok(!r02 || !(r02.mask & 0xF0), 'D 0x482[7:4] 不被寫 ' + JSON.stringify(r02), 'D');
    const s2 = DM.emptyState('EM02'); s2.hand = 1; s2.deEn = 1; s2.deSel = v;
    ok(JSON.stringify(DM.deSelTs(s.deSel, e.bits)) === JSON.stringify(DM.deSelTs(s2.deSel, m.bits)), 'D deSelTs E512＝EM02 ' + v, 'D');
  }
  /* 讀：位元組 0x4C5＝0x2A、0x482＝0xF1 ⇒ deSel 0x2A、deEn 1（舊版會讀成 0xF） */
  if (DM.decode) { const st = DM.decode('E512', a => a === 0x4C5 ? 0x2A : (a === 0x482 ? 0xF1 : 0)); ok(st.deSel === 0x2A && st.deEn === 1, 'D decode ' + st.deSel + '/' + st.deEn, 'D'); }
}

(async () => {
  const { JSDOM, VirtualConsole } = require(path.join(ROOT, 'node_modules/jsdom'));
  const vc = new VirtualConsole(); const jerr = []; vc.on('jsdomError', e => jerr.push(e.message));
  const dom = await JSDOM.fromFile(path.join(ROOT, 'datamap.html'), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc, beforeParse(win) { win.WebSocket = function () { throw new Error('no ws'); }; } });
  await new Promise(r => dom.window.addEventListener('load', r));
  const w = dom.window, d = w.document, $ = id => d.getElementById(id);
  const fire = (id, v) => { const e = $(id); e.value = v; e.dispatchEvent(new w.Event('change')); };
  const setState = (k, s) => { if (w.dmState.model !== k) fire('dm-model', k); w.dmState.cur = DM.cloneState(s); w.dmRender(); };
  const names = P => P.rows.map(r => r.names.map(c => c.off ? 'X' : c.name).join(' ')).join(' / ');
  const gridShown = () => { const t = $('dm-grid'), note = $('dm-gridnote'); return { tbl: !!t && !$('dm-gridbox').classList.contains('hidden'), note: note && !note.classList.contains('hidden') ? note.textContent : '', rh: [0, 1, 2, 3].map(r => ($('dm-rh' + r) || {}).textContent) }; };

  /* ── B＋C：MNT ── */
  for (const k of MNT) for (const sub of [1, 3, 5, 7]) {
    const x = A.XL_MNT.filter(r => r.panel === 3 && r.sub === sub && r.auto)[0];
    const au = DM.emptyState(k); au.hand = 0; au.panel = 3; au.subPanel = sub; au.rd = 1; setState(k, au); const Pa = w.dmPvModel();
    for (const rd of [1, 2]) {
      const s = DM.emptyState(k); s.hand = 1; s.panel = 3; s.subPanel = sub; s.rd = rd; s.deEn = 0; for (let i = 0; i < 24; i++) { s['c' + i] = x.c[i]; if (x.x) s['x' + i] = x.x[i]; }
      setState(k, s); const P = w.dmPvModel(), G = gridShown(), id = k + ' Hand MUX2 sub' + sub + ' rd' + rd;
      ok(G.tbl && !/不是 Single/.test(G.note) && G.rh.join(',').replace(/（[^）]*）/g, '') === 'Line 1-SW1,Line 1-SW2,Line 2-SW1,Line 2-SW2', 'B ' + id + ' 表格 ' + JSON.stringify(G), 'B');
      ok(!/不是 Single/.test($('stp-next').textContent) && !$('card-dm').classList.contains('err'), 'B ' + id + ' ② 沒有錯誤：' + $('stp-next').textContent, 'B');
      ok(P.ok && P.mux === 2 && P.NG === 1, 'B ' + id + ' ③ MUX2 三層 mux=' + P.mux, 'B');
      ok(Pa.ok && Pa.mux === 2 && names(P) === names(Pa), 'C ' + id + ' Hand＝Auto\n     Hand ' + names(P).slice(0, 160) + '\n     Auto ' + names(Pa).slice(0, 160), 'C');
    }
  }
  /* ── B＋C：NB E50x（有 SUB 欄位的） ── */
  for (const k of NB.filter(k => DM.fieldById(k, 'subPanel'))) for (const sub of [1, 3, 5, 7]) {
    const au = DM.emptyState(k); au.hand = 0; au.panel = 3; au.subPanel = sub; au.rd = 1; setState(k, au); const Pa = w.dmPvModel();
    if (!(Pa.ok && Pa.mux === 2)) { ok(false, 'C ' + k + ' Auto sub' + sub + ' 沒有 MUX2 圖', 'C'); continue; }
    const ty = Pa.muxType || 1, nm = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) { const l = r >> 1, j = r & 1, cell = Pa.rows.find(x => x.k === l).names[enc(2, ty, c, j)]; nm.push(cell && !cell.off ? cell.name : 'X'); }
    for (const rd of [1, 2]) {
      let s = DM.emptyState(k); s.hand = 1; s.panel = 3; s.subPanel = sub; s.rd = rd; s = DM.applyNames(k, s, nm) || s; s.rd = rd; s.panel = 3; s.subPanel = sub;
      setState(k, s); const P = w.dmPvModel(), G = gridShown(), id = k + ' Hand MUX2 sub' + sub + ' rd' + rd;
      ok(G.tbl && !/不是 Single/.test(G.note) && /SW1/.test(G.rh[0]), 'B ' + id + ' 表格 ' + JSON.stringify(G), 'B');
      ok(P.ok && P.mux === 2 && P.NG === 1, 'B ' + id + ' ③ MUX2 三層 mux=' + P.mux, 'B');
      ok(names(P) === names(Pa), 'C ' + id + ' Hand＝Auto\n     Hand ' + names(P).slice(0, 160) + '\n     Auto ' + names(Pa).slice(0, 160), 'C');
      ok(DM.gateText(k, s) === 'MUX2', 'B ' + id + ' Gate 文字 ' + DM.gateText(k, s), 'B');
    }
  }
  /* EM01 Hand 從 Single 用 Gate 選單切 MUX2（Bruce 線上操作路徑） */
  { setState('EM01', Object.assign(DM.emptyState('EM01'), { hand: 1 })); fire('dm-gate', 'MUX2'); const G = gridShown(), s = w.dmState.cur;
    ok(s.panel === 3 && (s.subPanel & 1) && s.rd === 1 && G.tbl && !G.note && /SW1/.test(G.rh[0]), 'B EM01 Gate 選 MUX2：' + JSON.stringify({ p: s.panel, sub: s.subPanel, rd: s.rd, G }), 'B'); }
  /* ── E：NB Hand MUX2 × Mirror、MUX3、DAZ6111／7353 ── */
  for (const k of NB) for (const sub of [1, 3, 5, 7]) for (const mir of [0, 1]) {
    const s = DM.emptyState(k); s.hand = 1; s.panel = 3; s.subPanel = sub; s.rd = 1; s.mirror = mir;
    for (let i = 0; i < 24; i++) s['c' + i] = (i * 5) % 18;
    setState(k, s); const P = w.dmPvModel(), G = gridShown(), id = k + ' Hand MUX2 sub' + sub + ' Mirror' + mir;
    ok(P.ok && P.mux === 2 && (!!P.mirror) === !!mir && G.tbl && /SW1/.test(G.rh[0]) && $('dm-gate').value === 'MUX2', 'E ' + id + ' ok=' + P.ok + ' mux=' + P.mux + ' mir=' + P.mirror + ' gate=' + $('dm-gate').value + ' ' + JSON.stringify(G), 'E');
    ok(/SW2：起始欄/.test(($('dm-rs1') || {}).textContent || '') && !/下 gate/.test(($('dm-rs1') || {}).textContent || ''), 'E ' + id + ' 第 2 列小字：' + ($('dm-rs1') || {}).textContent, 'E');
    const tg = $('dm-pvtag') ? $('dm-pvtag').textContent : ''; ok(!/Tri-Gate/.test(tg), 'E ' + id + ' ③ 標籤不寫 Tri-Gate：' + tg, 'E');
  }
  for (const k of NB) for (const sub of [0, 2, 4, 6]) for (const rd of [2, 3]) {
    const s = DM.emptyState(k); s.hand = 1; s.panel = 3; s.subPanel = sub; s.rd = rd; setState(k, s);
    const G = gridShown(), id = k + ' Hand MUX3 sub' + sub + ' rd' + rd;
    ok(DM.gateOf(k, s) === 'tri' && DM.gateText(k, s) === 'MUX3' && /MUX3：此型號只有一組/.test(G.note + $('stp-next').textContent), 'E ' + id + ' gate=' + DM.gateOf(k, s) + ' txt=' + DM.gateText(k, s) + ' note=' + G.note, 'E');
  }
  for (const k of ['DAZ6111', 'DAZ7353'].filter(k => DM.MODELS[k])) { const s = DM.emptyState(k); s.hand = 1; s.panel = 3; ok(!DM.muxPanel(k, s).mux && DM.gateText(k, s) !== 'MUX2' && DM.gateText(k, s) !== 'MUX3', 'E ' + k + ' panel 3 不當 MUX：' + DM.gateText(k, s), 'E'); }
  ok(!jerr.length, 'jsdomError：' + jerr.slice(0, 3).join(' | '), 'B');
  console.log(fails.join('\n'));
  console.log('項目數 ' + JSON.stringify(cnt));
  console.log('check_datamap_nbmux2：' + pass + ' pass / ' + fail + ' fail');
  dom.window.close(); process.exit(fail ? 1 : 0);
})();
