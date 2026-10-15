'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   tftlogic.js — TFT 接線圖（#dm-pv-tft）轉成「邏輯位置 → 內容」（Bruce 2026-10-15 定案）
   Bruce 原話：「應該要用 Pixel 位置跟 Gate 位置來當作它的位置座標…怎麼變，都不會改變結果啊！」
   位置（固定內定編號，不隨設定變）：
     ・第 N 列＝實體 pixel 列（1 起，同 TFT 圖左側「第 N 列」）；Single／Dual／Tri 不改變。
     ・第 M 欄＝面板玻璃上的實體 subpixel 欄，玻璃由左往右遞增；原點固定在子像素軸的第一格
       （＝② 表格用到的最小 pixel 的第 1 個 subpixel；它左邊的空位是負的欄號）。
       Mirror、CH1 左右（整張翻）、Driver 正反、RGB／BGR 都不改變這個編號（畫面畫多畫少只影響有幾欄，不影響編號）。
       註：TFT 圖只畫面板靠 CH1 的一段，工具不知道面板總寬，所以原點用子像素軸，不用整片玻璃的第 1 欄。
     ・Data 線在玻璃上的位置＝第 b 縫（第 b−1 欄與第 b 欄之間）。
   內容（要記錄、要比對，但不當位置）：接哪條 gate 線、接哪條 Data／SD OUT／TCON OUT、顯示名稱、顏色、
     亮／暗／dummy／衝突等狀態、title 提示文字…＝元素上除了螢幕幾何以外的全部屬性與文字。
   螢幕幾何（不進快照）：x y x1 y1 x2 y2 cx cy r rx ry d width height viewBox font-size transform baseline-shift data-x data-gy points dx dy。
   ═══════════════════════════════════════════════════════════════════════════ */
/* 版面衍生、不代表接線的兩項也不進快照（selftest B 抓到：只改欄距／格子大小就會變）：
     data-hops：drain 線跨過別條線的半圓跳線數（看線在畫面上的 x 先後，版面改了就會變）；
     text[data-send]：畫面外／X 不接 TFT 旁的「!名稱／X」小字，只有不和旁邊字重疊時才畫 ⇒ 有沒有出現看版面。
       同一個名稱與「畫面外／不接」已記在該 TFT 的 drain 線 data-w（列:Data:gate:名稱）與 data-off，照比。 */
const GEO = new Set(['x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'd', 'width', 'height', 'viewBox', 'viewbox', 'font-size', 'transform', 'baseline-shift', 'data-x', 'data-gy', 'points', 'dx', 'dy', 'data-hops']);
function attrs(e) { const o = {}; Array.from(e.attributes).map(a => a.name).sort().forEach(n => { if (!GEO.has(n)) o[n] = e.getAttribute(n); }); return o; }
function rec(e, rep) {
  const r = { t: e.tagName.toLowerCase(), a: attrs(e) };
  if (rep) r.rep = 1;   // 畫在「前後循環／重複組」整組調暗（opacity .45）的群組裡
  const c = [];
  e.childNodes.forEach(n => { if (n.nodeType === 3) { if (n.nodeValue !== '') c.push(n.nodeValue); } else if (n.nodeType === 1) c.push(rec(n)); });
  if (c.length) r.c = c;
  return r;
}
const J = o => JSON.stringify(o);
/* 一格的可讀摘要（報錯時列出哪些內容不同） */
function cellSum(g) {
  const rc = g.querySelector('rect[data-pv]'); if (!rc) return '';
  const nm = g.querySelector('text[data-name]'), rv = g.querySelector('text[data-recv]');
  return '名稱 ' + (nm ? nm.textContent : '') + '｜收到 ' + rc.getAttribute('data-dn') + '｜實體色 ' + rc.getAttribute('data-phys') + '｜填色 ' + rc.getAttribute('fill') + '/' + rc.getAttribute('fill-opacity') + '｜亮暗 ' + rc.getAttribute('data-tier') + '｜狀態 ' + rc.getAttribute('data-st') + (rc.getAttribute('data-dum') === '1' ? '｜dummy' : '') + '｜接線 ' + (rc.getAttribute('data-in') || '—') + (rv ? '｜下緣 ' + rv.textContent : '');
}
function lineSum(p) { return 'SD OUT ' + p.getAttribute('data-dl') + '｜收第 ' + p.getAttribute('data-src') + ' 筆｜重複組 ' + p.getAttribute('data-rep'); }
/* svg ⇒ { 位置鍵: 內容 }；位置鍵：
     'meta'           整張圖的非幾何屬性（方向、週期、gate 數…）
     'hdr'            標頭（主循環／前循環字、列頭 TCON Out／SD Out、分隔線）
     'N{n}'           第 n 列的列名與該列各 gate 線（gate 名稱、Line x-1/x-2 等屬於內容）
     'N{n}M{m}'       第 n 列第 m 欄的子像素格＋接到這格的所有 TFT（gate 點、drain 線、接哪條 Data）
     'N{n}B{b}'       第 n 列、第 b 縫上沒有接到畫面內格子的 TFT（X 不接、畫面外）
     'B{b}'           第 b 縫上的 Data 線（Dn 編號、SD OUT 標籤、TCON OUT 標籤、收到第幾筆資料） */
function tftLogic(svg) {
  const out = {}, sum = {};
  if (!svg) return { map: out, sum };
  out.meta = J(attrs(svg));
  let root = svg; const fl = svg.querySelector(':scope > g[data-flip]'); if (fl) root = fl;
  const items = [];
  Array.from(root.children).forEach(e => {
    if (e.tagName.toLowerCase() === 'g' && e.getAttribute('data-rep') === '1' && !e.hasAttribute('data-tip')) { items.push({ e, wrap: 1 }); Array.from(e.children).forEach(c => items.push({ e: c, rep: 1 })); }
    else items.push({ e });
  });
  const FRL = svg.getAttribute('data-dir') === 'rl', smax = +svg.getAttribute('data-smax'), nl = +svg.getAttribute('data-nl'), NG = +svg.getAttribute('data-ng') || 1;
  const cells = items.filter(it => it.e.tagName.toLowerCase() === 'g' && it.e.hasAttribute('data-tip'));
  const cnt = nl ? cells.length / nl : 0, smin = smax - cnt + 1;
  /* 欄號原點（固定）：畫面只畫面板的一段，畫的範圍（最左畫到哪）會隨 Mirror／CH1／Driver 改變，所以不能用「畫面最左＝0」。
     改用子像素軸（pvAxisLab：左小右大、不隨 Mirror／CH1／Driver／RGB↔BGR 改變）：軸上第一格（＝② 表格用到的最小 pixel 的第 1 個 subpixel）＝第 0 欄，
     往右（玻璃上往右）+1、往左 −1。畫面上沒有軸名稱的格子（最小 pixel 左邊的空位）就是負的欄號。 */
  const scr = s => FRL ? smax - s : s - smin;               // 畫面（玻璃）由左數第幾格
  let a0 = null;
  cells.forEach((it, i) => { const t = it.e.querySelector('text[data-name]'); if (t && t.textContent !== '') { const sc = scr(smin + (i % cnt)); if (a0 === null || sc < a0) a0 = sc; } });
  if (a0 === null) a0 = 0;                                  // 整張沒有軸名稱（不會發生在可畫圖的組合）：退回畫面最左
  const colOf = s => scr(s) - a0;                           // 第 M 欄
  const gapOf = g => scr(g) + (FRL ? 1 : 0) - a0;           // 第 b 縫＝第 b 欄的左緣（第 b−1 與第 b 欄之間）
  const key = new Map(), add = (k, v) => { (out[k] = out[k] || []).push(v); };
  /* 1) 子像素格 */
  const cellPos = {}; // 'k|token' -> pos
  cells.forEach((it, i) => {
    const k = Math.floor(i / cnt), s = smin + (i % cnt), rc = it.e.querySelector('rect[data-pv]');
    if (rc && +rc.getAttribute('data-pv').split(':')[0] !== k + 1) throw new Error('格序與列號不符 ' + i);
    const pos = 'N' + (k + 1) + 'M' + colOf(s); key.set(it.e, pos);
    sum[pos] = cellSum(it.e);
    (rc ? rc.getAttribute('data-in') : '').split(',').filter(Boolean).forEach(t => { cellPos[k + '|' + t] = pos; });
  });
  /* 2) Data 線（path[data-dl]）與其 SD OUT／TCON OUT 標籤 */
  const lineB = {}, repP = []; let lastP = null;
  items.forEach(it => { const e = it.e; if (e.tagName.toLowerCase() === 'path' && e.hasAttribute('data-dl')) { const p = +e.getAttribute('data-dl') - 1; lineB[p] = 'B' + gapOf(+e.getAttribute('data-gap')); if (it.rep) repP.push(p); } });
  const tftOwner = (it) => { const t = it.e.getAttribute('data-tft').split(':'); const k = +t[0] - 1, p = +t[1].slice(1) - 1, ud = t[2]; return cellPos[k + '|D' + (p + 1) + ud] || ('N' + (k + 1) + lineB[p]); };
  let gIdx = -1, afterRep = false, rowLab = 0;
  /* 先標 TFT（它的第一條引線畫在 gate 點之前） */
  items.forEach((it, i) => {
    if (it.wrap || it.e.tagName.toLowerCase() !== 'circle' || it.e.getAttribute('data-dot') !== 'gate') return;
    const pos = tftOwner(it); key.set(it.e, pos);
    const tn = j => items[j] ? items[j].e.tagName.toLowerCase() : '';
    if (tn(i - 1) !== 'line' || tn(i + 1) !== 'line' || tn(i + 2) !== 'line' || tn(i + 3) !== 'path' || tn(i + 4) !== 'circle' || items[i + 4].e.getAttribute('data-dot') !== 'source') throw new Error('TFT 元素順序和預期不同 ' + it.e.getAttribute('data-tft'));
    [i - 1, i + 1, i + 2, i + 3, i + 4].forEach(j => key.set(items[j].e, pos));
    if (tn(i + 5) === 'text' && items[i + 5].e.hasAttribute('data-send')) key.set(items[i + 5].e, pos);
  });
  items.forEach((it, i) => {
    const e = it.e, tg = e.tagName.toLowerCase();
    if (it.wrap) { afterRep = true; return; }
    if (key.has(e)) return;
    if (tg === 'path' && e.hasAttribute('data-dl')) { lastP = +e.getAttribute('data-dl') - 1; key.set(e, lineB[lastP]); sum[lineB[lastP]] = lineSum(e); return; }
    if (tg === 'text' && /\bdm-sdo\b/.test(e.getAttribute('class') || '') && e.hasAttribute('data-dlab')) { key.set(e, lineB[lastP]); return; }
    /* TCON OUT：主循環的緊接在自己的 SD OUT 後（o）；重複組的畫在調暗群組之後（oT），依重複組 Data 線順序 */
    if (tg === 'text' && /\bdm-tco\b/.test(e.getAttribute('class') || '') && e.hasAttribute('data-dof')) { if (afterRep && !it.rep) { if (!repP.length) throw new Error('oT 多出 TCON OUT 標籤'); key.set(e, lineB[repP.shift()]); } else key.set(e, lineB[lastP]); return; }
    if (tg === 'text' && e.hasAttribute('data-glabel')) { gIdx++; key.set(e, 'N' + (Math.floor(gIdx / NG) + 1)); return; }
    if ((tg === 'text' && e.hasAttribute('data-gsub')) || (tg === 'line' && e.hasAttribute('data-gate'))) { key.set(e, 'N' + (Math.floor(gIdx / NG) + 1)); return; }
    if (tg === 'path' && e.hasAttribute('data-w')) { const t = e.getAttribute('data-w').split(':'); key.set(e, tftOwner({ e: { getAttribute: () => t.slice(0, 3).join(':') } })); return; }
    if (tg === 'text' && items[i + 1] && key.has(items[i + 1].e) && /^N\d+M/.test(key.get(items[i + 1].e)) && items[i + 1].e.hasAttribute('data-tip')) { key.set(e, 'N' + (++rowLab)); return; }
    key.set(e, 'hdr');
  });
  /* oT（重複組的 TCON OUT 標籤，畫在 rep 群組之後、不在群組內）依序對應 repP；上面 afterRep 判斷已處理 */
  items.forEach(it => { if (it.wrap || (it.e.tagName.toLowerCase() === 'text' && it.e.hasAttribute('data-send'))) return; const k = key.get(it.e); add(k, J(rec(it.e, it.rep))); });
  /* 同一位置內：格子本體在前，其餘（TFT）排序，避免畫圖順序（不是位置）影響比對 */
  const map = {};
  Object.keys(out).forEach(k => { if (k === 'meta') { map[k] = out[k]; return; } const a = out[k]; map[k] = /^N\d+M/.test(k) ? J([a[0]].concat(a.slice(1).sort())) : (k === 'hdr' ? J(a) : J(a.slice().sort())); });
  return { map, sum };
}
module.exports = { tftLogic, GEO };
