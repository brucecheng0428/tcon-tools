/* ═══════════════════════════════════════════════════════════════════════════
   wfg_ls_edge_dump_probe.js — CKO 事件的**跨版本比對用** dump（v4.50.0）

     tools/ui_probe.sh wfg.html tools/wfg_ls_edge_dump_probe.js

   這一支**不判對錯**，只如實吐出每一條 CKO 的 rise/fall 時間摘要，用途是拿
   **同一份設定檔**在「改動前的 build」與「改動後的 build」各跑一次、逐值比對。
   🔴 為什麼要跨版本比：`cpv_trig_edge` 拆成兩欄的相容性，唯一夠格的證據是
      「舊檔在新版畫出來的波形與舊版逐點相同」。任何寫在新版裡的自我檢查都
      證明不了這件事 —— 新版的期望值也是新版自己算的。

   同一支檔案要能在**兩種 build** 上跑：
     ・舊 build：`wfgDumpLsCko()` 回 `trigEdge`，設定欄位是單一 `cpv_trig_edge`。
     ・新 build：回 `trigEdgeRise` / `trigEdgeFall`，欄位是兩個。
   偵測方式是看第一次 dump 的回傳有沒有 `trigEdgeRise`，不靠版號字串。

   量太大放不進 <title>（12 條 CKO × 2 frame，上千個浮點數），所以每條 CKO 存
   **FNV-1a 32-bit 雜湊 ＋ 筆數 ＋ 總和 ＋ 頭尾樣本**。雜湊吃的是 `toFixed(9)`
   的字串，兩個 build 同樣的浮點運算會給出同樣的字串 ⇒ 雜湊相同即逐值相同。
   頭尾樣本與筆數一起附上，是為了讓比對失敗時看得出差在哪，不是只有一個紅字。

   需要 `window.WFG_TEST_CFG`（設定檔 JSON 字串）；沒有就直接報錯，不用頁面預設
   —— 相容性要用**使用者的真實檔案**驗，不是用我們自己鋪的好測資料。
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  const R = [];
  const ERRS = [];
  window.addEventListener('error', (e) => ERRS.push('error: ' + (e.message || '') + ' @' + (e.lineno || 0)));
  window.alert = function () {};
  window.confirm = function () { return true; };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  /* FNV-1a 32bit over the exact decimal text of every value. */
  function fnv(list) {
    let h = 0x811c9dc5;
    for (let i = 0; i < list.length; i++) {
      const s = list[i].toFixed(9);
      for (let k = 0; k < s.length; k++) {
        h ^= s.charCodeAt(k);
        h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
      }
      h ^= 0x2c; h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h >>> 0;
  }
  const digest = (a) => ({
    n: a.length,
    h: fnv(a),
    sum: Math.round(a.reduce((s, v) => s + v, 0) * 1e6) / 1e6,
    head: a.slice(0, 3).map(v => Math.round(v * 1e6) / 1e6),
    tail: a.slice(-2).map(v => Math.round(v * 1e6) / 1e6)
  });

  (async function run() {
    const out = { build: null, scenarios: [] };
    try {
      await new Promise(r => (document.readyState === 'complete' ? r() : window.addEventListener('load', r)));
      await sleep(400);
      if (!window.WFG_TEST_CFG) throw new Error('缺 window.WFG_TEST_CFG —— 這支必須用真實設定檔跑');
      const okImp = window.wfgImportConfig(window.WFG_TEST_CFG);
      if (okImp === false) throw new Error('匯入設定檔失敗');
      await sleep(300);

      const probeDump = window.wfgDumpLsCko(1) || {};
      const NEW = ('trigEdgeRise' in probeDump);
      out.build = NEW ? 'new(two-field)' : 'old(single-field)';

      function setEdges(rise, fall) {
        if (NEW) {
          window.wfgOnLsGlobalChange('cpv_trig_edge_rise', rise);
          window.wfgOnLsGlobalChange('cpv_trig_edge_fall', fall);
          return true;
        }
        if (rise !== fall) return false;       // 舊 build 表達不出「兩邊不同」
        window.wfgOnLsGlobalChange('cpv_trig_edge', rise);
        return true;
      }

      /* 四進多出的另外兩個來源固定指向 CK7 / CK8（在 Bruce 的實檔裡是 enable 的
         真實波形）。兩個 build 都設同一組，比對才成立。 */
      const SCEN = [
        ['dual_cpv', 'falling', 'falling'],
        ['dual_cpv', 'rising', 'rising'],
        ['dual_cpv', 'rising', 'falling'],
        ['dual_cpv', 'falling', 'rising'],
        ['quad_cpv', 'falling', 'falling'],
        ['quad_cpv', 'rising', 'rising'],
        ['quad_cpv', 'rising', 'falling'],
        ['quad_cpv', 'falling', 'rising']
      ];
      for (const [mode, rise, fall] of SCEN) {
        window.wfgOnLsGlobalChange('mode', mode);
        window.wfgOnLsGlobalChange('cpv3_ck_idx', '10');
        window.wfgOnLsGlobalChange('cpv4_ck_idx', '11');
        await sleep(60);
        const can = setEdges(rise, fall);
        await sleep(120);
        if (!can) { out.scenarios.push({ mode, rise, fall, skipped: 'old build cannot express' }); continue; }
        const d = window.wfgDumpLsCko(2);
        const row = { mode, rise, fall, ok: !!d.ok, phase: d.phase, ckos: [] };
        for (const c of (d.ckos || [])) {
          row.ckos.push({ cko: c.cko, r: digest(c.rises || []), f: digest(c.falls || []) });
        }
        out.scenarios.push(row);
      }
      R.push({ name: 'DUMP ' + out.build, pass: true, extra: JSON.stringify(out) });
    } catch (err) {
      R.push({ name: '🔴 dump probe 爆掉：' + (err && err.message), pass: false, extra: String((err && err.stack) || '').slice(0, 300) });
    }
    const REAL = ERRS.filter(e => !/ResizeObserver loop/.test(e));
    if (REAL.length) R.push({ name: '🔴 頁面丟出未處理的例外', pass: false, extra: REAL.slice(0, 3).join(' | ') });
    document.title = 'UIPROBE' + JSON.stringify(R);
  })();
})();
