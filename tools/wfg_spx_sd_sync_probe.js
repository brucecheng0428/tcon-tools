/* ═══════════════════════════════════════════════════════════════════════════
   wfg_spx_sd_sync_probe.js — 改 SD／LS 參數時，Subpixel（Vpix）必須跟著重算

     tools/ui_probe.sh wfg.html tools/wfg_spx_sd_sync_probe.js

   🔴 釘住的是 v4.53.1 的 bug（Bruce 2026-09-21 真機回報）：
      「在 WFG 網頁設定 SD1 的電壓值時，Subpixel 的波形不會跟著更新 —— 只有 SD1
       自己的波形更新了。要把 Feedthrough 取消勾選再勾回來 Vpix 才會重算。」

      根因有兩層，兩層都要釘：
        ① `_wfgBuildAnalogDeps()` 給 type 3 的相依只有「自己 ＋ xpol」，沒有繼承
           上游的 SD1／Gate ⇒ 改 SD1 時 SPX 根本不在 `_affectedAnalog` 裡。
        ② `wfgInvalidateDirty()` 的即時快路徑只刪 type 1／2，沒有 type 3。
      漏任何一層，本檔的 ①／⑤ 就會變紅。

   🔴 **這支同時釘住反面**：修法不可以退化成「一律全刪」。那會讓每次調參數都全量
      重算（這條快路徑存在的目的正是避免全量），所以 ② 直接讀 `[WFG] Precompute
      analog: … recomputed=N (SD=x LS=y)` 這行實測輸出，要求 **LS=0、recomputed=2**
      （＝只有 SD1 與 Vpix 被重算），CKO 一條都不准被牽連。

   期望值不是「有沒有呼叫某支函式」，而是 `window.wfgDumpSpx()` 回來的**逐段電壓值**
   （每段 v[] 的 FNV-1a 雜湊 ＋ v0／vMid／vEnd）真的不一樣 —— 呼叫次數對而值沒變
   的情況（例如重算成同一份舊資料）騙不過這個判準。

   所有操作走的都是 UI 的同一支 handler（`wfgLoadPresetFromSelect` ＋ 對話框按鈕、
   `wfgOnAnalogConfigChange`、`wfgOnGpioChange`、`wfgOnFtEnableChange`），不直接改
   內部狀態 —— 否則測到的就不是使用者走的那條路徑。
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  const R = [];
  const ok = (name, cond, extra) => R.push({ name, pass: !!cond, extra: extra === undefined ? '' : String(extra) });
  const ERRS = [];
  window.addEventListener('error', (e) => ERRS.push('error: ' + (e.message || '') + ' @' + (e.lineno || 0)));
  window.addEventListener('unhandledrejection', (e) => ERRS.push('rejection: ' + ((e.reason && (e.reason.message || e.reason)) || '')));
  const LOGS = [];
  const _log = console.log.bind(console);
  console.log = function () { try { LOGS.push(Array.prototype.slice.call(arguments).join(' ')); } catch (e) {} _log.apply(console, arguments); };
  window.alert = function () {};
  window.confirm = function () { return true; };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const SD1 = 18;            // wfgSd1SlotIdx()：SD1 的索引在任何 phase 下都是 18
  const CK1 = 4;             // 數位訊號 CK1（Gate 的上游時脈）

  /* Vpix 的「值指紋」：段數 ＋ 每段的邊界值與整份雜湊。
     只比 overallHash 會漏掉「段結構變了但雜湊碰撞」的情況，所以連同各段端點一起帶。 */
  function spxSig() {
    const d = window.wfgDumpSpx();
    if (!d || !d.ok) return { ok: false, reason: (d && d.reason) || 'no dump' };
    return { ok: true, hash: d.overallHash, segCount: d.segCount, ext: d.computedExtent,
             pts: d.segs.map(s => [s.i, s.a, s.n, s.v0, s.vMid, s.vEnd].join(':')).join('|') };
  }
  const sigText = (s) => s.ok ? (s.hash + '/seg' + s.segCount) : ('FAIL:' + s.reason);
  const same = (a, b) => a.ok && b.ok && a.hash === b.hash && a.pts === b.pts;

  /* 從實測的 perf log 取回「這一次改參數到底重算了幾條」 */
  function perfCounts() {
    const line = LOGS.filter(l => /Precompute analog:/.test(l)).pop();
    if (!line) return { line: '(無)', total: -1, sd: -1, ls: -1 };
    const m = /recomputed=(\d+) \(SD=(\d+) LS=(\d+)\)/.exec(line);
    if (!m) return { line, total: -1, sd: -1, ls: -1 };
    return { line, total: +m[1], sd: +m[2], ls: +m[3] };
  }

  (async function run() {
    try {
      await new Promise(r => (document.readyState === 'complete' ? r() : window.addEventListener('load', r)));
      await sleep(600);

      /* ── 0. 用快捷設定把類比／面板 slot 開起來（首次進站它們 enable=false）──
         走的是下拉 → 類別選擇視窗 → 匯入，與使用者的操作完全相同。 */
      const sel = document.getElementById('wfg-preset-select');
      sel.value = 'fhd_60hz_sg';
      window.wfgLoadPresetFromSelect(sel);
      await sleep(300);
      document.getElementById('wfg-imps-ok').click();
      await sleep(3000);

      const gp = window.wfgDebugOax.gpios();
      ok('0a SD1／Gate／Vpix 三條都啟用了（前置條件）',
         gp[SD1] && gp[SD1].enable && gp[SD1].waveform_type === 1
         && gp[31] && gp[31].enable && gp[31].waveform_type === 2
         && gp[32] && gp[32].enable && gp[32].waveform_type === 3,
         [SD1, 31, 32].map(i => i + ':t' + gp[i].waveform_type + ':en' + (gp[i].enable ? 1 : 0)).join(' '));

      ok('0b Vpix 已經算出來了（前置條件）', spxSig().ok, sigText(spxSig()));

      /* 🔴 基準值**不取剛載入時的那一份**：SPX 的計算視窗（base／computedExtent）是
         lazy-extend 的，剛載入與「改過一次參數之後」本來就不是同一段（`wfgDumpSpx()`
         的註解已載明這件事不可重現）。所以先改一次讓視窗落定，再以那一份當基準 ——
         否則測到的是換窗，不是本次要驗的「值有沒有跟著上游更新」。 */
      const ac = gp[SD1].analog_config;
      const pmax0 = ac.pos_gamma_max;
      window.wfgOnAnalogConfigChange(SD1, 'pos_gamma_max', String(pmax0 - 1));
      await sleep(1200);
      const base = spxSig();
      ok('0c 視窗落定後取得基準指紋', base.ok && base.segCount > 0, sigText(base));

      /* ── 1. 改 SD1 電壓 ⇒ Vpix 的值必須跟著變（本次 bug 的正面）────────── */
      window._wfgPerfEnabled = true;
      LOGS.length = 0;
      window.wfgOnAnalogConfigChange(SD1, 'pos_gamma_max', String(pmax0 - 3));
      await sleep(1200);
      const afterSd = spxSig();
      ok('1a 改 SD1 正極性上緣（VGMA1）⇒ Vpix 的逐段電壓真的不一樣了',
         afterSd.ok && !same(base, afterSd), sigText(base) + ' → ' + sigText(afterSd));

      /* ── 2. 反面：不可以退化成全量重算 ──────────────────────────────────
         只有 SD1（type 1）與 Vpix（type 3）該被重算；12 條 CKO 一條都不准動。 */
      const pc = perfCounts();
      ok('2a 只重算 SD1 ＋ Vpix 兩條（沒有退化成全量重算）',
         pc.total === 2 && pc.sd === 1 && pc.ls === 0, pc.line);

      /* ── 3. 改回基準值 ⇒ 指紋必須回到一模一樣（證明 1a 是真重算，不是亂變）── */
      window.wfgOnAnalogConfigChange(SD1, 'pos_gamma_max', String(pmax0 - 1));
      await sleep(1200);
      const restored = spxSig();
      ok('3a 把 VGMA1 改回基準值 ⇒ Vpix 逐段電壓回到一模一樣',
         same(base, restored), sigText(base) + ' vs ' + sigText(restored));

      /* ── 4. Feedthrough 取消再勾這個 workaround 不再需要 ────────────────
         他原本的繞路走的是 `_wfgInvalidateLsOnly()`（那支有刪 type 3）。修好之後
         「直接改」與「改完再繞一次」必須收斂到同一份值 —— 不同就代表 1a 只是
         剛好變了，不是算對了。 */
      window.wfgOnAnalogConfigChange(SD1, 'pos_gamma_max', String(pmax0 - 3));
      await sleep(1200);
      const direct = spxSig();
      window.wfgOnFtEnableChange(false);
      await sleep(600);
      window.wfgOnFtEnableChange(true);
      await sleep(1200);
      const viaWorkaround = spxSig();
      ok('4a 直接改的結果 ＝ 走 Feedthrough 取消再勾之後的結果（workaround 已不需要）',
         same(direct, viaWorkaround), sigText(direct) + ' vs ' + sigText(viaWorkaround));
      window.wfgOnAnalogConfigChange(SD1, 'pos_gamma_max', String(pmax0 - 1));
      await sleep(1200);

      /* ── 5. 同一個洞的 LS 那一半：改 Gate 上游時脈的 timing ─────────────
         Vpix 的另一條上游是 Gate（TFT 開關窗），Gate 吃 CK ⇒ 改 CK 的 timing
         同樣要讓 Vpix 重算。這條走的是與 1a 完全相同的快路徑。 */
      const before5 = spxSig();
      const stl0 = gp[CK1].st_line;
      LOGS.length = 0;
      window.wfgOnGpioChange(CK1, 'st_line', String(stl0 + 40));
      await sleep(1200);
      const after5 = spxSig();
      ok('5a 改 CK1 的 ST_LINE（Gate 的上游）⇒ Vpix 的逐段電壓也跟著變',
         after5.ok && !same(before5, after5), sigText(before5) + ' → ' + sigText(after5));
      const pc5 = perfCounts();
      ok('5b 這一次重算的 SD 只有 1 條（沒有把所有 SD 都刪掉）', pc5.sd <= 1, pc5.line);
      window.wfgOnGpioChange(CK1, 'st_line', String(stl0));
      await sleep(1200);
      ok('5c 把 ST_LINE 改回原值 ⇒ Vpix 回到一模一樣', same(before5, spxSig()));

    } catch (err) {
      R.push({ name: '🔴 probe 自己爆掉：' + (err && err.message), pass: false, extra: String((err && err.stack) || '').slice(0, 300) });
    }
    /* `ResizeObserver loop completed with undelivered notifications` 是瀏覽器對
       「ResizeObserver callback 內又改了版面」發的通知，改動前的 HEAD 跑同一組
       互動一樣會出現，這裡照實分兩行報，其他任何例外仍一律判 FAIL。 */
    const RO = ERRS.filter(e => /ResizeObserver loop/.test(e));
    const REAL = ERRS.filter(e => !/ResizeObserver loop/.test(e));
    if (REAL.length) R.push({ name: '🔴 頁面丟出未處理的例外', pass: false, extra: REAL.slice(0, 3).join(' | ') });
    else R.push({ name: '頁面全程沒有未處理的例外（ResizeObserver 通知另計）', pass: true, extra: '' });
    if (RO.length) R.push({ name: 'ℹ ResizeObserver 通知（非本版引入）', pass: true, extra: RO.length + ' 則' });
    document.title = 'UIPROBE' + JSON.stringify(R);
  })();
})();
