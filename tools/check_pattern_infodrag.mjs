#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   Pattern Generator：全畫面左上角資訊框可拖曳（v3.9.0，Bruce 2026-10-22）
   需要：PLAYWRIGHT_CORE＝playwright-core 套件資料夾（沒有就 exit 2）；Chrome 用系統的（CHROME 環境變數）。
   SHOT_DIR＝截圖輸出資料夾（選用）。
   檢查（Chrome 桌機 1280×800、手機 375×667 觸控）：
   D1 預設在左上角 (1,1)、XY 座標文字
   D2 滑鼠拖到四角（故意拖出畫面外）→ 夾在可視範圍內、貼齊該角
   D3 拖到中間；拖曳全程 pattern 畫布像素不變、準星座標不變、控制面板沒被叫出
   D4 重新整理後位置保留；切換 pattern（Gray Level）位置維持；離開再進全畫面位置維持
   D5 方向鍵照常移動準星（拖曳不搶鍵盤）
   D6 雙擊回左上角並清掉記憶；↺ 按鈕（全畫面面板、頁面上的資訊框說明列）也能回左上角
   M1 手機觸控拖曳：框移動、面板沒被邊緣滑入叫出、畫布像素不變
   ═══════════════════════════════════════════════════════════════ */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { join, extname, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PWC = process.env.PLAYWRIGHT_CORE;
if (!PWC || !existsSync(PWC)) { console.error('🛑 需要 PLAYWRIGHT_CORE=<playwright-core 資料夾>'); process.exit(2); }
const { chromium } = createRequire(import.meta.url)(PWC);
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOT = process.env.SHOT_DIR || '';
if (SHOT) mkdirSync(SHOT, { recursive: true });

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml' };
const srv = createServer(async (req, res) => {
  try {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const p = normalize(join(REPO, u === '/' ? '/index.html' : u));
    if (!p.startsWith(REPO)) { res.writeHead(403); return res.end(); }
    const b = await readFile(p);
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(b);
  } catch (e) { res.writeHead(404); res.end(); }
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + srv.address().port + '/pattern.html';

let pass = 0, fail = 0;
function ok(cond, name, info) {
  if (cond) { pass++; console.log('  ✓ ' + name + (info ? '  ' + info : '')); }
  else { fail++; console.log('  ✗ ' + name + (info ? '  ' + info : '')); }
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

async function selectPattern(page, id) {
  await page.click('#pg-menu-btn');
  await page.waitForSelector('.pg-menu');
  const sel = '.pg-menu [data-menu-id="' + id + '"]';
  await page.click(sel);
  await page.waitForTimeout(150);
}
async function enterFs(page) {
  await page.click('#pg-fs-enter');
  await page.waitForTimeout(500);
}
async function fsMenuSelect(page, id) {
  await page.evaluate(() => {});
  await page.mouse.click(640, 400, { button: 'right' });
  await page.waitForSelector('.pg-menu');
  await page.click('.pg-menu [data-menu-id="' + id + '"]');
  await page.waitForTimeout(200);
}
const box = page => page.evaluate(() => {
  const el = document.getElementById('pg-info'), ov = document.getElementById('pg-fs');
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height, vw: ov.clientWidth, vh: ov.clientHeight,
           on: el.classList.contains('on'), txt: el.textContent,
           panelOpen: document.getElementById('pg-fs-panel').classList.contains('open'),
           ls: localStorage.getItem('pgInfoPos') };
});
const canvasHash = page => page.evaluate(() => {
  const c = document.getElementById('pg-fs-canvas');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < d.length; i += 1) { h ^= d[i]; h = Math.imul(h, 16777619) >>> 0; }
  return c.width + 'x' + c.height + ':' + h.toString(16);
});
// 拖曳：在框上按下 → 分段移動 → 放開前先量（面板是否被叫出）
async function drag(page, tx, ty) {
  const b = await box(page);
  const sx = b.x + b.w / 2, sy = b.y + b.h / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move((sx + tx) / 2, (sy + ty) / 2, { steps: 5 });
  await page.mouse.move(tx, ty, { steps: 8 });
  const during = await box(page);
  await page.mouse.up();
  await page.waitForTimeout(50);
  return during;
}

// ───────── 桌機 ─────────
console.log('Chrome 1280×800（桌機）');
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(BASE);
  await page.evaluate(() => localStorage.removeItem('pgInfoPos'));
  await page.reload();
  await page.waitForTimeout(300);
  await selectPattern(page, 'xy');
  await enterFs(page);
  let b = await box(page);
  ok(b.on && b.x === 1 && b.y === 1, 'D1 預設左上角 (1,1)', `(${b.x},${b.y}) "${b.txt}"`);
  ok(/^\s*\d+,\s*\d+$/.test(b.txt), 'D1 XY 座標文字', b.txt);
  const h0 = await canvasHash(page), t0 = b.txt;
  const W = b.vw, H = b.vh;

  const corners = [['左上', -60, -60], ['右上', W + 60, -60], ['右下', W + 60, H + 60], ['左下', -60, H + 60]];
  for (const [nm, tx, ty] of corners) {
    const during = await drag(page, tx, ty);
    b = await box(page);
    const inX = b.x >= 0 && b.x + b.w <= W + 0.5, inY = b.y >= 0 && b.y + b.h <= H + 0.5;
    const wantL = tx < 0, wantT = ty < 0;
    const atX = wantL ? b.x === 0 : Math.abs(b.x + b.w - W) <= 1;
    const atY = wantT ? b.y === 0 : Math.abs(b.y + b.h - H) <= 1;
    ok(inX && inY && atX && atY, 'D2 拖到' + nm + '（拖出畫面外）→ 夾在可視範圍並貼角', `(${b.x},${b.y}) ${b.w}×${b.h} / ${W}×${H}`);
    ok(!during.panelOpen, 'D3 拖到' + nm + '過程控制面板沒被叫出');
    if (SHOT && nm === '右下') await page.screenshot({ path: join(SHOT, 'desktop_br.png') });
  }
  await drag(page, W / 2, H / 2);
  b = await box(page);
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  ok(Math.abs(cx - W / 2) <= 1 && Math.abs(cy - H / 2) <= 1, 'D3 拖到中間', `中心 (${cx},${cy})`);
  ok(await canvasHash(page) === h0, 'D3 拖曳後 pattern 畫布像素不變', h0);
  ok(b.txt === t0, 'D3 準星座標不變', b.txt);
  ok(!!b.ls, 'D4 位置寫入 localStorage', b.ls);
  if (SHOT) await page.screenshot({ path: join(SHOT, 'desktop_center.png') });
  const keep = { x: b.x, y: b.y };

  // D5 方向鍵照常移動準星
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(80);
  const b5 = await box(page);
  ok(b5.txt !== t0, 'D5 方向鍵照常移動準星', t0 + ' → ' + b5.txt);
  ok(Math.abs(b5.x - keep.x) <= 1 && Math.abs(b5.y - keep.y) <= 1, 'D5 準星移動後框位置不變');

  // D4 切換 pattern
  await fsMenuSelect(page, 'gray');
  b = await box(page);
  const fx = JSON.parse(b.ls).fx, fy = JSON.parse(b.ls).fy;
  ok(b.on && Math.abs(b.x - Math.round(fx * (W - b.w))) <= 1 && Math.abs(b.y - Math.round(fy * (H - b.h))) <= 1,
     'D4 切到 Gray Level 位置維持（同比例）', `"${b.txt}" (${b.x},${b.y})`);
  await fsMenuSelect(page, 'xy');
  b = await box(page);
  ok(Math.abs(b.x - keep.x) <= 1 && Math.abs(b.y - keep.y) <= 1, 'D4 切回 XY 位置相同', `(${b.x},${b.y})`);

  // D4 離開再進全畫面
  await page.evaluate(() => document.getElementById('pg-fs-exit').click());
  await page.waitForTimeout(200);
  await enterFs(page);
  b = await box(page);
  ok(Math.abs(b.x - keep.x) <= 1 && Math.abs(b.y - keep.y) <= 1, 'D4 離開再進全畫面位置維持', `(${b.x},${b.y})`);

  // D4 重新整理
  await page.reload();
  await page.waitForTimeout(300);
  await selectPattern(page, 'xy');
  await enterFs(page);
  b = await box(page);
  ok(Math.abs(b.x - keep.x) <= 1 && Math.abs(b.y - keep.y) <= 1, 'D4 重新整理後位置保留', `(${b.x},${b.y})`);

  // D6 雙擊回左上角
  await page.mouse.dblclick(b.x + b.w / 2, b.y + b.h / 2);
  await page.waitForTimeout(80);
  b = await box(page);
  ok(b.x === 1 && b.y === 1 && b.ls === null, 'D6 雙擊回左上角並清掉記憶', `(${b.x},${b.y}) ls=${b.ls}`);

  // D6 全畫面面板 ↺
  await drag(page, 700, 500);
  await page.mouse.move(3, 300);                    // 推到左邊緣叫出面板
  await page.waitForTimeout(400);
  const open = (await box(page)).panelOpen;
  await page.click('#pg-info-reset');
  await page.waitForTimeout(80);
  b = await box(page);
  ok(open && b.x === 1 && b.y === 1 && b.ls === null, 'D6 全畫面面板 ↺ 回左上角', `panel=${open} (${b.x},${b.y})`);

  // D6 頁面說明列 ↺（先把滑鼠移回中間等面板收合，框才拿得到）
  await page.mouse.move(700, 400, { steps: 4 });
  for (let i = 0; i < 30 && (await box(page)).panelOpen; i++) await page.waitForTimeout(100);
  await page.waitForTimeout(400);                   // 面板收合動畫 .22s
  await drag(page, 700, 500);
  b = await box(page);
  ok(!!b.ls && b.x > 100, 'D6 面板收合後可再拖動', `(${b.x},${b.y}) panel=${b.panelOpen}`);
  await page.evaluate(() => document.getElementById('pg-fs-exit').click());
  await page.waitForTimeout(200);
  const hasBtn = await page.$('#pg-infoecho [data-act="info-reset"]');
  ok(!!hasBtn, 'D6 頁面說明列有 ↺（框不在預設位置時）');
  const tip = await page.textContent('#pg-infoecho');
  ok(/拖曳|drag/i.test(tip), 'D6 頁面說明列有拖曳說明', tip.replace(/\s+/g, ' ').slice(0, 80));
  if (hasBtn) await hasBtn.click();
  await page.waitForTimeout(80);
  ok(await page.evaluate(() => localStorage.getItem('pgInfoPos')) === null && !(await page.$('#pg-infoecho [data-act="info-reset"]')),
     'D6 頁面說明列 ↺ 清掉記憶');
  ok(errs.length === 0, '桌機無 JS 錯誤', errs.join(' | '));
  await ctx.close();
}

// ───────── 手機 375 觸控 ─────────
console.log('Chrome 375×667（手機觸控）');
{
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(BASE);
  await page.evaluate(() => localStorage.removeItem('pgInfoPos'));
  await page.reload();
  await page.waitForTimeout(300);
  await page.evaluate(() => {           // 手機版選單用點的
    document.getElementById('pg-menu-btn').click();
  });
  await page.waitForSelector('.pg-menu');
  await page.evaluate(() => document.querySelector('.pg-menu [data-menu-id="xy"]').click());
  await page.waitForTimeout(150);
  await page.evaluate(() => document.getElementById('pg-fs-enter').click());
  await page.waitForTimeout(500);
  let b = await box(page);
  ok(b.on && b.x === 1 && b.y === 1, 'M1 預設左上角', `(${b.x},${b.y}) "${b.txt}"`);
  const h0 = await canvasHash(page), t0 = b.txt;
  const cdp = await ctx.newCDPSession(page);
  const sx = b.x + 6, sy = b.y + b.h / 2;           // 按在框的左側（離邊緣 < 26px，原本會叫出面板）
  const tx = 200, ty = 400;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy }] });
  for (let i = 1; i <= 10; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sx + (tx - sx) * i / 10, y: sy + (ty - sy) * i / 10 }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(300);
  b = await box(page);
  ok(Math.abs(b.x - (tx - 6 + 1)) <= 2 && Math.abs(b.y + b.h / 2 - ty) <= 2, 'M1 觸控拖曳後框跟著手指', `(${b.x},${b.y})`);
  ok(!b.panelOpen, 'M1 按在框上沒有觸發邊緣滑入開面板');
  ok(await canvasHash(page) === h0 && b.txt === t0, 'M1 畫布像素與準星不變', t0);
  ok(!!b.ls, 'M1 位置記住', b.ls);
  if (SHOT) await page.screenshot({ path: join(SHOT, 'mobile_375.png') });
  // 拖出右下外
  const b2 = b;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b2.x + 5, y: b2.y + 5 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 500, y: 900 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(200);
  b = await box(page);
  ok(b.x + b.w <= b.vw + 0.5 && b.y + b.h <= b.vh + 0.5 && b.x >= 0 && b.y >= 0, 'M1 拖出畫面外會夾在可視範圍', `(${b.x},${b.y}) ${b.w}×${b.h} / ${b.vw}×${b.vh}`);
  ok(errs.length === 0, '手機無 JS 錯誤', errs.join(' | '));
  await ctx.close();
}

await browser.close();
srv.close();
console.log(`\n合計 ${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
