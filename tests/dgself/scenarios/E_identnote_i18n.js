/* E：DG_EN OFF 時「使用等間距 LUT」說明的三語文字＋版號一致。 */
(async function () { try { await __wait(500); await __arm(); await __wait(200);
  window.__regs[0x005D] = 0x0C; await dstGuard(async function(){ await dstReadDgEn(); }); dstRenderBtns();
  document.getElementById('dst-lut-read').click(); await __wait(1500);
  applyLang('en'); await __wait(100); __ok('E en note', __txt('dst-lut-identnote'), __txt('dst-lut-identnote'));
  applyLang('zh-CN'); await __wait(100); __ok('E zh-CN note', /等间距/.test(__txt('dst-lut-identnote')), __txt('dst-lut-identnote')); applyLang('zh-TW');
  /* dgself v2.6.1：確認量測送回 DG 後的指路句要提到 DG 第 4 部分並列的兩顆鈕（查看目前結果／進行第 N+1 輪），三語。 */
  ['zh-TW', 'en', 'zh-CN'].forEach(function (L) { applyLang(L);
    var a = dstT('dst.dgConfNext', { btn: '進行第二輪' }), b = dstT('dst.dgConfNextNoBtn');
    __ok('E ' + L + ' conf-next names both DG buttons', a.indexOf('查看目前結果') >= 0 && a.indexOf('進行第二輪') >= 0 && a.indexOf('查看目前結果') < a.indexOf('進行第二輪'), a);
    __ok('E ' + L + ' conf-next (no btn) names view button', b.indexOf('查看目前結果') >= 0, b); });
  applyLang('zh-TW'); __checkVersion('E');
 } catch (e) { window.__errs.push('test threw: ' + (e && e.stack || e)); } __done(); })();
