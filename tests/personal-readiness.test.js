'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(mode){
 const calls=[];const window={CLIENT_SPACE_CONFIG:{supabaseUrl:'https://platum.test',supabasePublishableKey:'synthetic'},CLIENT_SPACE_AUTH_CONTEXT:{accessToken:'user'}};
 const fetch=async(url,options)=>{calls.push(url);if(url.endsWith('/platum_personal_data')){
  if(mode==='ready')return new Response(JSON.stringify({contacts:[],events:[],busy:[],people:[],joinable:[],applications:[]}));
  if(mode==='invalid')return new Response('{}');
  return new Response(JSON.stringify({code:mode==='missing'?'PGRST202':'42501',message:'unavailable'}),{status:mode==='missing'?404:mode==='unauthorized'?401:mode==='denied'?403:500});
 }return new Response(JSON.stringify({ok:true}));};
 vm.runInNewContext(fs.readFileSync(require.resolve('../workspace-data'),'utf8'),{window,fetch,Blob,TextEncoder,URL,AbortSignal,crypto:require('node:crypto').webcrypto});return {api:window.PLATUM_DATA,calls};
}
test('missing privacy RPC yields an explicit pending state while prior network RPCs remain available',async()=>{
 const {api}=fixture('missing');const p=await api.personal();assert.equal(p.available,false);assert.equal(p.contacts.length,0);assert.equal((await api.networkMutate('community.profile','id',{})).ok,true);
});
test('authorization, server and malformed-response failures are never disguised as a missing migration',async()=>{
 for(const mode of ['unauthorized','denied','server','invalid'])await assert.rejects(()=>fixture(mode).api.personal());
});
test('personal writes and attachment archives wait for confirmed privacy-schema readiness',async()=>{
 const {api,calls}=fixture('missing');await assert.rejects(()=>api.personalMutate('contact.save',null,{}),/being prepared/);await assert.rejects(()=>api.exportWorkspace('work','archive'),/being prepared/);assert.equal(calls.some(x=>x.endsWith('/platum_personal_mutate')||x.startsWith('/api/files')),false);
});
test('a ready privacy schema enables personal writes',async()=>{
 const {api,calls}=fixture('ready');assert.equal((await api.personal()).available,true);assert.equal((await api.personalMutate('contact.save',null,{})).ok,true);assert.ok(calls.some(x=>x.endsWith('/platum_personal_mutate')));
});
