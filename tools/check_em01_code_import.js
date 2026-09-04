#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   常設機械檢查：EM01 code 匯入 —— 真檔必須被接受，假檔仍須被拒絕
   ───────────────────────────────────────────────────────────────────────
   為什麼需要這支（2026-09-04，Bruce 回報 EM01 匯入失敗）：

   `wfgEm01Sane()` 是「這份檔是不是 EM01」的最後一道判定。v4.11.0 寫它的時候
   放了兩條**行號值域**判準：

       if (s.st_line !== 16383 && s.st_line > vt * 3) return false;
       if (s.sp_line !== 16383 && s.sp_line > vt * 3) return false;

   前提是「ST／SP LINE 不會超過三個 frame」。**這個前提沒有規格依據。**
   `(Golden_RD_Check_Final)em01_register_bank_svn2415.xlsx` `rt8_tcon_1`：
       reg_st_line_xstb  Low h00A4 High h00A5  Bits 14 [13:0]  Init h8
       reg_sp_line_xstb  Low h00A6 High h00A7  Bits 14 [13:0]  Init h3FFF
   欄位就是 0～16383，沒有任何「不得超過 VTOTAL」的條款。

   🔴 **原本的寫法自己就露了餡**：對 16383 開特例 ＝ 已經承認「超出畫面是合法狀態」
      （16383 正是這個欄位的出廠預設值，而它對任何 vt < 5461 的面板都超過 vt×3）。
      既然超界合法，就不該只放行**一個數字**，把 3301～16382 這一整段判成「不是這顆」。

   實測（Bruce 2026-09-04 的那份 CSOT 23.8" FHD 280Hz EM01 Flash code）：
     ・`xstb.sp_line = 9139`、vt ＝ 1080 + 20 ＝ 1100 ⇒ 9139 > 3300 ⇒ 被拒。
     ・檔內 CURRENT（0x0500）與 Normal slot（0x35600）**兩份副本都是 9139**
       ⇒ 不是位元翻轉。
     ・同一份資料在 `wfgEm01SlotValid()` **過得了**（那支沒有這條上限）⇒ 內部自相矛盾。

   🔴 這是 v4.37.1（NB／E503 誤殺 18% 真檔）之後**同一類錯的第二次**：
      判準只驗過「壞檔會被拒絕」，**從來沒有驗過「真檔會被接受」**。
      這支腳本就是把正面那一半釘進 pre-commit。

   ── 為什麼是合成語料而不是附一份真檔 ──────────────────────────────────
   本 repo 的內容等於 GitHub Pages 公開可抓（含 view-source）。客戶的 code 檔帶著
   客戶名與面板型號，**不可以進版控**。所以這裡用程式產生一份結構完全合法、
   不含任何真實資料的 EM01 Flash 映像，並把當年誤殺的那組數值放進去。

   要拿真檔跑（本機、不進版控）：
       WFG_EM01_CODE_DIR=/path/to/bins  node tools/check_em01_code_import.js
   會把該目錄下每一份 `.bin` 餵進**產品的** `wfgEm01ParseBin()`；對「看起來就是
   EM01」（frame 解得出合理值 ＋ 未用位元全乾淨）的那些，全部必須被接受。

   ── 實作方式：把產品原始碼抽出來在 node 裡跑 ────────────────────────────
   與 `tools/check_nb_code_import.js` 同一套做法：抽出來的都是純函式、不碰 DOM，
   直接從 `wfg.html` 切出來 eval —— 驗的是**產品本身**，不是另一份抄過來的副本
   （抄一份就會有兩份不同步的版本，而且不同步的方向一定是
   「檢查看不到產品的缺陷」）。常數（載體門檻、layout）同樣從原始碼讀。
   零外部相依、跑完不到一秒。

   ⚠ 這支**不涵蓋 UI 那幾層**（型號確認框、GPO Timing 選擇框、匯入卡片）。
     那幾層要用 jsdom／真瀏覽器驗，不進這裡 —— 為了讓 pre-commit 保持零相依、秒級。

   退出碼： 0 = 通過   1 = 有誤殺／有漏放   2 = 檢查本身跑不起來（不當作通過）
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const SRC = path.join(REPO, 'wfg.html');

function die(msg) { console.error('🛑 ' + msg); process.exit(2); }

/* ── 從 wfg.html 切出一支具名函式（大括號配對，字串／註解不參與計數）──
   與 check_nb_code_import.js 的 cut() 同一份邏輯。兩支各留一份是刻意的：
   pre-commit 要能在任何一支被刪掉時仍然擋下另一半，不共用檔案。 */
function cut(src, name) {
  const head = 'function ' + name + '(';
  const i = src.indexOf(head);
  if (i < 0) die('在 wfg.html 找不到 function ' + name + '()');
  let j = src.indexOf('{', i);
  if (j < 0) die(name + '() 找不到函式主體');
  let depth = 0, k = j, inS = null, inLine = false, inBlock = false;
  for (; k < src.length; k++) {
    const c = src[k], n = src[k + 1];
    if (inLine) { if (c === '\n') inLine = false; continue; }
    if (inBlock) { if (c === '*' && n === '/') { inBlock = false; k++; } continue; }
    if (inS) { if (c === '\\') { k++; continue; } if (c === inS) inS = null; continue; }
    if (c === '/' && n === '/') { inLine = true; k++; continue; }
    if (c === '/' && n === '*') { inBlock = true; k++; continue; }
    if (c === '"' || c === "'" || c === '`') { inS = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(i, k + 1); }
  }
  die(name + '() 的大括號沒有配對');
}

/* ── 從 wfg.html 切出一段 `var NAME = … ;`（同樣做大括號配對）── */
function cutVar(src, name) {
  /* 🔴 不能用 indexOf('var NAME =')：原始碼為了對齊，等號前面的空白數不固定
     （`var WFG_CODE_FLASH_MIN  = 131072;` 是兩個空格）。用正則才不會漏。 */
  const m = new RegExp('var\\s+' + name + '\\s*=').exec(src);
  const i = m ? m.index : -1;
  if (i < 0) die('在 wfg.html 找不到 var ' + name);
  let depth = 0, started = false;
  for (let k = i; k < src.length; k++) {
    const c = src[k];
    if (c === '{' || c === '[') { depth++; started = true; }
    else if (c === '}' || c === ']') { depth--; }
    else if (c === ';' && (!started || depth === 0)) return src.slice(i, k + 1);
  }
  die('var ' + name + ' 沒有找到結尾分號');
}

let src;
try { src = fs.readFileSync(SRC, 'utf8'); } catch (e) { die('讀不到 ' + SRC); }

const NAMES = ['wfgGpoDecodeAt', 'wfgEm01Frame', 'wfgEm01Sane',
               'wfgEm01SlotHapVal', 'wfgEm01SlotValid',
               'wfgCodeIsHexName', 'wfgCodeDecodeIntelHex', 'wfgCodeToImage',
               'wfgCodeClassifyMedium', 'wfgCodeLoadImage'];
const VARS = ['WFG_EM02_SIGS', 'WFG_EM01_LAYOUT',
              'WFG_CODE_EEPROM_MAX', 'WFG_CODE_FLASH_MIN', 'WFG_CODE_MAX_IMAGE'];

const sandbox = {};
try {
  // eslint-disable-next-line no-new-func
  new Function('exports',
    'var t = function (k) { return String(k); };\n' +
    VARS.map(v => cutVar(src, v)).join('\n') + '\n' +
    NAMES.map(n => cut(src, n)).join('\n') + '\n' +
    NAMES.concat(VARS).map(n => 'exports.' + n + ' = ' + n + ';').join('\n'))(sandbox);
} catch (e) { die('抽出來的產品函式跑不起來：' + e.message); }
for (const n of NAMES) if (typeof sandbox[n] !== 'function') die(n + ' 抽取失敗');
const L = sandbox.WFG_EM01_LAYOUT.flash;
if (!L || L.base1 !== 0x0500) die('WFG_EM01_LAYOUT.flash 抽取失敗');

/* ═══ 合成一份結構合法的 EM01 Flash 映像（不含任何真實客戶資料）═══════════
   排法完全照 `wfgGpoDecodeAt()` 讀的位置寫回去，所以這份映像對產品而言
   與真檔沒有區別 —— 差別只在裡面的數字是我們自己選的。 */
const FLASH_LEN = sandbox.WFG_CODE_FLASH_MIN * 2;      // 262144，語料裡最常見的大小
const SIGN = sandbox.WFG_EM02_SIGS;                    // 18 條訊號的順序

function sigOff(i) {
  return (i === 0) ? (L.base1 + 0xA0) : (i === 1) ? (L.base1 + 0xB0) : (L.base2 + 16 * (i - 2));
}

function buildImage(opt) {
  opt = opt || {};
  const b = new Uint8Array(opt.len != null ? opt.len : FLASH_LEN);

  /* sys 的 frame timing：nibble 打包（見 wfgEm01Frame）。預設 1920×1080＋465／20，
     ＝ Bruce 2026-09-04 那份真檔的 timing（vt ＝ 1100）。 */
  const ha = opt.hactive != null ? opt.hactive : 1920;
  const va = opt.vactive != null ? opt.vactive : 1080;
  const hb = opt.hblank != null ? opt.hblank : 465;
  const vb = opt.vblank != null ? opt.vblank : 20;
  b[0x13] = ha & 0xFF;
  b[0x14] = ((ha >> 8) & 0x0F) | ((va & 0x0F) << 4);
  b[0x15] = (va >> 4) & 0xFF;
  b[0x16] = hb & 0xFF;
  b[0x17] = ((hb >> 8) & 0x0F) | ((vb & 0x0F) << 4);
  b[0x18] = (vb >> 4) & 0xFF;

  /* 18 條訊號。預設 8 條 enable（＝那份真檔的條數）。 */
  const sigs = opt.sigs || {};
  const defEn = opt.enableCount != null ? opt.enableCount : 8;
  for (let i = 0; i < 18; i++) {
    const o = sigOff(i), cfg = sigs[i] || {};
    const en = cfg.enable != null ? cfg.enable : (i < defEn ? 1 : 0);
    b[o + 0] = (en << 7) | ((cfg.toggle ? 1 : 0) << 6);
    b[o + 1] = 0x00;                                       // act_type
    b[o + 2] = 0x00;                                       // r_ph
    b[o + 3] = 0x00;                                       // f_ph
    const st = cfg.st_line != null ? cfg.st_line : 5;
    const sp = cfg.sp_line != null ? cfg.sp_line : 1090;
    b[o + 4] = st & 0xFF; b[o + 5] = (st >> 8) & 0x3F;     // ST_LINE 14bit LE
    b[o + 6] = sp & 0xFF; b[o + 7] = (sp >> 8) & 0x3F;     // SP_LINE 14bit LE
    const rd = cfg.r_dly != null ? cfg.r_dly : 1050;
    const fd = cfg.f_dly != null ? cfg.f_dly : 1110;
    b[o + 8] = rd & 0xFF; b[o + 9] = (rd >> 8) & 0xFF;     // R_DLY 16bit LE
    b[o + 10] = fd & 0xFF; b[o + 11] = (fd >> 8) & 0xFF;   // F_DLY 16bit LE
    b[o + 12] = b[o + 8]; b[o + 13] = b[o + 9];            // R_DLY2（真檔常是複本）
    b[o + 14] = b[o + 10]; b[o + 15] = b[o + 11];          // F_DLY2
  }
  /* bit8 打包位元組（0xC2~0xCB）與 rt8_tcon_3 的 ext1~ext8 都留 0
     ＝ 未用位元乾淨，符合 register bank 的定義。 */
  return b;
}

function judge(bytes) {
  const fr = sandbox.wfgEm01Frame(bytes);
  const sig = sandbox.wfgGpoDecodeAt(bytes, L.base1, L.base2);
  return !!sandbox.wfgEm01Sane(bytes, L, sig, fr);
}

let fail = 0;
function expect(name, got, want) {
  const ok = got === want;
  if (!ok) fail++;
  console.log('  ' + (ok ? '✅' : '❌') + ' ' + name + '  （得到 ' + got + '，應為 ' + want + '）');
}

console.log('EM01 code 匯入判定檢查（產品函式直接抽自 wfg.html）');
console.log('');
console.log('① 必須接受 —— 真實 EM01 code 會出現的行號值（v4.11.0～v4.43.3 誤殺）');
/* 🔴 9139 **不是編的**：是 Bruce 2026-09-04 那份 CSOT FHD280Hz 真檔裡實際量到的
   `xstb.sp_line`，而且 CURRENT 與 Normal slot 兩份副本都是這個值。
   任何人日後想把 `vt * 3` 這條加回去，都會被下面這幾條擋下。 */
expect('xstb.sp_line = 9139（vt = 1100 ⇒ 舊規則的 vt×3 = 3300）',
  judge(buildImage({ sigs: { 0: { enable: 1, st_line: 0, sp_line: 9139 } } })), true);
expect('sp_line = 16382（14 bit 值域上緣、不是 16383 那個特例值）',
  judge(buildImage({ sigs: { 4: { enable: 1, sp_line: 16382 } } })), true);
expect('st_line = 14820（NB 語料量到的最大值，同一類型的欄位）',
  judge(buildImage({ sigs: { 2: { enable: 1, st_line: 14820 } } })), true);
expect('sp_line = 3301（vt×3 + 1，舊規則的第一個受害值）',
  judge(buildImage({ sigs: { 5: { enable: 1, sp_line: 3301 } } })), true);
expect('sp_line = 16383（Init 值，舊規則靠特例放行的那一個）',
  judge(buildImage({ sigs: { 0: { enable: 1, sp_line: 16383 } } })), true);
/* v4.11.0 起就刻意排除、不可以被加回來的另外兩條（見 wfgEm01Sane 上方註解）。 */
expect('f_dly = 2140 > htotal 2080（FHD320 兩份真檔的殘留樣板值）',
  judge(buildImage({ hactive: 1920, hblank: 160, sigs: { 0: { enable: 1, f_dly: 2140 } } })), true);
expect('只有 3 條 enable（MCUv0079 那批真檔）',
  judge(buildImage({ enableCount: 3 })), true);
expect('全部欄位都在常見範圍的一般檔案', judge(buildImage()), true);

console.log('');
console.log('② 必須拒絕 —— 型號判別不可以因為①而失效');
expect('rt8_tcon_3 ext1 的 byte0 bit2（最有鑑別力的一條：117/118 個 EM02 檔卡在這）',
  (function () { const b = buildImage(); b[L.base3 + 0] |= 0x04; return judge(b); })(), false);
expect('rt8_tcon_3 ext8 的 +0xF bit3~7',
  (function () { const b = buildImage(); b[L.base3 + 16 * 7 + 0x0F] |= 0x80; return judge(b); })(), false);
expect('bit8 打包 0xC2 的未用位元（& 0x8E）',
  (function () { const b = buildImage(); b[L.base1 + 0xC2] |= 0x80; return judge(b); })(), false);
expect('bit8 打包 0xC5 的未用位元（& 0x88）',
  (function () { const b = buildImage(); b[L.base1 + 0xC5] |= 0x08; return judge(b); })(), false);
expect('某條訊號的 byte0 bit2（unused2）被設起來',
  (function () { const b = buildImage(); b[sigOff(3)] |= 0x04; return judge(b); })(), false);
expect('一條 enable 都沒有', judge(buildImage({ enableCount: 0 })), false);
expect('解析度荒謬（hactive = 100）', judge(buildImage({ hactive: 100 })), false);
expect('vactive 荒謬（= 2，NB/別家 IC 的檔解出來就長這樣）',
  judge(buildImage({ vactive: 2 })), false);
expect('hblank = 0', judge(buildImage({ hblank: 0 })), false);
expect('vblank = 0', judge(buildImage({ vblank: 0 })), false);
expect('全 0x00 的 262144 bytes', judge(new Uint8Array(FLASH_LEN)), false);
expect('全 0xFF 的 262144 bytes', judge(new Uint8Array(FLASH_LEN).fill(0xFF)), false);
/* 🔴 位址錯位：GPO bank 整組平移，其餘不動。這是「值域判準拿掉之後鑑別力還在不在」
   的關鍵測資 —— v4.37.1 在 NB 那邊實測到 delta=0x80 的錯位會因此變成可通過，
   所以這裡明確記錄 EM01 這邊各種 delta 的實際結果。 */
for (const d of [8, 0x10, 0x80, 0x100]) {
  expect('GPO bank 整組平移 +0x' + d.toString(16) + ' 仍被拒絕', (function () {
    const b = buildImage(), c = new Uint8Array(b.length);
    c.set(b);
    for (let i = 0; i < 18; i++) {
      const from = sigOff(i), to = from + d;
      for (let k = 0; k < 16; k++) { c[from + k] = 0; }
      for (let k = 0; k < 16; k++) { c[to + k] = b[from + k]; }
    }
    return judge(c);
  })(), false);
}

console.log('');
console.log('③ 載體判定（大小門檻）—— 中間地帶必須被擋在解析之前');
expect('8192 B ＝ EEPROM 邊界（合法）', sandbox.wfgCodeClassifyMedium(8192), 'eeprom');
expect('131072 B ＝ Flash 邊界（合法）', sandbox.wfgCodeClassifyMedium(131072), 'flash');
expect('262144 B ＝ Flash', sandbox.wfgCodeClassifyMedium(262144), 'flash');
expect('8193 B ＝ 中間地帶（不合法）', sandbox.wfgCodeClassifyMedium(8193), null);
expect('131071 B ＝ 中間地帶（不合法）', sandbox.wfgCodeClassifyMedium(131071), null);

console.log('');
console.log('④ slot 驗證器與 CURRENT 驗證器不可以再有兩套標準');
/* 🔴 v4.43.3 之前的內部矛盾：同一份 GPO 資料在 `wfgEm01SlotValid()` 過得了、
   在 `wfgEm01Sane()` 過不了（後者多一條行號上限）。這一條把兩支釘在一起 ——
   日後若有人只在其中一支加判準，這裡就會紅。 */
{
  const b = buildImage({ sigs: { 0: { enable: 1, st_line: 0, sp_line: 9139 } } });
  /* 在固定位置放一份 slot（0x35600 ＝ Normal），內容與 CURRENT 相同。 */
  const s = 0x35600;
  for (let i = 0; i < 18; i++) {
    const from = sigOff(i);
    const to = (i === 0) ? (s + 0xA0) : (i === 1) ? (s + 0xB0) : (s + 0x100 + 16 * (i - 2));
    for (let k = 0; k < 16; k++) b[to + k] = b[from + k];
  }
  const hap = 1920, val = 1080;                       // reg_hap 14bit / reg_val 13bit
  b[s + 0] = hap & 0xFF; b[s + 1] = (hap >> 8) & 0x3F;
  b[s + 2] = val & 0xFF; b[s + 3] = (val >> 8) & 0x1F;
  expect('同一份資料：CURRENT 驗證器接受', judge(b), true);
  expect('同一份資料：slot 驗證器接受', sandbox.wfgEm01SlotValid(b, s), true);
}

/* ⑤ 選配：拿本機真檔跑（不進版控）。
   判準刻意寫得保守 —— 只挑「一望即知就是 EM01」的檔（frame 解得出合理值、
   全部未用位元乾淨、至少一條 enable），那些**必須**被 `wfgEm01Sane()` 接受。
   這樣不需要在腳本裡重寫一份型號判別，也不會把別家 IC 的檔算進分母。 */
const REAL = process.env.WFG_EM01_CODE_DIR;
if (REAL && fs.existsSync(REAL)) {
  console.log('');
  console.log('⑤ 本機真檔語料：' + REAL);
  let seen = 0, shaped = 0, bad = 0;
  for (const f of fs.readdirSync(REAL)) {
    const p = path.join(REAL, f);
    if (!fs.statSync(p).isFile() || !/\.bin$/i.test(f)) continue;
    seen++;
    const img = sandbox.wfgCodeLoadImage(new Uint8Array(fs.readFileSync(p)), f);
    if (!img.ok || img.medium !== 'flash') continue;
    const b = img.bytes, fr = sandbox.wfgEm01Frame(b);
    if (!fr || fr.hactive < 600 || fr.vactive < 400 || !fr.hblank || !fr.vblank) continue;
    if (L.base3 + 0x80 > b.length) continue;
    let clean = true;
    if (b[L.base1 + 0xC2] & 0x8E) clean = false;
    for (let k = 1; k <= 9; k++) if (b[L.base1 + 0xC2 + k] & 0x88) clean = false;
    for (let e = 0; e < 8; e++) {
      if ((b[L.base3 + 16 * e] >> 2) & 1) clean = false;
      if (b[L.base3 + 16 * e + 0x0F] & 0xF8) clean = false;
    }
    const sig = sandbox.wfgGpoDecodeAt(b, L.base1, L.base2);
    if (!sig || sig.some(x => x.unused2) || !sig.some(x => x.enable)) clean = false;
    if (!clean) continue;                    // 不是 EM01 形狀，不算進分母
    shaped++;
    if (!sandbox.wfgEm01Sane(b, L, sig, fr)) { bad++; fail++; console.log('  ❌ 誤殺：' + f); }
  }
  console.log('  掃到 ' + seen + ' 份 .bin；EM01 形狀 ' + shaped + ' 份，被誤殺 ' + bad + ' 份');
}

console.log('');
if (fail) { console.log('🛑 有 ' + fail + ' 項不通過。'); process.exit(1); }
console.log('✅ 全部通過：真實 EM01 code 的行號值不會被判成「不是這顆」，型號判別仍然有效。');
process.exit(0);
