/* ═══════════════════════════════════════════════════════════════════════════
   i2c-spiflash.js — 經 TCON 讀寫外部 SPI Flash（i2c.html「外部 Flash（經 TCON）」模式）
   ───────────────────────────────────────────────────────────────────────────
   i2c v1.29.0（2026-10-06）。依據：outputs/I2C_外部SPIFlash_原廠查證與規劃_20261006.md。
   i2c v1.30.0（2026-10-06）：EN01 寫入／Erase All（outputs/EN01_flash_write_seq_20261006.md）。
   Bruce 10/6：「不是 TCON 內部的 Flash…是去抓 TCON 外部 Flash 的 code，只是需要透過 TCON」
              「Slave Address 一定要設對」。

   🔴 本檔只做「照原廠序列送哪些 I2C 交易」，不碰畫面。傳輸層由呼叫端注入：
        io.w(slave7, awid, addr, bytes)   一筆寫入（失敗要 throw）
        io.r(slave7, awid, addr, len)     一筆讀取，回 byte 陣列（失敗要 throw）
        io.sleep(ms)
      slave 一律 7-bit，直接交給 DLL_I2C_BCB 的 SendBytesEx／GetBytesEx，不左移
      （tools/i2c-bridge/i2c_bridge.c:898、1167；原廠 PY/C#/C++ 傳的也是這些值）。
      tools/i2c_spiflash_selftest.js 用假後端錄下每一筆交易，逐筆對原廠原始碼。

   原廠來源代號（行號為原始碼行號）：
     PY  = ~/TCON/TCON_UI/Raydium_RomCodeProcessUI/SourceCode_V5.0.4/RomCodeProcessUI.py
     EMF = VCL_TV_TCON_EM01_Tool@cb1c147 App/Flash/RApp_Flash.cpp
     EMT = 同上 App/Thread/RApp_Thread.cpp；EMS = 同上 SDIMAIN.cpp；EMH = App/Flash/RApp_Flash.h
     BH  = 同上 App/BIN_Header/RApp_BIN_Header.cpp
     FMo = WPF_RomCodeProcessUI@cf2c8de Wpf.RomCodeProcessUI/Modules/FlashModule.cs
     RCIo= WPF_RomCodeProcessUI@7c1ccd3~1 Wpf.RomCodeProcessUI/Models/RomCodeInfo.cs
     CL  = WPF_RomCodeProcessUI@acdb7f9 RomCodeProcessUI.ChangeLog.html
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  var SECTOR = 0x1000, PAGE = 0x100;

  function SfError(key, vars) { var e = new Error(key); e.sfKey = key; e.sfVars = vars || {}; return e; }
  function hx(v, w) { var s = (v >>> 0).toString(16).toUpperCase(); while (s.length < (w || 2)) s = '0' + s; return s; }
  function zeros(n) { var a = []; for (var i = 0; i < n; i++) a.push(0); return a; }
  function eq(a, b) { if (!a || !b || a.length !== b.length) return false; for (var i = 0; i < a.length; i++) if ((a[i] & 0xFF) !== (b[i] & 0xFF)) return false; return true; }
  function firstDiff(a, b) { var n = Math.min(a.length, b.length); for (var i = 0; i < n; i++) if ((a[i] & 0xFF) !== (b[i] & 0xFF)) return i; return n; }
  function noop() {}
  function ctxOf(o) {
    o = o || {};
    return { log: o.log || noop, progress: o.progress || noop, aborted: o.aborted || function () { return false; } };
  }

  /* ═══ JEDEC 清單 ═══════════════════════════════════════════════════════════
     名稱取 EMH:114–178（EM01 的 astFlashID[]，涵蓋 PY:2559–2598 的全部條目）。
     🔴 容量**不照抄**任一張表：PY 的 PUYA／GigaDevice 與 EMH 的 PUYA／GigaDevice／Fudan
        把 bit 數寫成 byte 數（例：P25Q05U＝512 Kbit＝64 KB，PY:2590 寫 512K Bytes、
        EMH:150 寫 0x80000）。改用 JEDEC 第三個 byte（容量碼）＝ 2^n byte，
        這條規則與兩張表裡 Winbond／MXIC／Boya 的每一筆都相符。 */
  var JEDEC_NAMES = {
    'EF3010': 'Winbond W25X05CL', 'EF3011': 'Winbond W25X10CL', 'EF3012': 'Winbond W25X20CL',
    'EF3013': 'Winbond W25X40CL', 'EF3014': 'Winbond W25X80CL', 'EF4013': 'Winbond W25Q40BL',
    'EF4014': 'Winbond W25Q80BL', 'EF4015': 'Winbond W25Q16BV', 'EF4016': 'Winbond W25Q32BV',
    'EF4017': 'Winbond W25Q64CV', 'EF4018': 'Winbond W25Q128FV', 'EF4019': 'Winbond W25Q256FV',
    'EF5012': 'Winbond W25Q20BW', 'EF5013': 'Winbond W25Q40BW', 'EF5014': 'Winbond W25Q80BW',
    'EF6012': 'Winbond W25Q20EW', 'EF6013': 'Winbond W25Q40EW', 'EF6014': 'Winbond W25Q80EW',
    'EF6015': 'Winbond W25Q16FW', 'EF6016': 'Winbond W25Q32FW', 'EF6017': 'Winbond W25Q64FW',
    'EF6018': 'Winbond W25Q128FV (QPI)', 'EF6019': 'Winbond W25Q256FV (QPI)',
    'C22810': 'MXIC MX25R512F', 'C22811': 'MXIC MX25R1035F', 'C22812': 'MXIC MX25R2035F',
    'C22813': 'MXIC MX25R4035F', 'C22814': 'MXIC MX25R8035F', 'C22815': 'MXIC MX25R1635F',
    'C22816': 'MXIC MX25R3235F', 'C22817': 'MXIC MX25R6435F',
    '856010': 'PUYA P25Q05U', '856011': 'PUYA P25Q10U', '856012': 'PUYA P25Q20U', '856013': 'PUYA P25Q40U',
    '856014': 'PUYA P25Q80SH', '856015': 'PUYA P25Q16SH', '856016': 'PUYA P25Q32SH', '856017': 'PUYA P25Q64SH',
    'C86010': 'GigaDevice GD25LE05C', 'C86011': 'GigaDevice GD25LE10C', 'C86012': 'GigaDevice GD25LE20C',
    'C86013': 'GigaDevice GD25LE40C',
    'A13111': 'Fudan FM25F01C', 'A13112': 'Fudan FM25F02C', 'A14013': 'Fudan FM25Q04B', 'A14014': 'Fudan FM25Q08B',
    'A14015': 'Fudan FM25Q16B', 'A14016': 'Fudan FM25Q32BI3', 'A14017': 'Fudan FM25Q64AI3',
    '681014': 'Boya BY25Q80AW', '681015': 'Boya BY25Q16AW', '681016': 'Boya BY25Q32BS',
    '684017': 'Boya BY25Q64BS', '684018': 'Boya BY25Q128AS', '684019': 'Boya BY25Q256AS'
  };
  function jedecInfo(id3) {
    var key = hx(id3[0]) + hx(id3[1]) + hx(id3[2]);
    var allSame = (id3[0] === id3[1] && id3[1] === id3[2]) && (id3[0] === 0x00 || id3[0] === 0xFF);
    var c = id3[2] & 0xFF;
    /* 容量碼 0x10（64 KB）～0x19（32 MB）才算得出容量；24-bit 位址最多 16 MB。 */
    var size = (c >= 0x10 && c <= 0x19) ? Math.pow(2, c) : 0;
    return { id: key, name: JEDEC_NAMES[key] || '', known: !!JEDEC_NAMES[key], size: size, blank: allSame };
  }

  /* ═══ E501A（RM81010）／E501B（RM81011）— 依 PY ═════════════════════════════
     slave：0x3E（2-byte offset，SPI master 控制）、0x7C（1-byte，狀態／init）、
            0x64（1-byte，Flash 資料埠）、0x7D（2-byte，E501B 的 JEDEC 讀出）。 */
  var E501 = {
    /* PY:33501–33521 i2c_flash_check_ic_version。7C:98≠0 ⇒ E501 系列；7C:95 ⇒ 0x00 RM81010、0x40/0x41 RM81011。
       🔴 原廠依讀到的 ID 自動換流程；網頁是使用者先選型號，所以讀到的和選的不同就擋下（安全防呆，不是 Flash 指令）。 */
    check: async function (io, wantA) {
      var id = (await io.r(0x7C, 1, 0x95, 1))[0];
      var t98 = (await io.r(0x7C, 1, 0x98, 1))[0];
      if (t98 === 0x00) throw SfError('i2c.sfErrNotE501', { v: hx(t98) });
      if (wantA && id !== 0x00) throw SfError('i2c.sfErrE501Mismatch', { want: 'E501A', got: hx(id) });
      if (!wantA && id !== 0x40 && id !== 0x41) throw SfError('i2c.sfErrE501Mismatch', { want: 'E501B', got: hx(id) });
      return id;
    },
    /* PY:33971–33995 i2c_flash_init */
    init: async function (io, isA) {
      if (isA) {
        await io.w(0x7C, 1, 0x0F, [0x80]);
        await io.w(0x7C, 1, 0x08, [0xEE, 0xE0]);
        await io.w(0x7C, 1, 0x08, [0xEF, 0x40]);
        await io.w(0x3E, 2, 0x00AD, [0xE5]);
        await io.w(0x3E, 2, 0x00B5, [0x00]);
      } else {
        await io.w(0x7C, 1, 0x0F, [0x80]);
      }
      await io.sleep(10);
    },
    /* PY:34037–34053 i2c_flash_w1w3_enable（WREN 06h） */
    wren: async function (io) {
      await io.w(0x3E, 2, 0x00AD, [0xE5]);
      await io.w(0x3E, 2, 0x00AE, [0x06]);
      await io.w(0x3E, 2, 0x00B5, [0x00]);
      await io.w(0x3E, 2, 0x00B5, [0x01]);
      await io.r(0x7C, 1, 0xD8, 1);
    },
    /* PY:34055–34074（20h，4 KB）／PY:34076–34095（D8h，64 KB） */
    erase: async function (io, op, addr) {
      await io.w(0x3E, 2, 0x00AD, [0xE5, op, (addr >> 16) & 0xFF, (addr >> 8) & 0xFF, addr & 0xFF]);
      await io.w(0x3E, 2, 0x00B5, [0x00]);
      await io.w(0x3E, 2, 0x00B5, [0x02]);
      await io.sleep(100);
      await io.r(0x7C, 1, 0xD8, 1);
    },
    /* PY:34097–34135 i2c_flash_w2p_erase：RDSR 05h 輪詢，7C:D0＝0 才算完成。
       🔴 計數照原廠：每輪讀完 D0 先 +1，>20 就判失敗（第 21 輪即使讀到 0 也算失敗）。 */
    waitIdle: async function (io) {
      for (var n = 1; ; n++) {
        await io.w(0x3E, 2, 0x00AD, [0xE5]);
        await io.w(0x3E, 2, 0x00AE, [0x05]);
        await io.w(0x3E, 2, 0x00B3, [0x00]);
        await io.w(0x3E, 2, 0x00B5, [0x00]);
        await io.r(0x7C, 1, 0xD8, 1);
        await io.w(0x3E, 2, 0x00B5, [0x08]);
        var d0 = (await io.r(0x7C, 1, 0xD0, 1))[0];
        if (n > 20) throw SfError('i2c.sfErrEraseBusy', {});
        if (d0 === 0x00) return;
      }
    },
    /* PY:34137–34163 w4_set ＋ PY:34165–34174 w5_write_data（Page Program 02h，每次 256 B）。
       w5 的 0x64 寫入走 i2c_flash_write_data(div=256)：滿一個 div 之後原廠會睡 10 ms（PY:34011–34012）。 */
    program: async function (io, addr, data) {
      var n = data.length; if (n > 256) n = 256;
      await io.w(0x3E, 2, 0x00AE, [0x02, (addr >> 16) & 0xFF, (addr >> 8) & 0xFF, addr & 0xFF, 0x00, 0x00, n - 1, 0x00, 0x80]);
      await io.w(0x3E, 2, 0x00B5, [0x10]);
      await io.r(0x7C, 1, 0xD8, 1);
      await io.w(0x64, 1, 0x00, data.slice(0, n));
      if (n === 256) await io.sleep(10);
      await io.w(0x3E, 2, 0x00B6, [0x00]);
      await io.r(0x7C, 1, 0xD8, 1);
    },
    /* PY:34176–34181 i2c_flash_stop */
    stop: async function (io) { await io.w(0x3E, 2, 0x00AD, zeros(9)); },
    /* PY:34204–34223（E501B 一次讀 4 KB，從 0x64 讀 4096） */
    read4kB: async function (io, addr) {
      await io.w(0x3E, 2, 0x00B6, [0x40]);
      await io.w(0x3E, 2, 0x00AD, [0xE5, 0x03, (addr >> 16) & 0xFF, (addr >> 8) & 0xFF, addr & 0xFF, 0x00, 0xF0, 0xFF, 0x04]);
      var d = await io.r(0x64, 1, 0x00, 4096);
      await io.w(0x3E, 2, 0x00B6, [0x00]);
      return d;
    },
    /* PY:34227–34238 read_start ＋ PY:34240–34263 read_loop（E501A 每次 8 B，從 7C:D0） */
    readStartA: async function (io) { await io.w(0x3E, 2, 0x00AD, [0xE5, 0x03]); },
    read8A: async function (io, addr) {
      await io.w(0x3E, 2, 0x00AF, [(addr >> 16) & 0xFF, (addr >> 8) & 0xFF, addr & 0xFF, 0x00, (8 - 1) << 4, 0x00, 0x00]);
      await io.w(0x3E, 2, 0x00B5, [0x04]);
      return await io.r(0x7C, 1, 0xD0, 8);
    }
  };

  function e501Profile(isA) {
    return {
      id: isA ? 'E501A' : 'E501B', chip: isA ? 'RM81010' : 'RM81011', jedec: true,
      canWrite: true, padZero: false,
      /* 「確認外部 Flash」＝ PY:33523–33576 i2c_flash_info（Check Flash 鈕，PY:6074–6078）。
         🔴 PY:6076 在這之前還會送 i2c_open_mbus_to_cbus（7E:AB←CD，PY:31832–31850），
            原廠註解寫明「E503 適用」，讀寫流程（PY:5640、6045）也都沒有它 ⇒ 不送。 */
      detect: async function (io, opts) {
        var tid = await E501.check(io, isA);
        await E501.init(io, isA);
        await io.w(0x3E, 2, 0x00AD, [0xE5]);
        await io.w(0x3E, 2, 0x00AE, [0x9F]);
        await io.w(0x3E, 2, 0x00B3, [0x20]);
        await io.w(0x3E, 2, 0x00B5, [0x08]);
        await io.r(0x7C, 1, 0xD8, 1);
        await io.w(0x3E, 2, 0x00B5, [0x00]);
        var id3 = isA ? await io.r(0x7C, 1, 0xD0, 3) : await io.r(0x7D, 2, 0x0246, 3);
        /* PY:33578–33596 i2c_flash_check_ap1_ap2（只顯示） */
        var ap = await io.r(0x7C, 1, 0xBB, 3);
        var apTxt = ap[0] !== 0x00 ? 'AP1/AP2 Fail' : ((ap[1] === 0 && ap[2] === 0) ? 'AP1' : 'AP2');
        return { tconId: tid, jedec: id3, flash: jedecInfo(id3), ap: apTxt };
      },
      /* PY:5565（check）→ 5640–5642（init → read_all → stop）。read_all 依 rm81010_flag 分兩條：
         E501A PY:34430–34464、E501B PY:34342–34373。 */
      read: async function (io, start, len, opts) {
        var cx = ctxOf(opts), out = [];
        await E501.check(io, isA);
        await E501.init(io, isA);
        try {
          if (isA) await E501.readStartA(io);
          for (var a = start; a < start + len; a += SECTOR) {
            if (cx.aborted()) { cx.log('i2c.sfLogAbortAt', { a: hx(a, 6) }, 'w'); return { ok: false, aborted: true, bytes: out, stopAt: a }; }
            var d;
            if (isA) { d = []; for (var j = 0; j < 512; j++) d = d.concat(await E501.read8A(io, a + j * 8)); }
            else d = await E501.read4kB(io, a);
            for (var k = 0; k < d.length; k++) out.push(d[k] & 0xFF);
            cx.progress(out.length, len);
          }
        } finally {
          await E501.stop(io);
        }
        return { ok: true, bytes: out };
      },
      /* PY:6017–6053 write_rom（check → init → write_all → stop）＋ PY:32806–32935 i2c_flash_write_all。
         · 長度 ≥64 KB 且起點 64 KB 對齊 ⇒ 每 64 KB 一次 Block Erase D8h，再寫 16 個 sector（PY:32874–32891）。
         · 其餘 4 KB 一次 Sector Erase 20h（PY:32892–32910、32915–32931）。
         🔴 原廠 bug（PY:32896）：「64 KB 整數倍＋餘數」分支的 4 KB 抹除位址寫成 `m*65536 + j*4096`，
            漏加 write_rom_start；同分支寫入位址有加。這裡用正確位址（起點＋偏移），與寫入一致。
         · 每個 sector：16 頁寫入 → 讀回比對；不符就重寫（不重新抹除），第 3 次仍不符就停
           （PY:34288–34340；E501A 只比頭尾各 256 B，PY:34377–34428）。 */
      write: async function (io, start, data, opts) {
        var cx = ctxOf(opts), len = data.length, done = 0;
        await E501.check(io, isA);
        await E501.init(io, isA);
        var self = this;
        try {
          var m = Math.floor(len / 0x10000), n = len % 0x10000;
          var blocks = [];   /* {erase:op, at, size} */
          if (m >= 1 && (start % 0x10000) === 0) {
            for (var i = 0; i < m; i++) blocks.push({ op: 0xD8, at: start + i * 0x10000, size: 0x10000 });
            for (var j = 0; j < n / SECTOR; j++) blocks.push({ op: 0x20, at: start + m * 0x10000 + j * SECTOR, size: SECTOR });
          } else {
            for (var s = 0; s < len / SECTOR; s++) blocks.push({ op: 0x20, at: start + s * SECTOR, size: SECTOR });
          }
          for (var b = 0; b < blocks.length; b++) {
            var bk = blocks[b];
            cx.log(bk.op === 0xD8 ? 'i2c.sfLogErase64' : 'i2c.sfLogErase4', { a: hx(bk.at, 6) }, 'n');
            await E501.wren(io);
            await E501.erase(io, bk.op, bk.at);
            await E501.waitIdle(io);
            for (var sa = bk.at; sa < bk.at + bk.size; sa += SECTOR) {
              var off = sa - start, want = data.slice(off, off + SECTOR);
              cx.log('i2c.sfLogWrite4', { a: hx(sa, 6), b: hx(sa + SECTOR - 1, 6) }, 'n');   /* v1.31.0：只記錄，不送 I2C */
              for (var tries = 0; ; ) {
                for (var p = 0; p < 16; p++) {
                  await E501.wren(io);
                  await E501.program(io, sa + p * PAGE, want.slice(p * PAGE, (p + 1) * PAGE));
                }
                var ok;
                if (isA) {
                  await E501.readStartA(io);
                  var got = [];
                  for (var h = 0; h < 2; h++) for (var q = 0; q < 32; q++) got = got.concat(await E501.read8A(io, sa + h * 3840 + q * 8));
                  ok = eq(got.slice(0, 256), want.slice(0, 256)) && eq(got.slice(256, 512), want.slice(3840, 4096));
                } else {
                  var rb = await E501.read4kB(io, sa);
                  ok = eq(rb, want);
                  if (!ok) cx.log('i2c.sfLogDiff', { a: hx(sa + firstDiff(rb, want), 6) }, 'w');
                }
                if (ok) break;
                tries++;
                cx.log('i2c.sfLogRetry', { a: hx(sa, 6), n: tries }, 'w');
                if (tries > 2) throw SfError('i2c.sfErrVerify', { a: hx(sa, 6) });
              }
              done += SECTOR;
              cx.log('i2c.sfLogSectorOk', { a: hx(sa, 6) }, 'o');
              cx.progress(done, len);
              if (cx.aborted() && done < len) {
                cx.log('i2c.sfLogAbortAt', { a: hx(sa + SECTOR, 6) }, 'w');
                return { ok: false, aborted: true, stopAt: sa + SECTOR };
              }
            }
          }
        } finally {
          await E501.stop(io);
        }
        return { ok: true };
      }
    };
  }

  /* ═══ EM01（RM80100／RM80203）— 依原廠 UI 的 ISP 分頁 ═══════════════════════
     slave：0x68（2-byte offset，暫存器；SPI master bank BK_SPI=0xFE00、BK_TM=0xFF00、BK_MMU_TOP=0x0900，
            RApp_Common.h:66/99/100）、0x58（4-byte offset，AHB 記憶體）。
     預設值 SDIMAIN.dfm:728／743；offset 寬度由原廠 DLL 依位址決定（RApp_I2C.h:6–28：0x58 屬 4 byte、0x68 屬 2 byte）。 */
  var R = 0x68, M = 0x58;
  var BK_SPI = 0xFE00, BK_TM = 0xFF00, BK_MMU = 0x0900;
  var WP = { ENABLE: 'wpOn', DISABLE: 'wpOff', HW: 'wpHw', UNKNOWN_IC: 'unknownIc' };
  var EM = {
    /* EMF:509–524 RAPP_Flash_Set_ISP_Demura：0xFF44 ← 01（主 code，CSPI PAD）／02（Demura，SSPI PAD） */
    setPad: async function (io, pad) { await io.w(R, 2, BK_TM + 0x44, [pad === 2 ? 0x02 : 0x01]); },
    /* BH:3754–3771 Registar_Updata_Value_Mask：讀裝置 → 改位元 → 寫回 */
    mask: async function (io, reg, val, msk) {
      var d = (await io.r(R, 2, reg, 1))[0];
      d = (d & ~msk & 0xFF) | (val & msk);
      await io.w(R, 2, reg, [d]);
    },
    /* EMF:526–601 RAPP_Flash_Get_Info（RDID）。FE10 ← 02 原廠連寫兩次（:567、:571）。
       FE14 bit0 先讀一次，未就緒再最多讀 500 次（:573–591）；之後一律讀 FE46 3 byte（:598）。 */
    getInfo: async function (io, pad) {
      await EM.setPad(io, pad);
      await io.w(R, 2, BK_SPI + 0x00, [0x20]);
      await io.w(R, 2, BK_SPI + 0x10, [0x00]);
      await io.w(R, 2, BK_SPI + 0x10, [0x02]);
      await io.w(R, 2, BK_SPI + 0x10, [0x02]);
      var st = (await io.r(R, 2, BK_SPI + 0x14, 1))[0], ready = !!(st & 1);
      for (var i = 0; i < 500 && !ready; i++) { st = (await io.r(R, 2, BK_SPI + 0x14, 1))[0]; ready = !!(st & 1); }
      var id3 = await io.r(R, 2, BK_SPI + 0x46, 3);
      return { id3: id3, ready: ready };
    },
    /* EMF:603–631 Flash_Get_Chip_ModelName：0xFFF1 bit5:4 */
    model: async function (io) {
      var v = (await io.r(R, 2, BK_TM + 0xF1, 1))[0];
      return ({ 0: 'RM80100', 1: 'RM80203', 3: 'D01' })[(v >> 4) & 3] || '';
    },
    /* EMF:633–678 RAPP_Flash_Get_Flash_Chip_Info */
    chipInfo: async function (io, pad) {
      var g = await EM.getInfo(io, pad);
      var fi = jedecInfo(g.id3);
      var mdl = await EM.model(io);
      return { jedec: g.id3, flash: fi, ready: g.ready, model: mdl, known: fi.known };
    },
    /* EMF:752–875 RAPP_Flash_Write_Protect_State（RDSR 05h／35h 經 FE02／FE09，從 FE29 讀） */
    wpState: async function (io) {
      await io.w(R, 2, BK_SPI + 0x10, [0x00]);
      await io.w(R, 2, BK_SPI + 0x02, [0x05]);
      await io.w(R, 2, BK_SPI + 0x09, [0x08]);
      var s0 = (await io.r(R, 2, BK_SPI + 0x29, 1))[0];
      await io.w(R, 2, BK_SPI + 0x02, [0x35]);
      await io.w(R, 2, BK_SPI + 0x09, [0x00]);
      await io.w(R, 2, BK_SPI + 0x09, [0x08]);
      var s1 = (await io.r(R, 2, BK_SPI + 0x29, 1))[0];
      await io.w(R, 2, BK_SPI + 0x02, [0x00]);
      await io.w(R, 2, BK_SPI + 0x09, [0x00]);
      await io.w(R, 2, BK_SPI + 0x4A, [0x10]);
      await io.w(R, 2, BK_SPI + 0x4B, [0x02]);
      await io.w(R, 2, BK_SPI + 0x4C, [0x02]);
      var srp0 = (s0 >> 7) & 1, srp1 = s1 & 1, bp2 = (s0 >> 4) & 1, bp1 = (s0 >> 3) & 1, bp0 = (s0 >> 2) & 1;
      var cmp = (s1 >> 6) & 1, sec = (s0 >> 6) & 1, st;
      if (srp0 || srp1) st = WP.HW;
      else {
        var none = cmp === 0 ? (!bp2 && !bp1 && !bp0 && !sec) : (bp2 && bp1 && bp0 && sec);
        st = none ? WP.DISABLE : WP.ENABLE;
      }
      return { state: st, sr: [s0, s1] };
    },
    /* EMF:2716–2733 RAPP_SPI_TriggerReady：輪詢 FE28 bit7:4＝0。
       🔴 原廠沒有上限（do…while），網頁加 1000 次上限，避免卡死；超過就報錯（不是新指令，只是停止讀）。 */
    triggerReady: async function (io) {
      for (var i = 0; i < 1000; i++) { var v = (await io.r(R, 2, BK_SPI + 0x28, 1))[0]; if (((v >> 4) & 0xF) === 0) return; }
      throw SfError('i2c.sfErrTrigger', {});
    },
    /* EMF:680–699 Flash_WriteEnable ＋ EMF:701–750 RAPP_Flash_Write_Protect。
       開保護寫 4B←7C（ISP 分頁「HW Protect」勾選框預設不勾，SDIMAIN.dfm:40587，故不用 FC）。 */
    writeProtect: async function (io, enable) {
      var we = [[0x10, 0x00], [0x4A, 0x00], [0x02, 0x06], [0x09, 0x00], [0x09, 0x01], [0x02, 0x00], [0x09, 0x00]];
      for (var i = 0; i < we.length; i++) await io.w(R, 2, BK_SPI + we[i][0], [we[i][1]]);
      await EM.triggerReady(io);
      var seq = enable ? [[0x4B, 0x7C], [0x4C, 0x00], [0x4A, 0x02], [0x09, 0x00], [0x09, 0x20], [0x09, 0x00]]
                       : [[0x4B, 0x00], [0x4C, 0x00], [0x4A, 0x02], [0x09, 0x20], [0x09, 0x00]];
      for (var j = 0; j < seq.length; j++) await io.w(R, 2, BK_SPI + seq[j][0], [seq[j][1]]);
      await EM.triggerReady(io);
    },
    /* EMT:853–874 RApp_Thread_Flash_SW_WP：設定後讀狀態；不符時再讀一次，HW protect 也接受。 */
    swWp: async function (io, target, cur, cx) {
      await EM.writeProtect(io, target === WP.ENABLE);
      if ((await EM.wpState(io)).state === target) return target;
      if ((await EM.wpState(io)).state === WP.HW) return target;
      cx.log('i2c.sfLogWpFail', {}, 'w');
      return cur;
    },
    /* EMF:131–185 RAPP_Flash_Sector_Erase（FE10 ← 00 → 08，輪詢 FE14 bit0，每 10 ms、最多 5000 次） */
    sectorErase: async function (io, addr) {
      await io.w(R, 2, BK_SPI + 0x11, [addr & 0xFF, (addr >> 8) & 0xFF, (addr >> 16) & 0xFF]);
      await io.w(R, 2, BK_SPI + 0x10, [0x00]);
      await io.w(R, 2, BK_SPI + 0x10, [0x08]);
      for (var i = 0; i < 5000; i++) {
        if ((await io.r(R, 2, BK_SPI + 0x14, 1))[0] & 1) return true;
        await io.sleep(10);
      }
      return false;
    },
    /* EMF:187–245 RAPP_Flash_Sector_Program（FE10 ← 00 → 80，輪詢 FE14，每 10 ms、最多 500 次） */
    sectorProgram: async function (io, ahb, addr) {
      await io.w(R, 2, BK_SPI + 0x0C, [ahb & 0xFF, (ahb >> 8) & 0xFF, (ahb >> 16) & 0xFF, (ahb >>> 24) & 0xFF]);
      await io.w(R, 2, BK_SPI + 0x11, [addr & 0xFF, (addr >> 8) & 0xFF, (addr >> 16) & 0xFF]);
      await io.w(R, 2, BK_SPI + 0x10, [0x00]);
      await io.w(R, 2, BK_SPI + 0x10, [0x80]);
      for (var i = 0; i < 500; i++) {
        if ((await io.r(R, 2, BK_SPI + 0x14, 1))[0] & 1) return true;
        await io.sleep(10);
      }
      return false;
    },
    /* EMF:247–332 RAPP_Flash_Sector_Verify（讀 4 KB 到 AHB 0x00000000，再從 0x58 讀回） */
    sectorRead: async function (io, ahb, addr, len) {
      await io.w(R, 2, BK_SPI + 0x0C, [ahb & 0xFF, (ahb >> 8) & 0xFF, (ahb >> 16) & 0xFF, (ahb >>> 24) & 0xFF]);
      await io.w(R, 2, BK_SPI + 0x11, [addr & 0xFF, (addr >> 8) & 0xFF, (addr >> 16) & 0xFF]);
      await io.w(R, 2, BK_SPI + 0x23, [len & 0xFF, (len >> 8) & 0xFF, 0x00]);
      var v = (await io.r(R, 2, BK_SPI + 0x00, 1))[0];
      await io.w(R, 2, BK_SPI + 0x00, [(v | 0x20) & 0xFF]);
      await io.w(R, 2, BK_SPI + 0x10, [0x00]);
      await io.w(R, 2, BK_SPI + 0x10, [0x04]);
      var ready = false;
      for (var i = 0; i < 500; i++) { if ((await io.r(R, 2, BK_SPI + 0x14, 1))[0] & 1) { ready = true; break; } }
      if (!ready) return null;
      return await io.r(M, 4, ahb, len);
    }
  };

  var EM01 = {
    id: 'EM01', chip: 'RM80100/RM80203', jedec: true, canWrite: true, padZero: true, hasPad: true,
    /* 「確認外部 Flash」＝ ISP 分頁 Get 鈕：EMS:1514–1550（setPad → Chip_Info → Write_Protect_State） */
    detect: async function (io, opts) {
      var pad = (opts && opts.pad) || 1;
      await EM.setPad(io, pad);
      var ci = await EM.chipInfo(io, pad);
      var wp = await EM.wpState(io);
      return { jedec: ci.jedec, flash: ci.flash, model: ci.model, noFlash: !ci.ready, wp: wp.state, sr: wp.sr };
    },
    /* Read Flash to file：EMS:671 → EMF:1369–1437 RAPP_Flash_ReadToFile → EMT:1149–1300 RApp_Thread_Flash_Read。
       每 4 KB 讀兩次（EMT:1188–1189），兩次相同才收下；不同或讀失敗就重試，第 5 次失敗中止（EMT:1180、1228）。
       讀完再讀一次 Flash 資訊（EMT:1292）。原廠讀取流程最後**沒有**把 0xFF44 歸零、也沒有重開 MCU。 */
    read: async function (io, start, len, opts) {
      var cx = ctxOf(opts), pad = (opts && opts.pad) || 1, out = [];
      await io.r(R, 2, BK_MMU + 0x80, 1);                 /* EMF:1386（結果原廠固定覆寫成 1，只讀不用） */
      await EM.mask(io, BK_TM + 0x1F, 0x00, 0x80);        /* EMF:1396 MCU OFF */
      await EM.setPad(io, pad);                           /* EMF:1406 */
      await EM.mask(io, BK_SPI + 0x4D, 0x00, 0x04);       /* EMF:1409 word mode */
      await io.r(R, 2, BK_MMU + 0x80, 1);                 /* EMF:1411 */
      for (var a = start; a < start + len; a += SECTOR) {
        if (cx.aborted()) { cx.log('i2c.sfLogAbortAt', { a: hx(a, 6) }, 'w'); return { ok: false, aborted: true, bytes: out, stopAt: a }; }
        var got = null;
        for (var err = 0; ; ) {
          var d1 = await EM.sectorRead(io, 0, a, SECTOR);
          var d2 = await EM.sectorRead(io, 0, a, SECTOR);
          if (d1 && d2 && eq(d1, d2)) { got = d1; break; }
          if (d1 && d2) cx.log('i2c.sfLogDiff', { a: hx(a + firstDiff(d1, d2), 6) }, 'w');
          if (++err >= 5) throw SfError('i2c.sfErrRead', { a: hx(a, 6) });
          cx.log('i2c.sfLogRetry', { a: hx(a, 6), n: err }, 'w');
        }
        for (var k = 0; k < got.length; k++) out.push(got[k] & 0xFF);
        cx.progress(out.length, len);
      }
      await EM.chipInfo(io, pad);
      return { ok: true, bytes: out };
    },
    /* 寫前：EMF:1976–1981（Chip_Info，認得才讀保護狀態，否則 UNKNOW_IC）；確認窗由畫面做（EMF:1983–2006）。 */
    writePre: async function (io, opts) {
      var pad = (opts && opts.pad) || 1;
      var ci = await EM.chipInfo(io, pad);
      var st = WP.UNKNOWN_IC, sr = null;
      if (ci.known) { var w = await EM.wpState(io); st = w.state; sr = w.sr; }
      return { jedec: ci.jedec, flash: ci.flash, model: ci.model, wp: st, sr: sr };
    },
    /* EMT:876–1133 TFlashThread::RApp_Thread_Flash_Write（Erase／Write／Verify 三個勾選框原廠預設都勾，SDIMAIN.dfm:40542–40563）
       🔴 與原廠不同的一處：AHB 暫存區原廠一次寫 0x1000 B（EMT:987），連線工具一次最多送 256 B，
          所以拆成 16 筆、位址 0x000～0xF00 遞增；寫到暫存區的內容相同，之後每個 sector 都讀回比對。
       🔴 原廠每次迴圈先做 I2C 連線探測／自動重連（EMT:952、83–91）—— 那是治具連線維護，不是 Flash 指令，
          這裡不做；I2C 錯誤直接中止並走收尾。 */
    write: async function (io, start, data, opts) {
      var cx = ctxOf(opts), pad = (opts && opts.pad) || 1, len = data.length;
      var state = (opts && opts.wp) || WP.UNKNOWN_IC, done = 0, base = start;
      var retry = 0, vErr = 0, fail = null, aborted = false;
      await EM.setPad(io, pad);                                                    /* EMT:909 */
      if (state === WP.ENABLE || state === WP.HW) {
        cx.log('i2c.sfLogWpOff', {}, 'n');                                         /* v1.31.0：只記錄 */
        state = await EM.swWp(io, WP.DISABLE, state, cx);                          /* EMT:911–915 */
      }
      try {
        await EM.mask(io, BK_SPI + 0x4D, 0x00, 0x04);                              /* EMT:918 */
        await io.r(R, 2, BK_MMU + 0x80, 1);                                        /* EMT:920 */
        await io.w(R, 2, BK_SPI + 0x00, [0x20]);                                   /* EMT:935–936 */
        await EM.mask(io, BK_TM + 0x1F, 0x00, 0x80);                               /* EMT:946 MCU OFF */
        while (done < len) {
          var want = data.slice(base - start, base - start + SECTOR);
          cx.log('i2c.sfLogErase4', { a: hx(base, 6) }, 'n');
          if (!(await EM.sectorErase(io, base))) {                                 /* EMT:967–978 */
            if (++retry >= 5) { fail = SfError('i2c.sfErrErase', { a: hx(base, 6) }); break; }
            cx.log('i2c.sfLogRetry', { a: hx(base, 6), n: retry }, 'w'); continue;
          }
          cx.log('i2c.sfLogWrite4', { a: hx(base, 6), b: hx(base + SECTOR - 1, 6) }, 'n');   /* v1.31.0：只記錄 */
          for (var c = 0; c < 16; c++) await io.w(M, 4, c * PAGE, want.slice(c * PAGE, (c + 1) * PAGE));   /* EMT:987 */
          await io.w(R, 2, BK_SPI + 0x26, [0x00, 0x01]);                           /* EMT:989–991 */
          var pok = true;
          for (var x = 0; x < 16; x++) {                                           /* EMT:996–1004 */
            if (!(await EM.sectorProgram(io, x * PAGE, base + x * PAGE))) { pok = false; break; }
          }
          if (!pok) {
            if (++retry >= 5) { fail = SfError('i2c.sfErrProgram', { a: hx(base, 6) }); break; }
            cx.log('i2c.sfLogRetry', { a: hx(base, 6), n: retry }, 'w'); continue;
          }
          var rb = await EM.sectorRead(io, 0, base, SECTOR);                        /* EMT:1027 */
          if (!rb) {
            if (++retry >= 5) { fail = SfError('i2c.sfErrRead', { a: hx(base, 6) }); break; }
            cx.log('i2c.sfLogRetry', { a: hx(base, 6), n: retry }, 'w'); continue;
          }
          if (!eq(rb, want)) {                                                     /* EMT:1041–1059 */
            cx.log('i2c.sfLogDiff', { a: hx(base + firstDiff(rb, want), 6) }, 'w');
            if (++vErr >= 5) { fail = SfError('i2c.sfErrVerify', { a: hx(base, 6) }); break; }
            cx.log('i2c.sfLogRetry', { a: hx(base, 6), n: vErr }, 'w'); continue;
          }
          vErr = 0; retry = 0;                                                     /* EMT:1064–1086 */
          cx.log('i2c.sfLogSectorOk', { a: hx(base, 6) }, 'o');
          base += SECTOR; done += SECTOR;
          cx.progress(done, len);
          if (done < len && cx.aborted()) { aborted = true; cx.log('i2c.sfLogAbortAt', { a: hx(base, 6) }, 'w'); break; }
        }
      } catch (e) { fail = e; }
      /* 收尾：寫完或中止都把軟體寫保護開回去（EMT:1094–1100、1110–1114）。原廠條件是「目前狀態＝已解除」。 */
      if (state === WP.DISABLE) {
        try { await EM.swWp(io, WP.ENABLE, state, cx); cx.log('i2c.sfLogWpOn', {}, 'n'); }
        catch (e2) { cx.log('i2c.sfLogWpFail', {}, 'e'); if (!fail) fail = e2; }
      }
      if (fail) throw Object.assign(fail, { stopAt: base });
      return aborted ? { ok: false, aborted: true, stopAt: base } : { ok: true };
    }
  };

  /* ═══ EN01（RM81008）— 依原廠共用庫現行版 ═════════════════════════════════
     slave：0x3E（2-byte offset，SPI master 控制 0x0098–0x00A4、狀態 0x230B、Check Write Value 0x0001、IC 版本 0x207E）、
            0x64（1-byte，資料埠 reg 0x00，一次 256 B）、0x7C（1-byte，Unlock／Lock 前置、保護狀態 0xD0）。
     規格：outputs/EN01_flash_write_seq_20261006.md（每筆附出處）。i2c v1.30.0（2026-10-06）起開放寫入、Erase All。
     原廠來源代號（現行版；WPF_RomCodeProcessUI 主 repo acdb7f9、DLL_Raydium_CommonLibrary 子模組 d80a850）：
       ENP = DLL_Raydium_CommonLibrary/Raydium.Channel.Core/Flash/En01FlashProgrammer.cs
       ICD = DLL_Raydium_CommonLibrary/Raydium.Core/Models/ICDefine.cs（GetRM81008）
       I2CB= DLL_Raydium_CommonLibrary/Raydium.Channel.Core/Channels/I2cChannelModuleBase.cs
       AVM = Wpf.RomCodeProcessUI/AppViewModel.cs；RCI = Wpf.RomCodeProcessUI/Models/RomCodeInfo.cs
       FM／DM = Wpf.RomCodeProcessUI/Modules/FlashModule.cs／DebugModule.cs
       ENH = DLL_Raydium_CommonLibrary/Raydium.Core/Models/DynamicHeader/EN01/EN01HeaderDefine.cs；ENHF = 同目錄 EN01HeaderDefineFLASH.cs
     🔴 讀取的 `0039←C0`：現行版只在「已載入檔案的 header 是 A1 排列」時送（RCI:1389–1390、1431–1440），
        讀取前沒有檔案可判斷 ⇒ 讀取維持 v1.29.0 的做法：沿用舊版（RCIo:1063）每次都送。理由：舊版是
        長期實際使用的序列（A1、A2 都送過），這筆只是開 SPI 時脈；現行版拿掉它的根據是側錄比對，不是錯誤報告。
        畫面標「待上機確認」。寫入有檔案可判斷 ⇒ 照現行版（en01IsA1）。 */
  var N = 0x3E, NP = 0x64, N7C = 0x7C;
  function nw(io, reg, v) { return io.w(N, 2, reg, Array.isArray(v) ? v : [v]); }

  /* ENH:214–233 IsA1：header（檔案前 4 KB）每 16 B 一筆、共 22 筆（ENH:43–79、144–148；長度要剛好 4096，ENH:26–39，
     原廠 HeaderLength＝0x1000，ENH:204）。每筆的類型（ENHF:262–274）：byte8 bit0＝EDID、bit1＝MCU，其他看
     MAP_ST_ADDR＝byte5<<8 | byte6（ENHF:30–34；AddrBitInfoExtension.cs:10–21 先列的 byte 是低位、後列的
     Prepend 到高位）。Bank14_17（0x1400）排在 Bank18_19（0x1800）前面就是 A1；任一個找不到 ⇒ false（不猜）。 */
  function en01IsA1(bytes) {
    if (!bytes || bytes.length < SECTOR) return false;
    var i14 = -1, i18 = -1;
    for (var i = 0; i < 22; i++) {
      var o = i * 16, f8 = bytes[o + 8] & 0xFF;
      if (f8 & 0x01) continue;            /* EDID（ENHF:266） */
      if (f8 & 0x02) continue;            /* MCU（ENHF:267） */
      var map = ((bytes[o + 5] & 0xFF) << 8) | (bytes[o + 6] & 0xFF);
      if (map === 0x1400 && i14 < 0) i14 = i;
      if (map === 0x1800 && i18 < 0) i18 = i;
    }
    return i14 >= 0 && i18 >= 0 && i14 < i18;
  }

  var EN = {
    /* ICD:755–828 FLASH_Unlock／ICD:680–753 FLASH_Lock。兩者只有區塊 1 的 00A4 不同（Unlock 00／Lock 9C）。
       逐筆送、不讀回確認（I2CB:110–131）；每個區塊最後一筆之後的延遲照原廠 DelayTime（I2CB:124–127）。 */
    lockSeq: async function (io, lock) {
      await io.w(N7C, 1, 0x0F, [0x80]);                                  /* ICD:760／685 */
      await io.w(N7C, 1, 0x08, [0xEE]);                                  /* :761／686 */
      await io.w(N7C, 1, 0x09, [0xE0]);                                  /* :762／687 */
      await io.w(N7C, 1, 0x08, [0xEF]);                                  /* :763／688 */
      await io.w(N7C, 1, 0x09, [0x40]);                                  /* :764／689 */
      await nw(io, 0x0098, 0xE5);                                        /* :766／691 */
      await nw(io, 0x0098, 0x00);                                        /* :767／692 */
      for (var r = 0x0099; r <= 0x00A1; r++) await nw(io, r, 0x00);      /* :768–776／693–701（逐筆 9 筆） */
      var blocks = [[0x01, lock ? 0x9C : 0x00, lock ? 53 : 73],          /* :779–789／704–714 SR1 */
                    [0x31, 0x00, lock ? 64 : 94],                        /* :792–802／717–727 SR2 */
                    [0x11, 0x60, lock ? 69 : 84]];                       /* :805–815／730–740 SR3 */
      for (var b = 0; b < 3; b++) {
        await nw(io, 0x0098, 0xE5); await nw(io, 0x0099, 0x06);
        await nw(io, 0x00A0, 0x00); await nw(io, 0x00A0, 0x01);
        await nw(io, 0x0099, blocks[b][0]); await nw(io, 0x009F, 0x00);
        await nw(io, 0x00A0, 0x00); await nw(io, 0x00A0, 0x20);
        await nw(io, 0x00A4, blocks[b][1]);
        await nw(io, 0x00A1, 0x00); await nw(io, 0x00A1, 0x08);
        await io.sleep(blocks[b][2]);
      }
      for (var t = 0x0098; t <= 0x00A1; t++) await nw(io, t, 0x00);      /* :817–826／742–751（逐筆 10 筆） */
    },
    /* ENP:57–88 WaitFlashReadyAsync：`retries++ > maxRetries` 才逾時 ⇒ 最多 maxRetries+1 輪；
       讀到 0x00 立刻結束，非 0 等 20 ms 再下一輪。aborted() 只給 Erase All 用（ENP:64 每輪檢查取消）。 */
    waitReady: async function (io, maxRetries, aborted) {
      var st = 0xFF, retries = 0;
      while (st !== 0x00) {
        if (aborted && aborted()) return false;
        if (retries++ > maxRetries) throw SfError('i2c.sfErrEraseBusy', {});
        await nw(io, 0x0099, 0x05);                                      /* ENP:72 RDSR */
        await nw(io, 0x009E, 0x00);                                      /* :73 */
        await nw(io, 0x00A0, 0x08);                                      /* :74 */
        await nw(io, 0x00A0, 0x00);                                      /* :75 */
        st = (await io.r(N, 2, 0x230B, 1))[0];                           /* :77 */
        if (st !== 0x00) await io.sleep(20);                             /* :83–86 */
      }
      return true;
    },
    /* ENP:187–204 EraseSectorAsync（sector s 的位址 s×0x1000；pageAddr＝s<<4） */
    eraseSector: async function (io, s) {
      var pa = s << 4;
      await nw(io, 0x0098, 0xE5);                                        /* ENP:192 */
      await nw(io, 0x0099, 0x06);                                        /* :193 WREN */
      await nw(io, 0x00A0, 0x01);                                        /* :194 */
      await nw(io, 0x00A0, 0x00);                                        /* :195 */
      await nw(io, 0x0099, 0x20);                                        /* :196 Sector Erase */
      await nw(io, 0x009A, (pa >> 8) & 0xFF);                            /* :197 */
      await nw(io, 0x009B, pa & 0xFF);                                   /* :198 */
      await nw(io, 0x009C, 0x00);                                        /* :199 */
      await nw(io, 0x00A0, 0x02);                                        /* :200 */
      await nw(io, 0x00A0, 0x00);                                        /* :201 */
      await EN.waitReady(io, 20);                                        /* :203（預設 maxRetries=20，:57） */
    },
    /* ENP:230–276 WriteAsync：每頁 256 B，不足補 0x00（:233–235）；page 是絕對頁號（:256–257、328）。
       🔴 頁與頁之間原廠的 Task.Delay(1)（:272）是讓 UI 執行緒喘口氣，不是硬體等待 ⇒ 不送。 */
    writeSector: async function (io, s, sd) {
      for (var k = 0; k * PAGE < sd.length; k++) {
        var page = s * 16 + k, chunk = sd.slice(k * PAGE, (k + 1) * PAGE);
        while (chunk.length < PAGE) chunk.push(0x00);
        await nw(io, 0x0099, zeros(9));                                  /* ENP:250（連寫 9 B） */
        await nw(io, 0x0099, 0x06);                                      /* :251 WREN */
        await nw(io, 0x00A0, 0x01);                                      /* :252 */
        await nw(io, 0x00A0, 0x00);                                      /* :253 */
        await nw(io, 0x00A1, 0x80);                                      /* :254 */
        await nw(io, 0x0099, 0x02);                                      /* :255 Page Program */
        await nw(io, 0x009A, (page >> 8) & 0xFF);                        /* :256 */
        await nw(io, 0x009B, page & 0xFF);                               /* :257 */
        await nw(io, 0x009C, 0x00);                                      /* :258 */
        await nw(io, 0x009F, PAGE - 1);                                  /* :259 */
        await nw(io, 0x00A0, 0x10);                                      /* :260 */
        await nw(io, 0x00A0, 0x00);                                      /* :261 */
        await io.w(NP, 1, 0x00, chunk);                                  /* :263–265 */
      }
      await nw(io, 0x0099, zeros(9));                                    /* :275 */
    },
    /* ENP:123–142 ReadAsync 的一頁。 */
    readPage: async function (io, page, n) {
      var hi = (page >> 8) & 0xFF, mid = page & 0xFF;
      await nw(io, 0x009A, hi);                                          /* ENP:127 */
      await nw(io, 0x009B, mid);                                         /* :128 */
      await nw(io, 0x009C, 0x00);                                        /* :129 */
      await nw(io, 0x0099, zeros(9));                                    /* :130 */
      await nw(io, 0x00A1, 0x40);                                        /* :131 */
      await nw(io, 0x0099, 0x03);                                        /* :132 Read */
      await nw(io, 0x009A, hi);                                          /* :133 */
      await nw(io, 0x009B, mid);                                         /* :134 */
      await nw(io, 0x009C, 0x00);                                        /* :135 */
      await nw(io, 0x009E, 0x10);                                        /* :136 */
      await nw(io, 0x009F, 0x00);                                        /* :137 */
      await nw(io, 0x00A0, 0x04);                                        /* :138 */
      await nw(io, 0x00A0, 0x00);                                        /* :139 */
      return await io.r(NP, 1, 0x00, n);                                 /* :141–142 */
    },
    /* ENP:366 讀回本 sector（實際長度）→ ENP:151 結尾 0099←00×9。驗證時不送 Initial（0098 仍是抹除時的 E5）。 */
    readSector: async function (io, s, n) {
      var out = [];
      for (var k = 0; k * PAGE < n; k++) {
        var d = await EN.readPage(io, s * 16 + k, Math.min(PAGE, n - k * PAGE));
        for (var j = 0; j < d.length; j++) out.push(d[j] & 0xFF);
      }
      await nw(io, 0x0099, zeros(9));
      return out;
    },
    /* AVM:1784–1803 三區保護狀態：ICD:633–665 Prereq1–3 ＋ ICD:667–674 讀 7C:D0 1 B。 */
    protectZone: async function (io, z) {
      if (z === 0) await nw(io, 0x0098, 0xE5);                           /* ICD:638 */
      await nw(io, 0x0099, [0x05, 0x35, 0x15][z]);                        /* ICD:639／650／661 */
      await nw(io, 0x00A0, 0x08);
      await nw(io, 0x00A0, 0x00);
      return (await io.r(N7C, 1, 0xD0, 1))[0];                            /* ICD:672 */
    }
  };

  var EN01 = {
    id: 'EN01', chip: 'RM81008', jedec: false, canWrite: true, padZero: false, padPage: true, legacySeq: true, eraseAll: null,
    /* 原廠連線後只讀 IC 版本 3E:0x207E bit3:0（0＝A1、1＝A2），只顯示、不擋操作（RCI:1397–1416）。 */
    detect: async function (io) {
      var v = (await io.r(N, 2, 0x207E, 1))[0];
      var n = v & 0x0F;
      return { icVer: n, icVerTxt: n === 0 ? 'A1' : (n === 1 ? 'A2' : 'Unknown') };
    },
    /* 讀：`0039←C0`（見上方說明，沿用舊版 RCIo:1063）→ Initial（ICD:611–620）→ 每頁 ENP:123–142 →
       ENP:151 0099←00×9 → FM:186／ENP:38–41 0098←00。 */
    read: async function (io, start, len, opts) {
      var cx = ctxOf(opts), out = [];
      await nw(io, 0x0039, 0xC0);
      await nw(io, 0x0099, zeros(9));
      await nw(io, 0x0099, zeros(9));
      await nw(io, 0x0098, 0xE5);
      try {
        for (var a = start; a < start + len; a += PAGE) {
          if ((a - start) % SECTOR === 0 && cx.aborted()) {
            cx.log('i2c.sfLogAbortAt', { a: hx(a, 6) }, 'w');
            return { ok: false, aborted: true, bytes: out, stopAt: a };
          }
          var d = await EN.readPage(io, a >> 8, Math.min(PAGE, start + len - a));
          for (var k = 0; k < d.length; k++) out.push(d[k] & 0xFF);
          if ((out.length % SECTOR) === 0 || out.length === len) cx.progress(out.length, len);
        }
      } finally {
        await nw(io, 0x0099, zeros(9));
        await nw(io, 0x0098, 0x00);
      }
      return { ok: true, bytes: out };
    },
    /* 寫：AVM:1749–1813（EN01 I2C 寫入分支）＋ ENP:299–398 EraseWriteVerifyAsync。
         Unlock → [A1：0039←C0] → EraseInitial 00A1←00（RCI:1452–1476、ICD:622–629）→
         每 sector：抹除＋輪詢 → 寫頁 → Check Write Value（3E:0001，只記錄，ENP:354–358、FM:137）→ 讀回比對；
           不符整個 sector 重來，最多重試 3 次、每次先等 100 ms（DM:122–134 預設開啟、FM:107–111）；
           仍不符 ⇒ 0098←00（ENP:389）、停止，後面 sector 不做（ENP:386–391）；全部 OK ⇒ 0098←00（ENP:396）。
         收尾（AVM:1780–1808，成功／失敗／逾時／中止都做）：Lock → 三區保護狀態 → 0098←00。
       🔴 與原廠不同（都寫在 CHANGELOG）：
         · Unlock 原廠在 try 外（AVM:1764），原廠 WriteCmd 失敗不會丟例外；網頁的 I2C 失敗會丟 ⇒ Unlock 放進 try，
           Unlock 送到一半失敗也會 Lock。正常流程送出的序列相同。
         · 原廠不檢查單筆 I2C 回傳值（ENP:26–30）；網頁 bridge 回錯誤就中止、走收尾；收尾內的錯誤只記錄、繼續送完。
         · 中止：原廠每頁都檢查取消（ENP:246），網頁做完目前這個 sector（含讀回比對）才停，與其他型號一致。
         · 原廠一律從位址 0 寫整份（AVM:1642–1646）；網頁可指定 4 KB 對齊的起點，sector／page 號照位址換算（ENP:189、256）。
         · A1 判斷只在起點 0 時看檔案 header（header 在 Flash 0 位址，ENH:202）。 */
    write: async function (io, start, data, opts) {
      var cx = ctxOf(opts), len = data.length, s0 = start / SECTOR, nSec = Math.ceil(len / SECTOR);
      var isA1 = start === 0 && en01IsA1(data);
      var fail = null, aborted = false, stopAt = start, done = 0, prot = [];
      try {
        cx.log('i2c.sfLogEn01Unlock', {}, 'n');
        await EN.lockSeq(io, false);                                      /* AVM:1764 */
        cx.log(isA1 ? 'i2c.sfLogEn01A1' : 'i2c.sfLogEn01NotA1', {}, 'n');
        if (isA1) await nw(io, 0x0039, 0xC0);                             /* RCI:1459–1465、ICD:602–609 */
        await nw(io, 0x00A1, 0x00);                                       /* RCI:1468–1472、ICD:622–629 */
        for (var i = 0; i < nSec; i++) {
          var s = s0 + i, sa = s * SECTOR, sd = data.slice(i * SECTOR, (i + 1) * SECTOR), ok = false, rb = null;
          stopAt = sa;
          if (i > 0 && cx.aborted()) { aborted = true; cx.log('i2c.sfLogAbortAt', { a: hx(sa, 6) }, 'w'); break; }
          for (var att = 1; att <= 4; att++) {                            /* ENP:320、335（retryCount=3 ⇒ 共 4 次） */
            if (att > 1) { cx.log('i2c.sfLogRetry', { a: hx(sa, 6), n: att - 1 }, 'w'); await io.sleep(100); }  /* ENP:339–346 */
            cx.log('i2c.sfLogErase4', { a: hx(sa, 6) }, 'n');
            await EN.eraseSector(io, s);                                  /* ENP:349 */
            cx.log('i2c.sfLogWrite4', { a: hx(sa, 6), b: hx(sa + sd.length - 1, 6) }, 'n');   /* v1.31.0：只記錄 */
            await EN.writeSector(io, s, sd);                              /* ENP:352 */
            var cv = (await io.r(N, 2, 0x0001, 1))[0];                    /* ENP:354 */
            cx.log('i2c.sfLogEn01Cv', { a: hx(sa, 6), v: hx(cv) }, 'n');
            rb = await EN.readSector(io, s, sd.length);                   /* ENP:366 */
            if (eq(rb, sd)) { ok = true; break; }                         /* ENP:369–381 */
            cx.log('i2c.sfLogDiff', { a: hx(sa + firstDiff(rb, sd), 6) }, 'w');
          }
          if (!ok) {                                                      /* ENP:386–391、FM:140–147 */
            var mis = [];
            for (var q = 0; q < sd.length; q++) if ((rb[q] & 0xFF) !== (sd[q] & 0xFF)) mis.push(q);
            cx.log('i2c.sfLogEn01Mis', { a: hx(sa, 6), b: hx(sa + sd.length - 1, 6), n: mis.length }, 'e');
            for (var m = 0; m < Math.min(8, mis.length); m++)
              cx.log('i2c.sfLogEn01MisAt', { a: hx(sa + mis[m], 6), w: hx(sd[mis[m]]), r: hx(rb[mis[m]]) }, 'e');
            await nw(io, 0x0098, 0x00);                                   /* ENP:389 */
            fail = SfError('i2c.sfErrVerify', { a: hx(sa, 6) });
            break;
          }
          done += sd.length;
          cx.log('i2c.sfLogSectorOk', { a: hx(sa, 6) }, 'o');
          cx.progress(done, len);
          stopAt = sa + SECTOR;
        }
        if (!fail && !aborted) await nw(io, 0x0098, 0x00);               /* ENP:396 */
      } catch (e) { fail = e; }
      /* AVM:1780–1808 finally */
      try { cx.log('i2c.sfLogEn01Lock', {}, 'n'); await EN.lockSeq(io, true); }   /* AVM:1782 */
      catch (e1) { cx.log('i2c.sfLogEn01LockFail', { e: String(e1 && e1.message || e1) }, 'e'); if (!fail) fail = e1; }
      for (var z = 0; z < 3; z++) {
        try { prot.push(await EN.protectZone(io, z)); }
        catch (e2) { prot.push(null); }
      }
      var ph = prot.map(function (v) { return v == null ? '--' : hx(v); });
      cx.log('i2c.sfLogEn01Prot', { a: ph[0], b: ph[1], c: ph[2] }, prot[0] === 0x9C ? 'n' : 'e');
      if (prot[0] !== 0x9C) cx.log('i2c.sfLogEn01NotLocked', { v: ph[0] }, 'e');   /* 0x9C＝已鎖（ICD:712；規格 §3.8） */
      try { await nw(io, 0x0098, 0x00); }                                 /* AVM:1808 */
      catch (e3) { if (!fail) fail = e3; }
      if (fail) throw Object.assign(fail, { stopAt: stopAt });
      return aborted ? { ok: false, aborted: true, stopAt: stopAt, protect: prot } : { ok: true, protect: prot, a1: isA1 };
    }
  };
  /* Erase All：DM:96–116 → FM:64–77 → ENP:162–181 EraseAllAsync（照側錄，0099←C7，不設位址）。
     🔴 原廠這顆鈕只送這 10 筆＋輪詢（maxRetries=400，DM:89–91），前後沒有 Unlock／Lock、也沒有 0098←00 ⇒ 照做。
        Flash 有保護時可能抹不掉，畫面確認窗寫明；要確認就抹完讀一段看是不是全 FF。
     中止：原廠每輪輪詢檢查取消（ENP:64）；網頁同樣停止輪詢（Flash 內部可能還在抹）。 */
  EN01.eraseAll = async function (io, opts) {
    var cx = ctxOf(opts);
    await nw(io, 0x00A1, 0x00);                                           /* ENP:166 */
    await nw(io, 0x0098, 0xE5);                                           /* :167 */
    await nw(io, 0x0099, zeros(9));                                       /* :168 */
    await nw(io, 0x0099, 0x06);                                           /* :169 WREN */
    await nw(io, 0x00A0, 0x01);                                           /* :170 */
    await nw(io, 0x00A0, 0x00);                                           /* :171 */
    await nw(io, 0x0099, zeros(9));                                       /* :172 */
    await nw(io, 0x0099, 0xC7);                                           /* :173 Chip Erase */
    await nw(io, 0x00A0, 0x01);                                           /* :174 */
    await nw(io, 0x00A0, 0x00);                                           /* :175 */
    var fin = await EN.waitReady(io, 400, cx.aborted);                    /* :178；DM:89–91 */
    if (!fin) { cx.log('i2c.sfLogEn01EraseAllAbort', {}, 'w'); return { ok: false, aborted: true }; }
    return { ok: true };
  };

  /* 每個型號在畫面上要列的 slave（7-bit）。8-bit 只拿來顯示：寫＝<<1、讀＝<<1|1。 */
  var SLAVES = {
    E501B: [['ctl', 0x3E, 2], ['st', 0x7C, 1], ['port', 0x64, 1], ['id', 0x7D, 2]],
    E501A: [['ctl', 0x3E, 2], ['stA', 0x7C, 1], ['port', 0x64, 1]],
    EM01:  [['reg', 0x68, 2], ['mem', 0x58, 4]],
    EN01:  [['ctlN', 0x3E, 2], ['port', 0x64, 1]]
  };

  var PROFILES = { E501B: e501Profile(false), E501A: e501Profile(true), EM01: EM01, EN01: EN01 };
  Object.keys(PROFILES).forEach(function (k) { PROFILES[k].slaves = SLAVES[k]; });

  /* 範圍檢查：起點、長度都以 4 KB 為單位（PY:33624、32819、32836；EM01 每次 0x1000，EMT:1165）。 */
  function checkRange(start, len, cap) {
    if (!(start >= 0) || start % SECTOR) return { k: 'i2c.sfErrAlignStart' };
    if (!(len > 0) || len % SECTOR) return { k: 'i2c.sfErrAlignLen' };
    if (start + len > 0x1000000) return { k: 'i2c.sfErrRange24' };
    if (cap && start + len > cap) return { k: 'i2c.sfErrOverCap', v: { cap: '0x' + hx(cap, 6) } };
    return null;
  }
  /* 寫入資料：EM01 不足 4 KB 的尾巴補 0x00（EMF:1737 memset 0）；E501 原廠要求 4096 的倍數（PY:32819）。 */
  function prepWrite(profile, bytes) {
    var d = Array.prototype.slice.call(bytes);
    /* EN01：不補到 4 KB；最後一頁不足 256 B 由 write 補 0x00（ENP:233–235），讀回只比實際長度（ENP:327、366）。 */
    if (profile.padPage) return { data: d, pagePad: (d.length % PAGE) !== 0 };
    if (d.length % SECTOR) {
      if (!profile.padZero) return { err: { k: 'i2c.sfErrFileLen', v: { n: d.length } } };
      while (d.length % SECTOR) d.push(0x00);
    }
    return { data: d };
  }

  var api = { PROFILES: PROFILES, WP: WP, SECTOR: SECTOR, PAGE: PAGE, jedecInfo: jedecInfo,
              checkRange: checkRange, prepWrite: prepWrite, hx: hx, en01IsA1: en01IsA1, _E501: E501, _EM: EM, _EN: EN };
  root.I2CSF = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
