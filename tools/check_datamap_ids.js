// 用法：node tools/check_datamap_ids.js [repo]
// datamap.html 全頁 id 不可重複，且 #dm-live 必須是「改值立即寫入」勾選框（INPUT checkbox）。
// 起因：v1.35.18（7aa2fda）把 ① 卡移進版面容器 <div id="dm-live"> 後，同頁出現兩個 id="dm-live"，
// getElementById 取到 div ⇒ :3062 `tconOk() && $('dm-live').checked` 永遠不成立（I2C 連線時改值不即時寫入）。
// v1.35.23 容器改 id="dm-live-wrap"（派工 237043078094487552；查證 ~/Obsidian/assistant_kb/datamap/詳細/SD快照差異查證_20261017.md）。
const path = require('path'), fs = require('fs');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const { JSDOM, VirtualConsole } = require(path.join(ROOT, 'node_modules/jsdom'));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };

function dupIds(d) {
  const seen = {}, dup = [];
  d.querySelectorAll('[id]').forEach(e => { const id = e.id; if (!id) return; if (seen[id]) { if (seen[id] === 1) dup.push(id); seen[id]++; } else seen[id] = 1; });
  return dup;
}

(async () => {
  // 1) 靜態 HTML 原始碼：id="..." 不可重複（不靠 jsdom，原始碼層）
  const src = fs.readFileSync(path.join(ROOT, 'datamap.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const ids = {}; (src.match(/\sid="[^"]+"/g) || []).forEach(s => { const k = s.slice(5, -1); ids[k] = (ids[k] || 0) + 1; });
  const sdup = Object.keys(ids).filter(k => ids[k] > 1);
  ok(sdup.length === 0, '原始碼靜態 id 重複：' + sdup.join(', '));

  // 2) jsdom 載入後（含 JS 產生的元素）各型號全頁 id 不重複
  const vc = new VirtualConsole(); vc.on('jsdomError', e => { console.log('jsdomError', e.message); fail++; });
  const dom = await JSDOM.fromFile(path.join(ROOT, 'datamap.html'), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) { w.WebSocket = function () { throw new Error('no ws'); }; try { w.localStorage.clear(); } catch (e) {} } });
  await new Promise(r => dom.window.addEventListener('load', r));
  const w = dom.window, d = w.document, $ = id => d.getElementById(id);
  const live = $('dm-live');
  ok(live && live.tagName === 'INPUT' && live.type === 'checkbox', '#dm-live 不是 INPUT checkbox：' + (live && live.tagName));
  ok(!!$('dm-live-wrap') && $('dm-live-wrap').tagName === 'DIV' && $('dm-live-wrap').classList.contains('dm-live'), '版面容器 #dm-live-wrap（.dm-live）不存在');
  ok($('dm-live-wrap') && $('dm-live-wrap').contains(live), '勾選框應在版面容器內（v1.35.18 版面不變）');
  ok(live && live.disabled === true, 'I2C 未連線時「改值立即寫入」應 disabled（a7e110f 行為）');
  const models = [].map.call($('dm-model').options, o => o.value);
  for (const m of models) {
    $('dm-model').value = m; $('dm-model').dispatchEvent(new w.Event('change'));
    const g = $('dm-gate'); const gates = g ? [].map.call(g.options, o => o.value) : [''];
    for (const gv of gates) {
      if (g) { g.value = gv; g.dispatchEvent(new w.Event('change')); }
      const dup = dupIds(d);
      ok(dup.length === 0, m + (gv ? ' gate=' + gv : '') + ' 全頁 id 重複：' + dup.join(', '));
      ok($('dm-live').tagName === 'INPUT', m + ' #dm-live 變成 ' + $('dm-live').tagName);
    }
  }
  console.log('型號 ' + models.length + '：' + models.join(','));

  // 3) 功能：mock I2C 連線（EM01 Check 成功）後，勾「改值立即寫入」⇒ 改表格值會寫 TCON；取消勾 ⇒ 不寫（:3062 路徑）
  {
    const log = [], mem = {}, sleep = ms => new Promise(r => setTimeout(r, ms));
    const dom2 = await JSDOM.fromFile(path.join(ROOT, 'datamap.html'), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: new VirtualConsole(),
      beforeParse(w) {
        try { w.localStorage.clear(); } catch (e) {}
        w.WebSocket = function () {
          const ws = this; ws.readyState = 0;
          setTimeout(() => { ws.readyState = 1; ws.onopen && ws.onopen(); }, 5);
          ws.send = s => { const m = JSON.parse(s); log.push(m); let r = { id: m.id, ok: true };
            if (m.type === 'ping') r = { id: m.id, ok: true, helper: 'mock', proto: 1 };
            else if (m.type === 'read') {
              if (m.addr === 0xFF00 && m.len === 3) r = m.slave === 0x68 ? { id: m.id, ok: true, data: [0x01, 0xEF, 0xA0] } : { id: m.id, ok: false, err: 'nack' };
              else { const a = []; for (let i = 0; i < m.len; i++) a.push(mem[(m.slave << 16) | (m.addr + i)] | 0); r = { id: m.id, ok: true, data: a }; }
            } else if (m.type === 'rawwrite') (m.data || []).forEach((b, i) => { mem[(m.slave << 16) | (m.addr + i)] = b; });
            setTimeout(() => ws.onmessage && ws.onmessage({ data: JSON.stringify(r) }), 1); };
          ws.close = () => { ws.readyState = 3; setTimeout(() => ws.onclose && ws.onclose(), 1); };
        };
      } });
    await new Promise(r => dom2.window.addEventListener('load', r));
    const w2 = dom2.window, $2 = id => w2.document.getElementById(id);
    const box = w2.document.querySelector("#dm-live-lbl input[type=checkbox]");   // 使用者實際點的勾選框（不用 getElementById，避免重複 id 時取錯）
    const writes = () => log.filter(m => m.type === 'rawwrite' && !(m.slave === 0x7E && m.addr === 0xAB)).length;
    $2('dm-model').value = 'EM01'; $2('dm-model').dispatchEvent(new w2.Event('change'));
    $2('dm-link').click();
    for (let i = 0; i < 200 && !(w2.dmState.linked && !w2.dmState.busy && w2.dmState.checked); i++) await sleep(20);
    await sleep(200);
    ok(w2.dmState.linked && w2.dmState.checked, 'mock 連線＋Check T-CON 成功');
    ok(box.disabled === false, '連線確認後「改值立即寫入」可勾');
    box.checked = true; box.dispatchEvent(new w2.Event('change', { bubbles: true }));
    const mir = $2('f-mirror'), w0 = writes();
    mir.checked = !mir.checked; mir.dispatchEvent(new w2.Event('change')); await sleep(400);
    ok(writes() > w0, '勾選「改值立即寫入」⇒ 改 Mirror 會即時寫入 TCON（寫入 ' + (writes() - w0) + ' 筆）');
    box.checked = false; box.dispatchEvent(new w2.Event('change', { bubbles: true }));
    const w1 = writes();
    mir.checked = !mir.checked; mir.dispatchEvent(new w2.Event('change')); await sleep(400);
    ok(writes() === w1, '取消勾 ⇒ 改值不寫入（多寫 ' + (writes() - w1) + ' 筆）');
    w2.close();
  }
  console.log(`check_datamap_ids: ${pass} pass / ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
