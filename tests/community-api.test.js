'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHandler}=require('../api/community');
const user='11111111-1111-4111-8111-111111111111',community='22222222-2222-4222-8222-222222222222',invitation='33333333-3333-4333-8333-333333333333',op='44444444-4444-4444-8444-444444444444';
const env={PLATUM_SUPABASE_URL:'https://platum.example.test',PLATUM_SUPABASE_SERVICE_ROLE_KEY:'sb_secret_synthetic',PLATUM_APP_URL:'https://platum-app.example.test'};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
async function invoke(options={}){
 const calls=[];const fetcher=async(url,request)=>{
  const u=new URL(url),p=request.body?JSON.parse(request.body):null;calls.push({url:u,request,p});
  if(options.fetcher)return options.fetcher(u,request,p);
  if(u.pathname==='/auth/v1/user')return json({id:user,email_confirmed_at:options.unconfirmed?null:'2026-01-01'});
  if(u.pathname.includes('/rpc/')){
   if(options.denied)return json({message:'FORBIDDEN'},403);
   if(p.action==='invitation.claim')return json({send:!options.alreadyClaimed,invitation:{id:invitation,email:'invitee@example.test',mail_status:'sent'}});
   if(p.action==='invitation.delivery')return json({id:invitation,email:'invitee@example.test',mail_status:p.payload.status});
   return json({id:invitation,email:'invitee@example.test',community_id:community,mail_status:'pending'});
  }
  if(u.pathname==='/auth/v1/invite'){
   if(options.timeout)throw new Error('private transport data');
   return options.exists?json({code:'email_exists'},422):json({},options.deliveryFailure?500:200);
  }
  if(u.pathname==='/auth/v1/otp')return json({});
  throw new Error('Unexpected request');
 };
 const handler=createHandler(env,fetcher),headers={origin:env.PLATUM_APP_URL,authorization:'Bearer user-token','content-type':'application/json',...options.headers};
 const req={method:options.method||'POST',headers,body:options.body||{action:'invitation.create',community_id:community,operation_id:op,payload:{email:' Invitee@example.test '}}};
 const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(value){this.body=JSON.parse(value);}};
 await handler(req,res);return {res,calls};
}
test('foreign origins, unsupported methods and missing sessions fail before network work',async()=>{
 for(const opts of [{headers:{origin:'https://foreign.example.test'}},{method:'GET'},{headers:{authorization:''}}]){const {res,calls}=await invoke(opts);assert.ok(res.statusCode>=400);assert.equal(calls.length,0);assert.equal(res.headers['Cache-Control'],'private, no-store');}
});
test('request identifiers, sizes and email are validated',async()=>{
 for(const body of [{action:'create_user',community_id:community,operation_id:op,payload:{}},{action:'invitation.create',community_id:'bad',operation_id:op,payload:{email:'ok@example.test'}},{action:'invitation.create',community_id:community,operation_id:op,payload:{email:'bad'}},{oversize:'x'.repeat(17000)}]){const {res,calls}=await invoke({body});assert.equal(res.statusCode,400);assert.equal(calls.length,0);}
});
test('an unconfirmed account cannot manage a community',async()=>{
 const {res,calls}=await invoke({unconfirmed:true});assert.equal(res.statusCode,401);assert.equal(calls.length,1);
});
test('the database authorizes the authenticated actor before any delivery',async()=>{
 const {res,calls}=await invoke({denied:true});assert.equal(res.statusCode,403);assert.equal(calls.some(c=>c.url.pathname==='/auth/v1/invite'),false);
});
test('modern server keys and canonical callbacks preserve bearer identity boundaries',async()=>{
 const {res,calls}=await invoke();assert.equal(res.statusCode,200);assert.equal(res.body.delivery,'sent');
 const auth=calls.find(c=>c.url.pathname==='/auth/v1/user');assert.equal(auth.request.headers.Authorization,'Bearer user-token');
 const db=calls.find(c=>c.url.pathname.includes('/rpc/'));assert.equal(db.p.actor_id,user);assert.equal(db.p.payload.email,'invitee@example.test');assert.equal(db.request.headers.apikey,'sb_secret_synthetic');assert.equal(db.request.headers.Authorization,undefined);
 const mail=calls.find(c=>c.url.pathname==='/auth/v1/invite');assert.equal(mail.url.searchParams.get('redirect_to'),env.PLATUM_APP_URL+'/client-space.html');
});
test('existing accounts receive a sign-in link without enabling signup',async()=>{
 const {res,calls}=await invoke({exists:true});assert.equal(res.body.delivery,'sent');const otp=calls.find(c=>c.url.pathname==='/auth/v1/otp');assert.equal(otp.p.create_user,false);
});
test('a previously claimed delivery does not send duplicate mail',async()=>{
 const {res,calls}=await invoke({alreadyClaimed:true});assert.equal(res.body.delivery,'sent');assert.equal(calls.some(c=>c.url.pathname.startsWith('/auth/v1/invite')),false);
});
test('delivery failure or uncertainty is persisted and visible without leaking provider data',async()=>{
 for(const [opts,expected] of [[{deliveryFailure:true},'failed'],[{timeout:true},'uncertain']]){
  const {res,calls}=await invoke(opts);assert.equal(res.body.delivery,expected);assert.equal(calls.find(c=>c.p?.action==='invitation.delivery').p.payload.status,expected);assert.equal(JSON.stringify(res.body).includes('private transport'),false);
 }
});

test('membership applications use manager authorization and never trigger email delivery',async()=>{
 for(const action of ['application.approve','application.reject']){
  const {res,calls}=await invoke({body:{action,community_id:community,operation_id:op,payload:{id:invitation}}});assert.equal(res.statusCode,200);
  const command=calls.find(c=>c.url.pathname.includes('/rpc/'));assert.equal(command.p.actor_id,user);assert.equal(command.p.action,action);assert.equal(calls.some(c=>c.url.pathname==='/auth/v1/invite'),false);
  const denied=await invoke({denied:true,body:{action,community_id:community,operation_id:op,payload:{id:invitation}}});assert.equal(denied.res.statusCode,403);
 }
});
