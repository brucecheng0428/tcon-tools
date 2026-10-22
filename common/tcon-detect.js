/* ═══════════════════════════════════════════════════════════════════════════
   common/tcon-detect.js — 全站唯一的 T-CON 辨認（I2C）與 ID 表
   ───────────────────────────────────────────────────────────────────────────
   Bruce 2026-10-22：「認Tcon的方式全部都一樣啊，你管他是哪個分頁、哪個網頁？」
   ⇒ 認 T-CON 全站只有這一支。i2c.html、datamap.html、dg-selftest.html、nbdebug.html、
      common/i2c-spiflash.js 都呼叫這裡；頁面不准自己寫辨認流程或 ID 表
      （tools/check_tcon_detect_single.mjs 會擋）。
   頁面只負責：傳輸（read／write）、畫面、認到之後的動作（例：E503 的 3E:0059←1E）。

   本檔是 v1.35.x 之前各頁分散實作的合併（數值與出處逐條沿用，一個值都沒改）：
     A 段（NB，RomCodeProcessUI.py V5.0.4）
       7C:0x95／7C:0x98（1-byte offset，1 byte）           PY L33507／L33508
       7C:0x98 ≠ 0 ⇒ E501 系列，0x95 查 tcon_id_dict      PY L2600–2604
       7C:0x98 = 0 ⇒ 7D:0x007D（2-byte offset）            PY L31694–31716、L36471–36494
         00／01／02 ＝ E503A1 T1／T2／T3、03 ＝ E503A2、04 ＝ E503A3；不在表內 ⇒ DAZ613x（E418A4）
     SY 辨認表（SY 2026-10-06「RE: EN01 I2C辨認方式」；assistant_kb reference/TCON辨識表_SY_20261006.md）
       EN01 A1／A2（RM81008）：3E:0x207E ＝ 0x10／0x11
       E501B1／B2：7D:0x007F ＝ 00／01（佐證）；E501A3／A6：7D:0x001E[7:4] ＝ 0（佐證，A3／A6 分不出）
     B 段（MNT，PQ Tool ICCommonFunction.CheckICID L191–227）
       slave 0x60→0x61→0x68→0x69 讀 0xFF00 ×3；byte0、byte1 相等、byte2 只比高 nibble；全 FF ＝ 沒有裝置

   🔴 v1.0（2026-10-22）修正：EN01（RM81008）以前只在「7C:98＝0 且 7D:007D 落在 E503 表內」才去讀 3E:207E。
      EN01 的 DP RX 在 3E:20xx（不在 7D），7D 可能不回；原廠程式預期 EN01 的 7C:0x95 是 0x20–0x24
      （assistant_kb reference/tcon-tools研究報告/CheckTCON_EN01_識別方案_20261006.md §3a）—— 這兩種情況
      都在讀 207E 之前就結束 ⇒「認不出 T-CON」。改成：E501 表沒命中，就先讀 3E:207E；10／11 ⇒ EN01，
      不再被 7C／7D 的結果擋住。E501 命中時照舊不碰 0x3E（207E 在 E501 上沒有定義）。

   用法：
     var r = await TconDetect.detect(io, { log: fn });
       io.read(slave, awid, addr, len) → Promise<byte[] | null>（讀不到回 null，不丟例外）
       io.write(slave, awid, addr, bytes) → Promise<{ok, err}>（M-Bus→C-Bus 用；可丟例外）
     r = { name, ext, family, alts, isE503, unknown, ambiguous, conflict, en01Ver, slave, src, raw, mbus }
       family：E501A／E501B／E503／EN01／DAZ6111／DAZ613x／E512／EM01／EM02／V007／V512／VM02（認不出＝null）
       raw：這次讀到的原始值（'7C:95'、'7C:98'、'7D:007D'、'3E:207E'、'FF00@68' …），認不出時給使用者看
     TconDetect.matchIcId(bytes) → B 段表的一筆或 null
     TconDetect.scanIcId(io, { slaves, log }) → { match, matchSlave, first, firstSlave, results }
     TconDetect.e501ByRom(id95, f98) → E501 表的一筆或 null
     TconDetect.readEn01Ver(io, { log }) → { raw, n, txt } 或 { fail: true }
   ═══════════════════════════════════════════════════════════════════════════ */
(function (g) {
  'use strict';

  var REG = {
    E501_ID:      { slave: 0x7C, awid: 1, addr: 0x95,   len: 1 },   /* PY L33507 */
    E501_FLAG:    { slave: 0x7C, awid: 1, addr: 0x98,   len: 1 },   /* PY L33508 */
    E503_VER:     { slave: 0x7D, awid: 2, addr: 0x007D, len: 1 },   /* PY L31698／L36480；SY */
    EN01_VER:     { slave: 0x3E, awid: 2, addr: 0x207E, len: 1, mask: 0x0F },   /* SY；WPF ICDefine.cs:294、RomCodeInfo.cs:1397–1416 */
    SY_E501A_VER: { slave: 0x7D, awid: 2, addr: 0x001E, len: 1 },   /* SY */
    SY_E501B_ID:  { slave: 0x7D, awid: 2, addr: 0x007F, len: 1 },   /* SY */
    ICID:         { awid: 2, addr: 0xFF00, len: 3 }                  /* CheckICID */
  };
  /* tcon_id_dict PY L2600–2604；外部型號出處 assistant_kb IC內部型號總表.md／IC外部型號總表.md */
  var E501 = {
    0x00: { name: 'E501A',   ext: 'RM81010', family: 'E501A' },
    0x40: { name: 'E501B1',  ext: 'RM81011', family: 'E501B' },
    0x41: { name: 'E501B2',  ext: 'RM81011', family: 'E501B' },
    0x7E: { name: 'DAZ6111', ext: 'E411A3',  family: 'DAZ6111' }
  };
  /* i2c_check_e503_ver PY L31701–31712 ＋ CHECKE503VER L36483–36492；SY 表 */
  var E503 = {
    0x00: { name: 'E503A1 T1', ext: 'RM81000~RM81004' },
    0x01: { name: 'E503A1 T2', ext: 'RM81000~RM81004' },
    0x02: { name: 'E503A1 T3', ext: 'RM81000~RM81004' },
    0x03: { name: 'E503A2',    ext: 'RM81000~RM81004' },
    0x04: { name: 'E503A3',    ext: 'RM81000~RM81004' }
  };
  /* PY L31711–31712 else：DAZ6138 與 DAZ6139 同一顆 IC（E418A4），上游分不出 */
  var DAZ13X = { name: 'DAZ613x', ext: 'E418A4', family: 'DAZ613x', alts: ['DAZ6138', 'DAZ6139'] };
  var SY_EN01 = { 0x10: 'A1', 0x11: 'A2' };
  var SY_E501B = { 0x00: 'E501B1', 0x01: 'E501B2' };
  /* B 段：CheckICID L191–227 的掃描順序（撞號時先報誰由這個順序決定）。
     alts＝判別條件逐字相同、上游也分不出的另一顆。key 給 dg-selftest 對它的 per-IC 序列表用。 */
  var ICID_SLAVES = [0x60, 0x61, 0x68, 0x69];
  var ICID = [
    { key: 'E512AX', name: 'E512A1', id: [0x12, 0xE5, 0xA0], family: 'E512', ext: 'RM80020_A~D', alts: ['E512A1', 'E512A2'] },   /* L383–393；A1/A2 共用 */
    { key: 'V007SX', name: 'V007SX', id: [0x05, 0xE5, 0xF0], family: 'V007', ext: '' },                                      /* L395–405 */
    { key: 'V512SX', name: 'V512S1', id: [0x12, 0xF5, 0xF0], family: 'V512', ext: '' },                                      /* L407–417 */
    { key: 'EM01A1', name: 'EM01A1', id: [0x01, 0xEF, 0xA0], family: 'EM01', ext: 'RM80100.PB / RM80203.PB', alts: ['EM01A1', 'VM01S1'] },   /* L419–429／L431 */
    { key: 'EM02A1', name: 'EM02A1', id: [0x02, 0xEF, 0xA0], family: 'EM02', ext: 'RM80120.PC / RM80103.PC', alts: ['EM02A1', 'V512S2'] },   /* L455–465；L177–179 */
    { key: 'VM02AX', name: 'VM02S1', id: [0x02, 0xEF, 0xF0], family: 'VM02', ext: '' }                                       /* L443–453 */
  ];
  /* 認不出時給使用者手選的全部型號 */
  var ALL_NAMES = ['EM01A1', 'EM02A1', 'E503A1 T1', 'E503A1 T2', 'E503A1 T3', 'E503A2', 'E503A3',
                   'E501A', 'E501B1', 'E501B2', 'E512A1', 'EN01', 'DAZ6111', 'DAZ6138', 'DAZ6139'];

  function hx(v, n) { var s = (v >>> 0).toString(16).toUpperCase(); while (s.length < (n || 2)) s = '0' + s; return s; }
  function allFF(b) { if (!b || !b.length) return false; for (var i = 0; i < b.length; i++) if ((b[i] & 0xFF) !== 0xFF) return false; return true; }
  function en01VerText(n) { return n === 0 ? 'A1' : (n === 1 ? 'A2' : 'Unknown'); }
  function familyOfName(name) {
    if (!name) return null;
    if (/^E503/.test(name)) return 'E503';
    if (name === 'EN01') return 'EN01';
    if (name === 'E501A') return 'E501A';
    if (/^E501B/.test(name)) return 'E501B';
    if (name === 'DAZ6111') return 'DAZ6111';
    if (/^DAZ613/.test(name)) return 'DAZ613x';
    for (var i = 0; i < ICID.length; i++) if (ICID[i].name === name || (ICID[i].alts || []).indexOf(name) >= 0) return ICID[i].family;
    return null;
  }

  function matchIcId(b) {
    if (!b || b.length < 3 || allFF(b)) return null;
    for (var i = 0; i < ICID.length; i++) {
      var e = ICID[i];
      if (b[0] === e.id[0] && b[1] === e.id[1] && (b[2] & 0xF0) === e.id[2]) return e;
    }
    return null;
  }
  function e501ByRom(id95, f98) {
    if (id95 == null || f98 == null || f98 === 0) return null;
    return E501[id95] || null;
  }

  function mkIo(io, raw, log) {
    return {
      r1: async function (R, tag) {
        var b = null;
        try { b = await io.read(R.slave, R.awid, R.addr, R.len); } catch (e) { b = null; }
        var v = (b && b.length) ? (b[0] & 0xFF) : null;
        var k = tag || (hx(R.slave) + ':' + hx(R.addr, R.awid === 2 ? 4 : 2));
        raw[k] = v;
        log('0x' + hx(R.slave) + ':0x' + hx(R.addr, R.awid === 2 ? 4 : 2) + ' = ' + (v == null ? 'read failed' : '0x' + hx(v)));
        return v;
      }
    };
  }
  async function mbusOpen(io) {
    if (g.TconMbus && typeof g.TconMbus.open === 'function') return g.TconMbus.open(io.write);
    try { var r = await io.write(0x7E, 1, 0xAB, [0xCD]); return (r && r.ok === false) ? { ok: false, err: String(r.err || 'write failed') } : { ok: true }; }
    catch (e) { return { ok: false, err: String((e && e.message) || e) }; }
  }
  /* 讀 3E:207E；讀不到或 FF ⇒ 補下 M-Bus→C-Bus 再讀一次（原廠 RCI:1397–1404 讀前沒下，一般讀取 RegisterModule.cs:36 會先下） */
  async function read207E(io, x, log, retry) {
    var b = await x.r1(REG.EN01_VER);
    if (retry !== false && (b == null || b === 0xFF)) {
      log('M-Bus to C-Bus 0x7E:0xAB <- CD, retry 0x3E:0x207E');
      var w = await mbusOpen(io); if (!w.ok) log('0x7E:0xAB write failed: ' + (w.err || ''));
      b = await x.r1(REG.EN01_VER);
    }
    return b;
  }

  /* E501：SY 表佐證（只讀）；任何意外都回原結果 */
  async function syE501Cross(x, r, log) {
    try {
      if (r.name === 'E501A') {
        var a = await x.r1(REG.SY_E501A_VER);
        if (a != null) log('SY table: 0x7D:0x001E CHIP_VERSION[7:4] = ' + ((a >> 4) & 0x0F) + (((a >> 4) & 0x0F) === 0 ? ' => E501A3/A6 (cannot tell A3 from A6)' : ' => not in SY table, keep 0x7C result'));
        return r;
      }
      if (r.family === 'E501B') {
        var b = await x.r1(REG.SY_E501B_ID);
        if (b == null) return r;
        var sy = SY_E501B[b];
        log('SY table: 0x7D:0x007F => ' + (sy || 'not in SY table, keep 0x7C result'));
        if (sy && sy !== r.name) {
          log('SY table vs 0x7C:0x95 disagree (' + sy + ' / ' + r.name + ') => list both');
          return Object.assign({}, r, { alts: ['E501B1', 'E501B2'], unknown: true, ambiguous: true });
        }
      }
    } catch (e) { log('SY table cross-check skipped: ' + (e && e.message)); }
    return r;
  }

  /* A 段（NB） */
  async function romSeq(io, x, log) {
    var id95 = await x.r1(REG.E501_ID, '7C:95');
    var f98 = await x.r1(REG.E501_FLAG, '7C:98');
    var e = e501ByRom(id95, f98);
    if (e) return syE501Cross(x, { name: e.name, ext: e.ext, family: e.family, alts: null, isE503: false, src: 'rom' }, log);
    if (f98 != null && f98 !== 0) log('0x7C:0x98 != 0 but 0x95 = ' + (id95 == null ? 'read failed' : '0x' + hx(id95)) + ' is not in tcon_id_dict');
    /* EN01：不被 7C／7D 擋（見檔頭 v1.0 修正）。7C 完全沒回應（MNT 板等）時只讀一次、不補下 7E:AB←CD
       （detect 一開始已下過；避免在 EM01 等板子上多一筆寫入，與 v1.34.x 行為相同） */
    var b = await read207E(io, x, log, !(id95 == null && f98 == null));
    if (b != null && SY_EN01[b]) {
      log('SY table: 0x3E:0x207E = 0x' + hx(b) + ' => EN01 ' + SY_EN01[b]);
      return { name: 'EN01', ext: 'RM81008', family: 'EN01', alts: null, isE503: false, src: 'rom',
               en01Ver: { raw: b, n: b & REG.EN01_VER.mask, txt: SY_EN01[b] } };
    }
    if (id95 == null || f98 == null || f98 !== 0) return null;
    var v7d = await x.r1(REG.E503_VER, '7D:007D');
    if (v7d == null) return null;
    var v = E503[v7d];
    if (v) {
      /* 7D:007D 在 E503 表內（EN01 也可能讀到同樣的值）：207E 讀不到、FF、或高 nibble＝1 但不是 10／11 ⇒ 分不出 */
      if (b == null || b === 0xFF || (b & 0xF0) === 0x10) {
        log('cannot tell E503 from EN01 (0x3E:0x207E ' + (b == null ? 'read failed' : '= 0x' + hx(b)) + ') => pick manually');
        return { name: v.name, ext: v.ext, family: 'E503', alts: [v.name, 'EN01'], isE503: false, unknown: true, ambiguous: true, src: 'rom' };
      }
      return { name: v.name, ext: v.ext, family: 'E503', alts: null, isE503: true, src: 'rom' };
    }
    return { name: DAZ13X.name, ext: DAZ13X.ext, family: DAZ13X.family, alts: DAZ13X.alts.slice(), isE503: false, src: 'rom' };
  }

  /* B 段（MNT）：逐一探；回第一個命中、也回第一個有回應的（dg-selftest 用） */
  async function scanIcId(io, opts) {
    opts = opts || {};
    var log = opts.log || function () {}, raw = opts.raw || {};
    var slaves = opts.slaves || ICID_SLAVES, out = { match: null, matchSlave: null, first: null, firstSlave: null, results: [] };
    for (var i = 0; i < slaves.length; i++) {
      var s = slaves[i], b = null;
      try { b = await io.read(s, REG.ICID.awid, REG.ICID.addr, REG.ICID.len); } catch (e) { b = null; }
      var tag = '0x' + hx(s);
      if (!b || b.length < 3) { out.results.push(tag + ' x'); raw['FF00@' + hx(s)] = null; log('ICID slave ' + tag + ' : no reply'); continue; }
      var txt = b.slice(0, 3).map(function (v) { return hx(v); }).join(' ');
      raw['FF00@' + hx(s)] = txt;
      if (allFF(b)) { out.results.push(tag + ' <- ' + txt + ' (idle)'); log('ICID slave ' + tag + ' : ' + txt + ' (idle)'); continue; }
      out.results.push(tag + ' <- ' + txt); log('ICID slave ' + tag + ' : ' + txt);
      if (!out.first) { out.first = b; out.firstSlave = s; }
      var m = matchIcId(b);
      if (m) { out.match = m; out.matchSlave = s; log('ICID match : ' + m.name + ' (slave ' + tag + ')'); if (opts.stopOnMatch !== false) break; }
    }
    return out;
  }

  async function readEn01Ver(io, opts) {
    var log = (opts && opts.log) || function () {}, raw = {};
    var b = await read207E(io, mkIo(io, raw, log), log);
    if (b == null) return { fail: true };
    var n = b & REG.EN01_VER.mask;
    return { raw: b, n: n, txt: en01VerText(n) };
  }

  /* 整套：M-Bus→C-Bus → A 段 → B 段 → 合併（兩段指向不同顆 ⇒ 不挑，兩個都列） */
  async function detect(io, opts) {
    opts = opts || {};
    var log = opts.log || function () {}, raw = {};
    var x = mkIo(io, raw, log), mbus = { ok: true };
    if (opts.mbus !== false) { mbus = await mbusOpen(io); log(mbus.ok ? 'W 0x7E:0xAB <- CD (M-Bus to C-Bus)' : 'M-Bus to C-Bus 0x7E:0xAB <- CD failed: ' + mbus.err); }
    var rom = await romSeq(io, x, log);
    var sc = (opts.icid === false) ? { match: null } : await scanIcId(io, { slaves: opts.icidSlaves, log: log, raw: raw });
    var icid = sc.match ? { name: sc.match.name, ext: sc.match.ext, family: sc.match.family, key: sc.match.key,
                            alts: sc.match.alts ? sc.match.alts.slice() : null, isE503: false, src: 'icid', slave: sc.matchSlave } : null;
    var r;
    if (rom && icid && rom.name !== icid.name) {
      log('conflict : rom=' + rom.name + ' icid=' + icid.name);
      r = Object.assign({}, icid, { conflict: true, alts: [icid.name, rom.name].concat(rom.alts || []).concat(icid.alts || [])
            .filter(function (v, i, a) { return a.indexOf(v) === i; }) });
    } else if (rom) r = rom;
    else if (icid) r = icid;
    else r = { name: null, ext: '', family: null, alts: ALL_NAMES.slice(), isE503: false, unknown: true, src: null };
    r.raw = raw; r.mbus = mbus;
    r.rawText = rawText(raw);
    return r;
  }
  function rawText(raw) {
    var ks = ['7C:95', '7C:98', '7D:007D', '3E:207E'], out = [];
    ks.forEach(function (k) { if (k in raw) out.push(k + ' = ' + (raw[k] == null ? '—' : hx(raw[k]))); });
    Object.keys(raw).forEach(function (k) { if (/^FF00@/.test(k) && raw[k]) out.push(k.replace('@', ' @') + ' = ' + raw[k]); });
    return out.join(' · ');
  }

  var API = {
    REG: REG, E501: E501, E503: E503, DAZ13X: DAZ13X, SY_EN01: SY_EN01, SY_E501B: SY_E501B,
    ICID: ICID, ICID_SLAVES: ICID_SLAVES, ALL_NAMES: ALL_NAMES,
    detect: detect, scanIcId: scanIcId, matchIcId: matchIcId, e501ByRom: e501ByRom,
    readEn01Ver: readEn01Ver, en01VerText: en01VerText, familyOfName: familyOfName, rawText: rawText
  };
  g.TconDetect = API;
  if (typeof module === 'object' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
