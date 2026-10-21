'use strict';
// Upgrade the previously shipped schema with legacy member posts and retries.
// Local PostgreSQL only; no hosted Auth, mail, accounts or content.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {db,ids,bootstrap,actor,query,mutate,service}=require('./network-database.cjs');
(async()=>{
  await bootstrap({deferParticipation:true});
  await actor(ids.founder);
  const c=await mutate('community.create',null,{name:'Upgrade fixture'});
  await service('invitation.create',ids.founder,c.id,{email:'member@platum.test'});
  await actor(ids.member);await query('select public.platum_accept_community_invitations()');
  const operation=randomUUID(),payload={kind:'help',title:'Legacy member request',body:'Preserve original text',status:'published'};
  const post=await mutate('community.post.save',c.id,payload,operation);
  const draft=await mutate('community.post.save',c.id,{kind:'resource',title:'Private legacy draft',status:'draft'});
  await mutate('community.comment',c.id,{id:post.id,body:'Preserve original discussion'});
  const before=(await query('select * from public.community_posts order by id'));
  await db.exec('reset role');
  await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261021120000_community_participation.sql'),'utf8'));
  await actor(ids.member);
  assert.deepEqual(await query('select * from public.community_posts order by id'),before);
  assert.equal((await query('select * from public.community_comments'))[0].context_snapshot.title,post.title);
  // Tightened policy applies before an old cached success can be returned.
  await assert.rejects(()=>mutate('community.post.save',c.id,payload,operation),/FORBIDDEN/);
  await assert.rejects(()=>mutate('community.post.save',c.id,{...payload,id:draft.id,revision:draft.revision}),/FORBIDDEN/);
  assert.equal((await query('select * from public.community_participations')).length,0);
  await actor(ids.founder);
  const agencyPost=await mutate('community.post.save',c.id,{kind:'help',title:'Agency request',status:'published'});
  await actor(ids.member);
  const response=await mutate('community.participation',c.id,{id:agencyPost.id,post_revision:agencyPost.revision,status:'completed'});
  assert.equal(response.status,'completed');
  assert.equal((await query('select * from public.workspace_members')).length,0);
  console.log('PASS upgrade: existing member posts/drafts/discussion preserved; cached publication denied; fresh agency request/self-report works; no workspace grants.');
})().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(()=>db.close());
