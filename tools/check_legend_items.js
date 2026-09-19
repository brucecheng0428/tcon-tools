#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * 常設機械檢查：dump 的顏色圖例項目數 ＝ CSS 裡實際存在的格子樣式數
 * ───────────────────────────────────────────────────────────────────────────
 * Bruce 2026-09-19 的要求是「項目數＝CSS 實際樣式數」。這種一致性靠人記是守不住的：
 * 加一個新樣式時，最需要被解釋的正好就是那個最新、最沒人認得的顏色，
 * 而漏掉它**不會有任何錯誤訊息** —— 畫面照跑、測試照綠。只能靠機械比對。
 *
 * 判準：
 *   CSS 側 ＝ `table.dump td.<class>` 出現過的**相異 class**（複合選擇器如
 *            `td.sel.wrfail` 拆開算，它不是新狀態）。
 *   圖例側 ＝ `#celllegend` 底下每個 `<span data-cls="…">` 的值。
 *   另有一個 `data-cls=""` 的「未讀取」項 ＝ 沒有任何 class 的基底狀態，
 *   它在 CSS 側沒有對應的 `td.<class>`，所以單獨算、不納入集合比對。
 *
 * 用法：node tools/check_legend_items.js
 * 離開碼 0 = 通過，1 = 不通過。
 * ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.dirname(__dirname);
const src = fs.readFileSync(path.join(ROOT, 'i2c.html'), 'utf8');

/* ── CSS 側 ─────────────────────────────────────────────────────────────── */
const cssClasses = new Set();
/* `table.dump td.a.b`、`table.dump td.a, table.dump th.b` 都吃得下 */
const re = /table\.dump\s+td((?:\.[A-Za-z0-9_-]+)+)/g;
let m;
while ((m = re.exec(src)) !== null) {
  m[1].split('.').filter(Boolean).forEach((c) => cssClasses.add(c));
}

/* ── 圖例側 ─────────────────────────────────────────────────────────────── */
const legendBlock = /<div id="celllegend"[^>]*>([\s\S]*?)<\/div>/.exec(src);
if (!legendBlock) {
  console.log('🔴 找不到 #celllegend —— 顏色圖例不見了？');
  process.exit(1);
}
const legend = [];
const lre = /data-cls="([^"]*)"/g;
while ((m = lre.exec(legendBlock[1])) !== null) legend.push(m[1]);

const legendSet = new Set(legend.filter((x) => x !== ''));
const baseCount = legend.filter((x) => x === '').length;

const missing = [...cssClasses].filter((c) => !legendSet.has(c)).sort();
const extra = [...legendSet].filter((c) => !cssClasses.has(c)).sort();

console.log('CSS 實際樣式（table.dump td.<class> 相異類別）：'
  + cssClasses.size + ' 種 → ' + [...cssClasses].sort().join(', '));
console.log('圖例項目：' + legend.length + ' 項（' + legendSet.size
  + ' 個對應 CSS 樣式 ＋ ' + baseCount + ' 個無類別基底「未讀取」）');

let bad = 0;
if (missing.length) { console.log('🔴 CSS 有、圖例沒有：' + missing.join(', ')); bad = 1; }
if (extra.length)   { console.log('🔴 圖例有、CSS 沒有：' + extra.join(', ')); bad = 1; }
if (baseCount !== 1) { console.log('🔴 無類別基底項應該剛好一個，實際 ' + baseCount); bad = 1; }

if (bad) {
  console.log('\n   修法：在 #celllegend 補上／移除對應的 <span data-cls="…">，'
    + '並在 .celllegend 加上同名的 .lg-<class> 色塊樣式（顏色要與格子本身相同）。');
  process.exit(1);
}
console.log('✅ 圖例項目數與 CSS 樣式數一致（' + cssClasses.size + ' + 1 = ' + legend.length + '）');
process.exit(0);
