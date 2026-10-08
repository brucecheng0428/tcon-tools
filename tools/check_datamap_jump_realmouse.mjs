// 用法：node tools/check_datamap_jump_realmouse.mjs <repo> <EM01 code.bin>
// v1.18.15（Bruce 10/8 回報 v1.18.14「點 SD Out／TCON Out 沒有跳」）：
//   jsdom 與先前截圖都是對元素直接 dispatchEvent('click')，不經瀏覽器的命中判定（hit-test）與 CSS pointer-events，
//   所以抓不到「mousedown 一按下就加 .dragging ⇒ 子元素 pointer-events:none ⇒ mouseup／click 落在外層 #dm-pv-wrap」。
//   這支用 headless Chrome＋CDP Input.dispatchMouseEvent 送真的滑鼠按下／放開（由瀏覽器做命中判定），
//   未鎖定、鎖定各點 SD Out 標題、D1、TCON Out 標題、Data 1；另測拖曳 40px 不跳、console 沒有錯誤。
import { spawn } from 'node:child_process'; import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const ROOT = path.resolve(process.argv[2] || '.'), CODE = process.argv[3];
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'dmjump-'));
const port = 9500 + Math.floor(Math.random() * 300);
const ch = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', `--user-data-dir=${prof}`, `--remote-debugging-port=${port}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); c ? pass++ : fail++; };
let tgt; for (let i = 0; i < 60 && !tgt; i++) { await sleep(200); try { tgt = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(x => x.type === 'page'); } catch {} }
const ws = new WebSocket(tgt.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pend = {}, errs = [];
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; }
  if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.text + ' ' + (m.params.exceptionDetails.exception?.description || ''));
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push(m.params.args.map(a => a.value || a.description).join(' ')); };
const cdp = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => { const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) errs.push('eval: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 200)); return r.result?.result?.value; };
try {
  await cdp('Emulation.setDeviceMetricsOverride', { width: 900, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "window.WebSocket=function(){throw new Error('no ws in test')};" });
  await cdp('Page.navigate', { url: 'file://' + path.join(ROOT, 'datamap.html') }); await sleep(1500);
  errs.length = 0;   // 載入時 WebSocket 不可用的錯誤不算
  await ev(`(function(){var e=document.getElementById('dm-model');e.value='EM01';e.dispatchEvent(new Event('change'));return 1})()`); await sleep(200);
  if (CODE) { const b64 = fs.readFileSync(CODE).toString('base64'); await ev(`(function(){var b=atob('${b64}'),u=new Uint8Array(b.length);for(var i=0;i<b.length;i++)u[i]=b.charCodeAt(i);window.dmImportBytes(u,${JSON.stringify(path.basename(CODE))});return 1})()`); await sleep(400); }
  await ev(`(function(){window.__sc=[];var o=Element.prototype.scrollIntoView;Element.prototype.scrollIntoView=function(a){window.__sc.push(this.id||this.className);return o.call(this,a)};return 1})()`);
  // 找元素中心（先把它捲到畫面中間，再清掉這次捲動的紀錄），回傳 viewport 座標
  // 等前一次平滑捲動停下來（scrollY 連續 3 次相同）再算座標，否則座標算完頁面還在動，滑鼠會點空
  const settle = async () => { let last = -1, same = 0; for (let i = 0; i < 80 && same < 3; i++) { const y = await ev('scrollY'); same = y === last ? same + 1 : 0; last = y; await sleep(50); } };
  const center = async sel => { await settle(); const c = await ev(`(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;var r0=e.getBoundingClientRect();scrollTo({top:scrollY+r0.top-400,behavior:'instant'});var r=e.getBoundingClientRect();window.__sc=[];return {x:r.left+r.width/2,y:r.top+r.height/2}})()`); await settle(); return c; };
  const mouse = async (type, x, y, extra = {}) => cdp('Input.dispatchMouseEvent', Object.assign({ type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 }, extra));
  const realClick = async sel => { const c = await center(sel); if (!c) return null; await mouse('mouseMoved', c.x, c.y, { buttons: 0 }); await mouse('mousePressed', c.x, c.y); await sleep(30); await mouse('mouseReleased', c.x, c.y); await sleep(250); return ev('JSON.stringify({sc:window.__sc,lj:window.dmState.lastJump||null})').then(JSON.parse); };
  const cases = [['[data-rowhead="sd"] text', 'dm-drv-sec', 'SD Out 標題'], ['#dm-pv-tft text[data-dlab="D1"]', 'dm-drv-sec', 'D1'],
                 ['[data-rowhead="tc"] text', 'dm-gridbox', 'TCON Out 標題'], ['#dm-pv-tft text[data-dof="1"]', 'dm-gridbox', 'Data 1']];
  for (const locked of [false, true]) {
    if (locked) { await ev(`document.getElementById('dm-pv-lock').click()`); await sleep(300); ok(await ev(`document.getElementById('card-pv').classList.contains('dm-locked')`), '已鎖定接線'); }
    for (const [sel, want, name] of cases) {
      await ev('window.dmState.lastJump=null'); const r = await realClick(sel);
      ok(r && r.sc[0] === want, (locked ? '鎖定' : '未鎖定') + '：真實滑鼠點 ' + name + ' ⇒ 捲到 ' + want + '（實際：' + JSON.stringify(r && r.sc) + '）');
      // v1.18.17：高亮在捲動停下來後才開始 ⇒ 最多等 3 秒；同時確認那時目標已停在頁首下方（上緣約 64px）
      const waitFor = async js => { for (let i = 0; i < 60; i++) { if (await ev(js)) return true; await sleep(50); } return false; };
      if (name === 'Data 1') ok(await waitFor(`document.getElementById('dm-grid').rows[0].cells[1].classList.contains('dm-flashcol')`) && Math.abs(await ev(`document.getElementById('dm-gridbox').getBoundingClientRect().top`) - 64) < 6, (locked ? '鎖定' : '未鎖定') + '：捲到定位後 Data 1 欄高亮（表格上緣在頁首下方）');
      if (name === 'D1') { const fl = await waitFor(`document.getElementById('dm-drv-sec').classList.contains('dm-flash')`), top = Math.round(await ev(`document.getElementById('dm-drv-sec').getBoundingClientRect().top`));
        ok(fl && Math.abs(top - 64) < 6, (locked ? '鎖定' : '未鎖定') + '：捲到定位後 Source Driver 區外框閃（flash=' + fl + '，外框上緣 ' + top + 'px）'); }
    }
  }
  // 拖曳：按在 Data 1 上、移 40px、放開 ⇒ 不跳；接線圖有捲動
  { const c = await center('#dm-pv-tft text[data-dof="1"]'); const sl0 = await ev(`document.getElementById('dm-pv-wrap').scrollLeft`);
    await ev(`document.getElementById('dm-pv-wrap').scrollLeft=200`); const slA = await ev(`document.getElementById('dm-pv-wrap').scrollLeft`);
    /* v1.18.24：24 條線後圖變寬，scrollLeft＝200 時 Data 1 可能捲出可視範圍 ⇒ 改按在「目前看得到的那個 Data k」上（data-dragpick 標記），測試意圖不變 */
    await ev(`(function(){var w=document.getElementById('dm-pv-wrap').getBoundingClientRect();Array.prototype.forEach.call(document.querySelectorAll('#dm-pv-tft text[data-dof]'),function(t){t.removeAttribute('data-dragpick')});var e=Array.prototype.filter.call(document.querySelectorAll('#dm-pv-tft text[data-dof]'),function(t){var r=t.getBoundingClientRect(),x=r.left+r.width/2;return x>w.left+60&&x<w.right-60})[0];if(e)e.setAttribute('data-dragpick','1');return !!e})()`);
    const c2 = await center('#dm-pv-tft text[data-dragpick]');
    await mouse('mouseMoved', c2.x, c2.y, { buttons: 0 }); await mouse('mousePressed', c2.x, c2.y);
    for (let dx = 10; dx <= 40; dx += 10) { await mouse('mouseMoved', c2.x + dx, c2.y); await sleep(20); }
    await mouse('mouseReleased', c2.x + 40, c2.y); await sleep(250);
    const r = JSON.parse(await ev('JSON.stringify({sc:window.__sc,sl:document.getElementById("dm-pv-wrap").scrollLeft})'));
    ok(r.sc.length === 0 && r.sl !== slA, '拖曳 40px：接線圖捲動（scrollLeft ' + slA + ' → ' + r.sl + '），不跳轉');
    const r2 = await realClick('#dm-pv-tft text[data-dragpick]'); ok(r2 && r2.sc[0] === 'dm-gridbox', '拖曳之後再點一下：正常跳轉'); }
  // 一般點擊（沒拖）不能讓接線圖亂捲：按下放開同一點
  ok(errs.length === 0, 'console 沒有錯誤' + (errs.length ? '：' + errs.slice(0, 3).join(' | ') : ''));
} catch (e) { ok(false, 'exception ' + (e.stack || e)); }
console.log((fail ? '✗ ' : '✓ ') + 'check_datamap_jump_realmouse ' + pass + ' pass / ' + fail + ' fail');
ws.close(); ch.kill(); process.exit(fail ? 1 : 0);
