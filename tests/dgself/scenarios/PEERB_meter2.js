/* 同事B 10/19：自檢頁量測儀開埠參數／順序／結尾／握手時限與 dg-measure.html 相同。
   模擬序列埠，執行真的 dstCaOpen()／dstCaCmd()。不代表真機通過。 */
(async function(){ try {
  await __boot(700);
  var opens=[], cur=null, written=[], reqs=0, ports=[];
  function mkPort(ids){
    return {
      getInfo:function(){return ids?{usbVendorId:0x132b,usbProductId:0x2141}:{};},
      open:async function(o){opens.push(JSON.stringify(o)); cur=o; this.readable=this._r; this.writable=this._w;},
      close:async function(){this.readable=null; this.writable=null;},
      _w:{getWriter:function(){return {write:async function(b){written.push(Array.from(b));},releaseLock:function(){}};}},
      _r:{getReader:function(){return {read:function(){return new Promise(function(){});},cancel:async function(){},releaseLock:function(){}};}},
      readable:null, writable:null };
  }
  var pick=mkPort(true);
  Object.defineProperty(navigator,'serial',{configurable:true,value:{
    getPorts:async function(){return ports;},
    requestPort:async function(){reqs++; return pick;}}});
  var SPEC=JSON.stringify({baudRate:38400,dataBits:7,stopBits:2,parity:'even',flowControl:'hardware'});
  var LEG=JSON.stringify({baudRate:38400,dataBits:8,stopBits:1,parity:'none'});
  __ok('constants equal dg-measure', JSON.stringify(DST_PORT_SPEC)===SPEC && JSON.stringify(DST_PORT_LEGACY)===LEG && DST_HS_MS===3000);

  // 1) real dstCaCmd: bytes end with CR only, handshake waits 3000 ms, spec then legacy
  ports=[mkPort(true)]; opens=[]; written=[];
  var t0=performance.now(); var ok=await dstCaOpen(); var dt=performance.now()-t0;
  __ok('no reply: fails', ok===false && dstCaLinked===false);
  __ok('no reply: spec then legacy', opens.join('|')===SPEC+'|'+LEG, opens.join('|'));
  __ok('no reply: each handshake waited ~3000 ms', dt>=5800 && dt<9000, Math.round(dt)+' ms');
  var bpr=written.filter(function(b){return String.fromCharCode.apply(null,b).indexOf('BPR')===0;});
  __ok('BPR sent twice, ends with CR only', bpr.length===2 && bpr.every(function(b){return b[b.length-1]===13 && b.indexOf(10)<0;}), JSON.stringify(bpr));
  __ok('no COM,0 written while failing', !written.some(function(b){return String.fromCharCode.apply(null,b).indexOf('COM,0')===0;}));
  __ok('after failure next ON asks for a port', dstCaRepick===true);
  reqs=0; opens=[];
  var realCmd=dstCaCmd;
  dstCaCmd=async function(t){ return t==='BPR' ? (cur && cur.dataBits===7 ? 'OK00,38400' : null) : 'OK00'; };
  ok=await dstCaOpen();
  __ok('repick: chooser shown once, then spec works', ok && reqs===1 && dstCaModeUsed==='spec' && opens.join('|')===SPEC, reqs+' '+opens.join('|'));
  await dstCaClose();

  // 2) spec silent, legacy answers
  ports=[mkPort(true)]; opens=[]; reqs=0;
  dstCaCmd=async function(t){ return t==='BPR' ? (cur && cur.dataBits===8 ? 'OK00,38400' : null) : 'OK00'; };
  ok=await dstCaOpen();
  __ok('legacy fallback connects', ok && dstCaLinked && dstCaModeUsed==='legacy' && opens.join('|')===SPEC+'|'+LEG && reqs===0, opens.join('|'));
  await dstCaClose();

  // 3) port choice like dgmChooseAuthorized
  dstCaCmd=async function(t){ return t==='BPR' ? 'OK00,38400' : 'OK00'; };
  ports=[mkPort(true),mkPort(true)]; reqs=0;
  ok=await dstCaOpen(); __ok('two granted ports: chooser', ok && reqs===1); await dstCaClose();
  ports=[mkPort(false)]; reqs=0;
  ok=await dstCaOpen(); __ok('granted port without USB ids: chooser', ok && reqs===1); await dstCaClose();
  ports=[mkPort(true)]; reqs=0;
  ok=await dstCaOpen(); __ok('single USB port: used directly', ok && reqs===0); await dstCaClose();
  dstCaCmd=realCmd;
 }catch(e){__ok('scenario exception',false,String(e.stack||e));} __done();})();
