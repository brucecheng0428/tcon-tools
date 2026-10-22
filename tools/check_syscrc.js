#!/usr/bin/env node
/* check_syscrc.js — EM01／EM02 SYS CRC 第二道確認固定測試（v1.0.0，2026-10-14）
   測 common/syscrc.js（頁面共用同一份）＋ datamap-core parseCode 帶出的 sysCrc。
   客戶 code 不進版控：讀本機 ~/TCON、~/BOEMNT 的固定檔；缺檔算 fail（固定測試不可悄悄跳過）。 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const SC = require(path.join(ROOT, 'common/syscrc.js'));
const DM = require(path.join(ROOT, 'common/datamap-core.js'));
const H = process.env.HOME;
/* 本機資料夾名含人名，原始碼不寫：路徑中含 * 的那一段在上層資料夾找第一個符合的（2026-10-22 改寫歷史清人名） */
const globDir = p => { const s = p.split('/'); for (let i = 0; i < s.length; i++) if (s[i].includes('*')) { const up = s.slice(0, i).join('/') || '/'; const re = new RegExp('^' + s[i].split('*').map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.+') + '$'); let hit = null; try { hit = require('fs').readdirSync(up).sort().find(n => re.test(n)); } catch (e) {} if (!hit) return p; s[i] = hit; } return s.join('/'); };
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('FAIL', m); } }

const CASES = [
  { n: '同事B RM80103 EM02', f: 'TCON/客戶/DG_tool_error_*_20261013/RM80103.PC_newcode.v2_EEPROM64K_CKS_02AA7A_CKS_02AB45.bin', m: 'EM02', want: 'match' },
  { n: 'BOE B10B18 GoldenCheck_CKS_2ACFF EM02', f: 'BOEMNT/BOE_B10_B18_27.0_QHD_100Hz_2port_3pair_mLVDS(RM80103.PC_EM02_*)/Code/05_提供客戶版本/RM80103.PC_BOE_B10B18_QHD100_(Final03_DCLK416Hz_pll_spread2_1_VS.script)BIST100HZ__from__2ACDD_GoldenCheck_CKS_2ACFF.bin', m: 'EM02', want: 'match' },
  { n: 'EM01 EEPROM BOE FHD320', f: 'BOEMNT/(驗證)BOE_B4_27.0_FHD_320Hz_2port_6pair_mLVDS(RM80203.PB_EM01_Flash_*)/Code/InitialCode/RM80100_BOE_FHD320_EEPROM_Initial_CKS_05B313_20260409131844.bin', m: 'EM01', want: 'match' },
  { n: 'EM01 Flash SN314GU02', f: 'TCON/TCON_UI/CheckListTool/MNT_BinComparator/SN314GU02_RM80100_75HZ(TEST1-Base_3E14D3_POL_ST_2200)_CKS_3E1742_20260804170528.bin', m: 'EM01', want: 'match' },
  { n: 'V512 MV27 (EM02 定位)', f: 'TCON/TCON_UI/V512/Raydium_TCON_Tool_v1.1.8.exe/MV27_V512_CKS_02D02B.BIN', m: 'EM02', want: 'blank' },
  { n: 'NT71855 NB（被判成 EM01 Flash）', f: 'TCON/Model/BOE/NB/BOE14.0_E501B2(驗證Driver)/Code/NT71855_BOE_BOE14.0(VerifyDriver)_EDID(8_93h)_CKS(6C63C2h)_(ORI_NVT)_20220817.bin', m: 'EM01', want: 'mismatch', notRd: true }
];
for (const c of CASES) {
  const p = globDir(path.join(H, c.f));
  if (!fs.existsSync(p)) { ok(false, c.n + '：缺檔 ' + p); continue; }
  const b = new Uint8Array(fs.readFileSync(p));
  const r = SC.sysCrcCheck(b, c.m);
  ok(r && r.status === c.want, c.n + '：syscrc ' + (r && r.status) + ' ≠ ' + c.want);
  if (c.notRd !== undefined) ok(r && r.notRaydium === c.notRd, c.n + '：notRaydium ' + (r && r.notRaydium));
  const d = DM.parseCode(b, c.m, path.basename(p));
  ok(d.ok && d.model === c.m, c.n + '：parseCode 型號 ' + d.model + ' ' + d.reason);
  ok(d.sysCrc && d.sysCrc.status === c.want, c.n + '：parseCode.sysCrc ' + (d.sysCrc && d.sysCrc.status));
  console.log((r && r.status === c.want ? '✓ ' : '✗ ') + c.n.padEnd(36) + ' ' + (r && r.status) + '  stored=' + (r && r.stored.toString(16)) + ' calc=' + (r && r.calc.toString(16)) + (r && r.notRaydium ? '  notRaydium' : ''));
}
/* 合成：改 1 byte ⇒ mismatch；E512／NB 型號 ⇒ null（沒有 SYS CRC，不做機種特例） */
{
  const b = new Uint8Array(fs.readFileSync(globDir(path.join(H, CASES[0].f))));
  b[0x10] ^= 1;
  const r = SC.sysCrcCheck(b, 'EM02');
  ok(r.status === 'mismatch' && !r.notRaydium, '改 1 byte 應 mismatch、非 notRaydium');
  ok(SC.sysCrcCheck(b, 'E512') === null && SC.sysCrcCheck(b, 'E501A') === null, 'E512／NB 不檢查');
  const z = new Uint8Array(0x200); z[0x88] = 0xFF; z[0x89] = 0xFF;
  ok(SC.sysCrcCheck(z, 'EM02').status === 'blank', 'FFFF ⇒ blank');
}
console.log('check_syscrc: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
