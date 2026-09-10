#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * 機械檢查：data/dpcd-db.js 同一個物件實字內不得出現重複的鍵
 * ───────────────────────────────────────────────────────────────────────────
 * 為什麼需要這支（2026-09-10 實測案例）：
 *   替 0220Eh 的 TRAINING_AUX_RD_INTERVAL 補 v 值對照時，字串比對命中的是
 *   0000Eh 的同名欄位，新的 `v:` 被插在既有 `v:` **之前**。JS 物件實字碰到
 *   重複鍵是「後者勝出」——新值被舊值靜默蓋掉，語法沒錯、載入沒錯、
 *   畫面上完全看不出來，只有逐欄位 dump 才會發現該補的東西根本沒補上。
 *
 *   這一類錯在本機測試不會出現（頁面照常運作、只是少了一塊），
 *   跟 check_nb_code_import.js / check_em01_code_import.js 一樣，只能靠機械檢查擋。
 *
 * 用法：
 *   node tools/check_dpcd_db_dupkey.js
 *   DPCD_DB_PATH=<某個檔> node tools/check_dpcd_db_dupkey.js   # 指定檢查對象
 * 離開碼 0 = 通過，1 = 有重複鍵，2 = 檢查本身跑不起來（不當作通過）。
 * ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.dirname(__dirname);
const P = process.env.DPCD_DB_PATH || path.join(ROOT, 'data', 'dpcd-db.js');

let src;
try {
  src = fs.readFileSync(P, 'utf8');
} catch (e) {
  console.error('🛑 讀不到 ' + P + '：' + e.message);
  process.exit(2);
}
if (!src.length) { console.error('🛑 ' + P + ' 是空的'); process.exit(2); }

const bad = [];
const stack = [];
let line = 1, inStr = false, q = '', esc = false;
for (let i = 0; i < src.length; i++) {
  const c = src[i];
  if (c === '\n') line++;
  if (inStr) {
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (c === q) inStr = false;
    continue;
  }
  if (c === '"' || c === "'") { inStr = true; q = c; continue; }
  if (c === '{') { stack.push(new Set()); continue; }
  if (c === '}') { stack.pop(); continue; }
  if (c === ':' && stack.length) {
    let j = i - 1;
    while (j >= 0 && /\s/.test(src[j])) j--;
    let key = null;
    if (src[j] === '"' || src[j] === "'") {
      const qq = src[j];
      let k = j - 1;
      while (k >= 0 && src[k] !== qq) k--;
      key = src.slice(k + 1, j);
    } else {
      let k = j;
      while (k >= 0 && /[A-Za-z0-9_$]/.test(src[k])) k--;
      key = src.slice(k + 1, j + 1);
    }
    if (key && /^[A-Za-z_$][A-Za-z0-9_$]*$|^[0-9A-Fa-fx]+$/.test(key)) {
      const top = stack[stack.length - 1];
      if (top.has(key)) bad.push('  line ' + line + '：重複鍵 "' + key + '"（後者會靜默覆蓋前者）');
      top.add(key);
    }
  }
}

if (bad.length) {
  console.error('🔴 不通過：' + path.relative(ROOT, P) + ' 有 ' + bad.length + ' 個重複鍵');
  bad.slice(0, 30).forEach(s => console.error(s));
  process.exit(1);
}
console.log('通過：' + path.relative(ROOT, P) + ' 無重複鍵。');
process.exit(0);
