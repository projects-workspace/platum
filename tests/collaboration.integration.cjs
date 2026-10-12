'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const {cfg,raw,rpc,mutate,team,rows,guard,success,randomUUID}=require('./local-support.cjs');
const {Owner:owner,Teammate:teammate,ClientA:a,ClientB:b,Outsider:outsider}=cfg.users;
const passed=[];
async function check(name,fn){await fn();passed.push(name);console.log('PASS '+name);}
function denied(r,label){assert.equal(r.ok,false,label);return r;}
function sql(text) {
  assert.match(cfg.container,/^supabase_db_platum-stage1-[a-z0-9-]+$/);
  return execFileSync('docker',['exec','-i',cfg.container,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At'],{
    input:"do $$ begin if public.platum_test_identity()<>'platum-stage1-local' then raise exception 'Wrong test target'; end if; end $$;\n"+text,encoding:'utf8'});
}
async function invite(actor,w,recipient,role='client'){
  const operation=randomUUID();
  const r=success(await team(actor,'invite',w,{email:recipient.email,role},operation),'Invite local member');
  assert.equal(r.delivery,'sent','Local invitation delivery must be explicit and successful');
  const repeated=success(await team(actor,'invite',w,{email:recipient.email,role},operation),'Retry invitation receipt');
  assert.equal(repeated.invitation.id,r.invitation.id);assert.equal(repeated.delivery,'sent');
  success(await rpc('platum_accept_invitations',{},recipient.session.access_token),'Accept invitation');
}
async function upload(actor,w,text,shared=false){
  const bytes=Buffer.from(text);
  const f=success(await mutate(actor,w,'file.reserve',{name:'context.txt',mime_type:'text/plain',size_bytes:bytes.length,client_visible:shared}),'Reserve private upload');
  const uploaded=await fetch(cfg.apiUrl+'/storage/v1/object/platum-workspace-files/'+f.path,{method:'POST',
    headers:{apikey:cfg.anonKey,Authorization:'Bearer '+actor.session.access_token,'Content-Type':'text/plain','x-upsert':'false'},body:bytes});
  assert.equal(uploaded.ok,true,'Storage accepts an authorized reserved upload');
  return success(await mutate(actor,w,'file.finish',{id:f.id}),'Finalize private upload');
}
async function download(actor,f){return fetch(cfg.apiUrl+'/storage/v1/object/authenticated/platum-workspace-files/'+f.path,{headers:{apikey:cfg.anonKey,Authorization:'Bearer '+actor.session.access_token}});}
(async()=>{
  await guard();
  await check('email sign-in remains available while public registration is disabled',async()=>{
    const settings=success(await raw('/auth/v1/settings'),'Auth settings');
    assert.equal(settings.external.email,true);
    const signup=await raw('/auth/v1/signup',{body:{email:'not-invited-'+randomUUID().slice(0,8)+'@platum.test',password:'Uninvited-Test-Only-Aa1!'}});
    denied(signup,'Public signup');
  });
  let wa,wb,request,task,draft,material,firstVersion,secondVersion,sharedFile,internalFile,form,submission,comment;
  await check('owners create isolated workspaces through the server API',async()=>{
    wa=success(await team(owner,'create_workspace',null,{name:'Northstar collaboration'}),'Create A').workspace.id;
    wb=success(await team(owner,'create_workspace',null,{name:'Fieldwork collaboration'}),'Create B').workspace.id;
    assert.notEqual(wa,wb);
    await invite(owner,wa,a);await invite(owner,wb,b);await invite(owner,wa,teammate,'team');
  });
  await check('clients and team members cannot grant themselves manager privileges',async()=>{
    denied(await team(a,'create_workspace',null,{name:'Forbidden'}),'client create');
    denied(await team(teammate,'invite',wa,{email:outsider.email,role:'admin'}),'team invite');
    denied(await rpc('platum_service_command',{action:'workspace.create',actor_id:owner.id,workspace_id:null,payload:{name:'Forbidden'},operation_id:randomUUID()},a.session.access_token),'Direct service RPC');
    const membershipWrite=await raw('/rest/v1/workspace_members',{token:a.session.access_token,body:{workspace_id:wa,user_id:outsider.id,role:'owner'}});
    denied(membershipWrite,'Direct membership write');assert.equal(membershipWrite.data.code,'42501');
    success(await raw('/auth/v1/user',{token:outsider.session.access_token,method:'PUT',body:{data:{role:'admin',platum_role:'owner'}}}),'Change untrusted profile metadata');
    assert.equal(success(await raw('/rest/v1/workspaces?select=id',{token:outsider.session.access_token}),'Outsider workspace list').length,0);
  });
  await check('requests are persistent, retry-safe and isolated',async()=>{
    const op=randomUUID(),payload={title:'Prepare the launch outline',message:'Please help us choose the next step.',topic:'Planning',file_ids:[]};
    request=success(await mutate(a,wa,'request.create',payload,op),'Create request');
    assert.equal(success(await mutate(a,wa,'request.create',payload,op),'Repeat request').id,request.id);
    denied(await mutate(a,wa,'request.create',{...payload,message:'Different'},op),'idempotency conflict');
    assert.equal(success(await rows('requests',wa,a),'Client request list').length,1);
    assert.equal(success(await rows('requests',wa,b),'Cross-client request list').length,0);
  });
  await check('scope, owner, replies and linked tasks share the same workspace',async()=>{
    request=success(await mutate(owner,wa,'request.triage',{id:request.id,revision:request.revision,scope_status:'included',status:'in_progress',owner_id:teammate.id}),'Triage');
    success(await mutate(teammate,wa,'request.reply',{id:request.id,body:'We will prepare the outline.'}),'Team reply');
    success(await mutate(a,wa,'request.reply',{id:request.id,body:'Please include the first review date.'}),'Client follow-up');
    assert.equal(success(await rows('request_replies',wa,a),'Reply history').length,2);
    task=success(await mutate(owner,wa,'task.save',{title:'Review the outline',description:'Share your feedback on the published version.',status:'open',priority:'medium',assignee_kind:'client',assignee_user_id:a.id,request_id:request.id,client_visible:true,due_at:'2026-10-20'}),'Create linked task');
    denied(await mutate(owner,wb,'task.save',{title:'Cross reference',status:'open',priority:'medium',assignee_kind:'client',request_id:request.id,client_visible:true}),'Cross-workspace request link');
    denied(await mutate(b,wa,'task.complete',{id:task.id,revision:task.revision,status:'completed'}),'Cross-workspace task completion');
    success(await mutate(a,wa,'task.complete',{id:task.id,revision:task.revision,status:'completed'}),'Complete assigned task');
  });
  await check('private Storage files cannot be downloaded before publication or by another client',async()=>{
    sharedFile=await upload(owner,wa,'Publication attachment');
    internalFile=await upload(owner,wa,'Internal draft evidence');
    denied(await mutate(a,wa,'request.create',{title:'Forbidden attachment',message:'Must not publish an internal file.',file_ids:[internalFile.id]}),'Client cannot share an internal file');
    assert.equal((await download(a,sharedFile)).ok,false);
    assert.equal((await download(b,sharedFile)).ok,false);
    const malicious=await fetch(cfg.apiUrl+'/storage/v1/object/platum-workspace-files/'+wb+'/'+randomUUID()+'/file',{method:'POST',headers:{apikey:cfg.anonKey,Authorization:'Bearer '+a.session.access_token,'Content-Type':'text/plain'},body:'not reserved'});
    assert.equal(malicious.ok,false,'Unreserved/cross-workspace object write is denied');
  });
  await check('drafts stay internal and publication selects one immutable version',async()=>{
    draft=success(await mutate(owner,wa,'material.save',{title:'First direction',summary:'An agreed starting point.',blocks:[{id:'context',label:'Context',text:'Prepared for our next discussion.'},{id:'next',label:'Next step',text:'Review the proposed outline.'}],file_ids:[sharedFile.id]}),'Save material draft');
    material=draft.material;firstVersion=draft.version;
    assert.equal(success(await rows('material_versions',wa,a),'Draft visibility').length,0);
    material=success(await mutate(owner,wa,'material.publish',{id:material.id,revision:material.revision,version_id:firstVersion.id}),'Publish version');
    assert.equal(success(await rows('material_versions',wa,a),'Published visibility').length,1);
    assert.equal(success(await raw('/rest/v1/material_versions?select=*&id=eq.'+firstVersion.id,{token:b.session.access_token}),'Direct foreign version').length,0);
    assert.equal((await download(a,sharedFile)).ok,true);
    assert.equal((await fetch(cfg.apiUrl+'/storage/v1/object/public/platum-workspace-files/'+sharedFile.path)).ok,false,'Published attachments remain in a private bucket');
    assert.equal((await download(b,sharedFile)).ok,false);
    assert.equal((await download(a,internalFile)).ok,false);
    denied(await raw('/rest/v1/material_versions?id=eq.'+firstVersion.id,{token:a.session.access_token,method:'PATCH',body:{title:'Changed'}}),'Direct version mutation');
  });
  await check('viewing, discussion and approval are separate, version-bound actions',async()=>{
    success(await mutate(a,wa,'material.read',{version_id:firstVersion.id}),'Mark read');
    assert.equal(success(await rows('material_reviews',wa,a),'Review count').length,0);
    comment=success(await mutate(a,wa,'material.comment',{version_id:firstVersion.id,block_id:'context',body:'Please clarify this part.'}),'Comment on block');
    success(await mutate(teammate,wa,'material.comment',{version_id:firstVersion.id,block_id:'context',parent_id:comment.id,body:'Here is the explanation.'}),'Reply to block comment');
    denied(await mutate(a,wa,'material.comment',{version_id:firstVersion.id,block_id:'missing',body:'No valid section'}),'Unknown block');
    denied(await mutate(b,wa,'material.comment',{version_id:firstVersion.id,body:'Wrong workspace'}),'Foreign discussion');
    success(await mutate(a,wa,'material.review',{version_id:firstVersion.id,status:'approved',note:''}),'Client approval');
    denied(await mutate(owner,wa,'material.review',{version_id:firstVersion.id,status:'approved',note:''}),'Staff cannot impersonate client approval');
  });
  await check('concurrent editors get an explicit conflict and draft metadata does not leak',async()=>{
    const make=title=>({id:material.id,revision:material.revision,title,summary:'An internal new revision.',blocks:firstVersion.blocks,file_ids:[sharedFile.id]});
    const results=await Promise.all([mutate(owner,wa,'material.save',make('Revised direction')),mutate(teammate,wa,'material.save',make('Alternative draft'))]);
    assert.equal(results.filter(r=>r.ok).length,1);assert.equal(results.filter(r=>!r.ok&&r.data.message==='CONFLICT').length,1);
    draft=results.find(r=>r.ok).data;secondVersion=draft.version;material=draft.material;
    assert.equal(success(await rows('materials',wa,a),'Public metadata')[0].title,'First direction');
    assert.equal(success(await rows('material_versions',wa,a),'Private revision').length,1);
    material=success(await mutate(owner,wa,'material.publish',{id:material.id,revision:material.revision,version_id:secondVersion.id}),'Publish revised material');
    const reviews=success(await rows('material_reviews',wa,a),'Versioned review history');
    assert.equal(reviews.filter(r=>r.version_id===firstVersion.id).length,1);
    assert.equal(reviews.filter(r=>r.version_id===secondVersion.id).length,0);
    denied(await mutate(a,wa,'material.review',{version_id:firstVersion.id,status:'approved',note:''}),'Old version cannot receive current approval');
    assert.equal(success(await rows('material_comments',wa,a),'Preserved discussion')[0].version_id,firstVersion.id);
  });
  await check('questionnaire drafts, submissions and original questions are preserved',async()=>{
    form=success(await mutate(owner,wa,'form.save',{title:'A little context',description:'This helps us prepare the next step.',status:'active',fields:[{id:'goal',label:'What outcome matters most?',help:'We will use this to choose the next task.',type:'text',required:true},{id:'ready',label:'Ready for a review?',help:'',type:'boolean',required:true}]}),'Publish questionnaire');
    submission=success(await mutate(a,wa,'form.submit',{id:form.id,form_revision:form.revision,revision:0,answers:{goal:'A clear launch',ready:false},status:'draft'}),'Save private draft');
    assert.equal(success(await rows('form_submissions',wa,owner),'Operator draft visibility').length,0);
    submission=success(await mutate(a,wa,'form.submit',{id:form.id,form_revision:form.revision,revision:submission.revision,answers:{goal:'A clear launch',ready:false},status:'submitted'}),'Submit answers');
    assert.equal(success(await rows('form_submissions',wa,owner),'Submitted responses')[0].answers.ready,false);
    denied(await mutate(a,wa,'form.submit',{id:form.id,form_revision:form.revision,revision:submission.revision,answers:{goal:'Overwritten',ready:true},status:'submitted'}),'Submitted history cannot be overwritten');
    const original=form.revision;
    form=success(await mutate(owner,wa,'form.save',{id:form.id,revision:form.revision,title:form.title,description:form.description,status:'active',fields:[{id:'goal',label:'What should we prioritise next?',help:'',type:'text',required:true}]}),'Revise form');
    assert.equal(success(await rows('form_submissions',wa,a),'Frozen question')[0].definition_snapshot.fields[0].label,'What outcome matters most?');
    denied(await mutate(a,wa,'form.submit',{id:form.id,form_revision:original,revision:0,answers:{goal:'Old form'},status:'submitted'}),'Stale form submission');
    success(await mutate(teammate,wa,'form.review',{id:submission.id,revision:submission.revision}),'Review response');
  });
  await check('context edits use concurrency checks and updates persist independently of read state',async()=>{
    let ws=success(await raw('/rest/v1/workspaces?select=*&id=eq.'+wa,{token:owner.session.access_token}),'Workspace')[0];
    const settings={revision:ws.revision,name:ws.name,accent:'slate',welcome:'Welcome to our shared workspace.',focus:'Prepare the first review',phase:'Planning',objective:'An agreed launch direction',scope:'Outline and review',roles:'Team prepares; client reviews.',rhythm:'Weekly update',boundaries:'Additional work is agreed first.',next_step:'Review the first direction',modules:['home','materials','work','context','forms','updates','files']};
    success(await mutate(owner,wa,'workspace.save',settings),'Save agreement');
    denied(await mutate(teammate,wa,'workspace.save',settings),'Stale agreement update');
    success(await mutate(owner,wa,'update.publish',{title:'Ready for the first review',body:'The materials are published. Your feedback will guide the next step.'}),'Publish update');
    success(await mutate(owner,wa,'decision.record',{title:'Start with the outline',context:'Agreed in the workspace.',decision:'Review the direction before production.'}),'Record decision');
    success(await mutate(a,wa,'updates.read',{}),'Read updates');
    assert.equal(success(await rows('workspace_reads',wa,owner),'Independent read state').length,0);
  });
  await check('exports include only shared material and omit internal files, drafts and credentials',async()=>{
    const secretDraft=success(await mutate(owner,wa,'material.save',{title:'Internal-only draft',summary:'Not approved for sharing.',blocks:[{id:'private',label:'Internal',text:'UNPUBLISHED_TEST_ONLY'}],file_ids:[internalFile.id]}),'Internal export fixture');
    const exported=success(await rpc('platum_export',{workspace_id:wa},owner.session.access_token),'Shared export');
    assert.equal(JSON.stringify(exported).includes('UNPUBLISHED_TEST_ONLY'),false);
    assert.equal(exported.files.some(f=>f.id===internalFile.id),false);
    assert.equal(exported.files.some(f=>f.id===sharedFile.id),true);
    assert.equal(JSON.stringify(exported).includes(owner.session.access_token),false);
    denied(await rpc('platum_export',{workspace_id:wa},b.session.access_token),'Foreign export');
  });
  await check('expired and revoked invitations cannot grant access',async()=>{
    let invitation=success(await team(owner,'invite',wa,{email:b.email,role:'client'}),'Pending expiry invitation').invitation;
    assert.match(invitation.id,/^[a-f0-9-]+$/);
    sql("update public.workspace_invitations set expires_at=now()-interval '1 second' where id='"+invitation.id+"';");
    success(await rpc('platum_accept_invitations',{},b.session.access_token),'Try expired invitation');
    assert.equal(success(await rows('requests',wa,b),'Expired invitation access').length,0);
    invitation=success(await team(owner,'invite',wa,{email:outsider.email,role:'client'}),'Pending revoke invitation').invitation;
    success(await team(owner,'revoke_invite',wa,{id:invitation.id}),'Revoke invitation');
    success(await rpc('platum_accept_invitations',{},outsider.session.access_token),'Try revoked invitation');
    assert.equal(success(await rows('requests',wa,outsider),'Revoked invitation access').length,0);
  });
  await check('revoked membership immediately denies records, personal form drafts, export and authenticated downloads',async()=>{
    success(await team(owner,'revoke_member',wa,{id:a.id}),'Revoke member');
    for(const table of ['requests','form_submissions','material_versions','material_comments','material_reads','workspace_files'])
      assert.equal(success(await rows(table,wa,a),'Revoked '+table).length,0,table);
    denied(await rpc('platum_export',{workspace_id:wa},a.session.access_token),'Revoked export');
    assert.equal((await download(a,sharedFile)).ok,false);
    denied(await team(owner,'revoke_member',wa,{id:owner.id}),'Last owner protection');
  });
  await check('a new authenticated session retains the same authorised workspace and records',async()=>{
    const session=success(await raw('/auth/v1/token?grant_type=password',{body:{email:b.email,password:b.password}}),'New client session');
    const ws=success(await raw('/rest/v1/workspaces?select=id',{token:session.access_token}),'Reopened workspaces');
    assert.deepEqual(ws.map(x=>x.id),[wb]);
  });
  cfg.fixture={workspaceA:wa,workspaceB:wb,materialId:material.id,requestId:request.id,formId:form.id};
  fs.writeFileSync(process.env.PLATUM_TEST_CONFIG,JSON.stringify(cfg,null,2),{mode:0o600});
  if(process.env.PLATUM_TEST_REPORT)fs.writeFileSync(process.env.PLATUM_TEST_REPORT,JSON.stringify({passed,date:new Date().toISOString(),scope:'disposable local Supabase Auth/PostgREST/Storage + local API'},null,2));
  console.log(passed.length+' collaboration integration scenarios passed.');
})().catch(error=>{console.error('FAIL '+error.message);process.exitCode=1;});
