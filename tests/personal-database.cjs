'use strict';
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {db,ids,bootstrap,actor,query,mutate,service}=require('./network-database.cjs');
const personal=async()=>(await query('select public.platum_personal_data() result'))[0].result;
const change=async(action,payload,op=randomUUID())=>(await query('select public.platum_personal_mutate($1,$2::jsonb,$3) result',[action,JSON.stringify(payload),op]))[0].result;
const deny=async(fn,pattern=/FORBIDDEN|permission denied|row-level security/)=>assert.rejects(fn,pattern);
const checks=[];async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
module.exports={personal,change};
if(require.main===module)(async()=>{
 await check('full schema replay and independent personal cabinet',bootstrap);
 let w=randomUUID(),c,second,share,response,post;
 await db.exec('reset role');
 await db.query("insert into public.workspaces(id,slug,name,created_by,updated_by) values($1,'personal-fixture','Personal fixture',$2,$2)",[w,ids.founder]);
 await db.query("insert into public.workspace_members(workspace_id,user_id,role,created_by) values($1,$2,'client',$4),($1,$3,'team',$4)",[w,ids.client,ids.team,ids.founder]);
 await db.query("insert into public.workspace_members(workspace_id,user_id,role,created_by) values($1,$2,'owner',$2)",[w,ids.founder]);
 await check('unassigned confirmed account owns contacts without provisioning a workspace',async()=>{
  await actor(ids.other);const before=(await query('select * from public.workspaces')).length;
  const c=await change('contact.save',{fields:{name:'Independent book',notes:'Private account data'}});
  assert.equal(c.owner_id,ids.other);assert.equal((await personal()).contacts.length,1);
  assert.equal((await query('select * from public.workspaces')).length,before);
  await actor(ids.unconfirmed);await deny(()=>personal(),/UNAUTHENTICATED/);
  await actor(null,'anon');await deny(()=>personal(),/permission denied/);
 });
 await check('default-private values are unavailable even to global founders',async()=>{
  await actor(ids.client);c=await change('contact.save',{fields:{name:'Private organizer',specialisation:'Events',phone:'HIDDEN_PHONE_SENTINEL',email:'private@example.test',notes:'HIDDEN_NOTE_SENTINEL'}});
  await deny(()=>query("update public.personal_contacts set status='active'"));
  await actor(ids.founder);assert.equal((await query('select * from public.personal_contacts')).length,0);
  assert.equal((await personal()).contacts.length,0);assert.equal(JSON.stringify(await personal()).includes('HIDDEN_PHONE_SENTINEL'),false);
  await deny(()=>change('contact.save',{id:c.id,revision:c.revision,fields:{name:'Hijack'}}));
 });
 await check('named sharing returns only selected fields and never raw rows or grant lists',async()=>{
  await actor(ids.client);await change('contact.share',{id:c.id,revision:c.revision,recipient_id:ids.team,fields:['name','specialisation'],can_edit:false});
  await actor(ids.team);const shared=(await personal()).contacts.find(x=>x.id===c.id);
  assert.deepEqual(Object.keys(shared.fields).sort(),['name','specialisation']);assert.deepEqual(shared.grants,[]);
  assert.equal(JSON.stringify(shared).includes('HIDDEN_'),false);assert.equal((await query('select * from public.personal_contact_grants')).length,0);assert.equal((await query('select * from public.personal_contacts')).length,0);
  await deny(()=>change('contact.save',{id:c.id,revision:shared.revision,fields:{name:'Denied'}}));
  await actor(ids.client);c=(await personal()).contacts.find(x=>x.id===c.id);
  await deny(()=>change('contact.share',{id:c.id,revision:c.revision,recipient_id:ids.other,fields:['name']}));
 });
 await check('delegated editing is restricted to granted fields, revision checked and retry safe',async()=>{
  await actor(ids.client);await change('contact.share',{id:c.id,revision:c.revision,recipient_id:ids.team,fields:['name'],can_edit:true});
  await actor(ids.team);let current=(await personal()).contacts[0];
  await deny(()=>change('contact.save',{id:c.id,revision:current.revision,fields:{phone:'No access'}}));
  const op=randomUUID(),p={id:c.id,revision:current.revision,fields:{name:'Updated organizer'}};
  response=await change('contact.save',p,op);assert.equal(response.fields.name,'Updated organizer');
  assert.deepEqual((await change('contact.save',p,op)).fields,{name:'Updated organizer'});
  await deny(()=>change('contact.save',{...p,fields:{name:'Stale'}}),/CONFLICT/);
  await actor(ids.client);c=(await personal()).contacts.find(x=>x.id===c.id);assert.equal(c.fields.phone,'HIDDEN_PHONE_SENTINEL');
  await change('contact.share',{id:c.id,revision:c.revision,recipient_id:ids.team,fields:['name','phone'],can_edit:true});
  await actor(ids.team);current=(await personal()).contacts[0];const previousOp=randomUUID(),previousPayload={id:c.id,revision:current.revision,fields:{name:'Second edit'}};
  assert.equal((await change('contact.save',previousPayload,previousOp)).fields.phone,'HIDDEN_PHONE_SENTINEL');
  await actor(ids.client);c=(await personal()).contacts.find(x=>x.id===c.id);await change('contact.share',{id:c.id,revision:c.revision,recipient_id:ids.team,fields:['name'],can_edit:true});
  await actor(ids.team);assert.equal('phone' in (await change('contact.save',previousPayload,previousOp)).fields,false,'cached results use current field permissions');
  await actor(ids.client);c=(await personal()).contacts.find(x=>x.id===c.id);
  const g=c.grants[0],revokeOp=randomUUID(),revokePayload={id:g.id,revision:g.revision};await change('contact.revoke',revokePayload,revokeOp);await change('contact.revoke',revokePayload,revokeOp);
  await actor(ids.team);await deny(()=>change('contact.save',p,op));assert.equal((await personal()).contacts.length,0);
 });
 await check('sharing the current book is explicit, field-limited and excludes future contacts',async()=>{
  await actor(ids.client);second=await change('contact.save',{fields:{name:'Second contact',notes:'PRIVATE_SECOND_NOTE'}});
  const hidden=await change('contact.save',{fields:{name:'Hidden on creation'},status:'hidden'});assert.equal(hidden.status,'hidden');
  const r=await change('contact.share-book',{workspace_id:w,fields:['name','specialisation'],can_edit:false});assert.equal(r.shared_count,2);
  const future=await change('contact.save',{fields:{name:'Future private contact'}});
  await actor(ids.founder);const data=await personal();assert.equal(data.contacts.length,2);assert.equal(JSON.stringify(data).includes('HIDDEN_'),false);assert.equal(JSON.stringify(data).includes('PRIVATE_SECOND_NOTE'),false);assert.equal(data.contacts.some(x=>x.id===future.id),false);
  await actor(ids.client);c=(await personal()).contacts.find(x=>x.id===c.id);
  c=await change('contact.save',{id:c.id,revision:c.revision,fields:{},status:'hidden'});
  await actor(ids.founder);assert.equal((await personal()).contacts.some(x=>x.id===c.id),false);
  await actor(ids.client);c=await change('contact.save',{id:c.id,revision:c.revision,fields:{},status:'archived'});
  await actor(ids.founder);assert.equal((await personal()).contacts.some(x=>x.id===c.id),false);
  await actor(ids.client);c=await change('contact.save',{id:c.id,revision:c.revision,fields:{},status:'active'});
 });
 await check('private calendar entries expose only busy projections to current coworkers',async()=>{
  await actor(ids.client);const e=await change('event.save',{kind:'private',title:'PRIVATE_EVENT_TITLE',notes:'PRIVATE_EVENT_NOTES',location:'PRIVATE_EVENT_LOCATION',starts_at:'2026-12-01T09:00:00Z',ends_at:'2026-12-01T10:00:00Z',timezone:'Europe/Warsaw'});
  await actor(ids.founder);const d=await personal();assert.equal((await query('select * from public.personal_calendar_entries')).length,0);assert.equal(d.events.length,0);assert.equal(d.busy.length,1);assert.deepEqual(Object.keys(d.busy[0]).sort(),['availability','ends_at','starts_at','user_id']);assert.equal(JSON.stringify(d).includes('PRIVATE_EVENT'),false);
  await actor(ids.other);assert.equal((await personal()).busy.length,0);await deny(()=>change('event.save',{id:e.id,revision:e.revision,title:'Hijack'}));
  await actor(ids.client);assert.equal((await personal()).events[0].notes,'PRIVATE_EVENT_NOTES');
 });
 await check('shared events disclose details only to named coworkers; free/unavailable reveal no notes',async()=>{
  await actor(ids.client);const e=await change('event.save',{kind:'shared',title:'SHARED_WITH_TEAM_ONLY',notes:'Shared agenda',participants:[ids.team],starts_at:'2026-12-02T09:00:00Z',ends_at:'2026-12-02T10:00:00Z',timezone:'UTC'});
  for(const kind of ['free','unavailable'])await change('event.save',{kind,title:'PRIVATE_AVAILABILITY_TITLE',notes:'PRIVATE_AVAILABILITY_NOTE',starts_at:'2026-12-03T09:00:00Z',ends_at:'2026-12-03T10:00:00Z',timezone:'UTC'});
  await actor(ids.team);assert.equal((await personal()).events.find(x=>x.id===e.id).notes,'Shared agenda');
  await actor(ids.founder);const d=await personal();assert.equal(d.events.length,0);assert.equal(JSON.stringify(d).includes('SHARED_WITH_TEAM_ONLY'),false);assert.equal(JSON.stringify(d).includes('PRIVATE_AVAILABILITY'),false);assert.ok(d.busy.some(x=>x.availability==='free'));assert.ok(d.busy.some(x=>x.availability==='unavailable'));
  await actor(ids.client);await deny(()=>change('event.save',{kind:'shared',title:'Invalid',participants:[ids.other],starts_at:'2026-12-03T09:00:00Z',ends_at:'2026-12-03T10:00:00Z',timezone:'UTC'}),/INVALID_ASSIGNEE/);
 });
 let community,application;
 await check('applications require an open community and an explicit manager decision',async()=>{
  await actor(ids.founder);community=await mutate('community.create',null,{name:'Voluntary circle'});
  await actor(ids.client);await deny(()=>change('application.create',{community_id:community.id,message:'Join please'}));assert.equal((await personal()).joinable.length,0);
  await actor(ids.founder);community=await mutate('community.save',community.id,{revision:community.revision,name:community.name,status:'active',applications_open:true});
  await db.exec('reset role');await db.query("update auth.users set raw_user_meta_data=$2::jsonb where id=$1",[ids.member,JSON.stringify({full_name:'PRIVATE_AUTH_NAME_SENTINEL'})]);
  await db.query("insert into public.community_members(community_id,user_id,profile_visible,display_name) values($1,$2,true,'Chosen community alias')",[community.id,ids.member]);
  await actor(ids.founder);const peers=await personal();assert.equal(peers.people.find(p=>p.user_id===ids.member).name,'Chosen community alias');assert.equal(JSON.stringify(peers).includes('PRIVATE_AUTH_NAME_SENTINEL'),false);
  await actor(ids.client);assert.equal((await personal()).joinable.length,1);application=await change('application.create',{community_id:community.id,message:'Work-related interest'});assert.equal((await query('select * from public.communities')).length,0);
  await deny(()=>service('application.approve',ids.client,community.id,{id:application.id}));
  await service('application.approve',ids.founder,community.id,{id:application.id});
  await actor(ids.client);assert.equal((await query('select * from public.communities')).length,1);assert.equal((await query('select * from public.workspaces')).length,1);
 });
 await check('request withdrawal/rejection and community exit preserve independent work and personal data',async()=>{
  await actor(ids.other);let a=await change('application.create',{community_id:community.id});a=await change('application.withdraw',{id:a.id,revision:a.revision});assert.equal(a.status,'withdrawn');
  a=await change('application.create',{community_id:community.id});await service('application.reject',ids.founder,community.id,{id:a.id});
  await actor(ids.other);assert.equal((await query('select * from public.communities')).length,0);
  await actor(ids.client);await mutate('community.leave',community.id,{});
  assert.equal((await query('select * from public.communities')).length,0);assert.equal((await query('select * from public.workspaces')).length,1);assert.ok((await personal()).contacts.find(x=>x.id===c.id));
 });
 await check('manual agency contact/account linking requires verified review and grants no access',async()=>{
  await actor(ids.team);const p={name:'Verified colleague',linked_user_id:ids.client};await deny(()=>mutate('contact.save',w,p),/CONTACT_VERIFICATION_REQUIRED/);
  const linked=await mutate('contact.save',w,{...p,link_verified:true});assert.equal(linked.linked_verified_by,ids.team);assert.ok(linked.linked_verified_at);
 });
 await check('client export includes accessible own uploads and excludes another user internal file',async()=>{
  await db.exec('reset role');
  for(const [owner,name,visible] of [[ids.client,'Client owned attachment',false],[ids.team,'Internal agency attachment',false],[ids.team,'Shared attachment',true]]){
   const id=randomUUID();await db.query("insert into public.workspace_files(id,workspace_id,path,name,mime_type,size_bytes,status,uploaded_by,client_visible) values($1,$2,$3,$4,'text/plain',12,'ready',$5,$6)",[id,w,w+'/'+id+'/file.txt',name,owner,visible]);
  }
  await actor(ids.client);const exported=(await query('select public.platum_export($1) result',[w]))[0].result;
  assert.deepEqual(exported.files.map(f=>f.name).sort(),['Client owned attachment','Shared attachment']);assert.equal(JSON.stringify(exported).includes('HIDDEN_PHONE_SENTINEL'),false);assert.equal(JSON.stringify(exported).includes('PRIVATE_EVENT'),false);
 });
 await check('client offboarding requires export offer and retains personal records and unrelated community membership',async()=>{
  await service('invitation.create',ids.founder,community.id,{email:'client@platum.test'});
  await actor(ids.client);await query('select public.platum_accept_community_invitations()');const before=(await personal()).contacts.length;
  await actor(ids.founder,'service_role');
  const revoke=payload=>query('select public.platum_service_command($1,$2,$3,$4::jsonb,$5) result',['member.revoke',ids.founder,w,JSON.stringify(payload),randomUUID()]);
  await deny(()=>revoke({id:ids.client}),/EXPORT_OFFER_REQUIRED/);
  await revoke({id:ids.client,export_offered:true});
  await actor(ids.client);assert.equal((await query('select * from public.workspaces')).length,0);assert.equal((await query('select * from public.communities')).length,1);assert.equal((await personal()).contacts.length,before);
  await deny(()=>query('select public.platum_export($1)',[w]));
  await actor(ids.founder);assert.equal((await personal()).contacts.length,0);assert.equal((await personal()).busy.length,0);
 });
 console.log('PASS '+checks.length+' personal privacy/access PostgreSQL groups (synthetic local engine).');
})().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(()=>db.close());
