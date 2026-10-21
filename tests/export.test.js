'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const archive=require('../workspace-archive');
async function fixture(files,bodies){
 const saved=[],blobs=new Map(),calls=[];let seq=0;
 class LocalURL extends URL{static createObjectURL(blob){const id='blob:'+seq++;blobs.set(id,blob);return id;}static revokeObjectURL(){}}
 const window={CLIENT_SPACE_CONFIG:{supabaseUrl:'https://platum.test',supabasePublishableKey:'synthetic'},CLIENT_SPACE_AUTH_CONTEXT:{accessToken:'synthetic-user'},PLATUM_ARCHIVE:archive};
 const document={body:{append(){}},createElement(){return {click(){saved.push({name:this.download,blob:blobs.get(this.href)});},remove(){}};}};
 const fetch=async(url,options)=>{calls.push({url,options});if(url.endsWith('/rpc/platum_personal_data'))return new Response(JSON.stringify({contacts:[],events:[],busy:[],people:[],joinable:[],applications:[]}));if(url.endsWith('/rpc/platum_export'))return new Response(JSON.stringify({workspace:{name:'Shared work'},exported_at:'2026-10-21',files}),{headers:{'Content-Type':'application/json'}});const id=new URL(url,'https://platum.test').searchParams.get('id');return bodies[id]===undefined?new Response('Denied',{status:403}):new Response(bodies[id]);};
 vm.runInNewContext(fs.readFileSync(require.resolve('../workspace-data'),'utf8'),{window,document,fetch,Blob,TextEncoder,URL:LocalURL,AbortSignal,crypto:require('node:crypto').webcrypto,setTimeout(){}});
 const result=await window.PLATUM_DATA.exportWorkspace('synthetic-workspace','archive');return {result,saved,calls};
}
function zipEntries(bytes){const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),entries={};let p=0;while(v.getUint32(p,true)===0x04034b50){const len=v.getUint32(p+18,true),n=v.getUint16(p+26,true),name=new TextDecoder().decode(bytes.slice(p+30,p+30+n));entries[name]=bytes.slice(p+30+n,p+30+n+len);p+=30+n+len;}return entries;}
test('client archive contains the projected history and exact accessible attachment bytes',async()=>{
 const f=await fixture([{id:'one',name:'Документ.txt',size_bytes:5}],{one:'hello'});assert.equal(f.result.complete,true);assert.equal(f.saved.length,2);
 const files=zipEntries(new Uint8Array(await f.saved[0].blob.arrayBuffer()));assert.equal(new TextDecoder().decode(files['attachments/one-Документ.txt']),'hello');assert.ok(files['workspace.json']);assert.ok(files['manifest.json']);assert.equal(JSON.parse(new TextDecoder().decode(files['manifest.json'])).complete,true);
 assert.equal(f.calls.find(c=>c.url.startsWith('/api/files')).options.headers.Authorization,'Bearer synthetic-user');assert.equal(f.calls.find(c=>c.url.startsWith('/api/files')).options.cache,'no-store');
});
test('inaccessible or truncated files are explicitly NOT_INCLUDED; an incomplete archive is never reported complete',async()=>{
 const f=await fixture([{id:'allowed',name:'yes.txt',size_bytes:2},{id:'revoked',name:'no.txt',size_bytes:3},{id:'truncated',name:'short.txt',size_bytes:99}],{allowed:'ok',truncated:'x'});
 assert.equal(f.result.complete,false);assert.deepEqual(Array.from(f.result.files,f=>f.status),['INCLUDED','NOT_INCLUDED','NOT_INCLUDED']);const files=zipEntries(new Uint8Array(await f.saved[0].blob.arrayBuffer()));assert.equal(Object.keys(files).filter(k=>k.startsWith('attachments/')).length,1);
 assert.equal(JSON.parse(await f.saved[1].blob.text()).complete,false);
});
