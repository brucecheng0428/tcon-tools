/* ═══════════════════════════════════════════════════════════════════════════
   dg_measure_port_probe.js — dg v1.70.0（dg-measure.html 的選埠出口）驗收夾具

   ═══ 事故 ════════════════════════════════════════════════════════════════
   同事 Tony Fang 的真機 log（Edge 153 / Win10，dg-measure v1.68.1）：

     [15:13:40.750] getPorts() 回 1 個（＝這個網址先前已授權過的埠） · 7 ms
     [15:13:40.752] 　　[0] VID — · PID — ⇒ getInfo() 是空的（非 USB 的埠）
     [15:13:40.753] ★ 走「既有授權」這條路：直接用 [0]，不跳選擇視窗
     [15:13:45.954] ✕ open() 失敗（規格模式（7E2 ＋ RTS/CTS））· NetworkError
     [15:13:51.099] ✕ open() 失敗（相容模式（8N1，無流量控制））· NetworkError

   重按一次 ⇒ 一模一樣的迴圈再跑一遍，每次白等 10.4 秒，**永遠選不到 CA-410**。

   ═══ 根因（三條，都是讀碼 ＋ 這支夾具確認的）═══════════════════════════════
     ① CA-410 是 USB 轉序列 ⇒ `getInfo()` 一定有 usbVendorId／usbProductId。
        他授權到的埠兩個都沒有 ⇒ 那個埠**必然不是量測儀**（型別事實，不是機率）。
        而 v1.68.1 只要 `getPorts()` 非空就直接採用 [0]，不跳選擇視窗。
     ② 失敗訊息只說「量測儀被佔用 —— 關掉 CA-S40」⇒ 把他導向一個沒有開的軟體。
     ③ v1.38.0 留下的已知限制：就算他用「重選儀器」挑對了，下一次連線／run()
        還是走 `getPorts()[0]` ⇒ **他的選擇被丟掉**。這才是真正的死路。

   ═══ 這支釘住的東西 ═══════════════════════════════════════════════════════
     ① open 失敗後「改選其他埠」**出現**，而且按下去真的呼叫 requestPort()
     ② 沒有 VID／PID 的既有授權**不會被自動採用**（改成跳選擇視窗）
     ③ 多個已授權埠時**不自動取 [0]**
     ④ 使用者親手挑過的埠，下一次連線仍然用它（③ 那條已知限制不再成立）
     ⑤ 平常（沒失敗過）「改選其他埠」**不出現**；開成功之後又收回去
     ⑥ 失敗訊息講人話，而且把出口寫在句子裡

   ═══ 🔴 怎麼避免「自己驗自己」════════════════════════════════════════════
     · 假的 `navigator.serial` 是本檔寫的；`dgmChooseAuthorized()` 的期望答案
       也在本檔自己列（表格驅動），不呼叫產品的函式來對答案。
     · 第 ⑦ 組是突變測試：把三個修正各改回 v1.68.1 的寫法，對應的斷言必須變紅。

   🔴 **沒驗到的**：真的 CA-410、真的 COM port、真瀏覽器的選擇視窗與權限。
      jsdom 沒有 Web Serial，這裡整層都是假的。能證明的是「規則怎麼判、
      失敗後出口會不會出現」，不能證明 Tony 的機器上 open 會成功。

   用法：node tools/dg_measure_port_probe.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const repo = path.join(__dirname, '..');
let pass = 0, fail = 0;
function CHECK(cond, msg, got) {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg + (got === undefined ? '' : '   got=' + JSON.stringify(got))); }
}
function EQ(a, b, msg) { CHECK(JSON.stringify(a) === JSON.stringify(b), msg, a); }
function H(n) { console.log('\n── ' + n + ' ' + '─'.repeat(Math.max(0, 58 - n.length))); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

function inlineSrc(html) {
  return html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
    const f = path.join(repo, src.split('?')[0]);
    if (!fs.existsSync(f)) return '<script>/* missing ' + src + ' */</script>';
    return '<script>\n' + fs.readFileSync(f, 'utf8') + '\n</script>';
  });
}
const SRC = fs.readFileSync(path.join(repo, 'dg-measure.html'), 'utf8');
const ORIGIN = 'https://example.invalid';

/* ═══ 假的序列埠 ══════════════════════════════════════════════════════════
   `info` ＝ getInfo() 要回什麼（`{}` ＝ 空的，就是 Tony 那一個）。
   `openFails` ＝ open() 一律丟 NetworkError（重現他的症狀）。 */
function makePort(info, openFails, tag) {
  const st = { opened: 0, closed: 0 };
  const p = {
    tag: tag || '', st,
    getInfo: () => info,
    get readable() { return p._open ? { getReader: () => ({ read: () => new Promise(() => {}), cancel: async () => {}, releaseLock: () => {} }) } : null; },
    get writable() { return p._open ? { getWriter: () => ({ write: async () => {}, releaseLock: () => {} }) } : null; },
    open: async () => {
      st.opened++;
      if (openFails) { const e = new Error('Failed to open serial port.'); e.name = 'NetworkError'; throw e; }
      p._open = true;
    },
    close: async () => { st.closed++; p._open = false; }
  };
  return p;
}
const CA410 = () => makePort({ usbVendorId: 0x0BDA, usbProductId: 0x5678 }, false, 'CA410');
const ONBOARD = () => makePort({}, true, 'ONBOARD');     // Tony 那一個：沒有 VID/PID，open 一定失敗

/* 假的 navigator.serial。`granted` ＝ getPorts() 要回的清單；
   `chooser` ＝ requestPort() 要回哪一個（null ⇒ 丟 NotFoundError ＝ 使用者取消）。 */
function makeSerial(granted, chooser) {
  const st = { getPorts: 0, requestPort: 0 };
  return {
    st,
    api: {
      getPorts: async () => { st.getPorts++; return granted.slice(); },
      requestPort: async () => {
        st.requestPort++;
        if (!chooser) { const e = new Error('No port selected by the user.'); e.name = 'NotFoundError'; throw e; }
        return chooser;
      }
    }
  };
}

async function load(opts) {
  opts = opts || {};
  const errs = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errs.push(String(e.message)));
  const dom = new JSDOM(inlineSrc(opts.src || SRC), {
    url: ORIGIN + '/dg-measure.html' + (opts.qs || ''),
    runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc
  });
  await sleep(180);
  const w = dom.window;
  /* 🔴 端到端那幾組預設把「連線參數」設成 legacy（8N1）—— 這是畫面上真的有的選項。
     理由：auto 會先試規格模式，而規格模式要等 3 秒握手逾時再退回，加上 1 秒
     readLoop 的等待，每一次連線要 4.2 秒；這幾組驗的是**選埠與出口**，
     與握手無關。`serialMode: 'auto'` 可以要回原本的行為（第 ⑤ 組用得到）。 */
  if (w.dgmProbe && w.dgmProbe.setSerialMode) w.dgmProbe.setSerialMode(opts.serialMode || 'legacy');
  let serial = null;
  if (opts.granted) {
    serial = makeSerial(opts.granted, opts.chooser === undefined ? null : opts.chooser);
    Object.defineProperty(w.navigator, 'serial', { value: serial.api, configurable: true });
  }
  return { dom, w, doc: w.document, P: w.dgmProbe, errs, serial };
}

(async function main() {

  /* ═══════════════════════════════════════════════════════════════════════
     ① 純函式：getInfo() 有沒有 VID／PID
     ═══════════════════════════════════════════════════════════════════════ */
  H('① portHasUsbIds（純函式）');
  {
    const { P } = await load({});
    EQ(P.portHasUsbIds(CA410()), true, 'CA-410 這種（有 VID／PID）⇒ true');
    EQ(P.portHasUsbIds(ONBOARD()), false, '🔴 Tony 那一個（getInfo() 是空的）⇒ false');
    EQ(P.portHasUsbIds(makePort({ usbVendorId: 0x1234 }, false)), false, '只有 VID 沒有 PID ⇒ false');
    EQ(P.portHasUsbIds(makePort({ usbProductId: 0x1234 }, false)), false, '只有 PID 沒有 VID ⇒ false');
    /* VID／PID 是 0 是合法的值 —— 不可以被 falsy 判斷吃掉 */
    EQ(P.portHasUsbIds(makePort({ usbVendorId: 0, usbProductId: 0 }, false)), true,
      '🔴 VID／PID 都是 0 ⇒ true（0 是合法值，不可以用 falsy 判）');
    EQ(P.portHasUsbIds(null), false, 'null ⇒ false（不丟例外）');
    EQ(P.portHasUsbIds({ getInfo: () => { throw new Error('boom'); } }), false,
      'getInfo() 丟例外 ⇒ false（不讓它炸掉連線流程）');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ② 純函式：既有授權要不要直接採用（三條規則的每一個分支）
     ═══════════════════════════════════════════════════════════════════════ */
  H('② chooseAuthorized（三條規則）');
  {
    const { P } = await load({});
    const ca = CA410(), ob = ONBOARD(), ca2 = CA410();
    /* 表格驅動：期望的 code 在本檔自己列，不問產品。 */
    const CASES = [
      { ports: [],         picked: null, code: 'none',   use: null, why: '一個都沒授權 ⇒ 跳選擇視窗' },
      { ports: [ca],       picked: null, code: 'single', use: ca,   why: '唯一且有 VID／PID ⇒ 直接用（便利路徑保留）' },
      { ports: [ob],       picked: null, code: 'noids',  use: null, why: '🔴 唯一但沒有 VID／PID ⇒ 不自動用（Tony 的情況）' },
      { ports: [ca, ca2],  picked: null, code: 'many',   use: null, why: '🔴 有兩個 ⇒ 不盲取 [0]' },
      { ports: [ob, ca],   picked: null, code: 'many',   use: null, why: '🔴 兩個（其中一個是好的）也不替他挑' },
      { ports: [ca, ca2],  picked: ca2,  code: 'picked', use: ca2,  why: '🔴 他親手挑過 ca2 ⇒ 用 ca2，不是 [0]' },
      { ports: [ob],       picked: ob,   code: 'picked', use: ob,   why: '他親手挑的就算沒有 VID／PID 也照他的意思（那是他的決定）' },
      { ports: [ca],       picked: ca2,  code: 'single', use: ca,   why: '他挑過的那個已經不在授權清單裡 ⇒ 退回一般規則' }
    ];
    for (const c of CASES) {
      const r = P.chooseAuthorized(c.ports, c.picked);
      EQ(r.code, c.code, c.why + '（code）');
      CHECK(r.port === c.use, c.why + '（用哪一個）',
        r.port ? r.port.tag : null);
      CHECK(typeof r.why === 'string' && r.why.length > 4, '而且有一句可以寫進 log 的理由', r.why);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ③ 🔴 端到端重現 Tony 的情況：沒有 VID／PID 的授權埠不得被自動採用
     ═══════════════════════════════════════════════════════════════════════ */
  H('③ 🔴 重現 Tony：noids ⇒ 跳選擇視窗，不硬開');
  {
    const ob = ONBOARD();
    const { P, serial } = await load({ granted: [ob], chooser: null });   // chooser null ＝ 他按取消
    const ok = await P.serialOn();
    await sleep(40);
    CHECK(ok === false, '連線回傳 false（他按了取消）');
    EQ(serial.st.getPorts, 1, 'getPorts() 叫過一次');
    /* 🔴 這一條就是核心：v1.68.1 會直接開那個埠，v1.70.0 改成跳選擇視窗 */
    EQ(serial.st.requestPort, 1, '🔴 改成跳選擇視窗（requestPort 被呼叫）');
    EQ(ob.st.opened, 0, '🔴 那個沒有 VID／PID 的埠**一次都沒有被 open**（省掉 10.4 秒白等）');
    const lg = (P.linkLog() || []).join('\n');
    CHECK(/noids/.test(lg), 'log 寫明判定是 noids', lg.slice(-300));
    CHECK(/VID／PID/.test(lg), 'log 講了為什麼（沒有 USB VID／PID）');
    /* 🔴 他按取消之後那句話也要看「當初為什麼跳這個視窗」——
       `DGM_ERR.noPort` 的「接上 USB 再按一次」對這一種是錯的建議（USB 早就接著了）。 */
    const mt = P.msgText() || '';
    CHECK(mt.indexOf('VID／PID') >= 0,
      '🔴 取消之後那句話講了為什麼（那個埠沒有 VID／PID）', mt);
    CHECK(mt.indexOf('接上 USB') < 0,
      '🔴 而且不再叫他「接上 USB」（USB 早就接著了，錯的建議比沒有建議更糟）', mt);
  }
  {
    /* 同樣情況，但他這次在選擇視窗裡挑了真的 CA-410 ⇒ 應該開成功 */
    const ob = ONBOARD(), ca = CA410();
    const { P } = await load({ granted: [ob], chooser: ca });
    const ok = await P.serialOn();
    await sleep(60);
    CHECK(ok === true, '🔴 他在視窗裡挑了真的 CA-410 ⇒ 連線成功');
    EQ(ca.st.opened >= 1, true, 'CA-410 那個埠真的被 open 了', ca.st.opened);
    EQ(ob.st.opened, 0, '那個內建 COM 還是一次都沒被 open');
    /* 🔴 v1.38.0 的已知限制：他挑的要被記住，下一次不可以又回去用授權清單的 [0] */
    CHECK(P.pickedPortRef() === ca, '🔴 他挑的那一個被記住了（pickedPortRef）');
    const again = P.chooseAuthorized([ob, ca], P.pickedPortRef());
    EQ(again.code, 'picked', '🔴 下一次連線的判定是 picked ⇒ 不會再被 [0] 蓋掉');
    CHECK(again.port === ca, '🔴 而且用的就是他挑的 CA-410', again.port && again.port.tag);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ④ 🔴 open 失敗 ⇒「改選其他埠」出現，按下去真的重跳選擇視窗
     ═══════════════════════════════════════════════════════════════════════ */
  H('④ 🔴 open 失敗後的出口');
  {
    /* 這一次給一個**有 VID／PID 但打不開**的埠（走 single 那條便利路徑進去，
       然後在 open 撞牆）—— 這樣驗到的是「失敗之後有沒有出口」，
       與第 ③ 組的「該不該自動採用」是兩件事。 */
    const bad = makePort({ usbVendorId: 0x1111, usbProductId: 0x2222 }, true, 'BAD');
    const good = CA410();
    const { P, serial, doc } = await load({ granted: [bad], chooser: good });
    EQ(P.repickShown(), false, '🔴 平常（還沒失敗過）「改選其他埠」不出現');
    const ok = await P.serialOn();
    await sleep(60);
    CHECK(ok === false, '開不起來 ⇒ 連線失敗');
    CHECK(bad.st.opened >= 1, '前置條件：那個埠真的被試著開過', bad.st.opened);
    EQ(P.portFailed(), true, 'portFailed 被標起來');
    /* 🔴 Bruce 指定的第一條，也是最重要的一條 */
    EQ(P.repickShown(), true, '🔴 open 失敗之後「改選其他埠」出現了');
    EQ(P.repickDisabled(), false, '而且可以按');
    const m = P.msgText() || '';
    CHECK(m.indexOf('改選其他埠') >= 0,
      '🔴 失敗訊息把出口寫在句子裡（叫他按那顆鈕）', m);
    CHECK(m.indexOf('不是量測儀') >= 0,
      '🔴 而且講了「可能選到的不是量測儀」，不是只說被佔用', m);
    CHECK(m.indexOf('NetworkError') < 0, '畫面上不丟 NetworkError 這種字給使用者', m);
    /* 按下去 ⇒ 真的呼叫 requestPort()，而且用新埠重試 */
    const before = serial.st.requestPort;
    P.repickClick();
    await sleep(400);
    EQ(serial.st.requestPort, before + 1, '🔴 按「改選其他埠」真的呼叫了 requestPort()');
    CHECK(good.st.opened >= 1, '🔴 選完之後用**新的埠**重試（新埠被 open 了）', good.st.opened);
    EQ(P.portFailed(), false, '🔴 新埠開成功 ⇒ 旗標清掉');
    EQ(P.repickShown(), false, '🔴 而且那顆鈕收回去（不留在畫面上）');
    EQ(P.errText().busy.indexOf('改選其他埠') >= 0, true, 'DGM_ERR.busy 本身就帶著出口');
    CHECK(!!doc.getElementById('dgm-repick'), '鈕在 DOM 裡（不是動態插的）');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ⑤ 多個已授權埠：不自動取 [0]（端到端）
     ═══════════════════════════════════════════════════════════════════════ */
  H('⑤ 多埠：不自動取 [0]');
  {
    const a = CA410(), b = CA410();
    const { P, serial } = await load({ granted: [a, b], chooser: b });
    const ok = await P.serialOn();
    await sleep(60);
    CHECK(ok === true, '連線成功（他在視窗裡挑了 b）');
    EQ(serial.st.requestPort, 1, '🔴 有兩個授權埠 ⇒ 跳選擇視窗，不自動挑');
    EQ(a.st.opened, 0, '🔴 [0] 那個一次都沒被 open');
    CHECK(b.st.opened >= 1, '開的是他挑的那一個', b.st.opened);
    CHECK((P.msgText() || '').indexOf('多個') >= 0,
      '畫面上講了為什麼又被問一次（有多個）', P.msgText());
  }
  {
    /* 唯一且有 VID／PID ⇒ 便利路徑**保留**（Bruce 機器上一直能動的那一條） */
    const a = CA410();
    const { P, serial } = await load({ granted: [a], chooser: null });
    const ok = await P.serialOn();
    await sleep(60);
    CHECK(ok === true, '🔴 唯一且有 VID／PID ⇒ 直接用，行為與 v1.68.1 逐字相同');
    EQ(serial.st.requestPort, 0, '🔴 不跳選擇視窗（便利路徑沒有被犧牲）');
    CHECK(a.st.opened >= 1, '直接開它', a.st.opened);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ⑥ 🔴 突變測試：把三個修正各改回 v1.68.1 的寫法
     ═══════════════════════════════════════════════════════════════════════ */
  H('⑥ 🔴 突變測試');
  {
    /* 突變 1：回到「清單非空就用 [0]」⇒ 第 ③ 組必須紅 */
    const orig = 'var choice = dgmChooseAuthorized(ports, dgmPickedPort);';
    CHECK(SRC.indexOf(orig) > 0, '找得到選埠判定那一行');
    const mut = SRC.replace(orig,
      "var choice = ports.length ? { port: ports[0], code: 'single', why: 'mutated' } : { port: null, code: 'none', why: 'mutated' };");
    const ob = ONBOARD();
    const { P, serial } = await load({ src: mut, granted: [ob], chooser: null });
    await P.serialOn();
    await sleep(60);
    EQ(serial.st.requestPort, 0, '🔴 突變後又不跳選擇視窗了 ⇒ 證明第 ③ 組真的在驗東西');
    CHECK(ob.st.opened >= 1,
      '🔴 突變後那個沒有 VID／PID 的埠又被硬開了（＝ Tony 的 10.4 秒白等）', ob.st.opened);
  }
  {
    /* 突變 2：把失敗收尾拿掉 ⇒ 第 ④ 組必須紅 */
    const orig = '{ dgmOpenFailed(); return false; }';
    CHECK(SRC.split(orig).length - 1 === 2, '兩個開埠呼叫點都有失敗收尾');
    const mut = SRC.split(orig).join('return false;');
    const bad = makePort({ usbVendorId: 1, usbProductId: 2 }, true, 'BAD');
    const { P } = await load({ src: mut, granted: [bad], chooser: null });
    await P.serialOn();
    await sleep(60);
    EQ(P.repickShown(), false,
      '🔴 突變後 open 失敗也不出現出口 ⇒ 證明第 ④ 組真的在驗東西（這就是 v1.68.1 的死路）');
  }
  {
    /* 突變 3：把「記住他挑的埠」拿掉 ⇒ 第 ③ 組後半必須紅 */
    const orig = '      dgmPickedPort = dgmSerialCh.port;';
    CHECK(SRC.indexOf(orig) > 0, '找得到「記住他挑的埠」那一行');
    const mut = SRC.replace(orig, '      /* mutated */');
    const ob = ONBOARD(), ca = CA410();
    const { P } = await load({ src: mut, granted: [ob], chooser: ca });
    await P.serialOn();
    await sleep(60);
    CHECK(P.pickedPortRef() === null,
      '🔴 突變後他挑的埠沒被記住 ⇒ 下一次又會走一般規則（v1.38.0 的已知限制）');
  }

  console.log('\n' + '═'.repeat(64));
  console.log('  pass ' + pass + '   fail ' + fail);
  console.log('═'.repeat(64));
  console.log('🔴 這支驗不到的：真的 CA-410、真的 COM port、真瀏覽器的選擇視窗與權限。');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
