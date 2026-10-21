'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');const {randomUUID}=require('node:crypto');
const {db,ids,bootstrap,actor,query}=require('./network-database.cjs');
const save=async(w,p,op=randomUUID())=>(await query('select public.platum_regular_mutate($1,$2,$3::jsonb,$4) result',['workspace.save',w,JSON.stringify(p),op]))[0].result;
const deny=(fn,re=/FORBIDDEN|permission denied/)=>assert.rejects(fn,re);
const checks=[];async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
(async()=>{
 await bootstrap({deferBranding:true});let w=randomUUID(),other=randomUUID(),workspace,shared,internal,foreign,pending,pdf;
 await db.exec('reset role');
 for(const [id,name] of [[w,'Client cooperation'],[other,'Other cooperation']])await db.query("insert into public.workspaces(id,slug,name,created_by,updated_by,settings) values($1,$2,$3,$4,$4,$5::jsonb)",[id,'fixture-'+id,name,ids.founder,JSON.stringify({accent:'clay',welcome:'A real welcome',timezone:'Europe/Warsaw',modules:['home','materials','work','calendar']})]);
 await db.query("insert into public.workspace_members(workspace_id,user_id,role,created_by) values($1,$2,'client',$4),($1,$3,'team',$4)",[w,ids.client,ids.team,ids.founder]);
 const settings=(await query('select settings from public.workspaces where id=$1',[w]))[0].settings;
 await check('branding upgrade preserves existing preferences and creates no workspaces or memberships',async()=>{
  const before=(await query('select count(*)::int n from public.workspace_members'))[0].n;
  await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261021180000_workspace_branding.sql'),'utf8'));
  assert.deepEqual((await query('select settings from public.workspaces where id=$1',[w]))[0].settings,settings);assert.equal((await query('select count(*)::int n from public.workspace_members'))[0].n,before);assert.equal((await query('select count(*)::int n from public.workspaces'))[0].n,2);
 });
 for(const [key,scope,visible,type,status] of [['shared',w,true,'image/png','ready'],['internal',w,false,'image/png','ready'],['foreign',other,true,'image/png','ready'],['pending',w,true,'image/png','pending'],['pdf',w,true,'application/pdf','ready']]){
  const id=randomUUID();await db.query("insert into public.workspace_files(id,workspace_id,path,name,mime_type,size_bytes,status,uploaded_by,client_visible) values($1,$2,$3,$4,$5,68,$6,$7,$8)",[id,scope,scope+'/'+id+'/logo',key,type,status,ids.founder,visible]);
  if(key==='shared')shared=id;if(key==='internal')internal=id;if(key==='foreign')foreign=id;if(key==='pending')pending=id;if(key==='pdf')pdf=id;
 }
 const payload=revision=>({revision,name:'Client cooperation',accent:'slate',welcome:'Welcome to your project',timezone:'Europe/Warsaw',modules:['home','materials','work','calendar'],objective:'Keep our objective',next_step:'Review the next deliverable'});
 await check('capabilities require a confirmed account; a client cannot change project branding',async()=>{
  await actor(null,'anon');await deny(()=>query('select public.platum_branding_capabilities()'));
  await actor(ids.unconfirmed);await deny(()=>query('select public.platum_branding_capabilities()'),/UNAUTHENTICATED/);
  await actor(ids.client);assert.equal((await query('select public.platum_branding_capabilities() result'))[0].result.logo,true);
  await deny(()=>save(w,{...payload(1),logo_file_id:shared}));
 });
 await check('only an already shared ready image from this project can be chosen',async()=>{
  await actor(ids.team);workspace=(await query('select * from public.workspaces where id=$1',[w]))[0];
  for(const id of [internal,foreign,pending,pdf])await deny(()=>save(w,{...payload(workspace.revision),logo_file_id:id}),/INVALID_LOGO/);
  const op=randomUUID(),p={...payload(workspace.revision),logo_file_id:shared};workspace=await save(w,p,op);assert.equal((await save(w,p,op)).revision,workspace.revision);
  await deny(()=>save(w,p),/CONFLICT/);assert.equal(workspace.settings.logo_file_id,shared);assert.equal(workspace.settings.welcome,'Welcome to your project');assert.deepEqual(workspace.settings.modules,settings.modules);
  await actor(ids.client);assert.equal((await query('select settings from public.workspaces where id=$1',[w]))[0].settings.logo_file_id,shared);assert.equal((await query('select * from public.workspace_files where id=$1',[internal])).length,0);
 });
 await check('old callers retain the logo, removal is explicit and branding grants no extra access',async()=>{
  await actor(ids.team);workspace=await save(w,payload(workspace.revision));assert.equal(workspace.settings.logo_file_id,shared);
  workspace=await save(w,{...payload(workspace.revision),logo_file_id:''});assert.equal(workspace.settings.logo_file_id,null);
  await actor(ids.other);assert.equal((await query('select * from public.workspaces')).length,0);await deny(()=>save(w,{...payload(workspace.revision),logo_file_id:shared}));
 });
 console.log('PASS '+checks.length+' branding PostgreSQL groups (local synthetic engine).');
})().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(()=>db.close());
