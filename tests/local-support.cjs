'use strict';
const fs = require('node:fs');
const { randomUUID, randomBytes } = require('node:crypto');
const assert = require('node:assert/strict');
function config() {
  if (!process.env.PLATUM_TEST_CONFIG) throw new Error('Set PLATUM_TEST_CONFIG to an explicit disposable local fixture configuration.');
  const value = JSON.parse(fs.readFileSync(process.env.PLATUM_TEST_CONFIG,'utf8'));
  for (const key of ['apiUrl','appUrl']) {
    const url=new URL(value[key]);
    if(url.protocol!=='http:'||!['127.0.0.1','localhost'].includes(url.hostname)) throw new Error('These checks refuse non-local services.');
  }
  if(!/^platum-stage1-[a-z0-9-]+$/.test(value.projectId))throw new Error('A dedicated Platum stage-1 test project is required.');
  return value;
}
const cfg=config();
async function raw(path, { token, body, method, service=false, headers={} }={}) {
  const response=await fetch(cfg.apiUrl+path,{method:method||(body===undefined?'GET':'POST'),
    headers:{apikey:service?cfg.serviceKey:cfg.anonKey,Authorization:'Bearer '+(service?cfg.serviceKey:token||cfg.anonKey),
      ...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},
    body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  return {ok:response.ok,status:response.status,data:await response.json().catch(()=>null)};
}
async function guard() {
  const r=await raw('/rest/v1/rpc/platum_test_identity',{service:true,body:{}});
  assert.equal(r.data,'platum-stage1-local','Disposable database guard must match before any fixture writes.');
}
async function rpc(name,body,token,service=false){return raw('/rest/v1/rpc/'+name,{body,token,service});}
async function mutate(actor,workspace,action,payload,operation=randomUUID()){
  return rpc('platum_mutate',{action,workspace_id:workspace,payload,operation_id:operation},actor.session.access_token);
}
async function team(actor,action,workspace,payload,operation=randomUUID()){
  const response=await fetch(cfg.appUrl+'/api/team',{method:'POST',headers:{Authorization:'Bearer '+actor.session.access_token,Origin:cfg.appUrl,'Content-Type':'application/json'},
    body:JSON.stringify({action,workspace_id:workspace,payload,operation_id:operation}),signal:AbortSignal.timeout(30000)});
  return {ok:response.ok,status:response.status,data:await response.json()};
}
async function rows(table,workspace,actor,extra=''){
  return raw('/rest/v1/'+table+'?select=*&workspace_id=eq.'+workspace+extra,{token:actor.session.access_token});
}
function success(r,label){assert.equal(r.ok,true,label+' failed: '+(r.data?.message||r.data?.error||r.status));return r.data;}
async function createUser(name) {
  const email=name.toLowerCase()+'-'+randomUUID().slice(0,8)+'@platum.test',password=randomBytes(24).toString('base64url');
  const result=success(await raw('/auth/v1/admin/users',{service:true,body:{email,password,email_confirm:true,user_metadata:{full_name:name}}}),'Create local Auth fixture');
  const session=success(await raw('/auth/v1/token?grant_type=password',{body:{email,password}}),'Sign in local Auth fixture');
  return {id:result.id,email,password,session};
}
async function createSuiteUsers(prefix) {
  await guard();
  const users={};
  for(const name of ['Owner','Teammate','ClientA','ClientB','Outsider'])users[name]=await createUser(prefix+name);
  // Bootstrap only an isolated local fixture owner. Each suite then exercises
  // the normal HTTP boundary without sharing another suite's invitation quota.
  success(await rpc('platum_service_command',{action:'workspace.create',actor_id:users.Owner.id,workspace_id:null,
    payload:{name:prefix+' fixture bootstrap'},operation_id:randomUUID()},null,true),'Bootstrap local suite owner');
  return users;
}
module.exports={cfg,raw,rpc,mutate,team,rows,guard,success,createUser,createSuiteUsers,randomUUID};
