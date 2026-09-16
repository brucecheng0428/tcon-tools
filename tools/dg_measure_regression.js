/* ═══════════════════════════════════════════════════════════════════════════
   dg-measure.html 的「假 CA-410」回歸夾具（jsdom）
   ───────────────────────────────────────────────────────────────────────────
   用途：階段 1 transport 重構的驗收 —— 重構前後各跑一輪完整 256 階量測，
         把回傳給 DG 頁的 rows 逐筆 diff。**沒有真機也能跑，而且可重現。**

   🔴 這支夾具的鑑別力來自哪裡：假儀器回報的 Lv／x／y 是從
      `document.body.style.background` **當場讀出來的**，不是憑空產生。
      所以只要 setFill()／量測迴圈／通訊層任何一處走樣，rows 立刻不一樣。

   用法（jsdom 不進版控，第一次要自己裝一份）：
     mkdir -p /tmp/h && cd /tmp/h && npm install jsdom
     NODE_PATH=/tmp/h/node_modules node tools/dg_measure_regression.js <html 檔> <輸出 json>

   然後把兩份 json 的 `result`（去掉 `at`／`durMs` 兩個本來就會變的欄位）、
   `cmds`、`logs`（數字正規化後）逐項比對，差異必須是 0。

   🔴 這支**不是** pre-commit 檢查（它要跑一輪 256 階，數十秒）。它是改動
      dg-measure.html 通訊層／量測迴圈時的手動回歸閘門。
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { TextEncoder, TextDecoder } = require('util');

const htmlPath = process.argv[2];
const outPath = process.argv[3];
if (!htmlPath || !outPath) { console.error('usage: harness.js <html> <out.json>'); process.exit(2); }

const repoDir = path.dirname(path.resolve(htmlPath));

/* ── 把外部 <script src> 就地內嵌（jsdom 不去抓檔案，省掉 resource loader）── */
let html = fs.readFileSync(htmlPath, 'utf8');
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
  const f = path.join(repoDir, src.split('?')[0]);
  if (!fs.existsSync(f)) return '<script>/* missing ' + src + ' */</script>';
  return '<script>\n' + fs.readFileSync(f, 'utf8') + '\n</script>';
});

/* ═══ 假 CA-410 ═══════════════════════════════════════════════════════════
   只實作 dg-measure.html 真的會碰到的那幾個成員：
   open/close/getInfo/readable.getReader()/writable.getWriter()。
   ═════════════════════════════════════════════════════════════════════════ */
function makeFakeCA410(getBg) {
  const enc = new TextEncoder();
  let opened = false;
  let queue = [];            // 等著被 read() 拿走的 Uint8Array
  let waiter = null;         // 目前掛著的 read() resolver
  let cancelled = false;
  const seen = [];           // 收到的每一道指令（診斷用）

  function push(text) {
    const b = enc.encode(text + '\r');
    if (waiter) { const w = waiter; waiter = null; w({ value: b, done: false }); }
    else queue.push(b);
  }

  function reply(line) {
    seen.push(line);
    const c = line.split(',')[0];
    if (c === 'BPR') return 'OK00,38400';            // 握手（DGM_HS_OK 的形狀）
    if (c === 'MVS') return 'OK00,60.00';            // 畫面更新率
    if (c === 'MES') {
      /* 🔴 有鑑別力的那一行：量到什麼，取決於頁面現在填了什麼顏色 */
      const m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(getBg() || '');
      if (!m) return 'ER99';
      const r = +m[1], g = +m[2], b = +m[3];
      const lin = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
      const lv = Math.round(Math.pow(lin, 2.2) * 300 * 10000) / 10000;
      const sum = r + g + b || 1;
      const x = Math.round(((r + 1) / (sum + 3)) * 10000) / 10000;
      const y = Math.round(((g + 1) / (sum + 3)) * 10000) / 10000;
      return 'OK00,P1,0,' + x.toFixed(4) + ',' + y.toFixed(4) + ',' + lv.toFixed(4) + ',0,0';
    }
    return 'OK00';                                    // COM/SCS/FSC/OPR/... 一律 OK
  }

  const dec = new TextDecoder();
  let txBuf = '';
  function onBytes(u8) {
    txBuf += dec.decode(u8);
    let i;
    while ((i = txBuf.indexOf('\r')) >= 0) {
      const line = txBuf.slice(0, i); txBuf = txBuf.slice(i + 1);
      const r = reply(line);
      setTimeout(() => push(r), 1);
    }
  }

  const readable = {
    getReader() {
      return {
        read() {
          if (cancelled || !opened) return Promise.resolve({ value: undefined, done: true });
          if (queue.length) return Promise.resolve({ value: queue.shift(), done: false });
          return new Promise(res => { waiter = res; });
        },
        cancel() {
          cancelled = true;
          if (waiter) { const w = waiter; waiter = null; w({ value: undefined, done: true }); }
          return Promise.resolve();
        },
        releaseLock() {}
      };
    }
  };
  const writable = {
    getWriter() {
      return { write(u8) { onBytes(u8); return Promise.resolve(); }, releaseLock() {} };
    }
  };

  const port = {
    _seen: seen,
    _optsUsed: null,
    getInfo() { return { usbVendorId: 0x0f0f, usbProductId: 0x0001 }; },
    open(o) { opened = true; cancelled = false; port._optsUsed = o; return Promise.resolve(); },
    close() {
      opened = false;
      if (waiter) { const w = waiter; waiter = null; w({ value: undefined, done: true }); }
      return Promise.resolve();
    },
    get readable() { return opened && !cancelled ? readable : null; },
    get writable() { return opened ? writable : null; }
  };
  return port;
}

const captured = { msg: null };

const dom = new JSDOM(html, {
  url: 'https://example.invalid/dg-measure.html?mode=gray&task=7',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  beforeParse(win) {
    win.TextEncoder = TextEncoder;
    win.TextDecoder = TextDecoder;
    const port = makeFakeCA410(() => win.document.body.style.background);
    win.__fakePort = port;
    win.navigator.serial = {
      getPorts() { return Promise.resolve([port]); },
      requestPort() { return Promise.resolve(port); },
      addEventListener() {}
    };
    /* 全螢幕：isFs() 先看 fullscreenElement（jsdom 給 null），再看 display-mode
       媒體查詢 —— 讓後者回 true，就等同「F11 型全螢幕」。閘門因此放行，
       而 run() 的控制流與真實全螢幕完全相同。 */
    const realMM = win.matchMedia;
    win.matchMedia = function (q) {
      if (/display-mode:\s*fullscreen/.test(q)) {
        return { matches: true, media: q, addEventListener() {}, addListener() {}, removeEventListener() {} };
      }
      return realMM ? realMM.call(win, q) : { matches: false, media: q, addEventListener() {}, addListener() {} };
    };
    Object.defineProperty(win, 'opener', {
      configurable: true,
      value: { closed: false, postMessage(m) { captured.msg = JSON.parse(JSON.stringify(m)); } }
    });
    win.addEventListener('error', e => console.error('[page error]', e.message));
  }
});

const win = dom.window;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function waitFor(fn, ms, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(30); }
  throw new Error('等不到：' + label);
}

(async function main() {
  await waitFor(() => win.document.getElementById('dgm-start'), 10000, 'DOM 就緒');
  await sleep(200);

  /* 換階等待選最小值，讓一輪跑得完；兩份檔案用同一個值，diff 才有意義 */
  const sel = win.document.getElementById('dgm-settle');
  sel.value = '100';
  sel.dispatchEvent(new win.Event('change', { bubbles: true }));

  win.document.getElementById('dgm-link').click();
  await waitFor(() => win.dgmProbe && win.dgmProbe.linkActive && win.dgmProbe.linkActive(),
    20000, '連線成功');

  win.document.getElementById('dgm-start').click();
  await waitFor(() => captured.msg, 600000, '量測回傳');

  const logs = Array.from(win.document.querySelectorAll('#dgm-log div'))
    .map(d => d.textContent.replace(/^\[[\d:.]+\]\s*/, ''));

  fs.writeFileSync(outPath, JSON.stringify({
    result: captured.msg,
    portOpts: win.__fakePort._optsUsed,
    cmds: win.__fakePort._seen,
    logs: logs
  }, null, 1));
  console.log('OK rows=' + (captured.msg.rows || []).length
    + ' prim=' + (captured.msg.prim ? captured.msg.prim.length : 'null')
    + ' cmds=' + win.__fakePort._seen.length);
  process.exit(0);
})().catch(e => { console.error('FAIL', e && e.stack || e); process.exit(1); });
