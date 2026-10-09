// v1.20.0（Bruce 10/9「請將EN01先完整調查完source code後，還有model file，將EN01也整合進datamap網頁」）：EN01（RM81008）回歸。
// 用法：node tools/check_datamap_en01.js [repo]（預設＝本檔上一層；jsdom 用 repo node_modules）
// 寫法照 10/9 去偶發：一律「等條件成立」（waitFor），不固定等待。
// 本機有原廠資料時另外對拍（沒有就跳過並註明，CI 沒有這些檔）：
//   WPF  ~/ClaudeData/Projects/WPF_RomCodeProcessUI（ICDefine.cs、RM81008.model）
//   CODE ~/TCON/TCON_UI/RCP2/RM81008_EEPROM_Demo_20251020.bin、RM81008_F1567_*.bin、WPF Doc/EN01/FALSH.bin
//   NEG  ~/TCON/Model/**/Code 底下的 .bin／.hex（非 EN01）：一份都不可以被認成 EN01
// 檢查：
//  A. 核心：位址（與 WPF DataMappingModule V2 讀法獨立重算比對）、候選值（與 ICDefine.cs GenDataMappingDefine 原文比對）、
//     欄位位址（與 ICDefine.cs／RM81008.model 原文比對）、Hand／Gate、Dynamic Header（EEPROM／FLASH 實檔、負控制）、
//     匯出 script（沒載入的段不寫、套回＝狀態）、Excel 往返（WPF 版面、跳號）、I2C 假裝置讀寫（遮罩外不動）。
//  B. 頁面：下拉、表格 24×12＋T、匯入實檔（段數、Register 表、Hand 關不能改）、Hand／Gate／選格／T 切換、③ 註明不支援、
//     All Same、mock Bridge 的 Check T-CON（3E:207E＝0x10 ⇒ EN01、回讀、即時寫入只寫改到的 byte）、其他型號不受影響。
const path = require('path'), fs = require('fs'), os = require('os');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const { JSDOM, VirtualConsole } = require(path.join(ROOT, 'node_modules/jsdom'));
const DM = require(path.join(ROOT, 'common/datamap-core.js'));
const XL = (function () { const src = fs.readFileSync(path.join(ROOT, 'common/xlsx.js'), 'utf8'); return new Function(src + '\nreturn TCONXlsx;')(); })();
const zlib = require('zlib');
let pass = 0, fail = 0; const fails = [], skips = [];
const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(m); } console.log((c ? '  ✓ ' : '  ✗ ') + m); };
const skip = m => { skips.push(m); console.log('  － 跳過：' + m); };
const sec = t => console.log('── ' + t);
const H = (v, n) => v.toString(16).toUpperCase().padStart(n || 2, '0');
const HOME = os.homedir();
const WPF = path.join(HOME, 'ClaudeData/Projects/WPF_RomCodeProcessUI');
const ICD = path.join(WPF, 'DLL_Raydium_CommonLibrary/Raydium.Core/Models/ICDefine.cs');
const MODEL = path.join(WPF, 'Wpf.RomCodeProcessUI/ModelFiles/RM81008.model');
const CODES = {
  demo: path.join(HOME, 'TCON/TCON_UI/RCP2/RM81008_EEPROM_Demo_20251020.bin'),
  f1567: path.join(HOME, 'TCON/TCON_UI/RCP2/RM81008_F1567_FRC7_EDID(8_E3_00h)_CKS(_03F5CAh)_Reorder_4_2026025.bin'),
  flash: path.join(WPF, 'Doc/EN01/FALSH.bin')
};

/* 獨立重算：WPF DataMappingModule.cs V2（:170-218）把 DataMappingDataWrapper（P1、P2、P3 依序串接）攤成 (row, col) */
function wpfV2Cells(p1Len, p2Len, p3Len) {
  const out = [];   // { row, col, addr }
  const p1 = [], p2 = [], p3 = [];
  for (let i = 0; i < p1Len; i++) p1.push(0x3D4 + i);
  for (let i = 0; i < p2Len; i++) p2.push(0x1000 + i);
  for (let i = 0; i < p3Len; i++) p3.push(0x1100 + i);
  p1.forEach((a, idx) => { const col = Math.floor(idx / 6), j = idx % 6; out.push({ row: j < 3 ? j : j + 3, col, addr: a }); });
  p2.forEach((a, idx) => { const col = Math.floor(idx / 6), j = idx % 6; out.push({ row: j < 3 ? j + 3 : j + 6, col, addr: a }); });
  p3.forEach((a, idx) => { const col = Math.floor(idx / 12), j = idx % 12; out.push({ row: j + 12, col, addr: a }); });
  return out;
}
/* 獨立重算：EEPROM／FLASH header（與 core 分開寫，避免同一個錯算兩次） */
function refMaps(b) {
  const ck = o => ((b[o] + b[o + 1] + b[o + 2] + b[o + 3] + b[o + 4] + b[o + 5] + b[o + 6]) & 0xFF) === b[o + 7];
  if (b.length >= 0x1A0 && ck(0x100)) {
    const m = []; let bad = 0;
    for (let i = 1; i < 20; i++) { const o = 0x100 + 8 * i; if (!ck(o)) { bad++; continue; } const len = ((b[o + 2] & 0x7F) << 8) | b[o + 3]; if (len) m.push([((b[o] & 0x7F) << 8) | b[o + 1], ((b[o + 4] & 7) << 16) | (b[o + 5] << 8) | b[o + 6], len]); }
    if (m.length && bad <= m.length) return m;
  }
  const m = [];
  for (let i = 0; i < 22; i++) { const o = 16 * i, rd = (b[o + 2] << 16) | (b[o + 3] << 8) | b[o + 4], mp = (b[o + 5] << 8) | b[o + 6];
    if (rd > 1 && !(b[o + 8] & 3) && mp <= 0x1800 && (mp & 0xFF) === 0 && mp !== 0x0100 && !(mp >= 0x0200 && mp <= 0x0500)) m.push([((b[o] << 8) | b[o + 1]) * 256, mp, rd - 1 + ((b[o + 9] & 0x80) ? 0 : 2)]); }
  return m;
}
const regOf = (b, maps) => { const r = {}; maps.forEach(([f, t, l]) => { for (let k = 0; k < l; k++) if (f + k < b.length && !(t + k in r)) r[t + k] = b[f + k]; }); return r; };

(async () => {
  sec('A1 位址：24 列 × 12 欄＝288 格，與 WPF V2 讀法逐格相同');
  {
    const ref = wpfV2Cells(72, 72, 144), seen = new Set(); let good = true, bad = '';
    ref.forEach(x => { const a = DM.en01Addr(x.row, x.col); if (a !== x.addr) { good = false; bad += ' (' + x.row + ',' + x.col + ')=' + H(a, 4) + '≠' + H(x.addr, 4); } seen.add(a); });
    ok(good && ref.length === 288 && seen.size === 288, 'en01Addr ＝ WPF DataMappingModule V2（P1 idx/6、row j<3?j:j+3；P2 j+3／j+6；P3 idx/12、row j+12）' + bad.slice(0, 200));
    ok(DM.en01Addr(0, 0) === 0x3D4 && DM.en01Addr(1, 0) === 0x3D5 && DM.en01Addr(6, 0) === 0x3D7 && DM.en01Addr(0, 1) === 0x3DA && DM.en01Addr(3, 0) === 0x1000 && DM.en01Addr(9, 0) === 0x1003 && DM.en01Addr(12, 0) === 0x1100 && DM.en01Addr(12, 1) === 0x110C && DM.en01Addr(23, 11) === 0x118F,
      '代表格：L1-1 R0＝0x3D4（原廠指南 FORCE_SEL_R0_0）、L2-1 R0＝0x3D7、L1-1 G0＝0x3DA、L1-4＝0x1000、L2-4＝0x1003、L3-1＝0x1100、L3-1 G0＝0x110C、L4-6 B3＝0x118F');
    ok(DM.en01Rows({ p2: false, p3: false }).join() === '0,1,2,6,7,8' && DM.en01Rows({ p2: true, p3: false }).length === 12 && DM.en01Rows(null).length === 24, '顯示列：只有 P1＝0,1,2,6,7,8（跳號同原廠）；P1+P2＝12 列；全部＝24 列');
    ok(DM.en01RowLabel(0) === 'L1-1' && DM.en01RowLabel(5) === 'L1-6' && DM.en01RowLabel(6) === 'L2-1' && DM.en01RowLabel(23) === 'L4-6', '列名 L(line)-(相位)（DataMappingModule.cs:335-342）');
    const f = DM.fieldsOf('EN01'), cells = f.filter(x => /^e\d+$/.test(x.id));
    ok(cells.length === 288 && cells.every(x => x.parts.length === 1 && x.parts[0][1] === 7 && x.parts[0][2] === 0) && f.find(x => x.id === 'e0').name === 'FORCE_SEL_R0_0' && f.find(x => x.id === 'e143').name === 'FORCE_SEL_B3_11',
      '288 個表格欄位都是整 byte，名稱＝RM81008.model 的 FORCE_SEL_<色><pixel>_<row>');
    ok(DM.MODEL_KEYS.indexOf('EN01') < 0 && DM.SELECT_KEYS.join() === 'DAZ6111,DAZ6138,DAZ6139,DAZ7353,E501A,E501B,E503,EN01,EM01,EM02,E512', 'MODEL_KEYS（PY＋MNT）不變；下拉 SELECT_KEYS 把 EN01 接在 E503 後');
  }

  sec('A2 候選值（T1~T10）');
  {
    const want = t => { const g = []; for (let b = t; b >= 0; b--) for (let k = 1; k <= 4; k++) g.push(4 * b + k); return g; };
    let good = true;
    for (let t = 1; t <= 10; t++) {
      const d = DM.en01Defs(t), g = want(t);
      if (d.length !== 12 * (t + 1) + 1 || d[d.length - 1].name !== 'X' || d[d.length - 1].value !== 0xFF) good = false;
      for (let v = 0; v < 12 * (t + 1); v++) if (DM.en01Name(t, v) !== 'RGB'[v % 3] + g[Math.floor(v / 3)]) good = false;
      if (DM.en01Name(t, 12 * (t + 1)) !== null) good = false;
    }
    ok(good, '每階 12(T+1) 個＋X(0xFF)，值 v ⇒ RGB[v%3]＋gValues[v/3]，超出範圍＝非標準');
    ok(DM.en01Name(1, 0) === 'R5' && DM.en01Name(1, 12) === 'R1' && DM.en01Name(2, 12) === 'R5' && DM.en01Name(4, 0) === 'R17' && DM.en01Name(4, 59) === 'B4' && DM.en01Name(4, 11) === 'B20' && DM.en01Value(1, 'R5') === 0 && DM.en01Value(2, 'R5') === 12,
      '原廠指南的例子：同樣 R5，T1 寫 0、T2 寫 12；0x00 在 T4 顯示 R17');
    const d1 = DM.en01Defs(1).map(x => x.name);
    ok(d1.slice(0, 8).join() === 'R1,R2,R3,R4,R5,R6,R7,R8' && d1[8] === 'G1' && d1[d1.length - 1] === 'X', '下拉順序：R→G→B、編號小→大，X 最後（WPF MappingCellInfo）');
    if (fs.existsSync(ICD)) {
      const src = fs.readFileSync(ICD, 'utf8'), re = /rm81008\.DataMappingRGBInfos\.Add\(new DataMappingRGBInfo\((\d+), GenDataMappingDefine\((\d+), new\[\] \{([^}]*)\}\)/g;
      let m, n = 0, same = true;
      while ((m = re.exec(src))) {
        n++; const tab = +m[1], cnt = +m[2], g = m[3].split(',').map(x => +x.trim()), t = DM.EN01_TABS.indexOf(tab) + 1, d = DM.en01Defs(t);
        const vMax = Math.max(...g);
        for (let v = 0; v < cnt; v++) if (DM.en01Name(t, v) !== ['R', 'G', 'B'][v % 3] + g[Math.floor(v / 3) % vMax]) same = false;
        if (d.length !== cnt + 1) same = false;
      }
      ok(n === 10 && same, 'ICDefine.cs 原文 10 階 GenDataMappingDefine(count, gValues) 逐值相同（' + n + ' 階）');
    } else skip('ICDefine.cs 不在本機，候選值原文對拍略過');
  }

  sec('A3 欄位位址（ICDefine.cs／RM81008.model 原文）');
  {
    const F = id => DM.fieldById('EN01', id).parts[0];
    if (fs.existsSync(ICD)) {
      const src = fs.readFileSync(ICD, 'utf8'), a = src.indexOf('public static ICInfo GetRM81008()'), b = src.indexOf('public static ICInfo GetRM81011()'), sub = src.slice(a, b);
      const prop = n => { const m = new RegExp('EnumICPropertyType\\.' + n + ',[\\s\\S]*?AddrBitInfo\\((0x[0-9A-Fa-f]+)(?:, (\\d+), (\\d+))?\\)').exec(sub); return m ? [parseInt(m[1], 16), m[2] === undefined ? 7 : +m[2], m[3] === undefined ? 0 : +m[3]] : null; };
      const rng = n => { const m = new RegExp('EnumICRangeType\\.' + n + ',[\\s\\S]*?Start = (0x[0-9A-Fa-f]+), End = (0x[0-9A-Fa-f]+)').exec(sub); return m ? [parseInt(m[1], 16), parseInt(m[2], 16)] : null; };
      ok(JSON.stringify(prop('FORCE_DE_EN')) === JSON.stringify(F('deEn')) && JSON.stringify(prop('FORCE_SEL_EN')) === JSON.stringify(F('hand')) && JSON.stringify(prop('FORCE_DE_SEL')) === JSON.stringify(F('deSel')) && JSON.stringify(prop('RD_MODE')) === JSON.stringify(F('rd')),
        'FORCE_DE_EN／FORCE_SEL_EN／FORCE_DE_SEL／RD_MODE ＝ ICDefine.cs GetRM81008（' + JSON.stringify([prop('FORCE_DE_EN'), prop('FORCE_SEL_EN'), prop('FORCE_DE_SEL'), prop('RD_MODE')]) + '）');
      ok(JSON.stringify(rng('DataMapping')) === '[980,1051]' && JSON.stringify(rng('DataMappingP2')) === '[4096,4167]' && JSON.stringify(rng('DataMappingP3')) === '[4352,4495]', 'RangeItems：P1 0x3D4–0x41B、P2 0x1000–0x1047、P3 0x1100–0x118F');
      ok(/DataMappingVersion = EnumDataMappingVersion\.Version2/.test(sub) && !/EnumICPropertyType\.PANEL_MODE/.test(sub), 'RM81008＝DataMappingVersion.Version2；ICDefine 沒有替 RM81008 定義 PANEL_MODE（Gate Type 不寫它）');
    } else skip('ICDefine.cs 不在本機');
    if (fs.existsSync(MODEL)) {
      const md = fs.readFileSync(MODEL, 'latin1');
      const node = n => { const m = new RegExp('\\[\\s*' + n + '\\s*\\][\\s\\S]*?RegAddr0\\s*=\\s*(0x[0-9A-Fa-f]+)[\\s\\S]*?RegMsb0\\s*=\\s*(\\d+)[\\s\\S]*?RegBits0\\s*=\\s*(\\d+)').exec(md); return m ? [parseInt(m[1], 16), +m[2], +m[2] - +m[3] + 1] : null; };
      const pairs = [['PANEL_MODE', 'panel'], ['SUB_PANEL_MODE', 'subPanel'], ['LTPS_ZIGZAG_MODE', 'ltpsZz'], ['FORCE_SEL_EN', 'hand'], ['FORCE_DE_EN', 'deEn'], ['FORCE_DE_SEL', 'deSel'], ['MIRROR', 'mirror'], ['CHRB', 'chrb'], ['CHWB', 'chwb'], ['READ_RVS', 'rvsL'], ['RD_MODE', 'rd']];
      const bad = pairs.filter(([n, id]) => JSON.stringify(node(n)) !== JSON.stringify(F(id))).map(([n]) => n + '=' + JSON.stringify(node(n)));
      ok(!bad.length, '11 個欄位（PANEL／SUB_PANEL／LTPS_ZIGZAG／FORCE_SEL_EN／FORCE_DE_EN／FORCE_DE_SEL／MIRROR／CHRB／CHWB／READ_RVS／RD_MODE）＝RM81008.model' + (bad.length ? ' 不符：' + bad.join(' ') : ''));
      let cellBad = 0; for (let r = 0; r < 12; r++) for (let c = 0; c < 12; c++) { const x = node('FORCE_SEL_' + DM.EN01_CH[c] + '_' + r); if (!x || x[0] !== DM.en01Addr(r, c)) cellBad++; }
      ok(cellBad === 0 && !/FORCE_SEL_R0_12\b/.test(md), 'model 的 FORCE_SEL_*_0~_11（144 格，P1＋P2）位址全部相同；model 沒有 _12 以後（P3 依 WPF 程式）');
    } else skip('RM81008.model 不在本機');
  }

  sec('A4 Hand Mode／Gate Type（WPF DataMappingModule.cs:224-245、421-458）');
  {
    let s = DM.emptyState('EN01'); s.rd = 1; s.panel = 2;
    ok(DM.gateOf('EN01', s) === 'off' && DM.cks('EN01', s) === null, 'Hand 關 ⇒ off；EN01 沒有 DM CKS');
    s = DM.setHand('EN01', s, true);
    ok(s.hand === 1 && s.deEn === 1 && s.deSel === 0x0E && DM.gateOf('EN01', s) === 'dual', '開 Hand ⇒ FORCE_SEL_EN＝FORCE_DE_EN＝1、FORCE_DE_SEL＝0x0E；RD_MODE 1 ⇒ Dual');
    const s1 = Object.assign(DM.cloneState(s), { deEn: 0 });
    ok(DM.gateOf('EN01', s1) === 'off', 'FORCE_SEL_EN＝1 但 FORCE_DE_EN＝0 ⇒ Hand 視為關（兩者都要開）');
    const t = DM.setGate('EN01', s, 'Single-Gate'), u = DM.setGate('EN01', s, 'MUX6 (RD_MODE=5)');
    ok(t.rd === 0 && t.panel === 2 && u.rd === 5 && u.panel === 2 && DM.gateText('EN01', u) === 'MUX6 (RD_MODE=5)' && DM.setGate('EN01', s, 'Non-Hand Mode') === null, 'Gate Type 只寫 RD_MODE（Single 0、MUX6 5），PANEL_MODE 不動');
    const off = DM.setHand('EN01', s, false);
    ok(off.hand === 0 && off.deEn === 0 && off.deSel === 0x0E, '關 Hand ⇒ 兩個都寫 0，FORCE_DE_SEL 仍寫 0x0E（同原廠）');
    const p = DM.en01Pick(s, 0, 0, 1, 'R1');
    ok(p && p.state.e0 === 12 && DM.en01Pick(off, 0, 0, 1, 'R1') === null && DM.en01Pick(s, 0, 0, 1, 'R9') === null, '選格：T1 的 R1＝12；Hand 關或名稱不在該階候選 ⇒ 不改');
    const as = DM.en01AllSame(s, 'R9', [0, 1], [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4].map((x, i) => i === 1 ? 1 : 4));
    ok(as.state.e0 === DM.en01Value(4, 'R9') && as.state.e12 === s.e12 && as.cells === 12, 'All Same：每列在自己的 T 找同名候選，T1 那列沒有 R9 ⇒ 不改（WPF AllAssign）');
  }

  sec('A5 Dynamic Header（實檔）');
  const parsed = {};
  for (const [k, f] of Object.entries(CODES)) {
    if (!fs.existsSync(f)) { skip(path.basename(f) + ' 不在本機'); continue; }
    const b = new Uint8Array(fs.readFileSync(f)), r = DM.parseCode(b, 'EN01', 'x.bin'), ref = regOf(b, refMaps(b));
    parsed[k] = { b, r, name: path.basename(f) };
    let same = r.ok; if (r.ok) DM.fieldsOf('EN01').forEach(fd => { const a = fd.parts[0][0]; const want = a in ref ? ref[a] : 0; const v = (want >> fd.parts[0][2]) & ((1 << (fd.parts[0][1] - fd.parts[0][2] + 1)) - 1); if ((r.state[fd.id] | 0) !== v) same = false; });
    ok(same, path.basename(f) + '：解析成功（' + r.medium + '），299 個欄位＝獨立重算的 header 映射值');
  }
  if (parsed.f1567) { const r = parsed.f1567.r; ok(r.medium === 'eeprom' && r.seg.p2 && !r.seg.p3 && r.state.hand === 0 && r.state.panel === 1 && r.state.e0 === 24 && r.state.e12 === 38, 'F1567（4096 B，EEPROM 版面）：P2 有、P3 沒開；Hand 關、PANEL_MODE 1；L1-1 R0＝24、L1-2 R0＝38'); }
  if (parsed.flash) { const r = parsed.flash.r; ok(r.medium === 'flash' && r.seg.p2 && r.seg.p3 && r.state.hand === 1 && r.state.deEn === 0 && DM.gateOf('EN01', r.state) === 'off', 'FALSH.bin（FLASH 版面）：Bank0_5 0x7000、RT7_p2 0x8B00、RT7_p3 0x8D00；FORCE_SEL_EN 1／FORCE_DE_EN 0 ⇒ Hand 關'); }
  if (parsed.demo) { const r = parsed.demo.r, T = 4; let allStd = true; DM.en01Rows({ p2: false, p3: false }).forEach(row => { for (let c = 0; c < 12; c++) if (!DM.en01CellView(r.state, row, c, T).std) allStd = false; });
    ok(r.state.hand === 1 && r.state.deEn === 1 && r.state.rd === 1 && r.state.panel === 3 && allStd, 'EEPROM_Demo：Hand 開、RD_MODE 1、PANEL_MODE 3；P1 值最大 59 ⇒ T4 全部是標準名稱'); }
  {
    const f = parsed.f1567 || parsed.demo;
    if (f) {
      const byName = DM.parseCode(f.b, 'E503', f.name), noName = DM.parseCode(f.b, 'E503', 'code.bin'), mnt = DM.parseCode(f.b, 'EM02', 'code.bin');
      ok(byName.ok && byName.model === 'EN01' && byName.byName && noName.ok === false && noName.reason === 'modelMismatch' && noName.found.join() === 'EN01' && mnt.reason === 'modelMismatch' && mnt.found.join() === 'EN01',
        '檔名有 RM81008 ⇒ 直接認 EN01；檔名看不出來、選的是 E503／EM02 ⇒ 回報「型號不符，找到 EN01」（頁面會先問）');
    }
    ok(DM.modelFromName('RM81008(RM81002like)_x.bin').key === 'EN01' && DM.modelFromName('EN01A2_x.bin').key === 'EN01' && DM.modelFromName('RM81003_x.bin').key === 'E503', '檔名：RM81008／EN01 優先（不會被 RM81002 認成 E503）；RM81003 仍是 E503');
    const short = DM.parseCode(new Uint8Array(4096), 'EN01', 'x.bin');
    ok(!short.ok && short.reason === 'en01Header', '空白檔選 EN01 ⇒ 找不到 Dynamic Header（不猜）');
  }
  {
    const root = path.join(HOME, 'TCON/Model');
    if (fs.existsSync(root)) {
      const files = []; (function walk(d, depth) { let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; } for (const e of es) { const p = path.join(d, e.name); if (e.isDirectory() && depth < 8) walk(p, depth + 1); else if (/\.(bin|hex)$/i.test(e.name) && /[\\/]Code[\\/]/i.test(p) && !/RM81008|EN01/.test(p)) files.push(p); } })(root, 0);
      let hit = []; files.forEach(p => { try { const b = DM.loadCodeBytes(p, new Uint8Array(fs.readFileSync(p))); if (DM.parseEn01(b).ok) hit.push(path.basename(p)); } catch (e) {} });
      ok(files.length > 100 && hit.length === 0, '負控制：~/TCON/Model 的非 EN01 code ' + files.length + ' 份，被認成 EN01 的 ' + hit.length + ' 份' + (hit.length ? '：' + hit.slice(0, 5).join('、') : ''));
    } else skip('~/TCON/Model 不在本機，負控制略過');
  }

  sec('A6 匯出 script／Excel／I2C');
  {
    let s = DM.setHand('EN01', DM.emptyState('EN01'), true);
    for (let i = 0; i < 288; i++) s['e' + i] = (i * 7) % 60;
    const seg = { p2: true, p3: false }, out = DM.buildScript('EN01', s, { seg, now: new Date(0) });
    const regs = out.text.split('\n').filter(l => /^write -m/.test(l)).map(l => parseInt(l.split(/\s+/)[2], 16));
    ok(out.ok && regs.some(a => a >= 0x1000 && a <= 0x1047) && !regs.some(a => a >= 0x1100 && a <= 0x118F) && regs.indexOf(0x41C) >= 0 && regs.indexOf(0x3A5) >= 0 && /EN01 \(RM81008\)/.test(out.text) && /P1\+P2\)/.test(out.text),
      '匯出 script（write -m，WPF Script 分頁 .script 格式）：P3 沒載入 ⇒ 不寫 0x11xx；含 RD_MODE、READ_RVS');
    const img = new Map(), get = a => img.has(a) ? img.get(a) : 0x5A; img.get = img.get.bind(img);
    const im = { get: a => (img.has(a) ? Map.prototype.get.call(img, a) : 0x5A), set: (a, v) => Map.prototype.set.call(img, a, v) };
    const ap = DM.applyScript(out.text, im), back = DM.decode('EN01', a => im.get(a));
    ok(ap.bad.length === 0 && DM.en01Ids(seg).every(id => (back[id] | 0) === (s[id] | 0)), '套回 script ⇒ 匯出的欄位全部＝狀態（' + ap.count + ' 行）');
    const tabs = Array(24).fill(4), rows = DM.en01Rows({ p2: false, p3: false }), xr = DM.en01ExcelRows(s, rows, tabs);
    ok(xr[0].join('|') === '|R0|G0|B0|R1|G1|B1|R2|G2|B2|R3|G3|B3' && xr[1][0] === 'L1-1' && xr[7][0] === 'L2-1' && xr[4].length === 0, 'Excel 版面＝WPF Export：第 1 列表頭、列號＝row＋2（只有 P1 時 L1-4~L1-6 那幾列空白）');
    const u8 = XL.build([{ name: 'DataMapping Export', rows: xr }]);
    const rd = await DM.readXlsxRows(u8, async x => new Uint8Array(zlib.inflateRawSync(Buffer.from(x))));
    let s2 = DM.setHand('EN01', DM.emptyState('EN01'), true); const res = DM.en01ExcelApply(s2, rd, rows, tabs);
    ok(res && res.cells === 72 && rows.every(r => { for (let c = 0; c < 12; c++) if ((res.state['e' + (r * 12 + c)] | 0) !== (s['e' + (r * 12 + c)] | 0)) return false; return true; }), 'Excel 往返（xlsx 寫→讀→套用）：72 格全部相同');
    ok(DM.en01ExcelApply(DM.emptyState('EN01'), rd, rows, tabs) === null, 'Hand 關不能匯入 Excel（同原廠）');
    ok(/^DataMapping Export \d{8}_\d{6}\.xlsx$/.test(DM.en01ExcelName(new Date(2026, 9, 9, 15, 4, 5))) && DM.en01ExcelName(new Date(2026, 9, 9, 15, 4, 5)) === 'DataMapping Export 20261009_030405.xlsx', '檔名照 WPF「DataMapping Export yyyyMMdd_hhmmss」（hh＝12 小時制）');
    const mem = new Uint8Array(0x10000); for (let i = 0; i < mem.length; i++) mem[i] = (i * 13 + 5) & 0xFF;
    const writes = [], io = { read: async (a, n) => Array.from(mem.slice(a, a + n)), write: async (a, bytes) => { writes.push([a, bytes.slice()]); for (let k = 0; k < bytes.length; k++) mem[a + k] = bytes[k]; } };
    const before = Uint8Array.from(mem), s0 = (await DM.readState(io, 'EN01')).state;
    const s1 = DM.cloneState(s0); s1.e100 = (s1.e100 + 1) & 0xFF; s1.rd = (s1.rd + 1) & 7; s1.mirror ^= 1;
    const d = DM.diffRegs('EN01', s0, s1), wr = await DM.writeRegs(io, d, () => {});
    let stray = 0; for (let i = 0; i < mem.length; i++) if (mem[i] !== before[i] && !writes.some(w => w[0] === i)) stray++;
    const keep = writes.reduce((a, w) => a | ((w[1][0] ^ before[w[0]]) & ~d.find(x => x.reg === w[0]).mask), 0);
    ok(wr.ok && stray === 0 && keep === 0 && d.length === 3 && JSON.stringify((await DM.readState(io, 'EN01')).state) === JSON.stringify(s1), 'I2C 假裝置：讀回＝解碼、只寫改到的 3 個 byte、遮罩外位元保留、寫完讀回＝目標');
  }

  sec('B 頁面');
  const mem = {};
  async function open(opt) {
    opt = opt || {};
    const log = [];
    const vc = new VirtualConsole(); vc.on('jsdomError', e => { fail++; fails.push('jsdomError ' + e.message); console.log('  ✗ jsdomError ' + e.message); });
    const dom = await JSDOM.fromFile(path.join(ROOT, 'datamap.html'), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
      beforeParse(w) {
        w.URL.createObjectURL = () => 'blob:x'; w.URL.revokeObjectURL = () => {};
        w.WebSocket = function () {
          const ws = this; ws.readyState = 0;
          setTimeout(() => { ws.readyState = 1; ws.onopen && ws.onopen(); }, 1);
          ws.send = s => { const m = JSON.parse(s); log.push(m); let r = { id: m.id, ok: true };
            if (m.type === 'ping') r = { id: m.id, ok: true, helper: 'mock', proto: 1 };
            else if (m.type === 'read') {
              if (m.addr === 0xFF00 && m.len === 3) r = { id: m.id, ok: false, err: 'nack' };
              else { const a = []; for (let i = 0; i < m.len; i++) a.push(mem[(m.slave << 16) | (m.addr + i)] | 0); r = { id: m.id, ok: true, data: a }; }
            } else if (m.type === 'rawwrite') (m.data || []).forEach((b, i) => { mem[(m.slave << 16) | (m.addr + i)] = b; });
            setTimeout(() => ws.onmessage && ws.onmessage({ data: JSON.stringify(r) }), 0); };
          ws.close = () => { ws.readyState = 3; setTimeout(() => ws.onclose && ws.onclose(), 0); };
        };
      } });
    await new Promise(r => dom.window.addEventListener('load', r));
    const w = dom.window, d = w.document, $ = id => d.getElementById(id);
    const waitFor = async (fn, what, ms = 5000) => { const t0 = Date.now(); for (;;) { let v; try { v = fn(); } catch (e) { v = false; } if (v) return v; if (Date.now() - t0 > ms) { ok(false, '逾時：' + what); return false; } await new Promise(r => setTimeout(r, 5)); } };
    const fire = (el, v) => { if (el.type === 'checkbox') el.checked = v; else el.value = v; el.dispatchEvent(new w.Event('change')); };
    return { w, d, $, waitFor, fire, log };
  }
  {
    const P = await open(), { w, d, $, fire } = P, S = w.dmState;
    ok(w.TOOL_VERSIONS && /^v1\.20\./.test(w.TOOL_VERSIONS.datamap), '版號 ' + (w.TOOL_VERSIONS && w.TOOL_VERSIONS.datamap));
    const opts = Array.from($('dm-model').options);
    ok(opts.map(o => o.value).join() === DM.SELECT_KEYS.join() && opts.every(o => !o.disabled) && opts[7].textContent === 'EN01 (RM81008)', '型號下拉：EN01 (RM81008) 在 E503 後、可選（不再是「暫不支援」）');
    fire($('dm-model'), 'EN01');
    const g = $('dm-grid');
    ok(S.model === 'EN01' && g.classList.contains('en01') && g.querySelectorAll('tbody tr').length === 24 && g.querySelectorAll('select.dm-cell').length === 288 && g.querySelectorAll('select.dm-en01t').length === 24 && Array.from(g.querySelectorAll('thead th')).map(x => x.textContent).slice(2).join() === DM.EN01_CH.join(),
      '選 EN01（沒匯入）⇒ 表格 24 列 × 12 欄（R0…B3）＋每列 T 下拉');
    ok(Array.from(g.querySelectorAll('select.dm-en01t')).every(x => x.value === '4') && Array.from($('dm-gate').options).map(o => o.value).join('|') === DM.EN01_GATES.map(x => x[0]).join('|'), '每列 T 預設 T4（WPF V2）；Gate Type＝Single／Dual／Tri／MUX4／MUX6');
    ok($('dm-pvbody').classList.contains('hidden') && /EN01：面板排列預覽與 16 種配置比較暫不支援/.test($('dm-pvnote').textContent) && !$('dm-pvnote').classList.contains('hidden'), '③ 明寫 EN01 預覽／比較表暫不支援（不推接線）');
    ok(!$('dm-gridnote').classList.contains('hidden') && /FORCE_SEL_EN 與 FORCE_DE_EN/.test($('dm-gridnote').textContent) && $('dm-e0-0').disabled && $('dm-gate').disabled, 'Hand 關：表格與 Gate Type 停用，提示兩個 bit 都要開');
    ['mirror', 'chrb', 'chwb', 'rvsL'].forEach(k => ok(!d.querySelector('.dm-fieldrow[data-need="' + k + '"]').classList.contains('hidden'), '② 顯示 ' + k + ' 列（EN01 model 有這個欄位）'));
    ok(d.querySelectorAll('#dm-code tr[data-f]').length === 299 && !!d.querySelector('#dm-code tr[data-f="e287"]'), 'TCON Register 確認：299 個欄位（11＋288）');
    if (parsed.f1567) {
      w.dmImportBytes(new Uint8Array(parsed.f1567.b), parsed.f1567.name);
      await P.waitFor(() => S.src.kind === 'file', '匯入 F1567');
      ok(S.model === 'EN01' && JSON.stringify(S.en01Seg) === '{"p2":true,"p3":false}' && g.querySelectorAll('tbody tr').length === 12 && !$('dm-e12-0') && !!$('dm-e3-0'), '匯入 F1567（檔名 RM81008）：P3 沒載入 ⇒ 只顯示 12 列（L1-1~L2-6）');
      ok(!d.querySelector('#dm-code tr[data-f="e144"]') && !!d.querySelector('#dm-code tr[data-f="e143"]') && !$('dm-hand').checked, 'Register 表不列 P3；Hand 關（原檔 FORCE_SEL_EN＝0）');
      ok($('dm-e0-0').value === 'R9' && $('dm-e1-0').value === 'B5', '格子名稱：L1-1 R0＝24 ⇒ T4 的 R9、L1-2 R0＝38 ⇒ B5');
      fire($('dm-hand'), true);
      ok(S.cur.hand === 1 && S.cur.deEn === 1 && S.cur.deSel === 0x0E && !$('dm-e0-0').disabled && !$('dm-gate').disabled && $('dm-gridnote').classList.contains('hidden'), '勾 Hand Mode ⇒ FORCE_SEL_EN＋FORCE_DE_EN＝1、FORCE_DE_SEL＝0x0E，表格可改');
      fire($('dm-e0-0'), 'B4');
      ok(S.cur.e0 === 59 && $('dm-e0-0').classList.contains('chg'), 'L1-1 R0 選 B4（T4）⇒ 0x3D4＝59（0x3B），格子標「已修改」');
      fire($('dm-et0'), '1');
      ok(S.cur.e0 === 59 && $('dm-e0-0').value === '__ns' && $('dm-e0-0').classList.contains('ns') && S.en01T[0] === 1, 'L1-1 改 T1 ⇒ 值不變（59 超出 T1 的 0~23）、顯示非標準；T 不寫入');
      fire($('dm-et0'), '4');
      fire($('dm-gate'), 'MUX6 (RD_MODE=5)');
      ok(S.cur.rd === 5 && S.cur.panel === 1, 'Gate Type 選 MUX6 ⇒ RD_MODE 5，PANEL_MODE 不動');
      const sc = w.dmBuildScript().text, lines = sc.split('\n').filter(l => /^write -m/.test(l));
      ok(lines.some(l => /^write -m 03D4 3B FF/.test(l)) && lines.some(l => /^write -m 041C 05 07/.test(l)) && !lines.some(l => /^write -m 11/.test(l)), '匯出 script：0x3D4←3B、0x41C←05（mask 07）、沒有 P3');
      const sameOpts = Array.from($('dm-samev').options).map(o => o.value);
      fire($('dm-samev'), 'G3'); $('dm-same').click();
      ok(sameOpts[0] === 'X' && S.cur.e0 === DM.en01Value(4, 'G3') && S.cur.e143 === DM.en01Value(4, 'G3'), 'All Same Pixel（X 先、再 R→G→B）選 G3 ⇒ 12 列全部＝G3');
    } else skip('F1567 實檔不在本機，頁面匯入段略過');
    fire($('dm-model'), 'E503');
    if (!$('dm-ask').classList.contains('hidden')) w.dmAskAnswer(true);   // 有未匯出的修改 ⇒ 換型號前先問（既有行為），答「是」
    ok(!g.classList.contains('en01') && g.querySelectorAll('select.dm-cell').length === 24 && Array.from($('dm-gate').options).length === 3 && !$('dm-pvnote').textContent.includes('EN01'), '換回 E503 ⇒ 4×6 表格、Gate 3 項、③ 不再顯示 EN01 註記');
  }
  {
    for (const k of Object.keys(mem)) delete mem[k];
    mem[(0x7C << 16) | 0x95] = 0x00; mem[(0x7C << 16) | 0x98] = 0x00; mem[(0x7D << 16) | 0x7D] = 0x02; mem[(0x3E << 16) | 0x207E] = 0x10;
    mem[(0x3E << 16) | 0x393] = 0x80; mem[(0x3E << 16) | 0x392] = 0x80; mem[(0x3E << 16) | 0x41C] = 0x01; mem[(0x3E << 16) | 0x3D4] = 24; mem[(0x3E << 16) | 0x1100] = 7;
    const P = await open(), { w, $, fire } = P, S = w.dmState;
    $('dm-link').click();
    await P.waitFor(() => S.linked && !S.busy && S.checked === 'EN01' && S.src.kind === 'tcon', 'Check T-CON 認 EN01 並回讀');
    ok(S.model === 'EN01' && S.cur.hand === 1 && S.cur.deEn === 1 && S.cur.rd === 1 && S.cur.e0 === 24 && S.cur.e144 === 7 && S.en01Seg === null && $('dm-grid').querySelectorAll('tbody tr').length === 24,
      'mock Bridge：7C:98＝0、7D:007D＝2、3E:207E＝0x10 ⇒ Check T-CON 認 EN01、讀回（L3-1 R0 也讀到）、24 列全顯示');
    ok(/EN01（RM81008，0x3E:0x207E = 10/.test($('dm-ic').textContent) && P.log.some(m => m.type === 'rawwrite' && m.slave === 0x7E && m.addr === 0xAB), 'Check 結果顯示 EN01＋207E 值；讀寫前下 7E:AB←CD');
    const n0 = P.log.filter(m => m.type === 'rawwrite' && m.slave === 0x3E).length;
    fire($('dm-e0-0'), 'R1');
    await P.waitFor(() => (mem[(0x3E << 16) | 0x3D4] | 0) === DM.en01Value(4, 'R1'), '即時寫入 0x3D4');
    const wr = P.log.filter(m => m.type === 'rawwrite' && m.slave === 0x3E).slice(n0);
    ok(wr.length === 1 && wr[0].addr === 0x3D4 && wr[0].data[0] === DM.en01Value(4, 'R1') && !P.log.some(m => m.type === 'rawwrite' && m.slave === 0x3E && m.addr === 0x0059), '連線中選格 ⇒ 只寫 0x3E:0x3D4 一個 byte（不下 E503 的 3E:0059）');
  }

  console.log('\n' + (fail ? '✗' : '✓') + ' check_datamap_en01 ' + pass + ' pass / ' + fail + ' fail' + (skips.length ? '（跳過 ' + skips.length + ' 項：本機缺原廠資料）' : ''));
  if (fail) { console.log(fails.slice(0, 30).join('\n')); process.exit(1); }
  process.exit(0);
})().catch(e => { console.log('✗ 例外 ' + (e && e.stack || e)); process.exit(1); });
