'use strict';
// Real PostgreSQL engine (PGlite), synthetic identities and local in-memory data.
// This checks SQL/RLS and full migration replay, not Supabase Auth/email/Storage.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {PGlite} = require(process.env.PLATUM_PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const ids = Object.fromEntries(['founder','team','client','member','other','unconfirmed'].map(k=>[k,randomUUID()]));
const passed=[];
async function check(name,fn){await fn();passed.push(name);console.log('PASS '+name);}
async function actor(id,role='authenticated'){
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,role})]);
  await db.exec('set role '+role);
}
const query=async(sql,args=[]) => (await db.query(sql,args)).rows;
async function deny(fn,pattern=/FORBIDDEN|permission denied|row-level security/){await assert.rejects(fn,pattern);}
const mutate=async(action,scope,payload,op=randomUUID())=>(await query('select public.platum_network_mutate($1,$2,$3::jsonb,$4) result',[action,scope,JSON.stringify(payload),op]))[0].result;
const service=async(action,actorId,c,payload,op=randomUUID())=>{
  await actor(actorId,'service_role');
  return (await query('select public.platum_community_service($1,$2,$3,$4::jsonb,$5) result',[action,actorId,c,JSON.stringify(payload),op]))[0].result;
};
async function bootstrap(){
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage; create schema extensions;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;
    grant usage on schema auth to authenticated,anon,service_role; grant execute on all functions in schema auth to authenticated,anon,service_role;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
    alter table storage.objects enable row level security;grant usage on schema storage to authenticated,anon,service_role;
    grant select,insert on storage.objects to authenticated;`);
  for(const name of fs.readdirSync(path.join(__dirname,'../supabase/migrations')).filter(n=>n.endsWith('.sql')).sort()){
    try{await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',name),'utf8'));}
    catch(e){throw new Error('Migration '+name+': '+e.message);}
  }
  await db.exec('reset role');
  for(const [name,id] of Object.entries(ids))await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,$3)',[id,name+'@platum.test',name==='unconfirmed'?null:new Date()]);
  await db.query("insert into public.platform_roles(user_id,role) values($1,'founder')",[ids.founder]);
}
module.exports={db,ids,bootstrap,actor,query,mutate,service};
if(require.main===module)(async()=>{
 await check('all repository migrations replay in PostgreSQL',bootstrap);
 let wa=randomUUID(),wb=randomUUID(),c,second,contact,post,event,version;
 await db.exec('reset role');
 for(const [w,name] of [[wa,'Network A'],[wb,'Network B']])await db.query('insert into public.workspaces(id,slug,name,created_by,updated_by) values($1,$2,$3,$4,$4)',[w,name.toLowerCase().replace(' ','-'),name,ids.founder]);
 await db.query("insert into public.workspace_members(workspace_id,user_id,role,created_by) values($1,$2,'team',$4),($1,$3,'client',$4)",[wa,ids.team,ids.client,ids.founder]);
 await check('anonymous and direct table writes are denied',async()=>{
   await actor(null,'anon');await deny(()=>query('select * from public.communities'));
   await deny(()=>mutate('community.create',null,{name:'Forbidden'}),/permission denied/);
   await actor(ids.client);await deny(()=>query("insert into public.community_members(community_id,user_id) values($1,$2)",[randomUUID(),ids.client]));
   await deny(()=>mutate('community.create',null,{name:'Forbidden'}));
 });
 await check('founder creates independent communities without granting workspace access',async()=>{
   await actor(ids.founder);c=await mutate('community.create',null,{name:'Professional circle',description:'Synthetic verification'});
   second=await mutate('community.create',null,{name:'Other circle'});
   assert.equal((await query('select count(*)::int n from public.workspace_members where user_id=$1',[ids.member]))[0].n,0);
 });
 await check('only server managers invite and only confirmed matching emails accept',async()=>{
   await actor(ids.member);await deny(()=>query('select public.platum_community_service($1,$2,$3,$4::jsonb,$5)',['invitation.create',ids.founder,c.id,'{}',randomUUID()]));
   await deny(()=>service('invitation.create',ids.member,c.id,{email:'other@platum.test'}));
   await service('invitation.create',ids.founder,c.id,{email:'member@platum.test'});
   await service('invitation.create',ids.founder,c.id,{email:'unconfirmed@platum.test'});
   await actor(ids.unconfirmed);assert.equal((await query('select public.platum_accept_community_invitations() n'))[0].n,0);
   await actor(ids.member);assert.equal((await query('select public.platum_accept_community_invitations() n'))[0].n,1);
   assert.equal((await query('select * from public.workspaces')).length,0);
   assert.equal((await query('select * from public.communities')).length,1);
 });
 await check('directory is opt-in and private account email is not exposed',async()=>{
   await actor(ids.member);let m=(await query('select * from public.community_members where user_id=$1',[ids.member]))[0];
   await deny(()=>mutate('community.profile',c.id,{revision:m.revision,display_name:'Member',url:'javascript:alert(1)'}),/INVALID_URL/);
   m=await mutate('community.profile',c.id,{revision:m.revision,display_name:'Mira',bio:'Marketing',skills:'Research',url:'https://example.test',profile_visible:true});
   assert.equal(m.profile_visible,true);assert.equal('email' in m,false);
   await service('invitation.create',ids.founder,c.id,{email:'other@platum.test'});
   await actor(ids.other);await query('select public.platum_accept_community_invitations()');
   const visible=await query('select * from public.community_members');assert.equal(visible.some(x=>x.user_id===ids.member),true);assert.equal(visible.some(x=>x.user_id===ids.founder),false);
 });
 await check('workspace contacts are operator-only, scoped, retry safe and revision checked',async()=>{
   await actor(ids.team);const op=randomUUID(),p={name:'Contact without account',categories:['partner','freelancer'],context:'PRIVATE_NETWORK_CONTEXT',next_action:'Arrange introduction',owner_id:ids.team};
   contact=await mutate('contact.save',wa,p,op);assert.equal(contact.linked_user_id,null);
   assert.equal((await mutate('contact.save',wa,p,op)).id,contact.id);
   await deny(()=>mutate('contact.save',wa,{...p,name:'Changed'},op),/IDEMPOTENCY_CONFLICT/);
   await deny(()=>mutate('contact.save',wb,p));
   await deny(()=>mutate('contact.save',wa,{...p,id:contact.id,revision:0}),/CONFLICT/);
   await mutate('contact.interaction',wa,{id:contact.id,kind:'introduction',body:'Introduced by the team.'});
   await actor(ids.client);assert.equal((await query('select * from public.workspace_contacts')).length,0);assert.equal((await query('select * from public.contact_interactions')).length,0);
   await deny(()=>mutate('contact.save',wa,p));
   const exported=(await query('select public.platum_export($1) result',[wa]))[0].result;assert.equal(JSON.stringify(exported).includes('PRIVATE_NETWORK_CONTEXT'),false);
   await actor(ids.member);assert.equal((await query('select * from public.workspace_contacts')).length,0);
 });
 await check('posts preserve draft privacy, ownership and comment context',async()=>{
   await actor(ids.member);post=await mutate('community.post.save',c.id,{kind:'resource',title:'Useful resource',body:'First version',status:'draft'});
   await actor(ids.other);assert.equal((await query('select * from public.community_posts')).length,0);
   await deny(()=>mutate('community.post.save',c.id,{id:post.id,revision:post.revision,kind:'resource',title:'Hijacked',status:'published'}));
   await actor(ids.member);await deny(()=>mutate('community.post.save',c.id,{kind:'announcement',title:'Forbidden',status:'published'}));
   post=await mutate('community.post.save',c.id,{id:post.id,revision:post.revision,kind:'resource',title:'Useful resource',body:'First version',status:'published'});
   await actor(ids.other);await mutate('community.comment',c.id,{id:post.id,body:'Helpful'});
   await actor(ids.member);post=await mutate('community.post.save',c.id,{id:post.id,revision:post.revision,kind:'resource',title:'Revised',body:'Second version',status:'published'});
   const comments=await query('select * from public.community_comments');assert.equal(comments[0].context_snapshot.title,'Useful resource');
   await deny(()=>mutate('community.post.save',second.id,{kind:'resource',title:'Other circle',status:'published'}));
 });
 await check('event time changes require a new RSVP and preserve earlier responses',async()=>{
   await actor(ids.founder);event=await mutate('community.event.save',c.id,{title:'Community call',starts_at:'2026-11-01T12:00:00Z',ends_at:'2026-11-01T13:00:00Z',timezone:'Europe/Warsaw'});version=event.version.id;
   await actor(ids.member);const op=randomUUID(),p={id:event.id,version_id:version,response:'yes'};
   await mutate('community.rsvp',c.id,p,op);await mutate('community.rsvp',c.id,p,op);
   assert.equal((await query('select * from public.community_rsvps')).length,1);
   await actor(ids.founder);event=await mutate('community.event.save',c.id,{id:event.id,revision:event.event.revision,title:'Community call',starts_at:'2026-11-02T12:00:00Z',ends_at:'2026-11-02T13:00:00Z',timezone:'Europe/Warsaw'});
   await actor(ids.member);await deny(()=>mutate('community.rsvp',c.id,p),/CURRENT_VERSION_CHANGED/);
   assert.equal((await query('select * from public.community_rsvps where version_id=$1',[event.version.id])).length,0);
   await mutate('community.rsvp',c.id,{...p,version_id:event.version.id});assert.equal((await query('select * from public.community_rsvps')).length,2);
 });
 await check('referrals are reviewed, do not admit accounts automatically and stay private',async()=>{
   await actor(ids.member);const r=await mutate('community.referral',c.id,{name:'Candidate',email:'client@platum.test',reason:'Useful collaborator'});
   await actor(ids.other);assert.equal((await query('select * from public.community_referrals')).length,0);
   await service('invitation.create',ids.founder,c.id,{email:'client@platum.test',referral_id:r.id});
   await actor(ids.client);assert.equal((await query('select * from public.communities')).length,0);
   await query('select public.platum_accept_community_invitations()');assert.equal((await query('select * from public.communities')).length,1);
   assert.equal((await query('select * from public.workspaces')).length,1);
 });
 await check('revocation denies both reads and replay of a cached mutation',async()=>{
   await actor(ids.member);const op=randomUUID(),p={kind:'help',title:'Voluntary collaboration',body:'Synthetic request',status:'published'};
   await mutate('community.post.save',c.id,p,op);
   await service('member.revoke',ids.founder,c.id,{id:ids.member});
   await actor(ids.member);assert.equal((await query('select * from public.communities')).length,0);assert.equal((await query('select * from public.community_comments')).length,0);
   await deny(()=>mutate('community.post.save',c.id,p,op));
 });
 await check('expired and revoked invitations cannot admit an account',async()=>{
   const expired=await service('invitation.create',ids.founder,second.id,{email:'other@platum.test'});
   await db.exec('reset role');await db.query("update public.community_invitations set expires_at=now()-interval '1 second' where id=$1",[expired.id]);
   await actor(ids.other);assert.equal((await query('select public.platum_accept_community_invitations() n'))[0].n,0);
   const revoked=await service('invitation.create',ids.founder,second.id,{email:'client@platum.test'});
   await service('invitation.revoke',ids.founder,second.id,{id:revoked.id});await actor(ids.client);
   assert.equal((await query('select public.platum_accept_community_invitations() n'))[0].n,0);
   assert.equal((await query('select * from public.communities where id=$1',[second.id])).length,0);
 });
 await check('archiving stops member reads and content writes until a manager restores it',async()=>{
   await actor(ids.founder);const current=(await query('select * from public.communities where id=$1',[c.id]))[0];
   const archived=await mutate('community.save',c.id,{revision:current.revision,name:current.name,status:'archived'});
   await deny(()=>mutate('community.event.save',c.id,{title:'Blocked'}));
   await actor(ids.other);assert.equal((await query('select * from public.communities')).length,0);
   await actor(ids.founder);await mutate('community.save',c.id,{revision:archived.revision,name:archived.name,status:'active'});
 });
 console.log('PASS '+passed.length+' network PostgreSQL groups (synthetic local engine; hosted services not exercised).');
 await db.close();
})().catch(async error=>{console.error(error.stack);await db.close();process.exitCode=1;});
