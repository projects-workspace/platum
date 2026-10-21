'use strict';
const {randomUUID} = require('node:crypto');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIONS = new Set(['invitation.create','invitation.resend','invitation.revoke','member.revoke','referral.reject','application.approve','application.reject']);
const messages = {
  FORBIDDEN:'Only community managers can manage invitations and access.',
  INVITATION_UNAVAILABLE:'This invitation is no longer available.',
  INVITATION_RATE_LIMIT:'Please wait before sending another invitation.',
  IDEMPOTENCY_CONFLICT:'This action has already been used for different information.',
  NOT_FOUND:'This record is no longer available.',
};
const failure=(status,message)=>Object.assign(new Error(message),{status});
function createHandler(env=process.env,fetcher=globalThis.fetch){
 return async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('X-Content-Type-Options','nosniff');
  const send=(status,body)=>{res.statusCode=status;res.end(JSON.stringify(body));};
  try{
   if(req.method!=='POST'){res.setHeader('Allow','POST');throw failure(405,'Method not allowed.');}
   const base=String(env.PLATUM_SUPABASE_URL||'').replace(/\/$/,''),secret=env.PLATUM_SUPABASE_SERVICE_ROLE_KEY;
   let app;try{app=new URL(env.PLATUM_APP_URL);}catch{throw failure(503,'Community management is not configured.');}
   if(!secret||!/^https:\/\//.test(base)&&!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)||app.protocol!=='https:'&&!['127.0.0.1','localhost'].includes(app.hostname))throw failure(503,'Community management is not configured.');
   if(req.headers.origin!==app.origin)throw failure(403,'This request must come from your Platum workspace.');
   const authorization=String(req.headers.authorization||'');if(!/^Bearer [^\s]+$/.test(authorization))throw failure(401,'Sign in again to continue.');
   if(!String(req.headers['content-type']||'').startsWith('application/json'))throw failure(415,'Send a JSON request.');
   let input=req.body;
   if(input===undefined){const chunks=[];let size=0;for await(const chunk of req){size+=Buffer.byteLength(chunk);if(size>16384)throw failure(413,'This request is too large.');chunks.push(Buffer.from(chunk));}input=Buffer.concat(chunks).toString('utf8');}
   if(typeof input==='string'||Buffer.isBuffer(input)){try{input=JSON.parse(input.toString());}catch{throw failure(400,'Invalid request.');}}
   if(!input||typeof input!=='object'||Array.isArray(input)||Buffer.byteLength(JSON.stringify(input))>16384)throw failure(400,'Invalid request.');
   const {action,community_id:c,operation_id:op}=input,p=input.payload||{};
   if(!ACTIONS.has(action)||!UUID.test(c||'')||!UUID.test(op||'')||!p||typeof p!=='object'||Array.isArray(p))throw failure(400,'Invalid action.');
   if(action==='invitation.create'){
     if(typeof p.email!=='string'||p.email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email.trim())||p.referral_id&&!UUID.test(p.referral_id))throw failure(400,'Enter a valid email address.');
   }else if(!UUID.test(p.id||''))throw failure(400,'Select a valid person or invitation.');
   async function call(path,body,user=false,raw=false){
    let response;
    try{response=await fetcher(base+path,{method:body===undefined?'GET':'POST',headers:{apikey:secret,...(user?{Authorization:authorization}:secret.startsWith('sb_secret_')?{}:{Authorization:'Bearer '+secret}),...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});}
    catch{throw failure(502,'Community management could not be reached. Your input is kept; try again.');}
    const data=await response.json().catch(()=>({}));if(raw)return {ok:response.ok,data};
    if(!response.ok){const code=Object.keys(messages).find(k=>String(data.message||'').includes(k));throw failure(response.status===401?401:code==='INVITATION_RATE_LIMIT'?429:code?403:502,code?messages[code]:'Community management could not complete this action.');}
    return data;
   }
   const user=await call('/auth/v1/user',undefined,true);
   if(!UUID.test(user.id||'')||!user.email_confirmed_at)throw failure(401,'Use a confirmed account to continue.');
   const command=(a,payload,id=randomUUID())=>call('/rest/v1/rpc/platum_community_service',{action:a,actor_id:user.id,community_id:c,payload,operation_id:id});
   let invitation=await command(action,action==='invitation.create'?{email:p.email.trim().toLowerCase(),...(p.referral_id?{referral_id:p.referral_id}:{})}:{id:p.id},op);
   if(!['invitation.create','invitation.resend'].includes(action))return send(200,invitation);
   const claim=await command('invitation.claim',{id:invitation.id});
   if(!claim.send)return send(200,{invitation:claim.invitation||invitation,delivery:(claim.invitation||invitation).mail_status});
   let delivery='uncertain';
   try{
    const redirect=encodeURIComponent(new URL('/client-space.html',app).href);
    let mail=await call('/auth/v1/invite?redirect_to='+redirect,{email:invitation.email},false,true);
    if(!mail.ok&&[mail.data.code,mail.data.error_code].some(k=>['email_exists','user_already_exists'].includes(k)))mail=await call('/auth/v1/otp?redirect_to='+redirect,{email:invitation.email,create_user:false},false,true);
    delivery=mail.ok?'sent':'failed';
   }catch{delivery='uncertain';}
   try{invitation=await command('invitation.delivery',{id:invitation.id,status:delivery});}catch{delivery='uncertain';}
   return send(200,{invitation,delivery});
  }catch(error){return send(error.status||500,{error:error.status?error.message:'Community management is temporarily unavailable. Try again.'});}
 };
}
module.exports=createHandler();module.exports.createHandler=createHandler;
