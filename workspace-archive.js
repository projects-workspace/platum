(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PLATUM_ARCHIVE=api;})(typeof window==='undefined'?globalThis:window,()=>{
 'use strict';
 const table=Uint32Array.from({length:256},(_,i)=>{let c=i;for(let n=0;n<8;n++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
 const crc=bytes=>{let c=0xffffffff;for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
 const safeName=name=>[...String(name||'file').replace(/[\\/\x00-\x1f\x7f]/g,'_').replace(/^\.+/,'_')].slice(0,180).join('')||'file';
 function header(length){const bytes=new Uint8Array(length);return {bytes,view:new DataView(bytes.buffer)};}
 async function zip(entries){
  const parts=[],directory=[];let offset=0;
  for(const entry of entries){
   const name=new TextEncoder().encode(entry.name),bytes=entry.data instanceof Uint8Array?entry.data:new Uint8Array(await entry.data.arrayBuffer());
   if(name.length>65535||bytes.length>0xffffffff||offset+bytes.length>0xffffffff)throw new Error('Archive volume is too large.');
   const sum=crc(bytes),local=header(30+name.length);local.view.setUint32(0,0x04034b50,true);local.view.setUint16(4,20,true);local.view.setUint16(6,0x800,true);
   local.view.setUint16(12,33,true);local.view.setUint32(14,sum,true);local.view.setUint32(18,bytes.length,true);local.view.setUint32(22,bytes.length,true);local.view.setUint16(26,name.length,true);local.bytes.set(name,30);
   parts.push(local.bytes,bytes);
   const central=header(46+name.length);central.view.setUint32(0,0x02014b50,true);central.view.setUint16(4,20,true);central.view.setUint16(6,20,true);central.view.setUint16(8,0x800,true);
   central.view.setUint16(14,33,true);central.view.setUint32(16,sum,true);central.view.setUint32(20,bytes.length,true);central.view.setUint32(24,bytes.length,true);central.view.setUint16(28,name.length,true);central.view.setUint32(42,offset,true);central.bytes.set(name,46);directory.push(central.bytes);offset+=local.bytes.length+bytes.length;
  }
  if(entries.length>65535)throw new Error('Too many archive entries.');
  const size=directory.reduce((n,b)=>n+b.length,0),end=header(22);end.view.setUint32(0,0x06054b50,true);end.view.setUint16(8,entries.length,true);end.view.setUint16(10,entries.length,true);end.view.setUint32(12,size,true);end.view.setUint32(16,offset,true);
  return new Blob([...parts,...directory,end.bytes],{type:'application/zip'});
 }
 return Object.freeze({zip,safeName});
});
