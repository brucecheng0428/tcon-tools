// 用法：node tools/check_datamap_handentry.mjs <repo> [型號,型號…]
// v1.31.0（Bruce 10/14 實機：勾 Hand Mode Enable 後 ②-2 沒有「Pixel 最小～最大＋套用」那一行；「NB 的 TCON 也需要吧」）：
//   每個型號 × 每種進入 Hand Mode 的方式（勾 Hand Mode Enable、MNT 的 RT7 Type 選 Manual 樣式、匯入 code 本身 hand＝1）：
//   ・Pixel 範圍列：MNT（EM01／EM02／E512）Single／Dual／Tri 一定出現；有 FORCE_DE_SEL 的 NB（E50x／DAZ6138／DAZ6139）Hand 開也出現（固定 -2～4 ↔ 14，v1.31.3）；DAZ6111／DAZ7353 不出現；EN01 Hand 開（Single／Dual／Tri／MUX4／MUX6）出現、可調（v1.31.4）。
//   ・R｜G｜B 面板：真實滑鼠點格子 ⇒ 面板出現、R／G／B 三欄；點一個值 ⇒ 格子與 state 改變。
//   ・格內只顯示名稱（.dm-tt 隱藏）。
//   ・All Same R3（整表同名）⇒ 表格內沒有任何元素在跑動畫（呼吸燈只在 TFT 接線圖），TFT 圖的錯誤格才有 dmBreathe。
//   ・TFT 預覽小窗標題列真實拖移會移動（有 TFT 圖的型號）。
//   匯入：NB 用合成 ROM（依 DM.exportRegs＋DM.nbFileOf 把 hand＝1 狀態寫進 bin，檔名帶型號）真的走 parseCode；
//         MNT 的 code 需要 RT7／RT8 header，無樣本檔 ⇒ 以 parse 結果注入（DM.parseCode 回傳 hand＝1 的 state）走同一條 importBytes→applyImport→render，寫明為模擬。
import { spawn } from 'node:child_process'; import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const ROOT = path.resolve(process.argv[2] || '.'), ONLY = process.argv[3] ? process.argv[3].split(',') : null;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); c ? pass++ : fail++; };
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'dmhand-')), port = 9100 + Math.floor(Math.random() * 190);
const ch = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', `--user-data-dir=${prof}`, `--remote-debugging-port=${port}`, 'about:blank'], { stdio: 'ignore' });
let tgt; for (let i = 0; i < 60 && !tgt; i++) { await sleep(200); try { tgt = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(x => x.type === 'page'); } catch {} }
const ws = new WebSocket(tgt.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pend = {}, errs = [];
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; }
  if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.text + ' ' + (m.params.exceptionDetails.exception?.description || ''));
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push(m.params.args.map(a => a.value || a.description).join(' ')); };
const cdp = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => { const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) errs.push('eval: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 300)); return r.result?.result?.value; };
const mouse = (type, x, y, extra = {}) => cdp('Input.dispatchMouseEvent', Object.assign({ type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 }, extra));
const click = async (x, y) => { await mouse('mouseMoved', x, y, { buttons: 0 }); await mouse('mousePressed', x, y); await sleep(30); await mouse('mouseReleased', x, y); await sleep(200); };
await cdp('Page.enable'); await cdp('Runtime.enable');
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "window.WebSocket=function(){throw new Error('no ws in test')};" });
const load = async (model, w = 1400) => {
  await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: 1000, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: 'file://' + path.join(ROOT, 'datamap.html') }); await sleep(1300); errs.length = 0;
  await ev(`(function(){try{localStorage.clear()}catch(e){}var e=document.getElementById('dm-model');e.value=${JSON.stringify(model)};e.dispatchEvent(new Event('change'));return 1})()`); await sleep(250);
};
const state = () => ev(`(function(){var $=function(i){return document.getElementById(i)},s=window.dmState.cur,m=window.dmState.model,row=$('dm-pxrow');
  return JSON.stringify({m:m,hand:s.hand|0,gate:TCONDataMap.gateOf(m,s),kind:TCONDataMap.MODELS[m].kind,nbSel:!!TCONDataMap.fieldById(m,'deSel'),px:!!row&&!row.classList.contains('hidden')&&row.offsetParent!==null})})()`).then(JSON.parse);
const pxWant = st => (st.kind === 'mnt' && ['single', 'dual', 'tri'].includes(st.gate)) || (st.kind === 'nb' && st.nbSel && st.hand === 1) || (st.kind === 'en01' && ['single', 'dual', 'tri', 'mux4', 'mux6'].includes(st.gate));   // v1.31.4：EN01 同 MNT 可調；v1.31.3：有 FORCE_DE_SEL 的 NB Hand 開也顯示（固定 -2～4）
const models = JSON.parse(await (async () => { await load('EM01'); return ev(`JSON.stringify([].map.call(document.getElementById('dm-model').options,function(o){return o.value}).filter(Boolean))`); })());
for (const M of models) {
  if (ONLY && !ONLY.includes(M)) continue;
  // ── A：勾 Hand Mode Enable
  await load(M);
  await ev(`(function(){var h=document.getElementById('dm-hand');h.checked=true;h.dispatchEvent(new Event('change'));return 1})()`); await sleep(250);
  let st = await state();
  ok(st.hand === 1 && st.px === pxWant(st), M + '／勾 Hand Mode Enable：hand＝1、gate＝' + st.gate + '、Pixel 範圍列 ' + (st.px ? '顯示' : '不顯示') + '（預期 ' + (pxWant(st) ? '顯示' : '不顯示') + '）');
  if (st.kind === 'mnt') { // 沒匯入 code 的預設：-2～4、FORCE_DE_EN＝1、FORCE_DE_SEL＝14；改 FORCE_DE_SEL ⇒ 輸入框反算；輸入範圍套用 ⇒ 暫存器
    const d0 = await ev(`JSON.stringify({lo:document.getElementById('dm-pxlo').value,hi:document.getElementById('dm-pxhi').value,en:window.dmState.cur.deEn|0,sel:window.dmState.cur.deSel|0})`).then(JSON.parse);
    ok(d0.lo === '-2' && d0.hi === '4' && d0.en === 1 && d0.sel === 14, M + '：沒匯入 code 開 Hand ⇒ Pixel -2～4、FORCE_DE_EN＝1、FORCE_DE_SEL＝14（實際 ' + JSON.stringify(d0) + '）');
    for (const v of [1, 2, 4, 8, 3]) {
      const d1 = await ev(`(function(){var e=document.getElementById('f-deSel');e.value='${v}';e.dispatchEvent(new Event('change'));var c=TCONDataMap.pxForDeSel(window.dmState.model,window.dmState.cur);
        var lo=+document.getElementById('dm-pxlo').value,hi=+document.getElementById('dm-pxhi').value;return JSON.stringify({lo:lo,hi:hi,c:c,back:TCONDataMap.deSelForPx(window.dmState.model,window.dmState.cur,lo,hi).base})})()`).then(JSON.parse);
      ok(d1.c && d1.lo === d1.c.from && d1.hi === d1.c.to && d1.back === d1.c.base, M + '：FORCE_DE_SEL＝' + v + ' ⇒ 輸入框 ' + d1.lo + '～' + d1.hi + '（起始欄 ' + (d1.c && d1.c.base) + '，反推回同一欄）');
    }
    const d2 = await ev(`(function(){document.getElementById('dm-pxlo').value='-2';document.getElementById('dm-pxhi').value='4';document.getElementById('dm-pxapply').click();return JSON.stringify({en:window.dmState.cur.deEn|0,sel:window.dmState.cur.deSel|0,lo:document.getElementById('dm-pxlo').value,hi:document.getElementById('dm-pxhi').value})})()`).then(JSON.parse);
    ok(d2.en === 1 && d2.sel === 14 && d2.lo === '-2' && d2.hi === '4', M + '：輸入 -2～4 套用 ⇒ FORCE_DE_SEL＝14，輸入框維持 -2～4（' + JSON.stringify(d2) + '）');
  }
  if (st.kind === 'mnt') { // 每種 gate（Panel_mode 0/2/3）都要出現
    for (const g of [['dual', 2, 1], ['tri', 3, 2], ['single', 0, 0]]) {
      await ev(`(function(){var s=TCONDataMap.cloneState(window.dmState.cur);s.panel=${g[1]};s.rd=${g[2]};window.dmState.cur=s;window.dmRender&&window.dmRender();return 1})()`);
      await ev(`(function(){var e=document.getElementById('dm-gate');if(e){var o=[].find.call(e.options,function(o){return /${g[0]}/i.test(o.value)});if(o){e.value=o.value;e.dispatchEvent(new Event('change'))}}return 1})()`); await sleep(200);
      const s2 = await state(); ok(s2.gate !== g[0] || s2.px, M + '／Gate ' + s2.gate + '：Pixel 範圍列' + (s2.px ? '顯示' : '不顯示'));
    }
  }
  if (st.kind !== 'en01') {
    // 格內只顯示名稱
    const nm = await ev(`(function(){var tt=document.querySelector('#dm-grid .dm-tt');var td=[].find.call(document.querySelectorAll('#dm-grid td'),function(t){return t.querySelector('select')&&!t.querySelector('select').disabled});
      var sel=td&&td.querySelector('select'),extra=td?[].filter.call(td.querySelectorAll('*'),function(e){return e!==sel&&!sel.contains(e)&&e.offsetParent!==null&&e.textContent.trim()}).map(function(e){return e.textContent.trim()}):[];
      return JSON.stringify({tt:tt?getComputedStyle(tt).display:'none',txt:sel&&sel.selectedOptions[0]?sel.selectedOptions[0].textContent.trim()+(extra.length?' +'+extra.join('|'):''):null,val:sel?sel.value:null})})()`).then(JSON.parse);
    ok(nm.tt === 'none' && nm.txt === nm.val, M + '：格內只顯示名稱（顯示「' + nm.txt + '」＝值 ' + nm.val + '，T／欄小字 display ' + nm.tt + '）');
    // R｜G｜B 面板（真實滑鼠）
    const c = await ev(`(function(){var td=[].filter.call(document.querySelectorAll('#dm-grid td'),function(t){var s=t.querySelector('select');return s&&!s.disabled&&s.options.length>3})[1];if(!td)return null;td.setAttribute('data-hp','1');td.scrollIntoView({block:'center'});var r=td.getBoundingClientRect();return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2,v:td.querySelector('select').value})})()`).then(v => v && JSON.parse(v));
    if (!c) ok(false, M + '：找不到可編輯格');
    else {
      await click(c.x, c.y);
      const pop = await ev(`(function(){var p=document.getElementById('dm-pop');if(!p)return null;var cols=getComputedStyle(p).gridTemplateColumns.split(' ').length;var b=[].find.call(p.querySelectorAll('button[data-v]'),function(b){return b.getAttribute('data-v')!==${JSON.stringify(c.v)}&&b.getAttribute('data-v')!=='X'});var r=b&&b.getBoundingClientRect();return JSON.stringify({cols:cols,n:p.querySelectorAll('button').length,v:b&&b.getAttribute('data-v'),x:r&&r.left+r.width/2,y:r&&r.top+r.height/2})})()`).then(v => v && JSON.parse(v));
      ok(pop && pop.cols === 3 && pop.n > 3, M + '：點格子 ⇒ R｜G｜B 面板（' + (pop ? pop.cols + ' 欄、' + pop.n + ' 個選項' : '沒出現') + '）');
      if (pop && pop.v) { await click(pop.x, pop.y); const nv = await ev(`document.querySelector('#dm-grid td[data-hp] select').value`); ok(nv === pop.v && !(await ev(`!!document.getElementById('dm-pop')`)), M + '：面板點 ' + pop.v + ' ⇒ 格子＝' + nv + '、面板關閉'); }
    }
    // All Same R3 ⇒ 表格不跑動畫；TFT 錯誤格呼吸
    await ev(`(function(){var v=document.getElementById('dm-samev');var o=[].find.call(v.options,function(o){return o.value==='R3'||o.textContent.trim()==='R3'});if(o){v.value=o.value;v.dispatchEvent(new Event('change'))}document.getElementById('dm-same').click();return 1})()`); await sleep(400);
    const an = await ev(`(function(){var g=[].filter.call(document.querySelectorAll('#dm-grid, #dm-grid *, #dm-gridbox'),function(e){var a=getComputedStyle(e).animationName;return a&&a!=='none'}).map(function(e){return e.tagName+'.'+e.className+':'+getComputedStyle(e).animationName});
      var er=document.querySelectorAll('#dm-pv-tft .pv-err'),ea=er.length?getComputedStyle(er[0]).animationName:'';var vals=[].map.call(document.querySelectorAll('#dm-grid select'),function(s){return s.value});
      return JSON.stringify({grid:g.slice(0,3),n:g.length,err:er.length,ea:ea,r3:vals.filter(function(v){return v==='R3'}).length,cells:vals.length,tft:!document.getElementById('dm-tftbody').classList.contains('hidden')})})()`).then(JSON.parse);
    ok(an.n === 0, M + '：All Same R3（' + an.r3 + '/' + an.cells + ' 格）⇒ 表格內沒有動畫' + (an.n ? '：' + an.grid.join(',') : ''));
    if (an.tft) ok(an.err === 0 || an.ea === 'dmBreathe', M + '：TFT 圖錯誤格 ' + an.err + ' 個' + (an.err ? '，動畫＝' + an.ea : ''));
  }
  // ── B：MNT 用 RT7 Type 選 Manual 樣式（Hand 開）
  if (st.kind === 'mnt') {
    await load(M);
    // EM01 原廠 UI 在 Auto 時是 Panel_mode／sub_panel_mode 兩層選單（沒有 RT7 清單，datamap.html renderAuto em01a）⇒ EM01 先勾 Hand 才有 RT7 清單，再選 Manual 樣式
    if (M === 'EM01') { await ev(`(function(){var h=document.getElementById('dm-hand');h.checked=true;h.dispatchEvent(new Event('change'));return 1})()`); await sleep(200); }
    const pk = await ev(`(function(){var k=TCONDataMap.PRESETS.findIndex(function(p,i){return p.set.hand&&i>0});var e=document.getElementById('dm-auto');e.value='p'+k;if(e.value!=='p'+k)return -1;e.dispatchEvent(new Event('change'));return k})()`); await sleep(250);
    st = await state(); ok(st.hand === 1 && st.px === pxWant(st), M + '／RT7 Type 選 Manual 樣式 #' + pk + '：hand＝' + st.hand + '、gate＝' + st.gate + '、Pixel 範圍列 ' + (st.px ? '顯示' : '不顯示'));
  }
  // ── C：匯入 code（hand＝1）
  if (st.kind !== 'en01') {
    await load(M);
    const imp = await ev(`(function(){var DM=TCONDataMap,m=${JSON.stringify(M)},s=DM.setHand(m,window.dmState.cur,true);
      if(DM.MODELS[m].kind==='nb'){var fo=DM.nbFileOf(m),regs=DM.exportRegs(m,s,true),mx=0;regs.forEach(function(r){mx=Math.max(mx,fo(r.reg))});var u=new Uint8Array(Math.max(0x10000,mx+1));
        regs.forEach(function(r){var o=fo(r.reg);if(o>=0)u[o]=(u[o]&~r.mask)|(r.val&r.mask)});window.dmImportBytes(u,(DM.MODELS[m].py||m)+'_handtest.bin');return 'rom'}
      var o=DM.parseCode;DM.parseCode=function(){return {ok:true,model:m,medium:'bin',state:s,fileOf:function(){return -1},cks:0,v512:[],sysCrc:null}};try{window.dmImportBytes(new Uint8Array(0x200),m+'_handtest.bin')}finally{DM.parseCode=o}return 'inject'})()`); await sleep(300);
    st = await state(); ok(st.hand === 1 && st.px === pxWant(st), M + '／匯入 code（' + (imp === 'rom' ? '合成 ROM，真的 parse' : 'parse 結果注入，模擬') + '）hand＝' + st.hand + '、gate＝' + st.gate + '、Pixel 範圍列 ' + (st.px ? '顯示' : '不顯示'));
  }
  // ── 小窗拖移（有 TFT 圖的型號，窄螢幕）
  if (st.kind !== 'en01') {
    await load(M, 900); await ev(`(function(){var h=document.getElementById('dm-hand');h.checked=true;h.dispatchEvent(new Event('change'));window.dmLive.mini(true);return 1})()`); await sleep(400);
    const h = await ev(`(function(){var r=document.querySelector('#dm-mini .dm-minihd b').getBoundingClientRect(),m=document.getElementById('dm-mini').getBoundingClientRect();return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2,l:m.left,t:m.top})})()`).then(JSON.parse);
    await mouse('mouseMoved', h.x, h.y, { buttons: 0 }); await mouse('mousePressed', h.x, h.y); for (let k = 1; k <= 4; k++) { await mouse('mouseMoved', h.x - 30 * k, h.y - 25 * k); await sleep(20); } await mouse('mouseReleased', h.x - 120, h.y - 100); await sleep(150);
    const m2 = await ev(`(function(){var m=document.getElementById('dm-mini').getBoundingClientRect();return JSON.stringify({l:m.left,t:m.top,svg:!!document.querySelector('#dm-mini-svg svg')})})()`).then(JSON.parse);
    ok(Math.abs(m2.l - (h.l - 120)) <= 2 && Math.abs(m2.t - (h.t - 100)) <= 2, M + '：TFT 預覽小窗標題列拖移 (' + Math.round(h.l) + ',' + Math.round(h.t) + ')→(' + Math.round(m2.l) + ',' + Math.round(m2.t) + ')' + (m2.svg ? '' : '（此設定無接線圖）'));
  }
  ok(errs.length === 0, M + '：console 沒有錯誤' + (errs.length ? '：' + errs.slice(0, 3).join(' | ') : ''));
}
console.log((fail ? '✗ ' : '✓ ') + 'check_datamap_handentry ' + pass + ' pass / ' + fail + ' fail');
ws.close(); ch.kill(); process.exit(fail ? 1 : 0);
