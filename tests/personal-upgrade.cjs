'use strict';
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {randomUUID}=require('node:crypto');
const {db,ids,bootstrap,actor,query,mutate}=require('./network-database.cjs');
(async()=>{
 await bootstrap({deferPrivacy:true});
 const w=randomUUID();await db.exec('reset role');await db.query("insert into public.workspaces(id,slug,name,created_by,updated_by) values($1,'privacy-upgrade','Agency work',$2,$2)",[w,ids.founder]);
 await db.query("insert into public.workspace_members(workspace_id,user_id,role,created_by) values($1,$2,'team',$3)",[w,ids.team,ids.founder]);
 await actor(ids.founder);const contact=await mutate('contact.save',w,{name:'Legacy agency record',context:'Keep agency ownership',linked_user_id:ids.team});
 const c=await mutate('community.create',null,{name:'Existing voluntary circle'});const before=await query('select * from public.workspace_members');
 await db.exec('reset role');await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261021160000_personal_privacy.sql'),'utf8'));
 await actor(ids.founder);const after=(await query('select * from public.workspace_contacts where id=$1',[contact.id]))[0];
 assert.equal(after.context,contact.context);assert.equal(after.workspace_id,w);assert.equal(after.linked_verified_by,null);assert.equal(after.linked_verified_at,null);
 assert.deepEqual(await query('select * from public.workspace_members'),before);assert.equal((await query('select * from public.communities where id=$1',[c.id]))[0].applications_open,false);
 const p=(await query('select public.platum_personal_data() result'))[0].result;assert.equal(p.contacts.length,0);assert.equal(p.events.length,0);
 console.log('PASS privacy upgrade: agency records/ownership/memberships preserved; no personal workspaces, implicit sharing or retroactive identity-verification claims.');
})().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(()=>db.close());
