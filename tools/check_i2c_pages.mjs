#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   check_i2c_pages.mjs — 全站 I2C 頁一律走共用導通（common/i2c-mbus.js）與共用辨認（common/tcon-detect.js）
   Bruce 2026-10-22：「所有用到 I2C 的網頁都應該要修正喔，你有做到嗎？」（聊天室派工 238973630923444224）
   放在 Pages 發佈關卡（.github/workflows/pages.yml），掃「去註解後」的發佈內容；任一項失敗就不發佈。
     P  頁面分類：根目錄每個 *.html、common／data 的 js ——
          會開 I2C and AUX Bridge 連線（new WebSocket）＝I2C 頁；只載 i2c-bridge.js、不開連線＝只放下載連結（要列在 DOWNLOAD_ONLY 並寫理由）。
          載了 i2c-bridge.js 卻不在這兩類 ⇒ 失敗。
     M  每個 I2C 頁：載入 common/i2c-mbus.js 與 common/tcon-detect.js；有 TconMbus.session(…)；
          每一個直接 ws.send(JSON.stringify(…)) 的函式，都必須是交給 TconMbus.session 的那一支，
          或只在 TconMbus 的 ensure(…) 之後才被呼叫（i2c.html 的 batchwrite）⇒ 不會有訊息繞過「先導通再讀寫」。
     D  每個 I2C 頁都呼叫 TconDetect（辨認／掃描只用共用的）；自建辨認表另由 check_tcon_detect_single.mjs 擋。
     U  TconMbus.session 單元測試（node）：連線後第一次讀寫前送 7E:AB←CD、自己下的那一筆不重複、open／close 歸零、
          失敗（NACK）不中止只送一次、只送 ping／open 不送。
     X  TconDetect：7D:007D 0～255 × 3E:207E 0～255（7C:98＝0）全掃，自動辨認從不回 DAZ6138／6139；ALL_NAMES 沒有 6138／6139；EN01 判 EN01。
   用法：node tools/check_i2c_pages.mjs <去註解後的目錄，例如 _site>
         node tools/check_i2c_pages.mjs --repo .
   退出碼：0 通過／1 失敗
   ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const args = process.argv.slice(2);
let dir = args[0] || '_site';
if (args[0] === '--repo') {
  const repo = path.resolve(args[1] || '.');
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'i2cpages-'));
  execFileSync(process.execPath, [path.join(repo, 'tools/build/strip-comments.mjs'), repo, dir], { stdio: 'ignore' });
}
dir = path.resolve(dir);
let pass = 0, fail = 0; const fails = [];
const ok = (c, m, d) => { c ? pass++ : fail++; if (!c) fails.push(m + (d ? '  ' + d : '')); console.log((c ? '  ✓ ' : '  ✗ ') + m + (c ? '' : '  ' + (d || ''))); };

/* 只放下載連結、不碰 I2C 的頁（一頁一個理由） */
const DOWNLOAD_ONLY = {
  'dg.html': 'DG 主頁只放 I2C and AUX Bridge 下載連結；I2C 連線活在 dg-selftest 分頁（dg.html 把要寫的內容傳給那一頁）',
};
/* 開 WebSocket 但不是 I2C and AUX Bridge 的（目前沒有） */
const NOT_BRIDGE_WS = {};

const files = [];
(function walk(d, rel) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) { if (!rel && /^(common|data)$/.test(e.name)) walk(path.join(d, e.name), r); else if (rel) walk(path.join(d, e.name), r); }
    else if ((!rel && /\.html$/.test(e.name)) || (rel && /\.js$/.test(e.name))) files.push(r);
  }
})(dir, '');

const SEND_RE = /\.send\(\s*JSON\.stringify\(/g;
const META_TYPES = ['ping', 'open', 'close', 'note', 'abortwrite', 'chandiag'];   /* 與 common/i2c-mbus.js 的 META 相同：不碰 I2C 匯流排 */
const i2cPages = [], dlPages = [];
console.log('P／M／D 頁面掃描（' + files.length + ' 個發佈檔）');
for (const f of files) {
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  const loadsBridge = /src=["'][^"']*common\/i2c-bridge\.js/.test(src);
  const opensWs = /new\s+WebSocket\s*\(/.test(src);
  if (f.startsWith('common/') || f.startsWith('data/')) {
    if (opensWs && f !== 'common/i2c-mbus.js') ok(false, `${f}：共用 js 自己開 WebSocket（I2C 連線只能在頁面裡、經 TconMbus.session）`);
    continue;
  }
  if (opensWs && NOT_BRIDGE_WS[f]) { console.log(`  · ${f}：WebSocket 不是 I2C and AUX Bridge（${NOT_BRIDGE_WS[f]}）`); continue; }
  if (!opensWs) {
    if (loadsBridge) {
      if (DOWNLOAD_ONLY[f]) { dlPages.push(f); ok(!SEND_RE.test(src), `${f}：只放下載連結（${DOWNLOAD_ONLY[f]}），沒有 I2C 傳輸`); SEND_RE.lastIndex = 0; }
      else ok(false, `${f}：載了 common/i2c-bridge.js 卻沒開 I2C 連線，也不在 DOWNLOAD_ONLY（要嘛走共用導通、要嘛寫明只放下載連結的理由）`);
    }
    continue;
  }
  i2cPages.push(f);
  ok(/src=["'][^"']*common\/i2c-mbus\.js/.test(src), `${f}：載入 common/i2c-mbus.js`);
  ok(/src=["'][^"']*common\/tcon-detect\.js/.test(src), `${f}：載入 common/tcon-detect.js`);
  ok(loadsBridge, `${f}：載入 common/i2c-bridge.js（連線位址／下載提示同一份）`);
  const sess = [...src.matchAll(/TconMbus\.session\(\s*([A-Za-z0-9_$]+)/g)].map(m => m[1]);
  ok(sess.length > 0, `${f}：有 TconMbus.session(…)（連線後第一次讀寫前先導通）`, '找不到');
  /* 每個 ws.send(JSON.stringify( 的所在函式 */
  let m, n = 0; SEND_RE.lastIndex = 0;
  while ((m = SEND_RE.exec(src))) {
    n++;
    const before = src.slice(0, m.index);
    const fm = [...before.matchAll(/function\s+([A-Za-z0-9_$]+)\s*\(/g)].pop();
    const name = fm ? fm[1] : '?';
    const viaEnsure = new RegExp('\\.ensure\\([^)]*\\)\\s*\\.then\\(\\s*function\\s*\\(\\s*\\)\\s*\\{\\s*return\\s+' + name.replace(/\$/g, '\\$') + '\\(').test(src);
    const line = before.split('\n').length;
    const lit = src.slice(m.index).match(/^\.send\(\s*JSON\.stringify\(\s*\{\s*type\s*:\s*['"]([a-z_]+)['"]/);
    if (lit && META_TYPES.includes(lit[1])) { ok(true, `${f}:${line}：直接送 ${lit[1]}（不碰 I2C 匯流排，不需導通）`); continue; }
    ok(sess.includes(name) || viaEnsure, `${f}:${line}：送訊息的 ${name}() 經過 TconMbus.session` + (viaEnsure ? '（ensure 之後才送）' : ''),
       `${name} 沒有交給 TconMbus.session，也不是在 ensure() 之後才呼叫 ⇒ 可能繞過「先導通再讀寫」`);
    /* 交給 session 的 raw 函式，只能被 session 用（頁面其他地方不可直接呼叫 raw 送 I2C） */
    if (sess.includes(name)) {
      const calls = [...src.matchAll(new RegExp('(?<![A-Za-z0-9_$.])' + name.replace(/\$/g, '\\$') + '\\s*\\(', 'g'))].length;
      const decl = [...src.matchAll(new RegExp('function\\s+' + name.replace(/\$/g, '\\$') + '\\s*\\(', 'g'))].length;
      /* i2c v1.38.0 例外（只限 DP AUX）：原廠 EN01 UI 的 AUX 沒有「第一次讀寫前先送 7E:AB←CD」（只在讀 7C／7D 時 MbusConnect，
         bridge 1.22.0 照做），Bruce 2026-10-23「那就依照原廠 UI 的行為吧」。只放行 i2ctSend 第一行這一處：
         `function i2ctSend(obj){ if (i2ctXport === 'aux') return i2ctSendRaw(obj);`，I2C 治具照舊經 session。 */
      const okAux = (name === 'i2ctSendRaw' && /function i2ctSend\(obj\)\{ if \(i2ctXport === 'aux'\) return i2ctSendRaw\(obj\); return i2ctMbus\(\)\.send\(obj\); \}/.test(src)) ? 1 : 0;
      ok(calls - decl - okAux === 0, `${f}：${name}() 只交給 TconMbus.session，頁面沒有直接呼叫` + (okAux ? `（DP AUX 只讀例外 ${okAux} 處）` : ''), `直接呼叫 ${calls - decl - okAux} 處`);
    }
  }
  ok(n > 0, `${f}：找得到送訊息的地方`, '0 處');
  ok(/TconDetect\.(detect|scanIcId|matchIcId|readEn01Ver|e501ByRom)\s*\(/.test(src), `${f}：辨認／掃描呼叫共用的 TconDetect`);
}
ok(i2cPages.length >= 4, `I2C 頁 ${i2cPages.length} 頁：${i2cPages.join('、')}`, '少於 4 頁（i2c／datamap／dg-selftest／nbdebug）——是不是掃錯目錄？');
console.log(`  · 只放下載連結：${dlPages.join('、') || '無'}`);

/* ── U：TconMbus.session 單元測試 ── */
console.log('U TconMbus.session（common/i2c-mbus.js）');
const req = createRequire(import.meta.url);
const mbusPath = path.join(dir, 'common/i2c-mbus.js'), detPath = path.join(dir, 'common/tcon-detect.js');
delete globalThis.TconMbus; delete globalThis.TconDetect;
req(mbusPath); const TM = globalThis.TconMbus;
ok(TM && typeof TM.session === 'function', 'TconMbus.session 存在');
if (!(TM && typeof TM.session === 'function')) {
  console.log(`\n✗ check_i2c_pages：${pass} pass / ${fail} fail（common/i2c-mbus.js 沒有 TconMbus.session）\n失敗：\n  - ` + fails.join('\n  - '));
  process.exit(1);
}
const is7E = x => x.type === 'rawwrite' && x.slave === 0x7E && x.addr === 0xAB && x.data.length === 1 && x.data[0] === 0xCD;
function fakeSend(nack) {
  const log = [];
  const send = async (o) => { log.push(JSON.parse(JSON.stringify(o))); if (nack && o.type === 'rawwrite' && o.slave === 0x7E) return { ok: false, err: 'NACK' }; return { ok: true, data: [0] }; };
  return { log, send };
}
{
  const f = fakeSend(); let nlog = 0; const s = TM.session(f.send, { log: () => nlog++ });
  await s.send({ type: 'ping' }); await s.send({ type: 'open' });
  ok(f.log.length === 2 && !f.log.some(is7E), '只送 ping／open ⇒ 不送 7E:AB←CD');
  await s.send({ type: 'read', slave: 0x3E, addr: 0x207E, len: 1, awid: 2 });
  ok(f.log.length === 4 && is7E(f.log[2]) && f.log[3].type === 'read', '第一次 read 前先送 7E:AB←CD', JSON.stringify(f.log.map(x => x.type + ':' + (x.slave || ''))));
  await s.send({ type: 'rawwrite', slave: 0x3E, addr: 0x10, data: [1], awid: 2 }); await s.send({ type: 'read', slave: 0x7C, addr: 0x95, len: 1, awid: 1 });
  ok(f.log.filter(is7E).length === 1 && nlog === 1, '同一次連線之後的讀寫不再重送');
  await s.send({ type: 'close' }); await s.send({ type: 'open' }); await s.send({ type: 'write', slave: 0x68, addr: 0x13, data: [0] });
  ok(f.log.filter(is7E).length === 2 && is7E(f.log[f.log.length - 2]), 'close／open（重連）後第一次 write 前再送一次');
}
{
  const f = fakeSend(); const s = TM.session(f.send);
  await s.send({ type: 'open' }); await s.send({ type: 'rawwrite', slave: 0x7E, addr: 0xAB, data: [0xCD], awid: 1 }); await s.send({ type: 'read', slave: 0x7C, addr: 0x95, len: 1 });
  ok(f.log.filter(is7E).length === 1, '頁面自己下的 7E:AB←CD（Check T-CON／TconDetect）不重複');
}
{
  const f = fakeSend(true); let last = null; const s = TM.session(f.send, { log: r => { last = r; } });
  await s.send({ type: 'open' });
  const r1 = await s.send({ type: 'read', slave: 0x60, addr: 0xFF00, len: 3 }); await s.send({ type: 'read', slave: 0x68, addr: 0xFF00, len: 3 });
  ok(r1 && r1.ok && f.log.filter(is7E).length === 1 && last && last.ok === false, 'NACK（沒有 M-Bus 的板子）不中止，只送一次、記一次 log');
}
{
  const f = fakeSend(); const s = TM.session(f.send);
  await s.send({ type: 'open' });
  await Promise.all([s.send({ type: 'read', slave: 1, addr: 1, len: 1 }), s.send({ type: 'read', slave: 2, addr: 2, len: 1 })]);
  ok(f.log.filter(is7E).length === 1 && is7E(f.log[1]), '同時兩筆讀取 ⇒ 只送一次 7E，且在兩筆之前');
}
{
  const f = fakeSend(); const s = TM.session(f.send); const o = { type: 'batchwrite', slave: 0x50, addr: 0, data: [1, 2] };
  await s.send({ type: 'open' }); await s.ensure(o); ok(f.log.length === 2 && is7E(f.log[1]), 'ensure(batchwrite) 先送 7E（i2c.html 的長命令）');
}

/* ── X：TconDetect 不回 6138／6139 ── */
console.log('X TconDetect（common/tcon-detect.js）');
req(detPath); const TD = globalThis.TconDetect;
ok(!TD.ALL_NAMES.some(n => /613[89]/.test(n)), 'ALL_NAMES 沒有 DAZ6138／6139');
let bad613 = 0, en01 = 0, en01Want = 0, total = 0, mbusFirst = 0;
for (let v7d = 0; v7d < 256; v7d++) for (const b207e of [0x00, 0x0A, 0x10, 0x11, 0x1F, 0x20, 0xFF]) {
  total++;
  const mem = { '7C:95': 0x22, '7C:98': 0, '7D:7D': v7d, '3E:207E': b207e }, seq = [];
  const k = (s, a) => s.toString(16).toUpperCase() + ':' + a.toString(16).toUpperCase();
  const io = { read: async (s, aw, a, n) => { seq.push('R'); if (a === 0xFF00) return [0, 0, 0]; return [mem[k(s, a)] ?? 0]; },
               write: async (s, aw, a, d) => { seq.push(s === 0x7E && a === 0xAB && d[0] === 0xCD ? 'M' : 'W'); return { ok: true }; } };
  const r = await TD.detect(io, {});
  if (seq[0] === 'M') mbusFirst++;
  const names = [r.name || ''].concat(r.alts || []);
  if (r.family === 'DAZ613x' || (!r.unknown && names.some(n => /613[89]/.test(n))) || (r.name && /613[89]/.test(r.name))) bad613++;
  if (b207e === 0x10 || b207e === 0x11) { en01Want++; if (r.family === 'EN01' || (r.alts || []).includes('EN01')) en01++; }
}
ok(bad613 === 0, `自動辨認 ${total} 組（7D:007D 0～255 × 3E:207E 7 種）從不回 DAZ6138／6139`, `${bad613} 組回 613x`);
ok(en01 === en01Want, `3E:207E＝10／11 的 ${en01Want} 組都判 EN01（或列在 EN01 候選）`, `${en01}/${en01Want}`);
ok(mbusFirst === total, `每一組辨認的第一筆都是 7E:AB←CD（${mbusFirst}/${total}）`);

console.log(`\n${fail ? '✗' : '✓'} check_i2c_pages：${pass} pass / ${fail} fail（I2C 頁 ${i2cPages.length}：${i2cPages.join('、')}；只放下載連結：${dlPages.join('、') || '無'}）`);
if (fail) { console.log('失敗：\n  - ' + fails.join('\n  - ')); process.exit(1); }
