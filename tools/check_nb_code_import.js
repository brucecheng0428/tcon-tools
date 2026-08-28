#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   常設機械檢查：NB（E501／E503／EN01）code 匯入 —— 解碼層＋判定層＋映像上限
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
   會把該目錄下每一份檔案都餵進**產品的** `wfgCodeToImage()`，再對 4096B／EDID
   合格的那些跑 `wfgNbSane()`，全部必須通過。

   ── 這支涵蓋哪幾層（每一層都是踩過一次才加進來的）─────────────────────────
     ①② 判定層 `wfgNbSane()`     v4.37.1：值域判準誤殺 18% 的真檔
     ③④ 解碼層 `wfgCodeToImage()` v4.37.2：UTF-8 BOM ＋ 只算 data 的 checksum 方言
     ⑤   映像大小上限             v4.37.3：type-04 可把配置推到 ~4 GB
     ⑥   選配的本機真檔語料
   🔴 破口的形狀每次都一樣：**只驗了一面**。①只驗「壞檔會被拒絕」沒驗「真檔會被
   接受」；③只驗判定層沒驗解碼層；⑥ 自己還抄了一份解碼器所以看不見 ② 那個 bug。
   加東西進來的時候，請同時想「這一項的反面是什麼，有沒有一起驗」。

   ── 實作方式：把產品原始碼抽出來在 node 裡跑 ────────────────────────────
   抽出來的六支都是**純函式**、不碰 DOM。直接從 `wfg.html` 原始碼切出來 eval ——
   這樣驗的是**產品本身**，不是另一份抄過來的副本（抄一份就會有兩份不同步的版本，
   而且不同步的方向一定是「檢查看不到產品的缺陷」）。常數（`WFG_CODE_MAX_IMAGE`）
   同理，用 regex 從原始碼讀，不在這裡再寫一次。也因此不需要 jsdom，零外部相依。

   ⚠ 這支**不涵蓋 UI 那幾層**（型號確認框、清除、匯入類別視窗）。那幾層要用
   jsdom／真瀏覽器驗，不進這裡 —— 為了讓 pre-commit 保持零相依、秒級。

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

/* 🔴 v4.37.2 追加 `wfgCodeDecodeIntelHex` / `wfgCodeToImage` / `wfgCodeIsHexName`：
   Bruce 回報的第二個症狀（「Intel HEX 第 1 行格式不正確」）根本沒走到 `wfgNbSane()`，
   它死在**解碼器**這一層。原本這支腳本只釘住判定層，等於又只驗了一半。
   `t()` 是這幾支唯一的外部相依（只用來組錯誤訊息）⇒ 用回傳 key 本身的替身即可，
   本檢查只看「有沒有拒絕」，不看訊息長什麼樣。 */
const NAMES = ['wfgNbDecodeChunk', 'wfgNbEdidFrame', 'wfgNbSane',
               'wfgCodeIsHexName', 'wfgCodeDecodeIntelHex', 'wfgCodeToImage'];
/* 🔴 常數也**從產品原始碼讀出來**，不在這裡再寫一份 —— 兩份不同步的方向一定是
   「檢查看不到產品的缺陷」（v4.37.2 的真檔語料段就是這樣栽的）。 */
const MAX_IMAGE = (function () {
  const m = /var\s+WFG_CODE_MAX_IMAGE\s*=\s*(\d+)/.exec(src);
  if (!m) die('在 wfg.html 找不到 WFG_CODE_MAX_IMAGE');
  return parseInt(m[1], 10);
})();
const sandbox = {};
try {
  // eslint-disable-next-line no-new-func
  new Function('exports', 'MAX_IMAGE',
    'var t = function (k) { return String(k); };\n' +
    'var WFG_CODE_MAX_IMAGE = MAX_IMAGE;\n' +
    NAMES.map(n => cut(src, n)).join('\n') +
    '\n' + NAMES.map(n => 'exports.' + n + ' = ' + n + ';').join('\n'))(sandbox, MAX_IMAGE);
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

/* ══ 🔴 v4.37.2 新增：Intel HEX 解碼層 ═══════════════════════════════════════
   為什麼要另外釘這一層：Bruce 2026-08-28 回報的第二個症狀是
   **「Intel HEX 第 1 行格式不正確」** —— 它連 `wfgNbSane()` 都沒走到就死了。
   上面①②只驗判定層，對這一類錯完全沒有鑑別力。**同一個破口的第三次**
   （① 只驗壞檔被拒 ② 只驗純函式不驗完整路徑 ③ 只驗判定層不驗解碼層），
   所以這裡把「檔案進來的第一站」也一起釘住。

   兩個真實存在的變體，都由 191 份真檔語料（189 份信件封存 ＋ Bruce 回報的 2 份）
   實測得出，不是推測：
     ・**UTF-8 BOM**：11 份帶 BOM（`EF BB BF`），v4.37.1 之前全數被判「第 1 行格式不正確」。
     ・**只算 data 的 checksum**：同樣那 11 份，整列標準 checksum 算不過，
       但「只算 data」全數通過；另外 180 份走標準；**沒有任何一份兩種都算不過**。
   ⇒ BOM 與 data-only checksum 是同一個產生器的兩個特徵。 */
const S = txt => new Uint8Array(Array.from(txt).map(c => c.charCodeAt(0)));
const EOF_REC = ':00000001FF\r\n';
/* 兩列標準 Intel HEX。 */
const STD_L1 = ':10000000000102030405060708090A0B0C0D0E0F78';
const STD_L2 = ':080010000102030405060708C4';           // 整列和 &0xFF = 0
const HEX_STD = STD_L1 + '\r\n' + EOF_REC;
/* 「只算 data」方言：整列和不為 0，但 data 和的二補數 ＝ cks。
   第一列**逐位元組取自 Bruce 那份真檔的第 1 行**，第二列是同規則自造的。 */
const DO_L1 = ':0800000000FFFFFFFFFFFF0006';            // 整列 &0xFF = 8；data 二補數 = 0x06
const DO_L2 = ':080008000102030405060708DC';            // 整列 &0xFF = 16；data 二補數 = 0xDC
const HEX_DATAONLY = DO_L1 + '\r\n' + DO_L2 + '\r\n' + EOF_REC;

console.log('');
console.log('③ Intel HEX 解碼層 —— 必須接受（真檔實際出現的兩種方言）');
expect('一般的標準 Intel HEX', sandbox.wfgCodeToImage(S(HEX_STD), 'x.hex').ok, true);
expect('開頭有 UTF-8 BOM（EF BB BF）', sandbox.wfgCodeToImage(S('ï»¿' + HEX_STD), 'x.hex').ok, true);
expect('checksum 只算 data 的方言', sandbox.wfgCodeToImage(S(HEX_DATAONLY), 'x.hex').ok, true);
expect('BOM ＋ data-only 同時出現（＝真檔的樣子）',
  sandbox.wfgCodeToImage(S('ï»¿' + HEX_DATAONLY), 'x.hex').ok, true);
/* 方言要被認出來，而不是「碰巧過關」。 */
expect('方言判定：標準檔回報 standard',
  sandbox.wfgCodeToImage(S(HEX_STD), 'x.hex').cksDialect === 'standard', true);
expect('方言判定：變體檔回報 data-only',
  sandbox.wfgCodeToImage(S(HEX_DATAONLY), 'x.hex').cksDialect === 'data-only', true);

console.log('');
console.log('④ Intel HEX 解碼層 —— 必須拒絕（checksum 還活著）');
/* 🔴 最關鍵的一項：混合。它是「整檔一致」與「逐列各自擇一」的分水嶺 ——
   逐列擇一會放行下面這份，整檔一致會擋下來。 */
expect('🔴 一列 data-only ＋ 一列標準（整檔不一致）',
  sandbox.wfgCodeToImage(S(DO_L1 + '\r\n' + STD_L2 + '\r\n' + EOF_REC), 'x.hex').ok, false);
expect('data 被改一個 byte（標準檔）',
  sandbox.wfgCodeToImage(S(HEX_STD.replace(':1000000000010203', ':1000000000010204')), 'x.hex').ok, false);
expect('data 被改一個 byte（data-only 檔）',
  sandbox.wfgCodeToImage(S(HEX_DATAONLY.replace('00FFFFFF', '01FFFFFF')), 'x.hex').ok, false);
expect('checksum 欄位被改', sandbox.wfgCodeToImage(S(HEX_STD.replace('0F78', '0F79')), 'x.hex').ok, false);
expect('第 1 行不是冒號開頭', sandbox.wfgCodeToImage(S('X' + HEX_STD), 'x.hex').ok, false);
expect('列長度與 len 欄位不符', sandbox.wfgCodeToImage(S(':10000000000102030478\r\n' + EOF_REC), 'x.hex').ok, false);
expect('缺少 EOF 記錄（檔案被截斷）',
  sandbox.wfgCodeToImage(S(STD_L1 + '\r\n'), 'x.hex').ok, false);
expect('BOM 之外的位置冒出 EF BB BF',
  sandbox.wfgCodeToImage(S(HEX_STD.replace(':00000001FF', 'ï»¿:00000001FF')), 'x.hex').ok, false);
expect('UTF-16 BOM（刻意不支援，要大聲失敗）',
  sandbox.wfgCodeToImage(new Uint8Array([0xFF, 0xFE, 0x3A, 0x00, 0x31, 0x00]), 'x.hex').ok, false);
/* .bin 不走解碼器：同一串內容當 .bin 應該原封不動回傳。 */
expect('.bin 不經過 hex 解碼（原樣回傳）',
  sandbox.wfgCodeToImage(S('X' + HEX_STD), 'x.bin').ok, true);

/* ══ 🔴 v4.37.3：映像大小上限 —— 超大配置要擋在配置之前 ═══════════════════════
   `new Uint8Array(maxAddr + 1)` 的大小完全由檔案內容決定，而 **type-04** 可以把
   base 推到 `0xFFFF × 65536 ≈ 4 GB`。v4.37.2 之前實測構造得出 `ok: true` ＋
   `content_len: 4294905856`，在瀏覽器分頁裡多半直接卡死。

   🔴 **這裡刻意不用 4 GB 當測資** —— 跑檢查本身不該把機器拖垮。用「剛好超過上限
   一點點」（上限 + 8）就足以證明閘門存在，而且它**配置得起**，所以如果閘門不在，
   結果會是「接受」而不是「當掉」⇒ 這個測資對「有沒有擋」的鑑別力反而更乾淨。 */
const REC = (len, addr, typ, data) => {
  const by = [len, (addr >> 8) & 255, addr & 255, typ].concat(data);
  let s = 0; for (const v of by) s += v;
  by.push((256 - (s & 255)) & 255);
  return ':' + by.map(v => v.toString(16).toUpperCase().padStart(2, '0')).join('');
};
const D8 = [1, 2, 3, 4, 5, 6, 7, 8];
const EXT04 = hi => REC(2, 0, 4, [(hi >> 8) & 255, hi & 255]);
const EXT02 = hi => REC(2, 0, 2, [(hi >> 8) & 255, hi & 255]);
const EOFR = REC(0, 0, 1, []);
const hexOf = body => S(body + '\r\n' + EOFR + '\r\n');

console.log('');
console.log('⑤ Intel HEX 映像大小上限（目前 ' + MAX_IMAGE + ' bytes ＝ ' + (MAX_IMAGE / 1048576) + ' MiB）');
{
  /* 上限 −8：最高位址 = MAX_IMAGE − 1 ⇒ 映像剛好 MAX_IMAGE ⇒ 合法邊界。 */
  const hiOk = (MAX_IMAGE - 8) >>> 16, loOk = (MAX_IMAGE - 8) & 0xFFFF;
  const okCase = hexOf(EXT04(hiOk) + '\r\n' + REC(8, loOk, 0, D8));
  const r1 = sandbox.wfgCodeToImage(okCase, 'x.hex');
  expect('type-04 推到剛好裝得下（合法邊界）', r1.ok, true);
  expect('  └ 邊界檔的映像長度正好是上限', r1.ok && r1.bytes.length === MAX_IMAGE, true);

  /* 上限 +0（第一個 byte 就越界）：只超一點點，配置得起 ⇒ 閘門不在就會「接受」。 */
  const hiBad = MAX_IMAGE >>> 16, loBad = MAX_IMAGE & 0xFFFF;
  expect('🔴 type-04 超過上限（哪怕只超 1 byte）',
    sandbox.wfgCodeToImage(hexOf(EXT04(hiBad) + '\r\n' + REC(8, loBad, 0, D8)), 'x.hex').ok, false);

  /* type-02：base = 0xFFFF × 16 = 1,048,560，加 addr 0xFFFF 與 len 255
     ⇒ 最高 1,114,349 ≈ 1.06 MB，**結構上到不了 4 MiB**。所以它要被接受，
     而且這一條同時記錄了「為什麼不必為 type-02 另立規則」。 */
  const t02 = sandbox.wfgCodeToImage(hexOf(EXT02(0xFFFF) + '\r\n' + REC(8, 0xFFF8, 0, D8)), 'x.hex');
  expect('type-02 推到最大（結構上到不了上限 ⇒ 應接受）', t02.ok, true);
  expect('  └ type-02 的理論最高位址仍 < 上限',
    t02.ok && t02.bytes.length < MAX_IMAGE, true);

  /* 合法的 EEPROM／Flash 大小不可以被這道閘門誤殺。 */
  for (const [nm, n] of [['EEPROM 4096', 4096], ['EEPROM 8192', 8192], ['Flash 131072', 131072], ['Flash 262144', 262144]]) {
    const hi = (n - 8) >>> 16, lo = (n - 8) & 0xFFFF;
    expect('合法大小 ' + nm + ' 仍可解碼',
      sandbox.wfgCodeToImage(hexOf(EXT04(hi) + '\r\n' + REC(8, lo, 0, D8)), 'x.hex').ok, true);
  }
}

/* ⑥ 選配：拿本機真檔跑（不進版控）。
   🔴 v4.37.2 修正：這一段原本自己寫了一份簡易的 Intel HEX 解碼器 —— 於是它
   **看不到 BOM 那個 bug**（自己的解碼器不剝 BOM ⇒ 那 11 份真檔解出來長度不對 ⇒
   被當成「不是 E503 形狀」靜默跳過）。抄一份實作就會有兩份不同步的版本，
   而且不同步的方向剛好是「檢查看不到產品的缺陷」。改用產品的 `wfgCodeToImage()`。 */
const REAL = process.env.WFG_NB_CODE_DIR;
if (REAL && fs.existsSync(REAL)) {
  console.log('');
  console.log('⑥ 本機真檔語料：' + REAL);
  let seen = 0, decFail = [], n = 0, bad = 0;
  for (const f of fs.readdirSync(REAL)) {
    const p = path.join(REAL, f);
    if (!fs.statSync(p).isFile()) continue;
    if (!/\.(hex|bin)$/i.test(f)) continue;
    seen++;
    const img = sandbox.wfgCodeToImage(new Uint8Array(fs.readFileSync(p)), f);
    if (!img.ok) { decFail.push(f + ' → ' + String(img.reason).slice(0, 40)); fail++; continue; }
    if (img.bytes.length !== E503.size) continue;   // 不是 E503 大小，跳過
    const r = judge(img.bytes);
    if (!r.edid) continue;                          // 不是 E503 形狀，跳過
    n++;
    if (!r.sane) { bad++; fail++; console.log('  ❌ 誤殺：' + f); }
  }
  console.log('  掃到 ' + seen + ' 份；解碼失敗 ' + decFail.length + ' 份；'
            + 'E503 形狀 ' + n + ' 份，被誤殺 ' + bad + ' 份');
  decFail.slice(0, 10).forEach(x => console.log('  ❌ 解碼失敗：' + x));
}

console.log('');
if (fail) { console.log('🛑 有 ' + fail + ' 項不通過。'); process.exit(1); }
console.log('✅ 全部通過：真實 E503 code 的數值不會被判成「不是這個型號」，型號判別仍然有效。');
process.exit(0);
