'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(mode){const calls=[];const window={CLIENT_SPACE_CONFIG:{supabaseUrl:'https://platum.test',supabasePublishableKey:'synthetic'},CLIENT_SPACE_AUTH_CONTEXT:{accessToken:'user'}};
 const fetch=async(url,options)=>{calls.push({url,options});if(url.endsWith('/platum_branding_capabilities'))return mode==='missing'?new Response(JSON.stringify({code:'PGRST202'}),{status:404}):mode==='denied'?new Response(JSON.stringify({code:'42501'}),{status:403}):new Response(JSON.stringify({logo:true}));return mode==='file-denied'?new Response('Denied',{status:403}):new Response('ok');};
 vm.runInNewContext(fs.readFileSync(require.resolve('../workspace-data'),'utf8'),{window,fetch,Blob,TextEncoder,URL,AbortSignal,crypto:require('node:crypto').webcrypto});return {api:window.PLATUM_DATA,calls};}
test('missing optional logo migration does not prevent existing work; authorization errors remain errors',async()=>{
 assert.equal((await fixture('missing').api.branding()).logo,false);assert.equal((await fixture('ready').api.branding()).logo,true);await assert.rejects(()=>fixture('denied').api.branding());
});
test('logo bytes use the authenticated no-store file path and reject private or invalid file types',async()=>{
 const {api,calls}=fixture('ready');const file={id:'fixture',size_bytes:2,mime_type:'image/png',status:'ready',client_visible:true};const b=await api.logoBlob(file);assert.equal(b.type,'image/png');assert.equal(await b.text(),'ok');assert.equal(calls[0].options.headers.Authorization,'Bearer user');assert.equal(calls[0].options.cache,'no-store');
 for(const change of [{client_visible:false},{status:'pending'},{mime_type:'image/svg+xml'}])await assert.rejects(()=>api.logoBlob({...file,...change}),/shared PNG/);
});
test('missing or truncated logo bytes fail closed without creating a public image URL',async()=>{
 const file={id:'fixture',size_bytes:2,mime_type:'image/png',status:'ready',client_visible:true};await assert.rejects(()=>fixture('file-denied').api.logoBlob(file));await assert.rejects(()=>fixture('ready').api.logoBlob({...file,size_bytes:3}));
});

test('private blob images are allowed without broadening script or frame permissions',()=>{
 const config=require('../vercel.json');const csp=config.headers.flatMap(h=>h.headers).find(h=>h.key==='Content-Security-Policy').value;
 assert.match(csp,/img-src 'self' data: blob:;/);assert.match(csp,/script-src 'self';/);assert.match(csp,/frame-ancestors 'none';/);
});
