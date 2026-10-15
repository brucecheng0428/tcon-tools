/* Simulated serial transport; execute the real connection entry. No hardware claim. */
(async function(){
 try {
  await __boot(700);
  var reply=null;
  var port={open:async function(){},close:async function(){},
   writable:{getWriter:function(){return {write:async function(){},releaseLock:function(){}};}},
   readable:{getReader:function(){return {read:function(){return new Promise(function(){});},cancel:async function(){},releaseLock:function(){}};}}};
  Object.defineProperty(navigator,'serial',{configurable:true,value:{getPorts:async function(){return [port];}}});
  dstCaCmd=async function(){return reply;};
  for(var r of [null,'ER01','nonsense','OK00,115200']){
   reply=r;
   var ok=await dstCaOpen();
   __ok('connection validity '+String(r),ok===(r==='OK00,115200') && dstCaLinked===ok);
   await dstCaClose();
  }
 }catch(e){__ok('scenario exception',false,String(e.stack||e));}
 __done();
})();