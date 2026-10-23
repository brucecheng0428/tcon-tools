#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   check_i2c_mbus_rom.mjs — common/i2c-mbus.js v1.2.2：ROM 類型（tcon.romType）不影響共用連線與辨認
   Bruce 2026-10-23：「不要搞得連原本的 I2C 都沒辦法連線」；Dispatch 定案：tcon.romType 不可以影響共用連線或辨認，
   EN01 Flash 的禁止導通，只留在 nbdebug「M-Bus → C-Bus 導通」那一項自己檢查（nbdebug.html，check_nbdebug 驗）。
   （v1.2／1.2.1 曾讓 flash 時 open()／session() 不送 7E:AB←CD，連 E503 也跟著不送 —— 已撤回。）
   測：rom 預設 eeprom、setRom 存 localStorage、不認得的值當 eeprom（nbdebug 那一項要用）；
       open()／session()／TconDetect.detect 在 eeprom 與 flash 下**完全一樣**：都送 7E:AB←CD（與 v1.1 相同）；
       E503 板（7C:95=24、98=00、7D:007D=04）在 flash 設定下照樣認成 E503A3。
   退出碼：0 通過／1 失敗
   ═══════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const REPO = resolve(process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), '..'));
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
  check('版本 1.2.2；預設 rom＝eeprom', M.VERSION === '1.2.2' && M.rom() === 'eeprom' && M.allowed());
  M.setRom('flash');
  check('setRom(flash) 存進 localStorage tcon.romType（給 nbdebug 那一項用）', store['tcon.romType'] === 'flash' && M.rom() === 'flash' && !M.allowed());
  store['tcon.romType'] = 'xyz';
  check('不認得的值一律當 eeprom', M.rom() === 'eeprom');
}

for (const mode of ['eeprom', 'flash']) {
  const { M } = load(); M.setRom(mode);
  const W = []; const write = async (s, aw, a, d) => { W.push([s, aw, a, d]); return { ok: true }; };
  const r = await M.open(write);
  check(`${mode}：open() 照 v1.1 送一筆 7E:AB←CD（不看 ROM 類型）`, r.ok && !r.skipped && W.length === 1 && is7E(W[0]), JSON.stringify(W));
  const S = []; const ss = M.session(async o => { S.push(o); return { ok: true, data: [0] }; });
  await ss.send({ type: 'open' }); await ss.send({ type: 'read', slave: 0x7C, addr: 0x95, len: 1, awid: 1 }); await ss.send({ type: 'read', slave: 0x7C, addr: 0x98, len: 1, awid: 1 });
  check(`${mode}：session 第一次讀之前補送 7E:AB←CD、之後不重送`, S.length === 4 && S[1].type === 'rawwrite' && S[1].slave === 0x7E && S[1].addr === 0xAB && S[1].data[0] === 0xCD && S.filter(o => o.type === 'rawwrite').length === 1, JSON.stringify(S));
}

/* TconDetect.detect：flash 設定也照常導通；E503 板照樣認成 E503A3、EN01 板照樣認成 EN01 */
const BOARDS = {
  E503: { '124:149': 0x24, '124:152': 0x00, '62:8318': 0x00, '125:125': 0x04 },   /* 2026-10-23 Windows 測試機 I2C 治具實測值 */
  EN01: { '62:8318': 0x10 }
};
for (const mode of ['eeprom', 'flash']) for (const b of Object.keys(BOARDS)) {
  const { ctx, M } = load(); M.setRom(mode);
  const D = []; const mem = BOARDS[b];
  ctx.__io = { read: async (s, aw, a) => (mem[s + ':' + a] != null ? [mem[s + ':' + a]] : (s >= 0x60 ? [0xFF, 0xFF, 0xFF] : [0xFF])),
               write: async (s, aw, a, d) => { D.push([s, aw, a, d]); return { ok: true }; } };
  const r = await vm.runInContext('TconDetect.detect(__io, {})', ctx);
  const n7e = D.filter(is7E).length, want = b === 'E503' ? /^E503A3$/ : /^EN01$/;
  check(`TconDetect.detect（rom=${mode}、${b} 板）：有送 7E:AB←CD、認成 ${b === 'E503' ? 'E503A3' : 'EN01'}`, n7e >= 1 && want.test(r && r.name || ''), n7e + ' ' + JSON.stringify(r && { name: r.name, isE503: r.isE503 }));
}

console.log(`\n${fail ? '✗' : '✓'} check_i2c_mbus_rom：${pass} 通過、${fail} 失敗`);
process.exit(fail ? 1 : 0);
