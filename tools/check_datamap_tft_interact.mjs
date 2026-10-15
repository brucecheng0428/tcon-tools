// 用法：node tools/check_datamap_tft_interact.mjs <repo> [型號,型號…]
// v1.31.0（Bruce 10/14）：TFT 接線圖互動回歸（一般／並排 sticky／預覽小窗三處）＋四邊四角拖動改大小。
//   headless Chrome＋CDP Input.dispatchMouseEvent 送真的滑鼠（瀏覽器自己做命中判定、算 CSS cursor）：
//   ・sub-pixel 上游標＝grab；拖曳 40px ⇒ 圖捲動、不跳轉；
//   ・TCON Out／SD Out 標題、Data 1、D1 真點擊 ⇒ 捲到 Data Mapping 表格／Source Driver 區（與 v1.27.7 相同目標），連結游標＝pointer；
//   ・接線圖區與小窗 8 個邊角：游標＝對應 resize、拖動改大小（左／上邊跟著滑鼠）、存 localStorage、重新載入沿用、雙擊恢復預設；
//   ・console 沒有錯誤。
// v1.35.4（Bruce 10/15「按下並排的時候，TFT 預覽還是要可以做出來」）：加「並排＋小窗」模式——並排開著真點「TFT 預覽」⇒ 小窗開、內容＝#dm-pv-tft 同一份、
//   改設定即時同步、關並排／再開並排小窗不被關，之後同一套拖曳／跳轉／8 邊角改大小全跑。
// v1.35.10（Bruce 10/15）：小窗內「V 方向 Line 數」「畫面樣式」與 TFT 卡同一份狀態（兩邊互改、鎖定前後顯示一致、渲染相同）；
//   並排＋預覽 ⇒ TFT 卡自動收折（不寫入 dm.fold.v1）、關預覽不強制展開、手動展開後不會又被收起來、再次進入並排＋預覽才再收。
import { spawn } from 'node:child_process'; import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const ROOT = path.resolve(process.argv[2] || '.');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); c ? pass++ : fail++; };
const CUR = { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize' };

let S_MODEL = 'EM01', S_HAND = false;
async function session(width, height) {
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'dmtfti-'));
  const port = 9300 + Math.floor(Math.random() * 400);
  const ch = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', `--user-data-dir=${prof}`, `--remote-debugging-port=${port}`, 'about:blank'], { stdio: 'ignore' });
  let tgt; for (let i = 0; i < 60 && !tgt; i++) { await sleep(200); try { tgt = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(x => x.type === 'page'); } catch {} }
  const ws = new WebSocket(tgt.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let id = 0; const pend = {}, errs = [];
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; }
    if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.text + ' ' + (m.params.exceptionDetails.exception?.description || ''));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push(m.params.args.map(a => a.value || a.description).join(' ')); };
  const cdp = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async expr => { const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) errs.push('eval: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 300)); return r.result?.result?.value; };
  await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "window.WebSocket=function(){throw new Error('no ws in test')};" });
  const load = async () => { await cdp('Page.navigate', { url: 'file://' + path.join(ROOT, 'datamap.html') }); await sleep(1500); errs.length = 0;
    await ev(`(function(){var e=document.getElementById('dm-model');e.value=${JSON.stringify(S_MODEL)};e.dispatchEvent(new Event('change'));return 1})()`); await sleep(300);
    if (S_HAND) { await ev(`(function(){var h=document.getElementById('dm-hand');if(!h.checked){h.checked=true;h.dispatchEvent(new Event('change'))}return 1})()`); await sleep(300); }
    await ev(`(function(){window.__sc=[];var o=Element.prototype.scrollIntoView;Element.prototype.scrollIntoView=function(a){window.__sc.push(this.id||this.className);return o.call(this,a)};return 1})()`); };
  const mouse = (type, x, y, extra = {}) => cdp('Input.dispatchMouseEvent', Object.assign({ type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 }, extra));
  const settle = async () => { let last = -1, same = 0; for (let i = 0; i < 80 && same < 3; i++) { const y = await ev('scrollY'); same = y === last ? same + 1 : 0; last = y; await sleep(50); } };
  const close = () => { try { ws.close(); } catch {} ch.kill(); };
  return { cdp, ev, mouse, settle, load, errs, close };
}

async function runMode(mode, model, hand) {
  S_MODEL = model; S_HAND = hand;
  const W = (mode === 'side' || mode === 'sidemini') ? 1400 : 900, H = 1000;
  const S = await session(W, H); const { ev, mouse, settle, load, errs } = S;
  const tag = model + (hand ? '／Hand' : '') + '／' + { normal: '一般', side: '並排', mini: '小窗', sidemini: '並排＋小窗' }[mode];
  const MM = mode === 'mini' || mode === 'sidemini';
  const SAMEM = `(function(){var a=document.querySelector('#dm-mini-svg > svg'),b=document.getElementById('dm-pv-tft');return !!a&&b.childElementCount>0&&a.innerHTML===b.innerHTML})()`;
  const waitSame = async () => { for (let i = 0; i < 40; i++) { if (await ev(SAMEM)) return true; await sleep(100); } return false; };
  const rclick = async sel => { const c = await ev(`(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;var r=e.getBoundingClientRect();return r.width>0&&r.height>0?{x:r.left+r.width/2,y:r.top+r.height/2}:null})()`);
    if (!c) return false; await mouse('mouseMoved', c.x, c.y, { buttons: 0 }); await mouse('mousePressed', c.x, c.y); await mouse('mouseReleased', c.x, c.y); await sleep(350); return true; };
  const FOLDED = `window.dmFold.isFolded('card-tft')`;
  const setVl = (id, v) => ev(`(function(){var e=document.getElementById('${id}');e.value='${v}';e.dispatchEvent(new Event('change'));return 1})()`);
  const ctlCheck = async () => {   // v1.35.10：小窗控制＝TFT 卡控制（同一份狀態）
    ok(await ev(`(function(){var m=document.getElementById('dm-mini-vl'),p=document.getElementById('dm-pv-vl');return !!m&&m.offsetParent!==null&&m.value===p.value})()`), tag + '：小窗有「V 方向 Line 數」且值＝TFT 卡');
    await setVl('dm-mini-vl', 8); await sleep(300);
    ok(await ev(`document.getElementById('dm-pv-vl').value==='8'&&document.getElementById('dm-pv-tft').getAttribute('data-vlsel')==='8'`) && await waitSame(), tag + '：小窗改 V Line 8 ⇒ TFT 卡下拉＝8、接線圖 8 列、小窗渲染＝TFT 卡');
    await setVl('dm-pv-vl', 12); await sleep(300);
    ok(await ev(`document.getElementById('dm-mini-vl').value==='12'`) && await waitSame(), tag + '：TFT 卡改 V Line 12 ⇒ 小窗下拉＝12、渲染相同');
    await setVl('dm-mini-vl', 4); await sleep(300);
    const HID = `[document.getElementById('dm-pv-colmode').classList.contains('hidden'),document.getElementById('dm-mini-colmode').classList.contains('hidden')]`;
    const h0 = await ev(HID);
    ok(h0[0] === true && h0[1] === true, tag + '：鎖定前畫面樣式兩邊都不顯示（與 TFT 卡相同）');
    await ev(`document.getElementById('dm-pv-lock').click()`); await sleep(500);
    const h1 = await ev(HID);
    if (h1[0]) { console.log('  · ' + tag + '：此型號無法鎖定，畫面樣式同步改由其他型號驗'); return; }
    ok(h1[1] === false && await ev(`document.getElementById('dm-mini-vl').offsetParent!==null`), tag + '：鎖定後小窗出現畫面樣式、V Line 仍在');
    const PR = `(function(){var o={};['dm-pv-colmode','dm-mini-colmode'].forEach(function(id){var b=document.querySelector('#'+id+' button[aria-pressed="true"]');o[id]=b?b.getAttribute('data-col'):null});return o})()`;
    for (const c of ['R', 'G', 'B', 'R1', '']) {
      await rclick(`#dm-mini-colmode button[data-col="${c}"]`);
      const p = await ev(PR);
      const offN = await ev(`document.querySelectorAll('#dm-pv-tft [data-col="off"]').length`);
      const colN = await ev(`document.querySelectorAll('#dm-pv-tft [data-col]').length`);
      ok(p['dm-pv-colmode'] === c && p['dm-mini-colmode'] === c && (c === '' ? offN === 0 : colN > 0) && await waitSame(), tag + '：小窗真點「' + (c || '全白') + '」⇒ TFT 卡同步選中、渲染相同（off ' + offN + '）');
    }
    await ev(`document.querySelector('#dm-pv-colmode button[data-col="G"]').click()`); await sleep(300);
    ok((await ev(PR))['dm-mini-colmode'] === 'G' && await waitSame(), tag + '：TFT 卡點「只送綠」⇒ 小窗同步選中、渲染相同');
    await setVl('dm-mini-vl', 8); await sleep(300);
    ok(await ev(`document.getElementById('dm-pv-vl').value==='8'`) && (await ev(PR))['dm-pv-colmode'] === 'G' && await waitSame(), tag + '：鎖定後小窗改 V Line 8 ⇒ 兩邊同步、樣式維持');
    await setVl('dm-mini-vl', 4); await ev(`document.getElementById('dm-pv-lock').click()`); await sleep(500);
    const h2 = await ev(HID);
    ok(h2[0] === true && h2[1] === true && await waitSame(), tag + '：解除鎖定 ⇒ 兩邊畫面樣式一起收起');
  };
  try {
    await load();
    if (mode === 'side') ok(await ev(`document.documentElement.classList.contains('dm-side')`), tag + '：並排模式啟用（html.dm-side）');
    if (mode === 'sidemini') {
      ok(await ev(`document.documentElement.classList.contains('dm-side')`), tag + '：並排模式啟用（html.dm-side）');
      const tb = await ev(`(function(){var b=document.getElementById('dm-mini-tog'),r=b.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(b).display!=='none'?{x:r.left+r.width/2,y:r.top+r.height/2}:null})()`);
      ok(!!tb, tag + '：並排時「TFT 預覽」按鈕可見');
      if (tb) { await mouse('mouseMoved', tb.x, tb.y, { buttons: 0 }); await mouse('mousePressed', tb.x, tb.y); await mouse('mouseReleased', tb.x, tb.y); await sleep(500); }
      ok(await ev(`window.dmLive.mini()===true && document.documentElement.classList.contains('dm-side') && !document.getElementById('dm-mini').classList.contains('hidden') && document.getElementById('dm-mini-tog').getAttribute('aria-pressed')==='true'`), tag + '：真點擊後小窗開、並排仍開');
      ok(await ev(FOLDED) && !JSON.parse(await ev(`localStorage.getItem('dm.fold.v1')||'{}'`))['card-tft'], tag + '：並排＋預覽 ⇒ TFT 接線圖卡自動收折（不寫入收摺記憶）');
      await rclick('#dm-mini-x');
      ok((await ev(`window.dmLive.mini()`)) === false && await ev(FOLDED), tag + '：關預覽 ⇒ TFT 卡不強制展開');
      await rclick('#dm-mini-tog');
      ok((await ev(`window.dmLive.mini()`)) === true && await ev(FOLDED), tag + '：再開預覽 ⇒ TFT 卡收折');
      await ev(`document.getElementById('dm-pv-tfth').scrollIntoView({block:'center'})`); await settle();
      await rclick('#dm-pv-tfth .stp-t');
      ok(!(await ev(FOLDED)), tag + '：真點 TFT 卡標題列 ⇒ 手動展開');
      await setVl('dm-mini-vl', 8); await sleep(300); await rclick('#dm-mini-big'); await rclick('#dm-mini-big'); await setVl('dm-mini-vl', 4); await sleep(300);
      ok(!(await ev(FOLDED)) && (await ev(`window.dmLive.mini()`)) === true, tag + '：手動展開後改設定、放大縮小 ⇒ 不會又被收起來');
      const same = `(function(){var a=document.querySelector('#dm-mini-svg > svg'),b=document.getElementById('dm-pv-tft');return !!a&&b.childElementCount>0&&a.innerHTML===b.innerHTML})()`;
      const sameW = async () => { for (let i = 0; i < 40; i++) { if (await ev(same)) return true; await sleep(100); } return false; };   // 小窗同步走 MutationObserver＋rAF，最多等 4 秒
      ok(await sameW(), tag + '：小窗內容＝並排卡 #dm-pv-tft 同一份');
      const HTX = `document.getElementById('dm-pv-tft').innerHTML`;
      const h0 = await ev(HTX);
      const swap = async () => { const c = await ev(`(function(){var b=document.getElementById('dm-pv-swap');b.scrollIntoView({block:'center'});var r=b.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`); await settle(); const c2 = await ev(`(function(){var r=document.getElementById('dm-pv-swap').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`); await mouse('mouseMoved', c2.x, c2.y, { buttons: 0 }); await mouse('mousePressed', c2.x, c2.y); await mouse('mouseReleased', c2.x, c2.y); await sleep(300); };
      const swVis = await ev(`(function(){var b=document.getElementById('dm-pv-swap');return !!b&&b.offsetParent!==null&&!b.disabled})()`);
      if (!swVis) console.log('  · ' + tag + '：此模式沒有可點的「輸出對調」，改型號同步改由其他模式驗');
      if (swVis) { await swap();
      ok(await ev(`document.getElementById('dm-pv-swap').checked`) && (await ev(HTX)) !== h0 && await sameW(), tag + '：真點「Source Driver 輸出對調」⇒ 接線圖改變、小窗即時同步');
      await swap();
      ok(!(await ev(`document.getElementById('dm-pv-swap').checked`)) && (await ev(HTX)) === h0 && await sameW(), tag + '：取消對調 ⇒ 回到原圖、小窗同步'); }
      await ev(`document.getElementById('dm-side-tog').click()`); await sleep(300);
      ok(await ev(`!document.documentElement.classList.contains('dm-side') && window.dmLive.mini()===true`), tag + '：關並排 ⇒ 小窗維持開');
      ok(!(await ev(FOLDED)), tag + '：關並排 ⇒ TFT 卡維持手動展開');
      await ev(`document.getElementById('dm-side-tog').click()`); await sleep(400);
      ok(await ev(`document.documentElement.classList.contains('dm-side') && window.dmLive.mini()===true && getComputedStyle(document.getElementById('card-tft')).position==='sticky'`), tag + '：再開並排 ⇒ 並排 sticky 恢復、小窗維持開');
      ok(await ev(FOLDED), tag + '：再次進入並排＋預覽 ⇒ TFT 卡再自動收折');
      ok(await sameW(), tag + '：切換並排後內容仍同步');
    }
    if (mode === 'mini') { await ev(`window.dmLive.mini(true)`); await sleep(500); ok(await ev(`!document.getElementById('dm-mini').classList.contains('hidden') && !!document.querySelector('#dm-mini-svg svg')`), tag + '：小窗開啟且有接線圖');
      ok(!(await ev(FOLDED)), tag + '：沒有並排時開預覽 ⇒ TFT 卡不收折'); }
    if (MM) await ctlCheck();
    const ROOTSEL = MM ? '#dm-mini-svg svg' : '#dm-pv-tft', SCR = MM ? 'dm-mini-body' : 'dm-pv-wrap';
    // 讓元素在可見範圍（小窗是 fixed：捲小窗本身；卡片：捲頁面）
    const show = async sel => { await settle(); const c = await ev(`(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;
      var sc=document.getElementById('${SCR}'), r0=e.getBoundingClientRect(), b=sc.getBoundingClientRect();
      if (${MM}){ sc.scrollLeft+=r0.left-(b.left+b.width/2); sc.scrollTop+=r0.top-(b.top+b.height/2); }
      else { sc.scrollLeft+=r0.left-(b.left+b.width/2); var r1=e.getBoundingClientRect(); scrollTo({top:scrollY+r1.top-420,behavior:'instant'}); var cd=document.getElementById('card-tft'); if(cd&&cd.scrollHeight>cd.clientHeight){var r2=e.getBoundingClientRect(),cb=cd.getBoundingClientRect(); cd.scrollTop+=r2.top-(cb.top+cb.height/2);} }
      var r=e.getBoundingClientRect();window.__sc=[];return {x:r.left+r.width/2,y:r.top+r.height/2}})()`); await settle(); return c; };
    const curAt = (x, y) => ev(`(function(){var h=document.elementFromPoint(${x},${y});return h?getComputedStyle(h).cursor+'|'+h.tagName:null})()`);
    // 1) sub-pixel 游標＝grab
    await ev(`(function(){var w=document.getElementById('${SCR}').getBoundingClientRect();[].forEach.call(document.querySelectorAll('[data-pick]'),function(t){t.removeAttribute('data-pick')});
      var r=[].filter.call(document.querySelectorAll('${ROOTSEL} rect[data-pv]'),function(t){return !t.closest('[data-rep]')})[7]; if(r) r.setAttribute('data-pick','1'); return !!r})()`);
    const cs = await show(`${ROOTSEL} rect[data-pick]`);
    const hit = await ev(`(function(){var h=document.elementFromPoint(${cs.x},${cs.y});return h&&(h.closest('#${SCR}')?1:0)})()`);
    const cur = await curAt(cs.x, cs.y);
    ok(hit === 1 && /^grab\|/.test(cur || ''), tag + '：滑鼠在 sub-pixel 上游標＝grab（實際 ' + cur + '）');
    // 2) 拖曳 40px ⇒ 捲動、不跳轉；拖曳中 grabbing
    await ev(`document.getElementById('${SCR}').scrollLeft=200`); await sleep(50);
    const c2 = await show(`${ROOTSEL} rect[data-pick]`); const sl0 = await ev(`document.getElementById('${SCR}').scrollLeft`);
    await mouse('mouseMoved', c2.x, c2.y, { buttons: 0 }); await mouse('mousePressed', c2.x, c2.y);
    let grabbing = null; for (let dx = 10; dx <= 40; dx += 10) { await mouse('mouseMoved', c2.x + dx, c2.y); await sleep(20); if (dx === 20) grabbing = await ev(`getComputedStyle(document.getElementById('${SCR}')).cursor`); }
    await mouse('mouseReleased', c2.x + 40, c2.y); await sleep(250);
    const d = JSON.parse(await ev(`JSON.stringify({sc:window.__sc,sl:document.getElementById('${SCR}').scrollLeft})`));
    ok(d.sc.length === 0 && d.sl === Math.max(0, sl0 - 40), tag + '：sub-pixel 拖曳 40px ⇒ 圖捲動 ' + sl0 + '→' + d.sl + '、不跳轉（拖曳中游標 ' + grabbing + '）');
    ok(grabbing === 'grabbing', tag + '：拖曳中游標＝grabbing');
    // 3) 連結：TCON Out／SD Out 標題、Data 1、D1
    const cases = [[`${ROOTSEL} [data-rowhead="tc"] text`, 'dm-gridbox', 'TCON Out 標題'], [`${ROOTSEL} text[data-dof="1"]`, 'dm-gridbox', 'Data 1'],
                   [`${ROOTSEL} [data-rowhead="sd"] text`, 'dm-drv-sec', 'SD Out 標題'], [`${ROOTSEL} text[data-dlab="D6(0)+1"]`, 'dm-drv-sec', 'D1']];
    for (const [sel, want, name] of cases) {
      await ev('window.dmState.lastJump=null'); const c = await show(sel);
      const pc = await curAt(c.x, c.y);
      await mouse('mouseMoved', c.x, c.y, { buttons: 0 }); await mouse('mousePressed', c.x, c.y); await sleep(30); await mouse('mouseReleased', c.x, c.y); await sleep(300);
      const r = JSON.parse(await ev('JSON.stringify({sc:window.__sc,lj:window.dmState.lastJump||null})'));
      ok(r.sc[0] === want && /^pointer\|/.test(pc || ''), tag + '：真實滑鼠點 ' + name + ' ⇒ 捲到 ' + want + '（實際 ' + JSON.stringify(r.sc) + '，游標 ' + pc + '）');
      if (name === 'Data 1') ok(r.lj && r.lj.kind === 'tc' && r.lj.col === 1, tag + '：Data 1 ⇒ 高亮表格第 1 欄（lastJump ' + JSON.stringify(r.lj) + '）');
      await ev('scrollTo(0,0)'); await settle();
    }
    // 鍵盤 Enter 也能跳（與舊版同）
    await ev(`(function(){window.__sc=[];var t=document.querySelector('${ROOTSEL} [data-rowhead="tc"]');t.focus();t.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));return 1})()`); await sleep(100);
    ok((await ev('window.__sc[0]')) === 'dm-gridbox', tag + '：TCON Out 標題 Enter ⇒ 捲到 dm-gridbox');
    // 4) 邊緣調整大小
    const EL = MM ? 'dm-mini' : 'dm-pv-wrap';
    await ev(`scrollTo(0,0)`); await settle();
    const box = async () => JSON.parse(await ev(`(function(){var e=document.getElementById('${EL}');if('${EL}'==='dm-pv-wrap'){var r0=e.getBoundingClientRect();scrollTo({top:scrollY+r0.top-120,behavior:'instant'});var cd=document.getElementById('card-tft');if(cd)cd.scrollTop=0;r0=e.getBoundingClientRect();scrollTo({top:scrollY+r0.top-120,behavior:'instant'});}
      var r=e.getBoundingClientRect();return JSON.stringify({l:r.left,t:r.top,r:r.right,b:r.bottom,w:r.width,h:r.height})})()`));
    const pt = (b, z) => ({ x: z.includes('w') ? b.l + 3 : z.includes('e') ? b.r - 3 : b.l + b.w / 2 + 17, y: z.includes('n') ? b.t + 3 : z.includes('s') ? b.b - 3 : b.t + Math.min(b.h / 2, 300) + 9 });
    const Hmax = MM ? 400 : 700;
    if (mode !== 'mini') { // 卡片內的圖：先把高度縮到看得到下邊
      const b0 = await box(); await mouse('mouseMoved', b0.l + b0.w / 2, b0.b - 3, { buttons: 0 });
      if (b0.b > H - 20) { // 下邊在畫面外 ⇒ 用 API 設定一個起始高度（模擬使用者先前調過）
        await ev(`(function(){var e=document.getElementById('dm-pv-wrap');e.classList.add('dm-sized');e.style.height='${Hmax}px';return 1})()`);
      }
    }
    for (const z of ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se']) {
      await settle(); const b = await box(); const p = pt(b, z);
      await mouse('mouseMoved', p.x, p.y, { buttons: 0 }); await sleep(30);
      const c = await curAt(p.x, p.y);
      ok((c || '').startsWith(CUR[z] + '|'), tag + '：邊緣 ' + z + ' 游標＝' + CUR[z] + '（實際 ' + c + '）');
      // 往內拖 30px（左上角內縮）⇒ 該邊跟著滑鼠
      const ix = z.includes('w') ? 30 : z.includes('e') ? -30 : 0, iy = z.includes('n') ? 30 : z.includes('s') ? -30 : 0;
      await ev('window.__sc=[]');
      await mouse('mousePressed', p.x, p.y); for (let k = 1; k <= 3; k++) { await mouse('mouseMoved', p.x + ix * k / 3, p.y + iy * k / 3); await sleep(20); }
      await mouse('mouseReleased', p.x + ix, p.y + iy); await sleep(150);
      const a = JSON.parse(await ev(`(function(){var r=document.getElementById('${EL}').getBoundingClientRect();return JSON.stringify({l:r.left,t:r.top,r:r.right,b:r.bottom,w:r.width,h:r.height,sl:document.getElementById('${SCR}').scrollLeft,sc:window.__sc})})()`));
      const near = (u, v) => Math.abs(u - v) <= 2;
      const okEdge = (z.includes('w') ? near(a.l, b.l + 30) : true) && (z.includes('e') ? near(a.r, b.r - 30) : true) && (z.includes('n') ? near(a.t, b.t + 30) : true) && (z.includes('s') ? near(a.b, b.b - 30) : true)
        && (!/[ew]/.test(z) ? near(a.w, b.w) : near(a.w, b.w - 30)) && (!/[ns]/.test(z) ? near(a.h, b.h) : near(a.h, b.h - 30));
      ok(okEdge && a.sc.length === 0, tag + '：拖 ' + z + ' 邊往內 30px ⇒ 該邊跟著滑鼠、其他邊不動、不跳轉（' + Math.round(b.w) + '×' + Math.round(b.h) + ' → ' + Math.round(a.w) + '×' + Math.round(a.h) + '）');
      // 再往外拖回 30px ⇒ 回原尺寸
      const p2 = pt(a, z); await mouse('mouseMoved', p2.x, p2.y, { buttons: 0 }); await mouse('mousePressed', p2.x, p2.y);
      for (let k = 1; k <= 3; k++) { await mouse('mouseMoved', p2.x - ix * k / 3, p2.y - iy * k / 3); await sleep(20); }
      await mouse('mouseReleased', p2.x - ix, p2.y - iy); await sleep(150);
      const a2 = JSON.parse(await ev(`(function(){var r=document.getElementById('${EL}').getBoundingClientRect();return JSON.stringify({w:r.width,h:r.height})})()`));
      ok(Math.abs(a2.w - b.w) <= 2 && Math.abs(a2.h - b.h) <= 2, tag + '：' + z + ' 邊往外拖回 30px ⇒ 回到 ' + Math.round(a2.w) + '×' + Math.round(a2.h));
    }
    // 圖內容不縮放：SVG 寬高屬性與畫面寬高一致
    ok(await ev(`(function(){var s=document.querySelector('${ROOTSEL}'),r=s.getBoundingClientRect();return Math.abs(r.width-(+s.getAttribute('width')))<1&&Math.abs(r.height-(+s.getAttribute('height')))<1})()`), tag + '：改大小後 SVG 以原尺寸顯示（不變形、靠捲動）');
    // 拖成較小並存檔 ⇒ 重新載入沿用 ⇒ 雙擊邊緣恢復預設
    { const b = await box(); const p = pt(b, 'e'); await mouse('mouseMoved', p.x, p.y, { buttons: 0 }); await mouse('mousePressed', p.x, p.y); await mouse('mouseMoved', p.x - 60, p.y); await mouse('mouseReleased', p.x - 60, p.y); await sleep(150);
      const saved = JSON.parse(await ev(`localStorage.getItem('dm.tftsize.v1')||'{}'`)); const k = MM ? 'mini' : 'card';
      ok(saved[k] && Math.abs(saved[k].w - (b.w - 60)) <= 2, tag + '：尺寸存 localStorage dm.tftsize.v1.' + k + '＝' + JSON.stringify(saved[k]));
      await load(); if (MM) { await ev(`window.dmLive.mini(true)`); await sleep(400); } if (mode === 'sidemini') ok(await ev(`document.documentElement.classList.contains('dm-side') && window.dmLive.mini()===true`), tag + '：重新載入後並排＋小窗同時開');
      const w2 = await ev(`document.getElementById('${EL}').getBoundingClientRect().width`);
      ok(Math.abs(w2 - (b.w - 60)) <= 2, tag + '：重新載入沿用寬 ' + Math.round(w2));
      const b2 = await box(); const q = pt(b2, 'e'); await mouse('mouseMoved', q.x, q.y, { buttons: 0 });
      await mouse('mousePressed', q.x, q.y, { clickCount: 1 }); await mouse('mouseReleased', q.x, q.y, { clickCount: 1 }); await mouse('mousePressed', q.x, q.y, { clickCount: 2 }); await mouse('mouseReleased', q.x, q.y, { clickCount: 2 }); await sleep(200);
      const after = JSON.parse(await ev(`JSON.stringify({w:document.getElementById('${EL}').style.width,h:document.getElementById('${EL}').style.height,s:JSON.parse(localStorage.getItem('dm.tftsize.v1')||'{}')})`));
      ok(after.w === '' && after.h === '' && !after.s[k], tag + '：雙擊邊緣恢復預設（inline 尺寸清空、localStorage 移除）');
      if (MM) ok(await ev(`!localStorage.getItem('dm.mini.pos.v1') || true`) && (await ev(`window.dmLive.mini()`)) === true, tag + '：雙擊邊緣不關小窗');
    }
    ok(errs.length === 0, tag + '：console 沒有錯誤' + (errs.length ? '：' + errs.slice(0, 3).join(' | ') : ''));
  } catch (e) { ok(false, tag + ' exception ' + (e.stack || e)); }
  S.close();
}
// 矩陣：EM01（Auto＋Hand）、E503（Hand）三種顯示方式全跑；其他 MNT／NB 型號跑一般＋小窗（Hand）。EN01 沒有 TFT 接線圖（③ 不支援），不列。
const ONLY = process.argv[3] ? process.argv[3].split(',') : null;
const PLAN = [['EM01', false, ['normal', 'side', 'mini', 'sidemini']], ['EM01', true, ['normal', 'side', 'mini', 'sidemini']], ['E503', true, ['normal', 'side', 'mini', 'sidemini']],
  ['EM02', true, ['normal', 'mini']], ['E512', true, ['normal', 'mini']], ['E501A', true, ['normal', 'mini']], ['E501B', true, ['normal']], ['DAZ6138', true, ['normal', 'mini']], ['DAZ6139', true, ['normal']], ['DAZ6111', true, ['normal']], ['DAZ7353', true, ['normal']]];
for (const [m, h, modes] of PLAN) { if (ONLY && !ONLY.includes(m)) continue; for (const md of modes) await runMode(md, m, h); }
console.log((fail ? '✗ ' : '✓ ') + 'check_datamap_tft_interact ' + pass + ' pass / ' + fail + ' fail');
process.exit(fail ? 1 : 0);
