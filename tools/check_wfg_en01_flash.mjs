#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   WFG v4.57.0 自測：EN01（RM81008）code 的 EEPROM／Flash 判定與匯入
   ───────────────────────────────────────────────────────────────────────
   振嘉 2026-10-19 mail「網頁版本tool開啟flash bin檔出現無法解析提示」：EN01 載入
   SA 同事K 的 Flash code（40960 bytes）被「EEPROM ≤ 8192／Flash ≥ 131072，中間不合法」擋掉。
   Bruce 2026-10-19：EEPROM 只有 4096／8192；其他大小要考慮 Flash；同事E 的 UI 認得，網頁也要認得。
   做法：127.0.0.1 靜態伺服器 ＋ 自有暫存 profile 的 headless Chrome（CDP），打開 wfg.html，
   全部呼叫**產品本身**的函式（不抄一份解析器）。
     S  合成語料（不含任何客戶資料，可進版控）：
          EEPROM 4096／8192（標準）、6354（RD Demo 那種非標準大小）× bin／hex
          Flash 40960／40961／65536／131072／262144 × bin／hex
          反例：全 0、全 FF、亂數（4096／8192／40960／131072）、Flash header checksum 壞、
                Flash 缺 Bank0_5、Flash bank 指到檔案外、EEPROM 檔被截成 40960 以外的大小
        每一組檢查 ok／medium／EDID 解析度／xstb 讀到的值，round-trip：Flash 與 EEPROM
        裝同一組暫存器值 ⇒ 兩邊解出來的訊號完全相同。
     P  讀檔前閘門：EN01 不擋 40960；EM01／E503／E501A 照舊擋 40960（其他型號不受影響）。
     R  真檔（選用，本機、不進版控）：WFG_EN01_CODE_DIR=<資料夾>，每份 .bin／.hex 都要匯入成功，
        並與 datamap 的 en01Maps（common/datamap-core.js，另一份獨立實作）逐筆比對映射。
     U  畫面流程（選用，需 R 的資料夾）：照使用者操作走 wfgCodePickFile() → 選檔，
        失敗會跳 alert（v4.56.0 的現象）、成功會出現匯入完成框。WFG_PAGE 指向改前的頁面可重現原錯誤。
   用法：WFG_EN01_CODE_DIR=<真檔資料夾> node tools/check_wfg_en01_flash.mjs
         WFG_PAGE=<頁面檔名>（預設 wfg.html）  WFG_SHOT_DIR=<截圖資料夾>（選用）
         WFG_EN01_EXPECT_FAIL=1 ⇒ U 段期望「跳 alert」（拿來重現改前的錯誤）
   退出碼：0 通過／1 有失敗／2 跑不起來
   ═══════════════════════════════════════════════════════════════════════ */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdtemp, readdir } from 'node:fs/promises';
import { writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = process.env.WFG_PAGE || 'wfg.html';
const CODES = process.env.WFG_EN01_CODE_DIR || '';
const SHOT = process.env.WFG_SHOT_DIR || '';
const EXPECT_FAIL = !!process.env.WFG_EN01_EXPECT_FAIL;
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `  得到 ${JSON.stringify(got)}，應為 ${JSON.stringify(want)}`}`);
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const srv = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/__codes/') && CODES) {
      const p = normalize(join(CODES, decodeURIComponent(url.pathname.slice(9))));
      if (!p.startsWith(resolve(CODES))) { res.writeHead(403); return res.end(); }
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' }); return res.end(await readFile(p));
    }
    const p = normalize(join(REPO, decodeURIComponent(url.pathname)));
    if (!p.startsWith(REPO)) { res.writeHead(403); return res.end(); }
    let buf = await readFile(p);
    if (p === join(REPO, PAGE)) {
      const s = buf.toString('utf8'), i = s.lastIndexOf('})();', s.lastIndexOf('</script>'));
      if (i < 0) throw new Error('找不到主 IIFE 收尾');
      buf = Buffer.from(s.slice(0, i) + 'window.__wfgEval = function(__s){ return eval(__s); };\n' + s.slice(i), 'utf8');
    }
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(buf);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${srv.address().port}`;
const port = 9300 + Math.floor(Math.random() * 600);
const prof = await mkdtemp(join(tmpdir(), 'wfg-en01-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--mute-audio',
  `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--window-size=1700,1000', 'about:blank'], { stdio: 'ignore' });
let targets;
for (let i = 0; i < 100; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (targets.length) break; } catch { } await sleep(200); }
if (!targets) { console.error('🛑 Chrome 起不來'); process.exit(2); }
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map(); const exc = []; const dialogs = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
  if (m.method === 'Page.javascriptDialogOpening') { dialogs.push(m.params.message); send('Page.handleJavaScriptDialog', { accept: true }); }
  if (m.method === 'Runtime.exceptionThrown') exc.push(String(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0]);
};
const send = (method, params = {}) => new Promise(r => { const id = ++seq; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true });
  if (r.result?.exceptionDetails) throw new Error('evaluate 例外：' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
  return r.result?.result?.value;
};
const evIn = code => ev(`window.__wfgEval(${JSON.stringify(code)})`);
await send('Page.enable'); await send('Runtime.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Page.navigate', { url: `${ORIGIN}/${PAGE}#wfg` });
for (let i = 0; i < 150; i++) { await sleep(200); if (await ev('document.readyState') === 'complete') break; }
await sleep(1500);
const NEW = await evIn(`typeof wfgEn01DetectHeader === 'function'`);
console.log(`頁面 ${PAGE}：${NEW ? '有' : '沒有'} wfgEn01DetectHeader（${NEW ? '改後' : '改前'}）`);

/* ── 合成語料產生器（在頁面裡跑，結果交給產品的 parseCode）── */
const GEN = `(()=>{
  const W = window;
  function edid(b, off, ha, va, hb, vb){             // 128 B EDID：magic ＋ 第一個 DTD ＋ checksum
    const M=[0,255,255,255,255,255,255,0]; for(let i=0;i<8;i++) b[off+i]=M[i];
    b[off+0x12]=1; b[off+0x13]=4;
    const d=off+0x36; b[d]=0x10; b[d+1]=0x27;
    b[d+2]=ha&255; b[d+3]=hb&255; b[d+4]=((ha>>8)<<4)|(hb>>8);
    b[d+5]=va&255; b[d+6]=vb&255; b[d+7]=((va>>8)<<4)|(vb>>8);
    let s=0; for(let i=0;i<127;i++) s+=b[off+i]; b[off+127]=(256-(s&255))&255;
  }
  /* 暫存器值（0x000～0x5BB＝Bank0_5）：xstb（0x490）enable＋一些值、vst1（0x4A0）enable、RD_MODE 0x41C、
     START_LINE_RD 0x41F、PRE_BLK_DATA 0x41E、PANEL_MODE 0x390。seed 讓每組的值不同。 */
  function regs(seed){
    const r=new Uint8Array(0x5BC);
    for(let i=0;i<r.length;i++) r[i]=(i*7+seed*13)&255;
    for(let k=0;k<18;k++){ const b=0x490+k*0x10; if(b+16<=r.length) r[b]&=0x7F; }
    r[0x490]|=0x80; r[0x4A0]|=0x80;
    r[0x41C]=(r[0x41C]&~7)|1; r[0x41F]=6; r[0x41E]=2; r[0x390]=(r[0x390]&~3)|2;
    return r;
  }
  function eeprom(size, seed){                       // header 在 0x100，Header0＋第 1 筆：From 0x200 → reg 0x000
    const b=new Uint8Array(size); edid(b,0,1920,1200,160,40+seed);
    const h=0x100; b[h]=0x12; b[h+1]=0x34; b[h+2]=0x56; let s=0; for(let k=0;k<7;k++) s+=b[h+k]; b[h+7]=s&255;
    const o=h+8, frm=0x200, len=0x5BC; b[o]=frm>>8; b[o+1]=frm&255; b[o+2]=len>>8; b[o+3]=len&255; b[o+4]=0; b[o+5]=0; b[o+6]=0;
    s=0; for(let k=0;k<7;k++) s+=b[o+k]; b[o+7]=s&255;
    b.set(regs(seed), frm); return b;
  }
  function fitem(b,i,st,rd,mp,flags,cken){
    const o=i*16; b[o]=st>>8; b[o+1]=st&255; b[o+2]=(rd>>16)&255; b[o+3]=(rd>>8)&255; b[o+4]=rd&255;
    b[o+5]=mp>>8; b[o+6]=mp&255; b[o+7]=3; b[o+8]=flags; b[o+9]=(cken?0x80:0)|flags; b[o+10]=0x0C;
    let s=0; for(let k=0;k<14;k++) s+=b[o+k]; s=(s-1)&0xFFFF; b[o+14]=s&255; b[o+15]=s>>8;
  }
  function flash(size, seed, opt){                   // 照 RM81008_TM_54G 實檔的版面：EDID 0x1000、Bank0_5 0x7000
    opt=opt||{}; const b=new Uint8Array(size); let i=0;
    fitem(b,i++,0x10,0x17F,0x1000,0x01,1);           // EDID
    edid(b,0x1000,1920,1200,160,40+seed);
    if(!opt.noBasic){ const st=opt.outside?((size>>8)-1):0x70; fitem(b,i++,st,0x5BD,0x0000,0x04,1);
      if(!opt.outside){ b.set(regs(seed),0x7000); } }
    fitem(b,i++,0x77,0x89,0x0600,0x04,1);            // Bank6（只佔位）
    if(opt.badCks){ b[0x10+14]^=0x5A; b[0x20+14]^=0x5A; b[0x00+14]^=0x5A; }
    return b;
  }
  function toHex(b){                                 // Intel HEX（type 04 ＋ 00 ＋ 01）
    const L=[]; const hx=(v,n)=>v.toString(16).toUpperCase().padStart(n,'0');
    const rec=(a,t,d)=>{ let s=d.length+(a>>8)+(a&255)+t; d.forEach(x=>s+=x); return ':'+hx(d.length,2)+hx(a,4)+hx(t,2)+d.map(x=>hx(x,2)).join('')+hx((256-(s&255))&255,2); };
    for(let base=0; base<b.length; base+=0x10000){
      L.push(rec(0,4,[(base>>24)&255,(base>>16)&255]));
      for(let a=0;a<0x10000 && base+a<b.length;a+=16){ L.push(rec(a,0,Array.from(b.subarray(base+a,Math.min(base+a+16,b.length))))); }
    }
    L.push(':00000001FF'); return new TextEncoder().encode(L.join('\\r\\n')+'\\r\\n');
  }
  function rnd(size, seed){ const b=new Uint8Array(size); let x=seed*2654435761>>>0; for(let i=0;i<size;i++){ x^=x<<13; x^=x>>>17; x^=x<<5; b[i]=x&255; } return b; }
  W.__gen={eeprom,flash,toHex,rnd};
  W.__parse=(b,name)=>{ const r=WFG_TCON_CODECS.en01.parseCode(b,name);
    if(!r||!r.ok) return {ok:false, reason:String(r&&r.reason||'?').slice(0,400)};
    const med=/ (EEPROM|FLASH) /.exec(r.detail||''); const s0=r.signals[0];
    return {ok:true, medium:med?med[1]:'?', w:r.frame.hactive, h:r.frame.vactive, vb:r.frame.vblank,
            xstb:s0?[s0.enable,s0.r_ph,s0.f_ph,s0.st_line,s0.sp_line,s0.r_dly,s0.f_dly]:null,
            sig:r.signals.map(s=>s?[s.enable?1:0,s.st_line,s.sp_line,s.r_dly,s.f_dly]:null),
            odd:/4096／8192/.test(r.detail||''), detail:r.detail};
  };
  return true;
})()`;
await evIn(GEN);
const P = (expr, name) => evIn(`__parse(${expr}, ${JSON.stringify(name)})`);
const pick = r => r.ok ? { ok: true, medium: r.medium, w: r.w, h: r.h } : { ok: false };

console.log('\n── S 合成語料 ──');
const okE = s => ({ ok: true, medium: 'EEPROM', w: 1920, h: 1200 });
const okF = { ok: true, medium: 'FLASH', w: 1920, h: 1200 };
for (const sz of [4096, 8192]) {
  for (const fmt of ['bin', 'hex']) {
    const e = `${fmt === 'hex' ? '__gen.toHex(' : '('}__gen.eeprom(${sz},1))`;
    check(`S EEPROM ${sz} ${fmt} → EEPROM`, pick(await P(e, `x.${fmt}`)), okE());
  }
}
{ const r = await P(`__gen.eeprom(6354,2)`, 'demo.bin'); check('S EEPROM 6354（RD Demo 那種非標準大小）bin → 仍可匯入、標示非標準', [pick(r), r.odd], [okE(), true]); }
for (const sz of [40960, 40961, 65536, 131072, 262144]) {
  for (const fmt of ['bin', 'hex']) {
    const e = `${fmt === 'hex' ? '__gen.toHex(' : '('}__gen.flash(${sz},3))`;
    const r = await P(e, `x.${fmt}`);
    check(`S Flash ${sz} ${fmt} → FLASH`, [pick(r), r.odd], [okF, false]);
  }
}
/* round-trip：同一組暫存器裝進 EEPROM 與 Flash，解出來的 18 條訊號一模一樣 */
for (const seed of [1, 5, 9]) {
  const a = await P(`__gen.eeprom(4096,${seed})`, 'a.bin'), b = await P(`__gen.flash(40960,${seed})`, 'b.bin'), c = await P(`__gen.eeprom(8192,${seed})`, 'c.bin');
  check(`S round-trip seed ${seed}：EEPROM 4096＝Flash 40960＝EEPROM 8192（18 條訊號）`, [JSON.stringify(a.sig) === JSON.stringify(b.sig), JSON.stringify(c.sig) === JSON.stringify(b.sig), !!(b.sig && b.sig[0] && b.sig[0][0])], [true, true, true]);
}
/* 反例 */
const NEG = [
  ['全 0 4096', '__gen.rnd(0,1)&&new Uint8Array(4096)'], ['全 0 40960', 'new Uint8Array(40960)'],
  ['全 FF 8192', 'new Uint8Array(8192).fill(255)'], ['全 FF 40960', 'new Uint8Array(40960).fill(255)'], ['全 FF 131072', 'new Uint8Array(131072).fill(255)'],
  ['亂數 4096', '__gen.rnd(4096,7)'], ['亂數 8192', '__gen.rnd(8192,8)'], ['亂數 40960', '__gen.rnd(40960,9)'], ['亂數 131072', '__gen.rnd(131072,10)'],
  ['Flash header checksum 壞（多數筆）', '__gen.flash(40960,3,{badCks:true})'],
  ['Flash 沒有 Bank0_5', '__gen.flash(40960,3,{noBasic:true})'],
  ['Flash Bank0_5 指到檔案外', '__gen.flash(40960,3,{outside:true})'],
  ['EEPROM 截到 0x1F0（header 不完整）', '__gen.eeprom(4096,1).slice(0,0x1F0)'],
];
for (const [n, e] of NEG) check(`S 反例 ${n} → 拒絕`, (await P(e, 'neg.bin')).ok, false);
{ const r = await P('new Uint8Array(40960)', 'neg.bin'); check('S 反例訊息提到兩種格式都試過', /EEPROM 版.*Flash 版|EEPROM.*Flash/.test(r.reason) || /兩種格式/.test(r.reason), true); }

console.log('\n── P 讀檔前閘門 ──');
const pre = (k, n) => evIn(`wfgCodeSizePreflight(WFG_TCON_CODECS.${k}, {name:'x.bin', size:${n}})`);
check('P EN01 40960 不擋', await pre('en01', 40960), null);
check('P EN01 40961 不擋', await pre('en01', 40961), null);
for (const k of ['em01', 'e503', 'e501a', 'e501b']) {
  check(`P ${k.toUpperCase()} 40960 照舊擋`, typeof (await pre(k, 40960)), 'string');
  check(`P ${k.toUpperCase()} 4096 照舊不擋`, await pre(k, 4096), null);
}

let realFiles = [];
if (CODES) {
  console.log('\n── R 真檔 ──');
  realFiles = (await readdir(CODES)).filter(f => /\.(bin|hex)$/i.test(f)).sort();
  /* datamap 的 en01Maps 是另一份獨立實作（common/datamap-core.js），拿來交叉比對映射 */
  const dmSrc = await readFile(join(REPO, 'common/datamap-core.js'), 'utf8');
  const fnStart = dmSrc.indexOf('var EN01_FLASH_MAP'), fnEnd = dmSrc.indexOf('function parseEn01');
  const dmMaps = fnStart > 0 && fnEnd > fnStart ? dmSrc.slice(fnStart, fnEnd) : '';
  for (const f of realFiles) {
    const r = await ev(`(async()=>{ const b=new Uint8Array(await (await fetch('/__codes/'+encodeURIComponent(${JSON.stringify(f)}))).arrayBuffer());
      const out = window.__wfgEval('__parse')(b, ${JSON.stringify(f)});
      let cmp=null;
      ${dmMaps ? `try { ${dmMaps.replace(/`/g, '\\`')}; const d=en01Maps(b); const H=window.__wfgEval('typeof wfgEn01DetectHeader==="function" ? wfgEn01DetectHeader : null'); const h=H?H(b):null;
        if(d&&h){ const A=d.maps.map(m=>[m.from,m.to,m.len]).sort().join(';'), B=h.items.map(m=>[m.from,m.to,m.len]).sort().join(';'); cmp={dm:d.medium, wfg:h.medium, same:A===B, n:h.items.length}; } else cmp={dm:d&&d.medium, wfg:h&&h.medium}; } catch(e){ cmp={err:String(e)}; }` : ''}
      return {size:b.length, out, cmp}; })()`);
    console.log(`  ${f}（${r.size} B）：${r.out.ok ? r.out.medium + ' ' + r.out.w + 'x' + r.out.h + ' ' + (r.out.detail || '').split('/').slice(0, 2).join('/') : '✗ ' + r.out.reason}`);
    check(`R ${f} 匯入成功`, r.out.ok, true);
    const want = (r.size === 4096 || r.size === 8192) ? 'EEPROM' : (r.out.odd ? 'EEPROM' : 'FLASH');
    check(`R ${f} 載體＝${want}（大小 ${r.size}）`, r.out.medium, want);
    if (r.cmp) check(`R ${f} 與 datamap en01Maps 映射逐筆相同`, [r.cmp.dm, r.cmp.wfg, r.cmp.same], [r.cmp.wfg === 'flash' ? 'flash' : 'eeprom', String(r.out.medium || '').toLowerCase(), true]);
  }

  console.log('\n── U 畫面流程（照使用者操作）──');
  const target = realFiles.find(f => /LOBFON/i.test(f)) || realFiles.find(f => /LOBF/i.test(f)) || realFiles.find(f => /54G/.test(f)) || realFiles[0];
  await evIn(`(()=>{ const sel=document.getElementById('wfg-ui-tcon'); sel.value='en01'; wfgCodeOnTconChange('en01'); return wfgTconKey(); })()`);
  await sleep(1000);
  dialogs.length = 0;            // 切型號本身會跳「欄位超出位元寬」的既有提示，與匯入無關
  const u = await ev(`(async()=>{ const f=${JSON.stringify(target)};
    const b=new Uint8Array(await (await fetch('/__codes/'+encodeURIComponent(f))).arrayBuffer());
    let inp=null; const orig=document.createElement.bind(document);
    document.createElement=function(t){ const e=orig(t); if(String(t).toLowerCase()==='input') inp=e; return e; };
    try { window.__wfgEval('wfgCodePickFile')(); } finally { document.createElement=orig; }
    if(!inp) return {err:'沒有開檔案選擇'};
    const dt=new DataTransfer(); dt.items.add(new File([b], f)); inp.files=dt.files; inp.onchange();
    await new Promise(r=>setTimeout(r,1500));
    const m=document.getElementById('wfg-ack-mask'), sub=document.getElementById('wfg-ack-sub');
    return { ack: !!(m && getComputedStyle(m).display!=='none'), sub: sub?sub.textContent.slice(0,200):'' }; })()`);
  console.log(`  ${target}：dialogs=${JSON.stringify(dialogs.map(d => d.slice(0, 160)))} ack=${JSON.stringify(u)}`);
  if (EXPECT_FAIL) {
    check('U（改前重現）跳出「無法解析」alert', dialogs.some(d => /無法解析|中間|不是合法/.test(d)), true);
  } else {
    check('U 沒有 alert', dialogs, []);
    check('U 出現匯入完成框', u.ack, true);
  }
  if (SHOT) {
    mkdirSync(SHOT, { recursive: true });
    const r = await send('Page.captureScreenshot', { format: 'png' });
    const fn = join(SHOT, `en01_import_${PAGE.replace(/\W+/g, '_')}.png`);
    writeFileSync(fn, Buffer.from(r.result.data, 'base64')); console.log('  📷 ' + fn);
  }
}

check('整段沒有 JS 例外', exc, []);
ws.close(); chrome.kill(); srv.close();
console.log(`\n${fail ? '✗' : '✓'} ${pass} 通過／${fail} 失敗`);
process.exit(fail ? 1 : 0);
