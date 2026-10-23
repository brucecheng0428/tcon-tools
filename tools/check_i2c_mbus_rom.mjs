#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   check_i2c_mbus_rom.mjs — common/i2c-mbus.js v1.2：Flash 應用不下 M-Bus 導通 C-Bus（Bruce 2026-10-23）
   Bruce 原話：「EN01 還有特別注意一下：它要先判斷目前之應用是否為 Flash，如果是 Flash 的話就不可以用這個
   導通方式，如果是 EEPROM 才可以用 M-Bus 導通 C-Bus 的這種方式。」
   判斷方式比照瑞鼎 UI（使用者選 ROM 類型，預設 EEPROM）：全站共用 localStorage tcon.romType。
   測：預設 eeprom；open()／session() 在 eeprom 下送一筆 7E:AB←CD、flash 下一筆都不送（含 TconDetect.detect
   的兩次導通）；切回 eeprom＋新連線又會送；設定存在 localStorage、別的值一律當 eeprom；autoText 寫明原因。
   退出碼：0 通過／1 失敗
   ═══════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? pass++ : fail++; console.log((ok ? '✓ ' : '✗ ') + n + (!ok && d ? '  ' + d : '')); };

function load() {
  const store = {};
  const ctx = { console, Promise, setTimeout, clearTimeout, I18N: {},
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } } };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(readFileSync(join(REPO, 'common/i2c-mbus.js'), 'utf8'), ctx);
  vm.runInContext(readFileSync(join(REPO, 'common/tcon-detect.js'), 'utf8'), ctx);
  return { ctx, store, M: ctx.TconMbus };
}
const is7E = w => w[0] === 0x7E && w[2] === 0xAB && JSON.stringify(w[3]) === '[205]';

{
  const { M, store } = load();
  check('預設 rom＝eeprom（同瑞鼎 UI 預設）、allowed', M.rom() === 'eeprom' && M.allowed() && M.VERSION === '1.2.1');
  const W = []; const write = async (s, aw, a, d) => { W.push([s, aw, a, d]); return { ok: true }; };
  let r = await M.open(write);
  check('eeprom：open() 送一筆 7E:AB←CD', r.ok && !r.skipped && W.length === 1 && is7E(W[0]), JSON.stringify(W));
  M.setRom('flash'); W.length = 0;
  check('setRom(flash) 存進 localStorage tcon.romType', store['tcon.romType'] === 'flash' && M.rom() === 'flash' && !M.allowed());
  r = await M.open(write);
  check('flash：open() 不送、回 ok＋skipped=flash', r.ok && r.skipped === 'flash' && W.length === 0, JSON.stringify(r));
  check('flash：autoText 寫明 Flash 不送', /not sent: ROM type = Flash/.test(M.autoText(r)));
  /* session */
  const S = []; const send = async o => { S.push(o); return { ok: true, data: [0x10] }; };
  const logs = []; const ss = M.session(send, { log: x => logs.push(x) });
  await ss.send({ type: 'open' }); await ss.send({ type: 'read', slave: 0x3E, addr: 0x207E, len: 1, awid: 2 }); await ss.send({ type: 'read', slave: 0x3E, addr: 0x207E, len: 1, awid: 2 });
  check('flash：session 第一次讀之前不補送 7E', !S.some(o => o.type === 'rawwrite' && o.slave === 0x7E) && S.filter(o => o.type === 'read').length === 2, JSON.stringify(S));
  check('flash：session log 一次 skipped', logs.length === 1 && logs[0].skipped === 'flash');
  M.setRom('eeprom');
  const S2 = []; const ss2 = M.session(async o => { S2.push(o); return { ok: true, data: [0] }; });
  await ss2.send({ type: 'open' }); await ss2.send({ type: 'read', slave: 0x3E, addr: 0, len: 1, awid: 2 });
  check('切回 eeprom＋新連線：session 先送 7E:AB←CD 再讀', S2.length === 3 && S2[1].type === 'rawwrite' && S2[1].slave === 0x7E && S2[1].addr === 0xAB && S2[1].data[0] === 0xCD && S2[2].type === 'read', JSON.stringify(S2));
  store['tcon.romType'] = 'xyz';
  check('不認得的值一律當 eeprom', M.rom() === 'eeprom');
}
/* TconDetect.detect 經 TconMbus：flash 時整個辨認過程沒有 7E 寫入；eeprom 時有 */
for (const mode of ['flash', 'eeprom']) {
  const { ctx, M } = load(); M.setRom(mode);
  const D = [];
  ctx.__io = { read: async (s, aw, a) => (s === 0x3E && a === 0x207E ? [0x10] : [0xFF]), write: async (s, aw, a, d) => { D.push([s, aw, a, d]); return { ok: true }; } };
  const r = await vm.runInContext('TconDetect.detect(__io, {})', ctx);
  const n7e = D.filter(is7E).length;
  check(`TconDetect.detect（${mode}）：7E:AB←CD ${mode === 'flash' ? '0 筆' : '≥1 筆'}、仍認到 EN01`, (mode === 'flash' ? n7e === 0 : n7e >= 1) && /EN01/.test(r && (r.name || r.family) || ''), n7e + ' ' + JSON.stringify(r && { name: r.name, family: r.family }));
}
console.log(`\n${fail ? '✗' : '✓'} check_i2c_mbus_rom：${pass} 通過、${fail} 失敗`);
process.exit(fail ? 1 : 0);
