/* ═══════════════════════════════════════════════════════════════════════════
   i2c_wp_probe.js — i2c v1.25.1 的驗收夾具（jsdom）

   Bruce 2026-09-21：「如果要燒錄 Slave address 是 0x50 的 EEPROM Code 時，
   在燒之前你要下達將 WP 拉 Low 的這個指令。」＋ 裁示「**依照 Python UI 就好**」。

   這支釘住的東西（每一條都對應上游 `RomCodeProcessUI.py` V5.0.4 的行號）：
     ① `wp_low` 的六筆序列：0x0F 讀 → 0x0F 寫(v|0x80) → 08/09 四筆，結尾 0x00
     ② `wp_high` 的四筆序列：08/09 四筆，結尾 0x80，而且**沒有** 0x0F 那兩步
     ③ 框法：wp_low → 寫入 → wp_high → **回讀驗證**（wp_high 在驗證之前）
     ④ 條件：slave ∈ 0x50–0x57 且型號 ≠ DAZ7353；**型號未知也要走**
     ⑤ 寫入失敗／中止時 `wp_high` 仍然補得回去
     ⑥ 正常路徑畫面上一個字都不多；`wp_high` 失敗時畫面上一定要警告

   🔴 **沒驗到**：真治具、真 EEPROM、真的 WP 腳位。這台 Mac 沒有硬體，
      WS 全部是假的。這支能證明「送出去的序列與順序正確」，
      **不能**證明真板子上 WP 真的被拉低了。

   用法：node tools/i2c_wp_probe.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const repo = path.join(__dirname, '..');
let pass = 0, fail = 0;
function CHECK(cond, msg, got) {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg + (got === undefined ? '' : '   got=' + JSON.stringify(got))); }
}
function EQ(a, b, msg) { CHECK(JSON.stringify(a) === JSON.stringify(b), msg, a); }
function H(n) { console.log('\n── ' + n + ' ' + '─'.repeat(Math.max(2, 58 - n.length))); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

let html = fs.readFileSync(path.join(repo, 'i2c.html'), 'utf8');
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
  const f = path.join(repo, src.split('?')[0]);
  return fs.existsSync(f) ? '<script>\n' + fs.readFileSync(f, 'utf8') + '\n</script>' : '<script></script>';
});

/* ── 假 bridge：記下每一則命令，讀取一律回 0（EEPROM 內容），寫入一律 ok ──
   `failOn(m, n)` 可以指定「第 n 則、或符合條件的那一則」回失敗。 */
function makeDom(opts) {
  opts = opts || {};
  const sent = [];
  const mem = {};                       // 假 EEPROM：位址 → 值
  const dom = new JSDOM(html, {
    url: 'http://127.0.0.1:8899/i2c.html', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(win) {
      win.navigator.clipboard = { writeText: () => Promise.resolve() };
      class MockWS {
        constructor(url) {
          this.url = url; this.readyState = 0;
          setTimeout(() => { this.readyState = 1; if (this.onopen) this.onopen(); }, 0);
        }
        send(txt) {
          const m = JSON.parse(txt);
          sent.push(m);
          let rep;
          const bad = opts.failOn && opts.failOn(m, sent.length);
          if (m.type === 'open' || m.type === 'lock' || m.type === 'close' || m.type === 'ping') {
            rep = { ok: true, cmd: m.type, locked: true, helper: '1.16.0', proto: 5 };
          } else if (m.type === 'read') {
            const d = [];
            for (let i = 0; i < m.len; i++) {
              const k = m.slave + ':' + (m.addr + i);
              d.push(mem[k] == null ? 0x00 : mem[k]);
            }
            rep = bad ? { ok: false, cmd: 'read', status: 7, err: 'forced read fail' }
                      : { ok: true, cmd: 'read', status: 0, want: m.len, got: d.length, data: d };
          } else if (m.type === 'rawwrite' || m.type === 'batchwrite') {
            if (!bad) for (let i = 0; i < (m.data || []).length; i++) mem[m.slave + ':' + (m.addr + i)] = m.data[i];
            rep = bad ? { ok: false, cmd: m.type, status: 9, err: 'forced write fail' }
                      : { ok: true, cmd: m.type, status: 0, transferred: (m.data || []).length };
          } else {
            rep = { ok: true, cmd: m.type, status: 0 };
          }
          setTimeout(() => {
            if (this.onmessage) this.onmessage({ data: JSON.stringify(Object.assign({ id: m.id, type: 'result' }, rep)) });
          }, 0);
        }
        close() { this.readyState = 3; if (this.onclose) this.onclose(); }
      }
      win.WebSocket = MockWS;
    }
  });
  return { dom, sent, mem };
}
async function boot(opts) {
  const { dom, sent, mem } = makeDom(opts);
  const win = dom.window;
  await sleep(400);                       // 自動連線（250 ms 的計時器）＋ 沉澱
  const A = win.__i2ct;
  A.eepromAuto('24C32');                  // 🔴 跳過 EEPROM 型號確認視窗（不是本題）
  return { dom, win, A, sent, mem, doc: win.document };
}
/* 只留下「走到匯流排上」的那幾則（open/lock/ping 之類不算） */
const bus = s => s.filter(m => m.type === 'read' || m.type === 'rawwrite' || m.type === 'batchwrite');
const tag = m => (m.type === 'read' ? 'R' : 'W') + ' 0x' + m.slave.toString(16).toUpperCase()
  + '/' + m.awid + 'B/0x' + (m.addr >>> 0).toString(16).toUpperCase()
  + (m.type === 'read' ? (' x' + m.len) : (' <- ' + (m.data || []).map(v => v.toString(16).toUpperCase()).join(',')));

(async function main() {

  /* ═════════════════════════════════════════════════════════════════════ */
  H('① 條件（純函式，與上游逐字相同）');
  {
    const { A } = await boot({});
    EQ(A.wpNeeded(0x50, 'EM02A1'), true, 'slave 0x50 ⇒ 要框 WP');
    EQ(A.wpNeeded(0x57, 'EM02A1'), true, 'slave 0x57（區間上界）⇒ 要');
    EQ(A.wpNeeded(0x4F, 'EM02A1'), false, '0x4F 在區間外 ⇒ 不要');
    EQ(A.wpNeeded(0x58, 'EM02A1'), false, '0x58 在區間外 ⇒ 不要');
    EQ(A.wpNeeded(0x68, 'EM02A1'), false, '暫存器 slave 0x68 ⇒ 不要');
    EQ(A.wpNeeded(0x50, 'DAZ7353'), false, '🔴 唯一的例外型號 DAZ7353 ⇒ 不要');
    EQ(A.wpNeeded(0x50, null), true, '🔴 型號未知也要走（Bruce 2026-09-21 裁示：照上游語意）');
    EQ(A.wpNeeded(0x50, ''), true, '型號是空字串也要走');
    EQ(A.wpNeeded(0x50, 'E503A1 T1'), true, '🔴 條件不收窄成「只有 E503」—— 其他型號一樣走');
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  H('② 完整序列：wp_low → 寫入 → wp_high → 回讀驗證');
  let seqDump = [];
  {
    const { A, sent, doc } = await boot({});
    A.setInputs({ slave: '0x50', awid: 2, off: '0x0000', data: 'AA BB CC' });
    await sleep(20);
    sent.length = 0;
    await A.doWrite();
    await sleep(200);
    const b = bus(sent);
    seqDump = b.map(tag);

    /* wp_low 的六筆 */
    EQ([b[0].type, b[0].slave, b[0].awid, b[0].addr, b[0].len], ['read', 0x7C, 1, 0x0F, 1],
       '① wp_low 第一步：read 0x7C / awid 1 / off 0x0F / 1 byte');
    EQ([b[1].type, b[1].slave, b[1].awid, b[1].addr, b[1].data], ['rawwrite', 0x7C, 1, 0x0F, [0x80]],
       '② 0x0F <- (讀回值 0x00) | 0x80 ＝ 0x80（read-modify-write，不是死值）');
    EQ([b[2].slave, b[2].awid, b[2].addr, b[2].data], [0x7C, 1, 0x08, [0xEE]], '③ 0x08 <- 0xEE');
    EQ([b[3].addr, b[3].data], [0x09, [0x17]], '④ 0x09 <- 0x17');
    EQ([b[4].addr, b[4].data], [0x08, [0xEF]], '⑤ 0x08 <- 0xEF');
    EQ([b[5].addr, b[5].data], [0x09, [0x00]], '🔴 ⑥ 0x09 <- 0x00（＝拉低）');

    /* 真正的寫入 */
    EQ([b[6].slave, b[6].addr, b[6].data], [0x50, 0x0000, [0xAA, 0xBB, 0xCC]],
       '🔴 ⑦ 接著才是真正的 EEPROM 寫入（slave 0x50）');

    /* wp_high 的四筆 —— 🔴 沒有 0x0F */
    EQ([b[7].slave, b[7].awid, b[7].addr, b[7].data], [0x7C, 1, 0x08, [0xEE]], '⑧ 0x08 <- 0xEE');
    EQ([b[8].addr, b[8].data], [0x09, [0x17]], '⑨ 0x09 <- 0x17');
    EQ([b[9].addr, b[9].data], [0x08, [0xEF]], '⑩ 0x08 <- 0xEF');
    EQ([b[10].addr, b[10].data], [0x09, [0x80]], '🔴 ⑪ 0x09 <- 0x80（＝拉回去）');
    const highBlock = b.slice(7, 11);
    EQ(highBlock.filter(m => m.addr === 0x0F).length, 0,
       '🔴 wp_high **沒有** 0x0F 那兩步（上游 L31805 就是不對稱，不要「補成對稱」）');

    /* 回讀驗證在最後 */
    EQ([b[11].type, b[11].slave, b[11].addr], ['read', 0x50, 0x0000],
       '🔴 ⑫ 回讀驗證排在 wp_high **之後**（上游 L30948–30956 的順序）');
    EQ(b.length, 12, '整串就是 6 + 1 + 4 + 1 ＝ 12 則，沒有多餘動作', b.length);

    /* 正常路徑：畫面上不多一句 WP 的話 */
    const top = doc.getElementById('topbanner');
    EQ((top.textContent || '').indexOf('WP') >= 0, false, '🔴 正常路徑最上面那條 banner 一個 WP 字都沒有');
    const rb = doc.getElementById('readbanner');
    EQ((rb.textContent || '').indexOf('WP') >= 0, false, '🔴 結果 banner 也沒有（成功就安靜）');
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  H('③ 0x0F 是 read-modify-write，不是寫死 0x80');
  {
    const { A, sent, mem } = await boot({});
    mem['124:15'] = 0x25;                  // slave 0x7C(124) offset 0x0F(15) 先放一個值
    A.setInputs({ slave: '0x50', awid: 2, off: '0x0000', data: '11' });
    await sleep(20); sent.length = 0;
    await A.doWrite();
    await sleep(200);
    const b = bus(sent);
    EQ(b[1].data, [0xA5], '🔴 讀回 0x25 ⇒ 寫 0x25|0x80 ＝ 0xA5（其餘 7 位保留，沒有被清掉）');
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  H('④ 不該框的情形：一筆 WP 都不送');
  {
    const { A, sent } = await boot({});
    A.setInputs({ slave: '0x68', awid: 2, off: '0x0000', data: '11 22' });
    await sleep(20); sent.length = 0;
    await A.doWrite();
    await sleep(200);
    const b = bus(sent);
    EQ(b.filter(m => m.slave === 0x7C).length, 0, '🔴 寫暫存器 slave 0x68 ⇒ 完全不碰 0x7C');
    EQ(b[0].slave, 0x68, '第一則就是真正的寫入');
  }
  {
    const { A, sent } = await boot({});
    A.ckSetNameForTest('DAZ7353');
    A.setInputs({ slave: '0x50', awid: 2, off: '0x0000', data: '11' });
    await sleep(20); sent.length = 0;
    await A.doWrite();
    await sleep(200);
    EQ(bus(sent).filter(m => m.slave === 0x7C).length, 0, '🔴 型號是 DAZ7353 ⇒ 一筆 WP 都不送（上游唯一的例外）');
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  H('⑤ 寫入失敗也要把 WP 拉回去');
  {
    /* 讓「寫到 0x50」那一筆失敗，0x7C 的都放行 */
    const { A, sent, doc } = await boot({ failOn: m => (m.type === 'rawwrite' || m.type === 'batchwrite') && m.slave === 0x50 });
    A.setInputs({ slave: '0x50', awid: 2, off: '0x0000', data: 'AA BB' });
    await sleep(20); sent.length = 0;
    await A.doWrite();
    await sleep(250);
    const b = bus(sent);
    const last4 = b.slice(-4);
    EQ(last4.map(m => [m.addr, m.data[0]]), [[0x08, 0xEE], [0x09, 0x17], [0x08, 0xEF], [0x09, 0x80]],
       '🔴 寫入失敗 ⇒ 最後四筆仍然是 wp_high（try/finally，不讓板子停在沒保護的狀態）');
    EQ(b.filter(m => m.slave === 0x50 && m.type === 'read').length, 0,
       '寫入失敗 ⇒ 不做回讀驗證（既有規則），但 WP 照樣拉回去');
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  H('⑥ wp_high 補不回去 ⇒ 畫面上一定要警告');
  {
    /* 只讓 0x7C / 0x09 <- 0x80 那一筆失敗 */
    const { A, sent, doc } = await boot({
      failOn: m => m.type === 'rawwrite' && m.slave === 0x7C && m.addr === 0x09 && m.data[0] === 0x80
    });
    A.setInputs({ slave: '0x50', awid: 2, off: '0x0000', data: 'AA' });
    await sleep(20); sent.length = 0;
    await A.doWrite();
    await sleep(250);
    const top = (doc.getElementById('topbanner').textContent || '');
    CHECK(top.indexOf('WP') >= 0, '🔴 最上面那條 banner 出現 WP 警告', top.slice(0, 60));
    CHECK(/沒有寫入保護|without write protection|没有写入保护/.test(top),
      '🔴 而且明講「板子可能停在沒有寫入保護的狀態」', top.slice(0, 80));
  }
  {
    /* wp_low 失敗 ⇒ 照上游仍然往下寫，但結果 banner 要帶一句 */
    const { A, sent, doc } = await boot({
      failOn: m => m.type === 'read' && m.slave === 0x7C && m.addr === 0x0F
    });
    A.setInputs({ slave: '0x50', awid: 2, off: '0x0000', data: 'AA' });
    await sleep(20); sent.length = 0;
    await A.doWrite();
    await sleep(250);
    const b = bus(sent);
    CHECK(b.some(m => m.slave === 0x50 && (m.type === 'rawwrite' || m.type === 'batchwrite')),
      '🔴 wp_low 失敗仍然往下寫（上游不檢查這個回傳值，不自作主張中止他的燒錄）');
    const rb = (doc.getElementById('readbanner').textContent || '');
    CHECK(rb.indexOf('WP') >= 0, '🔴 但結果 banner 要帶一句 WP 拉低失敗', rb.slice(-80));
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  H('⑦ i18n 三語');
  {
    const src = fs.readFileSync(path.join(repo, 'common/i18n.js'), 'utf8');
    const keys = ['i2c.logWpLow', 'i2c.logWpHigh', 'i2c.logWpLowFail', 'i2c.logWpHighFail',
                  'i2c.bnWpHighFail', 'i2c.bnWpLowFail'];
    let bad = [];
    for (const k of keys) {
      const i = src.indexOf("'" + k + "'");
      if (i < 0) { bad.push(k + ':missing'); continue; }
      const row = src.slice(i, src.indexOf('\n', src.indexOf('},', i)));
      for (const lang of ['zh-TW', 'en', 'zh-CN']) if (row.indexOf("'" + lang + "'") < 0) bad.push(k + ':' + lang);
    }
    EQ(bad, [], `新增的 ${keys.length} 個 key 三語全部齊全`);
  }

  console.log('\n── 第 ② 組實際送出去的序列（給 Bruce 覆核）' + '─'.repeat(18));
  seqDump.forEach((s, i) => console.log('   ' + String(i + 1).padStart(2) + '. ' + s));

  console.log('\n' + '═'.repeat(64));
  console.log('  pass ' + pass + '   fail ' + fail);
  console.log('  🔴 沒驗到：真治具、真 EEPROM、真的 WP 腳位（這台 Mac 沒有硬體）');
  console.log('═'.repeat(64));
  process.exit(fail ? 1 : 0);
})();
