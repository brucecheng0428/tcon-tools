/* 同事B 10/15: 原始條件 10000K、Gamma 2.4；不改 LUT 模式。 */
(async function () {
 try {
  await __boot(1500);
  DG_WMODE = 'pc'; dgWmodeSync(); dgDoneStepsSync();
  __ok('settings expanded', !$('dg-card-setup').classList.contains('dg-fold'));
  __ok('output format expanded', $('dg-setup-more').open);
  $('dg-wpt-new').checked = true;
  $('dg-wpt-new').dispatchEvent(new Event('change', {bubbles:true}));
  $('dg-wpt-cct').value = '10000';
  $('dg-wpt-cct').dispatchEvent(new Event('input', {bubbles:true}));
  $('dg-gamma').value = '2.4';
  $('dg-gamma').dispatchEvent(new Event('input', {bubbles:true}));
  DG_CCT_MODE = 'fixed6500'; dgCctModeSync();
  __ok('fixed CCT follows 10000K', Math.abs(dgCctBase().center - 10000) < 1);
  __ok('fixed label follows 10000K', /10000/.test($('dg-cctbase-cmp').textContent));
  var curve = {xs:[0,64,128,192,255],rel:[0,.036,.191,.506,1],gam:[null,2.4,2.4,2.4,null],cct:[10000,10000,10000,10000,10000]};
  [DG_MAIN_CHARTS,DG_CMP_CHARTS,DG_CONF_CHARTS].forEach(function(ids){
    dgDrawTriple(ids,[{curve:curve,color:'#a78bfa',name:'測試量測'}]);
    dgChartZoomOpen(ids[0]);
    __ok(ids[0]+' target 2.4 with bounds 2.2/2.6', /γ=2.6/.test($('dg-zoom-canvas').textContent) && !/γ=2.0/.test($('dg-zoom-canvas').textContent));
    dgChartZoomClose(); dgChartZoomOpen(ids[1]);
    __ok(ids[1]+' step gamma 2.6 bound', /γ=2.6/.test($('dg-zoom-canvas').textContent));
    dgChartZoomClose();
  });
  var xml=dgOptSheetXml([],256,255);
  __ok('xlsx target gamma and CCT', /γ=2.6/.test(xml) && /10000/.test(xml) && /\^2.4/.test(xml));
  var button=$('dg-btn-conf-setup');
  button.classList.remove('dg-btn-imp');
  __ok('confirmation blue outline guidance', getComputedStyle(button).borderTopColor==='rgb(59, 130, 246)');
  button.classList.add('dg-btn-imp');
  __ok('confirmation primary blue', getComputedStyle(button).backgroundColor==='rgb(37, 99, 235)');
  for(var lang of ['zh-TW','zh-CN','en']){
    applyLang(lang); dgCctModeSync();
    __ok('fixed CCT locale '+lang, $('dg-cctbase-cmp').textContent.indexOf(lang==='en'?'Fixed 10000K':'固定 10000K')>=0);
  }
  applyLang('zh-TW'); dgCctModeSync();
  dgChartZoomOpen('dg-conf-chart1');
 } catch(e) {__ok('scenario exception', false, String(e.stack||e));}
 __done();
})();
