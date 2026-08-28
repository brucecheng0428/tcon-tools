#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   常設機械檢查 ⑤：NB（E501／E503／EN01）code 匯入不得誤殺合法的真檔
   ───────────────────────────────────────────────────────────────────────
   為什麼需要這支（2026-08-28，Bruce 回報 E503 匯入失敗）：

   `wfgNbSane()` 是「這份檔是不是這個型號」的最後一道判定。v4.14.0 寫它的時候
   加了四條**值域**判準，前提是「延遲量是一條 line 內的 DCLK 數」、
   「ST/SP LINE 不會超過三個 frame」。**這兩個前提對真實的 E503 code 不成立。**

   語料實測（177 份 4096B、EDID 合格的真實 E503 EEPROM 檔）：
     ・v4.37.0 之前：**32 份（18.1%）被拒**，理由全部只是這四條值域判準。
     ・啟用訊號的實際最大值：R_DLY 50923、F_DLY 65535、ST_LINE 14820、SP_LINE 16382。
     ・被判超界的 F_DLY 值是連續分佈（2487 / 5500 / 6228 / … / 65535），
       不是「解析錯位」會有的指紋。

   🔴 這個錯**沒有任何一版把它改壞** —— 它從 NB 匯入誕生（v4.14.0）就在，
      而當時到現在的驗收都只驗「壞檔會被拒絕」，**從來沒有驗過「真檔能匯入」**。
      這支腳本就是把那個破口補起來：**每次都要跑「真檔會被接受」這一面。**

   ── 為什麼是合成語料而不是附一份真檔 ──────────────────────────────────
   這個 repo 的內容等於 GitHub Pages 公開可抓（含 view-source）。客戶的 code 檔
   帶著客戶名、面板型號與實際 EDID，**不可以進版控**。所以這裡用程式產生一份
   結構完全合法、但不含任何真實資料的 E503 EEPROM 映像，並把當年誤殺的那組
   數值（F_DLY=0xFFFF、SP_LINE=16000、R_DLY=50923、ST_LINE=14820）放進去。

   要拿真檔跑（本機、不進版控）：
       WFG_NB_CODE_DIR=/path/to/hex_or_bin  node tools/check_nb_code_import.js
   會把該目錄下每一份 4096B／EDID 合格的檔案都餵進 `wfgNbSane()`，全部必須通過。

   ── 實作方式：把產品原始碼抽出來在 node 裡跑 ────────────────────────────
   `wfgNbDecodeChunk()` / `wfgNbEdidFrame()` / `wfgNbSane()` 三支都是**純函式**，
   不碰 DOM。直接從 `wfg.html` 原始碼切出來 eval —— 這樣驗的是**產品本身**，
   不是另一份抄過來的副本（抄一份就會有兩份不同步的版本）。也因此不需要 jsdom，
   與 repo 其他檢查一樣零外部相依。

   退出碼： 0 = 通過   1 = 有誤殺／有漏放   2 = 檢查本身跑不起來（不當作通過）
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const SRC = path.join(REPO, 'wfg.html');

function die(msg) { console.error('🛑 ' + msg); process.exit(2); }

/* ── 從 wfg.html 切出一支具名函式（大括號配對，字串／註解不參與計數）── */
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

let src;
try { src = fs.readFileSync(SRC, 'utf8'); } catch (e) { die('讀不到 ' + SRC); }

const NAMES = ['wfgNbDecodeChunk', 'wfgNbEdidFrame', 'wfgNbSane'];
const sandbox = {};
try {
  // eslint-disable-next-line no-new-func
  new Function('exports', NAMES.map(n => cut(src, n)).join('\n') +
    '\n' + NAMES.map(n => 'exports.' + n + ' = ' + n + ';').join('\n'))(sandbox);
} catch (e) { die('抽出來的產品函式跑不起來：' + e.message); }
for (const n of NAMES) if (typeof sandbox[n] !== 'function') die(n + ' 抽取失敗');

/* ═══ E503 的版面常數（與 wfg.html 的 WFG_NB_MODELS.e503 一致）═══════════ */
const E503 = {
  size: 4096, edidOff: 0, sigCount: 14, layout: 'A',
  fileOff: i => 0x3B0 + i * 0x10 + 0x100      // sigBase(i) + map.delta
};

/* ── 合成一份結構合法的 E503 EEPROM 映像（不含任何真實客戶資料）── */
function buildImage(opt) {
  opt = opt || {};
  const b = new Uint8Array(E503.size);
  // EDID：magic ＋ 一組 DTD（1920x1080、hblank 270、vblank 60、pclk 149.80MHz）
  [0x00, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x00].forEach((v, i) => { b[i] = v; });
  const ha = opt.hactive != null ? opt.hactive : 1920;
  const hb = opt.hblank != null ? opt.hblank : 270;
  const va = 1080, vb = 60;
  const pclk10k = 14980;
  const d = E503.edidOff + 0x36;
  b[d] = pclk10k & 0xFF; b[d + 1] = (pclk10k >> 8) & 0xFF;
  b[d + 2] = ha & 0xFF; b[d + 3] = hb & 0xFF;
  b[d + 4] = ((ha >> 8) << 4) | ((hb >> 8) & 0x0F);
  b[d + 5] = va & 0xFF; b[d + 6] = vb & 0xFF;
  b[d + 7] = ((va >> 8) << 4) | ((vb >> 8) & 0x0F);
  let s = 0; for (let i = 0; i < 127; i++) s += b[i];
  b[127] = (256 - (s & 0xFF)) & 0xFF;                    // EDID checksum

  // 14 條訊號。預設前 7 條 enable（與真檔常見的樣子一致）。
  const sigs = opt.sigs || [];
  for (let i = 0; i < E503.sigCount; i++) {
    const o = E503.fileOff(i);
    const cfg = sigs[i] || {};
    const en = cfg.enable != null ? cfg.enable : (i < 7 ? 1 : 0);
    b[o + 0] = (en << 7);
    b[o + 1] = 0x00;                                     // oax_mode 0 / act_type 0
    b[o + 2] = 0x00;                                     // r_ph
    b[o + 3] = 0x00;                                     // tg_ini_val / f_ph
    const st = cfg.st_line != null ? cfg.st_line : 5;
    const sp = cfg.sp_line != null ? cfg.sp_line : 1090;
    b[o + 4] = (st >> 8) & 0x3F; b[o + 5] = st & 0xFF;   // ST_LINE 14bit BE
    b[o + 6] = (sp >> 8) & 0x3F; b[o + 7] = sp & 0xFF;   // SP_LINE 14bit BE
    const rd = cfg.r_dly != null ? cfg.r_dly : 955;
    const fd = cfg.f_dly != null ? cfg.f_dly : 955;
    b[o + 8] = (rd >> 8) & 0xFF; b[o + 9] = rd & 0xFF;   // R_DLY 16bit BE
    b[o + 10] = (fd >> 8) & 0xFF; b[o + 11] = fd & 0xFF; // F_DLY 16bit BE
    b[o + 12] = b[o + 8]; b[o + 13] = b[o + 9];          // R_DLY2（真檔通常是複本）
    b[o + 14] = b[o + 10]; b[o + 15] = b[o + 11];        // F_DLY2
  }
  return b;
}

function judge(bytes) {
  const fr = sandbox.wfgNbEdidFrame(bytes, E503.edidOff);
  if (!fr) return { edid: false, sane: false };
  const sig = [];
  for (let i = 0; i < E503.sigCount; i++) {
    sig.push(sandbox.wfgNbDecodeChunk(bytes, E503.fileOff(i), E503.layout));
  }
  return { edid: true, sane: !!sandbox.wfgNbSane(sig.filter(Boolean), fr), frame: fr };
}

let fail = 0;
function expect(name, got, want) {
  const ok = got === want;
  if (!ok) fail++;
  console.log('  ' + (ok ? '✅' : '❌') + ' ' + name + '  （得到 ' + got + '，應為 ' + want + '）');
}

console.log('NB code 匯入判定檢查（產品函式直接抽自 wfg.html）');
console.log('');
console.log('① 必須接受 —— 真實 E503 code 會出現的數值（v4.14.0～v4.37.0 全部誤殺）');
/* 🔴 這四個數字**不是編的**：是 177 份真實 E503 檔裡實際量到的、
   且在舊版被判「超界」的值。任何人日後想把值域判準加回去，都會被這一條擋下。 */
expect('F_DLY = 0xFFFF（65535）在 enable 的訊號上',
  judge(buildImage({ sigs: { 3: { enable: 1, f_dly: 0xFFFF, sp_line: 16000, st_line: 1095, r_dly: 955 } } })).sane, true);
expect('SP_LINE = 16000（> vtotal×3）',
  judge(buildImage({ sigs: { 3: { enable: 1, sp_line: 16000 } } })).sane, true);
expect('F_DLY = 5500（> htotal 2190）',
  judge(buildImage({ sigs: { 13: { enable: 1, f_dly: 5500 } } })).sane, true);
expect('R_DLY = 50923（語料最大值）',
  judge(buildImage({ sigs: { 2: { enable: 1, r_dly: 50923 } } })).sane, true);
expect('ST_LINE = 14820（語料最大值）',
  judge(buildImage({ sigs: { 2: { enable: 1, st_line: 14820 } } })).sane, true);
expect('全部欄位都在合理範圍的一般檔案',
  judge(buildImage()).sane, true);

console.log('');
console.log('② 必須拒絕 —— 型號判別不可以因為①而失效');
expect('EDID magic 壞掉一個 byte', (function () {
  const b = buildImage(); b[3] ^= 0xFF; return judge(b).edid;
})(), false);
expect('EDID checksum 不對', (function () {
  const b = buildImage(); b[127] = (b[127] + 1) & 0xFF; return judge(b).edid;
})(), false);
expect('XSTB 沒有 enable', (function () {
  const b = buildImage(); b[E503.fileOff(0)] &= 0x7F; return judge(b).sane;
})(), false);
expect('只有 3 條訊號 enable（需 ≥ 4）', (function () {
  const s = {}; for (let i = 0; i < E503.sigCount; i++) s[i] = { enable: i < 3 ? 1 : 0 };
  return judge(buildImage({ sigs: s })).sane;
})(), false);
expect('解析度荒謬（hactive = 100）', judge(buildImage({ hactive: 100 })).sane, false);
expect('全 0x00 的 4096 bytes', judge(new Uint8Array(4096)).edid, false);
expect('全 0xFF 的 4096 bytes', judge(new Uint8Array(4096).fill(0xFF)).edid, false);

/* ③ 選配：拿本機真檔跑（不進版控）。 */
const REAL = process.env.WFG_NB_CODE_DIR;
if (REAL && fs.existsSync(REAL)) {
  console.log('');
  console.log('③ 本機真檔語料：' + REAL);
  const hexToBytes = txt => {
    const out = {}; let ext = 0, max = 0;
    for (const line of txt.split(/\r?\n/)) {
      if (line[0] !== ':') continue;
      const b = Buffer.from(line.slice(1), 'hex');
      const len = b[0], addr = (b[1] << 8) | b[2], typ = b[3];
      if (typ === 0) { const a = ext * 65536 + addr; for (let i = 0; i < len; i++) { out[a + i] = b[4 + i]; } max = Math.max(max, a + len); }
      else if (typ === 4) ext = (b[4] << 8) | b[5];
    }
    const arr = new Uint8Array(max); for (const k in out) arr[k] = out[k];
    return arr;
  };
  let n = 0, bad = 0;
  for (const f of fs.readdirSync(REAL)) {
    const p = path.join(REAL, f);
    if (!fs.statSync(p).isFile()) continue;
    let bytes;
    try {
      bytes = /\.hex$/i.test(f) ? hexToBytes(fs.readFileSync(p, 'latin1')) : new Uint8Array(fs.readFileSync(p));
    } catch (e) { continue; }
    if (bytes.length !== E503.size) continue;
    const r = judge(bytes);
    if (!r.edid) continue;                    // 不是 E503 形狀，跳過
    n++;
    if (!r.sane) { bad++; fail++; console.log('  ❌ 誤殺：' + f); }
  }
  console.log('  E503 形狀的真檔 ' + n + ' 份，被誤殺 ' + bad + ' 份');
}

console.log('');
if (fail) { console.log('🛑 有 ' + fail + ' 項不通過。'); process.exit(1); }
console.log('✅ 全部通過：真實 E503 code 的數值不會被判成「不是這個型號」，型號判別仍然有效。');
process.exit(0);
