#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   check_datamap.js — Data Mapping 分頁（datamap.html）核心的機械檢查（v1.1.0）
   ───────────────────────────────────────────────────────────────────────────
   測 common/datamap-core.js（頁面與這支共用同一份程式）。客戶 code 不可進版控 ⇒ 預設用合成語料。
     ① MNT（EM01／EM02／E512）.bin 定位與解碼（v1.0.0 的檢查，換成新狀態格式）
     ② PY 型號（DAZ／E501／E503）：依檔名取型號、ROM→3E 位移、各欄位往返
     ③ Python UI 規則：Gate 判斷、Single 鏡射、Dual 第 2／4 列用 GN2、輸入驗證、X＝31、非標準值保留、
        All Same Pixel、改 Gate、連動欄位（FORCE_DE_EN／FORCE_DE_SEL＝0xE、DAZ line type）、CKS
     ④ 匯出 → 套回原檔：MNT write -m、PY SCRIPT 列；只有 Data Mapping 的位元會變
     ⑤ I2C 假裝置：讀回、只寫有變的位元、寫後讀回
     ⑥ xlsx：TCONXlsx 寫出 → readXlsxRows 讀回；Data Mapping Excel 往返
     ⑦ R／G／B 底色與 Pattern 4×4（pattern v3.8.2 pgCellColor）逐字相同
     ⑧ MNT 原廠預設樣式（34 筆；本機有 RApp_TX.h 才逐字比對）
   真檔（不進版控）：node tools/check_datamap.js --real <檔案或資料夾>...
     再加 --pyui <SourceCode_V5.0.4 目錄>：每份 PY 型號的真檔都跑 tools/datamap_pyui_harness.py（Python UI 自己的程式），
     逐格比對 Gate、24 格名稱、DM CKS，並把一組編輯（含表外名稱）丟給兩邊，比對寫出來的 3E byte。
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), zlib = require('zlib'), cp = require('child_process');
const ROOT = path.join(__dirname, '..');
const DM = require(path.join(ROOT, 'common', 'datamap-core.js'));
const SP = require(path.join(ROOT, 'common', 'subpix-colors.js'));
const XL = (function () { const c = { }; vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'common', 'xlsx.js'), 'utf8') + '\nthis.TCONXlsx = TCONXlsx;', c); return c.TCONXlsx; })();
let fails = 0, passes = 0;
function ok(cond, msg) { if (cond) passes++; else { fails++; console.log('  ✗ ' + msg); } }
function sec(t) { console.log('── ' + t); }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const inflateRaw = async u8 => new Uint8Array(zlib.inflateRawSync(Buffer.from(u8)));

/* ── ① MNT 合成映像（v1.0.0 同一套） ── */
function synthMnt(model) {
  const b = new Uint8Array(model === 'EM01F' ? 0x40000 : 0x1000);
  for (let i = 0; i < b.length; i++) b[i] = (i * 37 + 11) & 0xFF;
  let o7, o8;
  if (model === 'EM02') { o7 = 0x033E; o8 = 0x0440; b[0x31] = o7 & 0xFF; b[0x32] = o7 >> 8; b[0x33] = o8 & 0xFF; b[0x34] = o8 >> 8; }
  if (model === 'E512') { o7 = 0x02DE; o8 = 0x03D7; b[0x43] = o7 & 0xFF; b[0x44] = o7 >> 8; b[0x45] = o8 & 0xFF; b[0x46] = o8 >> 8; }
  if (model === 'EM01') { o7 = 0x0358; o8 = 0x0457; b[0x46] = o7 & 0xFF; b[0x47] = o7 >> 8; b[0x48] = o8 & 0xFF; b[0x49] = o8 >> 8; }
  if (model !== 'EM02') { b[0x31] = 0x11; b[0x32] = 0x01; b[0x33] = 0x22; b[0x34] = 0x02; }
  if (model !== 'E512' && model !== 'EM01') { b[0x43] = 0x10; b[0x44] = 0x01; b[0x45] = 0x30; b[0x46] = 0x02; }
  if (model !== 'EM01') { b[0x47] = 0x00; b[0x48] = 0x05; b[0x49] = 0x07; }
  if (model === 'E512') { b[0x47] = 0xA5; b[0x48] = 0x04; b[0x49] = 0x77; }
  if (model === 'EM01F') { b[0x500] = 1920 & 0xFF; b[0x501] = 1920 >> 8; b[0x502] = 1080 & 0xFF; b[0x503] = 1080 >> 8; }
  return b;
}
function randState(key, seed) {
  const s = DM.emptyState(key);
  DM.fieldsOf(key).forEach((f, i) => { s[f.id] = ((i + 1) * 2654435761 + seed * 40503) % (1 << f.bits); });
  return s;
}
sec('① MNT 定位 ＋ 解碼');
for (const mk of ['EM02', 'E512', 'EM01', 'EM01F']) {
  const model = mk === 'EM01F' ? 'EM01' : mk, b = synthMnt(mk), hits = DM.locate(b);
  ok(hits.length === 1 && hits[0].model === model, mk + ' 只命中自己（實得 ' + hits.map(h => h.model).join(',') + '）');
  const s = randState(model, 3);
  for (const e of DM.encode(model, s)) { const o = hits[0].fileOf(e.reg); b[o] = DM.maskedMerge(b[o], e.val, e.mask); }
  const r = DM.parseCode(b, null, 'x.bin');
  ok(r.ok && r.model === model && same(r.state, s), mk + ' parseCode 型號正確且解碼 ＝ 寫入值');
  const other = model === 'EM02' ? 'E512' : 'EM02';
  ok(!DM.parseCode(b, other, 'x.bin').ok, mk + ' 選成 ' + other + ' 時拒絕');
}
{
  const b = synthMnt('EM02'); b[0x33] = 0x41;
  ok(DM.locate(b).length === 0, 'EM02 表頭 rt8 起點錯 1 ⇒ 不命中');
  ok(!DM.parseCode(new Uint8Array(50), null, 'x.bin').ok, '太小的檔 ⇒ 拒絕');
  const f = DM.fieldById('E512', 'deSel').parts[0], g = DM.fieldById('EM02', 'deSel').parts[0];
  ok(same(f, [0x0482, 7, 4]) && same(g, [0x04C5, 5, 0]), 'force_de_sel：E512 0x0482[7:4]、EM02 0x04C5[5:0]');
  for (const m of DM.MNT_KEYS) { const r0 = DM.regsOf(m).find(e => e.reg === DM.MODELS[m].rt7); ok(r0 && (r0.mask & 1) === 0, m + ' rt7+0 遮罩不含 bit0（reg_isp_mlvds_sel）'); }
  /* register 名稱與 8100X model 共用：PY 表格 (type t, Data d) ＝ force_sel_{r0,g0,b0,r1,g1,b1}_t */
  ok(DM.fieldById('EM02', 'c0').parts[0][0] === 0x0483 && DM.fieldById('EM02', 'c6').parts[0][0] === 0x0484 && DM.fieldById('EM02', 'c1').parts[0][0] === 0x0487,
     'EM02：Line 1-1 Data 1 ＝ r0_0（0x0483）、Line 1-2 Data 1 ＝ r0_1（0x0484）、Line 1-1 Data 2 ＝ g0_0（0x0487）');
  ok(DM.fieldById('E503', 'c0').name === 'FORCE_SEL_R0_0' && same(DM.fieldById('E503', 'c0').parts, [[0x323, 4, 0]]) &&
     same(DM.fieldById('E503', 'c4').parts, [[0x326, 5, 5], [0x325, 7, 5], [0x324, 7, 7]]), 'E503：FORCE_SEL_R0_0 ＝ 0x323[4:0]、FORCE_SEL_G1_0 ＝ 0x326[5]0x325[7:5]0x324[7]（8100X model:8588、8616）');
}

/* ── ② PY 型號 ── */
sec('② PY 型號：檔名、ROM→3E、往返');
const PYK = ['DAZ6111', 'DAZ6138', 'DAZ6139', 'DAZ7353', 'E501A', 'E501B', 'E503'];
function synthNb(key, s) {
  const r = DM.PY_TABLES[DM.MODELS[key].tbl].rom, b = new Uint8Array(r[1] + 1 + 16);
  for (let i = 0; i < b.length; i++) b[i] = (i * 29 + 7) & 0xFF;
  const fo = DM.nbFileOf(key);
  if (s) for (const e of DM.encode(key, s)) b[fo(e.reg)] = DM.maskedMerge(b[fo(e.reg)], e.val, e.mask);
  return b;
}
for (const k of PYK) {
  const s = randState(k, 7), b = synthNb(k, s), py = DM.MODELS[k].py;
  const r = DM.parseCode(b, null, py + '_test.bin');
  ok(r.ok && r.model === k && r.byName && same(r.state, s), k + ' 依檔名（' + py + '）解析，解碼 ＝ 寫入值');
  ok(!DM.parseCode(b.slice(0, 100), null, py + '_test.bin').ok, k + ' 檔案太短 ⇒ 拒絕');
}
ok(DM.modelFromName('E501A_xxx.bin').key === 'E501A' && DM.modelFromName('E501B2_DAZ81011.bin').key === 'E501B' &&
   DM.modelFromName('E503A3_RM81003_x.hex').key === 'E503' && DM.modelFromName('RM81004_HKC.bin').key === 'E503' &&
   DM.modelFromName('DAZ6138_KGS.rom').key === 'DAZ6138' && DM.modelFromName('abc.bin') === null, '檔名對應同 PY find_a_tcon（:35566-35593）');
{
  const b = synthNb('E503', randState('E503', 1));
  const r = DM.parseCode(b, 'E503', 'noname.bin');
  ok(r.ok && r.model === 'E503' && !r.byName, '檔名看不出型號 ⇒ 用選的型號');
  ok(!DM.parseCode(b, 'EM02', 'noname.bin').ok, '檔名看不出、選的是 MNT、內容也不是 MNT ⇒ 拒絕');
  /* .hex／.rom 文字格式 */
  let hex = '', rom = '';
  for (let i = 0; i < b.length; i += 16) {
    const n = Math.min(16, b.length - i), seg = Array.from(b.slice(i, i + n));
    const sum = (n + ((i >> 8) & 0xFF) + (i & 0xFF) + seg.reduce((a, x) => a + x, 0)) & 0xFF;
    hex += ':' + DM.hex(n, 2) + DM.hex(i & 0xFFFF, 4) + '00' + seg.map(x => DM.hex(x, 2)).join('') + DM.hex((256 - sum) & 0xFF, 2) + '\r\n';
  }
  hex += ':00000001FF\r\n';
  for (let i = 0; i < b.length; i++) rom += DM.hex(b[i], 2) + '\r\n';
  const enc = t => Uint8Array.from(Buffer.from(t, 'latin1'));
  ok(same(DM.loadCodeBytes('a.hex', enc(hex)), b) && same(DM.loadCodeBytes('a.rom', enc(rom)), b), '.hex（Intel HEX type 00）與 .rom（每行一個 hex byte）讀法同 FileProcess.py openauto');
}

/* ── ③ Python UI 規則 ── */
sec('③ Python UI 規則');
function st(key, o) { const s = DM.emptyState(key); Object.assign(s, o); return s; }
{
  const K = 'E503';
  ok(DM.gateOf(K, st(K, { hand: 0, panel: 2, rd: 1 })) === 'off' && DM.gateOf(K, st(K, { hand: 1, panel: 2, rd: 1 })) === 'dual' &&
     DM.gateOf(K, st(K, { hand: 1, panel: 1, rd: 0 })) === 'single' && DM.gateOf(K, st(K, { hand: 1, panel: 0, rd: 0 })) === 'single' &&
     DM.gateOf(K, st(K, { hand: 1, panel: 3, rd: 2 })) === 'tri' && DM.gateOf(K, st(K, { hand: 1, panel: 2, rd: 0 })) === 'mismatch', 'Gate 判斷（PY:29729、29753）');
  ok(DM.gateText(K, st(K, { hand: 0, panel: 2 })) === 'Dual-Gate' && DM.gateText(K, st(K, { panel: 0 })) === 'Single-Gate', 'comboBox 依 PANEL_MODE 顯示（PY:28998）');
  /* Dual：Line 1-2 用 GN2（值 0 ＝ R5），Line 1-1 用 GN1（值 0 ＝ R3） */
  const d = st(K, { hand: 1, panel: 2, rd: 1, c0: 0, c6: 0, c12: 6, c18: 12 });
  ok(DM.cellView(K, d, 0, 0).txt === 'R3' && DM.cellView(K, d, 1, 0).txt === 'R5' && DM.cellView(K, d, 2, 0).txt === 'R1' && DM.cellView(K, d, 3, 0).txt === 'R1', 'Dual：Line 1-1／2-1 GN1、1-2／2-2 GN2');
  /* Single：Line 1-2 顯示 Line 1-1 的值、不能改；改 Line 1-1 會一起寫 type1 */
  const sg = st(K, { hand: 1, panel: 1, rd: 0, c0: 6, c6: 9 });
  ok(DM.cellView(K, sg, 1, 0).txt === 'R1' && !DM.cellView(K, sg, 1, 0).editable && DM.cellView(K, sg, 1, 0).dark, 'Single：Line 1-2 ＝ Line 1-1 的複本、暗色、不能改');
  const e1 = DM.editCell(K, sg, 0, 0, 'g4');
  ok(e1 && e1.state.c0 === 4 && e1.state.c6 === 4 && e1.text === 'G4', 'Single：輸入 g4 ⇒ type0、type1 都 ＝ GN1[G4]＝4（PY:12521-12524、29760）');
  ok(DM.editCell(K, sg, 1, 0, 'R1') === null, 'Single：Line 1-2 輸入被忽略（PY:12525）');
  const e2 = DM.editCell(K, d, 1, 2, 'R5');
  ok(e2 && e2.text === 'X' && e2.state.c8 === 31, '輸入一律用 GN1 驗證：R5 不在表內 ⇒ X ＝ 31（PY:12518）');
  const e3 = DM.editCell(K, d, 1, 2, 'R1');
  ok(e3 && e3.state.c8 === 12, 'Dual 第 2 列輸入 R1 ⇒ 寫 GN2[R1]＝12（PY:29738）');
  ok(e3.state.deEn === 1 && e3.state.deSel === 0xE, '任何改動 ⇒ FORCE_DE_EN＝Hand、FORCE_DE_SEL＝0xE（PY:29267-29280）');
  ok(DM.editCell(K, st(K, { hand: 1, panel: 3, rd: 2 }), 0, 0, 'R1') === null && DM.editCell(K, st(K, { hand: 0, panel: 2, rd: 1 }), 0, 0, 'R1') === null, 'Tri／Hand 關 ⇒ 不能改');
  /* 非標準值：顯示 0xNN、保留原值；改別格不動它 */
  const ns = st(K, { hand: 1, panel: 2, rd: 1, c0: 0x1E, c1: 6 });
  const v = DM.cellView(K, ns, 0, 0);
  ok(!v.std && v.txt === '0x1E' && v.raw === 0x1E && v.color === 'ns', '表外值顯示「0x1E」、標非標準值');
  const e4 = DM.editCell(K, ns, 0, 1, 'B1');
  ok(e4.state.c0 === 0x1E, '改別格後非標準值保留原值（不像 PY 會寫成 31）');
  ok(DM.pyNames(K, ns)[0] === 'X', 'CKS 計算時非標準值以 X 計（同 PY KeyError 分支）');
  /* All Same Pixel：GN2 驗證；Dual 第 1／3 列用 GN1 ⇒ R5 變 X */
  const as = DM.allSame(K, d, 'r5');
  ok(as && as.text === 'R5' && as.state.c0 === 31 && as.state.c6 === 0, 'All Same Pixel R5：Line 1-1 ⇒ X(31)、Line 1-2 ⇒ GN2[R5]＝0（PY:29925）');
  /* Gate 改選 */
  const g1 = DM.setGate(K, d, 'Single-Gate');
  ok(g1.panel === 1 && g1.rd === 0 && DM.setGate(K, d, 'Tri-Gate').rd === 2 && DM.setGate(K, d, 'Non-Hand Mode') === null, 'Gate Type：Single→1/0、Dual→2/1、Tri→3/2、Non-Hand Mode 不動（PY:29874-29885）');
  /* DAZ */
  const z = DM.setGate('DAZ7353', st('DAZ7353', { hand: 1, panel: 2 }), 'Single-Gate');
  ok(z.panel === 1 && z.lineEn === 1 && [0, 1, 2, 3, 4, 5, 6, 7].map(i => z['lt' + i]).join('') === '02020202', 'DAZ Single ⇒ line type 0,2,0,2…（PY:29303）');
  ok(DM.setGate('DAZ6111', st('DAZ6111', { hand: 1, panel: 1 }), 'Dual-Gate').lt1 === 1, 'DAZ Dual ⇒ line type 0,1,2,3…（PY:29300）');
  ok(DM.editCell('DAZ6111', st('DAZ6111', { hand: 1, panel: 2 }), 0, 0, 'R-2').state.c0 === 15, 'DAZ6111：R-2 不在 D6111 ⇒ X＝15（4 bit）');
  ok(DM.preLabels('DAZ7353')[0] === '(R-1)' && DM.preLabels('E501A')[0] === '(R-2 / R-1)', '前循環文字（PY:29947）');
  /* CKS：全部 R1、Dual ⇒ 1×(權重總和) */
  const all = st(K, { hand: 1, panel: 2, rd: 1 }); for (let i = 0; i < 24; i++) all['c' + i] = Math.floor(i / 6) & 1 ? 12 : 6;
  ok(DM.cks(K, all) === '0x' + DM.hex([1,118,3,117,5,116,113,8,114,10,115,12,6,112,4,111,2,110,107,11,108,9,109,7].reduce((a, x) => a + x, 0), 4), 'CKS：全 R1 ＝ 權重總和（PY:29993）');
  ok(DM.cks(K, st(K, { hand: 0 })) === null, 'Hand 關 ⇒ CKS 不顯示');
}

/* ── ④ 匯出 → 套回 ── */
sec('④ 匯出 → 套回原檔');
for (const mk of ['EM02', 'E512', 'EM01', 'EM01F']) {
  const model = mk === 'EM01F' ? 'EM01' : mk, b = synthMnt(mk), r = DM.parseCode(b, null, 'x.bin');
  const s = DM.cloneState(r.state); s.panel = (s.panel + 1) & 3; s.hand ^= 1; s.c0 = (s.c0 + 3) % 30; s.x23 = 31; s.rd = (s.rd + 1) & 3; s.rvsL ^= 0x0F;
  const out = DM.buildScript(model, s, { version: 'test', source: 'synthetic' });
  const img = Uint8Array.from(b);
  const ap = DM.applyScript(out.text, { get: reg => img[r.fileOf(reg)], set: (reg, v) => { img[r.fileOf(reg)] = v; } });
  const allow = {}; for (const e of DM.regsOf(model)) allow[r.fileOf(e.reg)] = e.mask;
  let outside = 0, bits = 0, chg = 0;
  for (let i = 0; i < img.length; i++) { if (img[i] === b[i]) continue; chg++; if (!(i in allow)) outside++; else if ((img[i] ^ b[i]) & ~allow[i] & 0xFF) bits++; }
  ok(out.ok && ap.bad.length === 0 && chg > 0 && outside === 0 && bits === 0, mk + ' write -m 套回：只動 DM 遮罩內位元（變 ' + chg + '、外 ' + outside + '、遮罩外位元 ' + bits + '）');
  ok(same(DM.parseCode(img, model, 'x.bin').state, s), mk + ' 套回後重新解碼 ＝ 匯出前狀態');
}
for (const k of PYK) {
  const b = synthNb(k, randState(k, 5)), r = DM.parseCode(b, null, DM.MODELS[k].py + '.bin');
  const s = DM.cloneState(r.state); s.hand ^= 1; s.c3 = DM.inputDict(k).X; s.c22 = (s.c22 + 1) % 16; s.panel = (s.panel + 1) & 3;
  const rows = DM.pyScriptRows(k, s);
  ok(rows[0][0] === 'TCON\n(內部型號)' && rows[0].length === 22 && rows[1][1] === 'SCRIPT WR' && rows[1][2] === '0x3E' && rows[1][3] === '2', k + ' SCRIPT 表頭與欄位同 PY 範本');
  const img = Uint8Array.from(b), fo = r.fileOf;
  DM.applyPyScriptRows(rows, { get: reg => img[fo(reg)], set: (reg, v) => { img[fo(reg)] = v; } });
  const allow = {}; for (const e of DM.regsOf(k)) allow[fo(e.reg)] = e.mask;
  let outside = 0, bits = 0, chg = 0;
  for (let i = 0; i < img.length; i++) { if (img[i] === b[i]) continue; chg++; if (!(i in allow)) outside++; else if ((img[i] ^ b[i]) & ~allow[i] & 0xFF) bits++; }
  ok(chg > 0 && outside === 0 && bits === 0 && same(DM.parseCode(img, null, DM.MODELS[k].py + '.bin').state, s), k + ' SCRIPT 套回：只動 DM 位元、重新解碼 ＝ 匯出前狀態');
}

/* ── ⑤ I2C 假裝置 ── */
sec('⑤ I2C 假裝置');
(async function () {
  for (const model of DM.MODEL_KEYS) {
    const mem = new Uint8Array(0x10000); for (let i = 0; i < mem.length; i++) mem[i] = (i * 13 + 5) & 0xFF;
    const writes = [], io = { read: async (a, n) => Array.from(mem.slice(a, a + n)), write: async (a, bytes) => { writes.push([a, bytes.slice()]); for (let k = 0; k < bytes.length; k++) mem[a + k] = bytes[k]; } };
    const before = Uint8Array.from(mem);
    const s0 = (await DM.readState(io, model)).state;
    ok(same(s0, DM.decode(model, reg => before[reg])), model + ' readState ＝ 直接解碼');
    const s1 = DM.cloneState(s0); s1.c5 = (s1.c5 + 1) % 16; s1.hand ^= 1;
    const d = DM.diffRegs(model, s0, s1), res = await DM.writeRegs(io, d, () => {});
    ok(res.ok, model + ' 寫入成功');
    let stray = 0; for (let i = 0; i < mem.length; i++) if (mem[i] !== before[i] && !writes.some(w => w[0] === i)) stray++;
    ok(stray === 0, model + ' 沒有寫到別的位址');
    const changedBits = writes.reduce((a, w) => a | ((w[1][0] ^ before[w[0]]) & ~d.find(x => x.reg === w[0]).mask), 0);
    ok(changedBits === 0, model + ' 遮罩外位元保留');
    ok(same((await DM.readState(io, model)).state, s1), model + ' 寫完讀回 ＝ 目標狀態');
  }

  /* ── ⑥ xlsx ── */
  sec('⑥ xlsx 往返');
  {
    const K = 'E503', s = st(K, { hand: 1, panel: 2, rd: 1 }); for (let i = 0; i < 24; i++) s['c' + i] = [6, 7, 8, 9, 10, 11][i % 6] + (Math.floor(i / 6) & 1 ? 6 : 0);
    s.c2 = 0x1D;
    const rows = DM.excelRows(K, s), u8 = XL.build([{ name: 'Data Mapping', rows }]);
    const back = await DM.readXlsxRows(u8, inflateRaw);
    ok(same(back[1].slice(0, 7), rows[1]) && back[0][1] === 'Data 1', 'Data Mapping Excel 寫出 → 讀回一致');
    const nm = DM.excelToNames(back);
    ok(nm.ok && nm.names[2] === '0x1D', '非標準值以 0xNN 匯出（PY 讀到會當 X）');
    const ap = DM.applyNames(K, s, nm.names);
    ok(ap.c0 === s.c0 && ap.c2 === 31, 'Import Excel：一般名稱還原；0xNN 不在表內 ⇒ X（同 PY set_rgb_table_to_dm_info）');
    const sr = DM.pyScriptRows(K, s), su8 = XL.build([{ name: 'Sheet1', rows: sr }]), sb = await DM.readXlsxRows(su8, inflateRaw);
    ok(sb[0][0] === 'TCON\n(內部型號)' && sb[1][4] === '0x322[0:0]', 'SCRIPT xlsx 讀回：表頭含換行、Offset 格式 0x322[0:0]');
    const DMX = path.join(process.env.HOME || '', 'TCON/TCON_UI/Raydium_RomCodeProcessUI/Raydium_RomCodeProcessUI_V5.0.4_Release/Data_Mapping');
    if (fs.existsSync(DMX)) {
      const xs = fs.readdirSync(DMX).filter(f => /\.xlsx$/i.test(f));
      let good = 0;
      for (const f of xs) { const r = DM.excelToNames(await DM.readXlsxRows(new Uint8Array(fs.readFileSync(path.join(DMX, f))), inflateRaw)); if (r.ok) good++; else console.log('    ' + f + ': ' + r.reason); }
      ok(good === xs.length, 'Python UI 隨附的 Data Mapping Excel 全部讀得懂（' + good + '/' + xs.length + '）');
    }
  }

  /* ── ⑦ 色碼 ── */
  sec('⑦ R／G／B 底色 ＝ Pattern 4×4');
  { const old = (c, v) => c === 0 ? 'rgb(' + v + ',0,0)' : c === 1 ? 'rgb(0,' + v + ',0)' : 'rgb(0,0,' + v + ')';
    let bad = 0; for (let c = 0; c < 3; c++) for (let v = 0; v < 256; v++) if (SP.css(c, v) !== old(c, v)) bad++;
    ok(bad === 0, 'TCONSubpix.css 與 pattern v3.8.2 pgCellColor 逐字相同（768 組）');
    ok(SP.textOn(0, 0, 255) === '#fff' && SP.textOn(0, 255, 0) === '#000' && SP.textOn(50, 50, 50) === '#fff' && SP.textOn(150, 150, 150) === '#000', '文字黑白依底色自動選');
    const pat = fs.readFileSync(path.join(ROOT, 'pattern.html'), 'utf8');
    ok(/return TCONSubpix\.css\(c, v\);/.test(pat) && /common\/subpix-colors\.js/.test(pat), 'pattern.html 引用同一支 subpix-colors.js');
  }

  /* ── ⑧ 預設樣式 ── */
  sec('⑧ MNT 原廠預設樣式');
  ok(DM.PRESETS.length === 34, '預設樣式 34 筆');
  const p32 = DM.PRESETS.findIndex(p => p.name.indexOf('(32)') === 0), s32 = DM.applyPreset('EM02', DM.emptyState('EM02'), p32);
  ok(s32.rd === 1 && s32.panel === 2 && s32.hand === 1 && s32.deEn === 1 && s32.deSel === 14 && s32.c0 === 10 && s32.c6 === 17 && s32.c1 === 8, '(32) 欄位值正確（r0_0＝10、r0_1＝17、g0_0＝8：原廠索引 k＝通道×4＋type）');
  ok(DM.matchPreset('EM02', s32) === p32, 'matchPreset 認得 (32)');
  const H = path.join(process.env.HOME || '', 'ClaudeData/Projects/VCL_TV_TCON_EM02_Tool/App/TX/RApp_TX.h');
  if (fs.existsSync(H)) {
    const src = fs.readFileSync(H, 'latin1'), blk = src.slice(src.indexOf('stRt7MapType[TX_MAP_ITEM_NUM] ='));
    const rows = blk.split('\n').filter(l => /^\s*"\(\d+\)/.test(l)); let n = 0;
    const head = ['rd', 'panel', 'ltpsZz', 'subPanel', 'mirror', 'chrb', 'deEn', 'deSel', 'rvsL', 'rvsH', 'hand'];
    const selId = k => { const ch = Math.floor(k / 4), t = k % 4; return ch < 6 ? 'c' + (t * 6 + ch) : 'x' + (t * 6 + ch - 6); };
    for (const row of rows) {
      const cells = (row.match(/"[^"]*"/g) || []).map(c => c.slice(1, -1)), name = cells[0], vals = cells.slice(1);
      if (name.indexOf('User define') >= 0) continue;
      const p = DM.PRESETS.find(q => q.name === name); if (!p) { ok(false, '找不到 ' + name); continue; }
      let eq = true;
      for (let i = 0; i < vals.length; i++) { const id = i < 11 ? head[i] : selId(i - 11), want = vals[i] === 'x' ? undefined : +vals[i]; if (p.set[id] !== want) eq = false; }
      ok(eq, name + ' 與原廠表一致'); n++;
    }
    ok(n === 34, '原廠表比對筆數 34（實得 ' + n + '）');
  }

  /* ── 真檔 ── */
  const ri = process.argv.indexOf('--real');
  if (ri >= 0) {
    sec('真檔');
    const pi = process.argv.indexOf('--pyui'), pyDir = pi >= 0 ? process.argv[pi + 1] : null;
    const list = [];
    const walk = p => { const s = fs.statSync(p); if (s.isDirectory()) fs.readdirSync(p).forEach(f => walk(path.join(p, f))); else if (/\.(bin|hex|rom)$/i.test(p)) list.push(p); };
    process.argv.slice(ri + 1).filter((a, i, arr) => a !== '--pyui' && arr[i - 1] !== '--pyui').forEach(walk);
    const cnt = {};
    for (const f of list) {
      const raw = new Uint8Array(fs.readFileSync(f)), r = DM.parseCode(raw, null, path.basename(f));
      const k = r.ok ? r.model + '/' + DM.gateOf(r.model, r.state) : 'REJECT:' + r.reason;
      cnt[k] = (cnt[k] || 0) + 1;
      if (!r.ok || !pyDir || DM.MODELS[r.model].kind !== 'nb') continue;
      const py = r.py, H2 = path.join(__dirname, 'datamap_pyui_harness.py');
      const out = JSON.parse(cp.execFileSync('/usr/bin/python3', [H2, pyDir, py, f]).toString());
      const web = DM.pyNames(r.model, r.state), pyRgb = (out.rgb.length && r.state.hand) ? out.rgb : web;
      const cksP = (out.cks.match(/0x[0-9A-F]+/) || [null])[0];
      ok(same(web, pyRgb) && DM.cks(r.model, r.state) === cksP && DM.gateText(r.model, r.state) === out.gate,
         path.basename(f) + '：Gate／24 格／CKS 與 Python UI 一致（' + DM.gateText(r.model, r.state) + '，CKS ' + cksP + '）');
      const g = DM.gateOf(r.model, r.state);
      if (g === 'single' || g === 'dual' || (DM.MODELS[r.model].sem !== 'e50x' && r.state.hand)) {
        const pool = Object.keys(DM.inputDict(r.model)), names = Array.from({ length: 24 }, (_, i) => pool[(i * 5 + 3) % pool.length]);
        names[7] = 'R9';
        const ns = DM.applyNames(r.model, r.state, names);
        const ed = JSON.parse(cp.execFileSync('/usr/bin/python3', [H2, pyDir, py, f, JSON.stringify({ rgb: names })]).toString());
        const bytes = DM.loadCodeBytes(path.basename(f), raw), base = a => bytes[r.fileOf(a)];
        const webDiff = DM.encode(r.model, ns).map(e => [e.reg, base(e.reg), DM.maskedMerge(base(e.reg), e.val, e.mask)]).filter(x => x[1] !== x[2]);
        ok(same(webDiff, ed.diff), path.basename(f) + '：改 24 格後寫出的 3E byte 與 Python UI 相同（' + webDiff.length + ' byte）');
        const other = g === 'dual' ? 'Single-Gate' : 'Dual-Gate';
        const eg = JSON.parse(cp.execFileSync('/usr/bin/python3', [H2, pyDir, py, f, JSON.stringify({ gate: other })]).toString());
        const gs = DM.setGate(r.model, r.state, other);
        const gDiff = DM.encode(r.model, gs).map(e => [e.reg, base(e.reg), DM.maskedMerge(base(e.reg), e.val, e.mask)]).filter(x => x[1] !== x[2]);
        ok(same(gDiff, eg.diff), path.basename(f) + '：Gate 改成 ' + other + ' 後寫出的 byte 與 Python UI 相同（' + gDiff.length + ' byte）');
      }
    }
    console.log('  ' + JSON.stringify(cnt));
  }
  console.log((fails ? '✗ ' : '✓ ') + passes + ' 項通過、' + fails + ' 項失敗');
  process.exit(fails ? 1 : 0);
})();
