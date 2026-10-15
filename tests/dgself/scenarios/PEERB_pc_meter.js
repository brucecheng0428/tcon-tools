/* Real connection functions, simulated serial transport. */
(async function(){
 try{
  await __boot(300);
  var reply=null, queries=0;
  var port={readable:null, getInfo:function(){return {usbVendorId:1,usbProductId:1};},
   open:async function(){this.readable={};},close:async function(){this.readable=null;}};
  Object.defineProperty(navigator,'serial',{configurable:true,value:{getPorts:async function(){return [port];}}});
  readLoop=function(){};
  cmd=async function(t){if(t==='BPR'){queries++;return reply;}return 'OK00';};
  for(var mode of ['auto','spec','legacy']){
   $('dgm-mode').value=mode;
   for(var r of [null,'ER01','OK00,38400']){
    reply=r; queries=0; port.readable=null;
    dgmSerialLinkActive=false; dgmSerialLinkBusy=false;
    await dgmLinkOn();
    __ok(mode+' reply '+String(r),dgmSerialLinkActive===(r==='OK00,38400') && queries>0);
    __ok(mode+' failed handshake closes port',r==='OK00,38400'||port.readable===null);
    await dgmHardClose('test cleanup');
   }
  }
 }catch(e){__ok('scenario exception',false,String(e.stack||e));}
 __done();
})();