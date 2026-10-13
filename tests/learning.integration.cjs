'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {cfg,guard,team,rpc,mutate,rows,raw,success,randomUUID,createSuiteUsers}=require('./local-support.cjs');
let owner,staff,client,other;
const command=(actor,w,action,payload,operation=randomUUID())=>rpc('platum_learning_mutate',{action,workspace_id:w,payload,operation_id:operation},actor.session.access_token);
const denied=(r,code)=>{assert.equal(r.ok,false);if(code)assert.equal(r.data?.message,code);};
const passed=[];async function check(name,fn){await fn();passed.push(name);console.log('PASS '+name);}
(async()=>{
  await guard();
  ({Owner:owner,Teammate:staff,ClientA:client,ClientB:other}=await createSuiteUsers('LearningApi'));
  const w=success(await team(owner,'create_workspace',null,{name:'Learning local verification'}),'Create workspace').workspace.id;
  for(const [person,role] of [[client,'client'],[staff,'team']]){success(await team(owner,'invite',w,{email:person.email,role}),'Invite');success(await rpc('platum_accept_invitations',{},person.session.access_token),'Accept');}
  let unit,version,m,submitted,inspiration;
  const p={title:'A useful brief',summary:'Make the next action clear.',explanation:'Explain the audience, goal and useful result.',prompt:'Write a short brief for your current task.',file_ids:[]};
  await check('lessons reuse immutable material versions while drafts remain internal',async()=>{
    const op=randomUUID(),r=success(await command(owner,w,'learning.save',p,op),'Save lesson');unit=r.unit;version=r.version;m=r.material;
    assert.deepEqual(success(await command(owner,w,'learning.save',p,op),'Retry lesson'),r);
    assert.equal(success(await rows('learning_units',w,client),'Client draft units').length,0);
    assert.equal(success(await rows('learning_versions',w,client),'Client draft versions').length,0);
    denied(await command(client,w,'learning.save',p),'FORBIDDEN');
    unit=success(await command(owner,w,'learning.publish',{id:unit.id,revision:unit.revision,version_id:version.material_version_id,material_revision:m.revision}),'Publish lesson');
    assert.equal(success(await rows('learning_versions',w,client),'Published lesson').length,1);
    assert.equal(success(await rows('learning_versions',w,other),'Foreign lesson').length,0);
    denied(await command(other,w,'learning.submit',{version_id:version.id,status:'submitted',answer:'Wrong client'}),'FORBIDDEN');
  });
  await check('private practice drafts persist without exposing them to staff',async()=>{
    const payload={version_id:version.id,status:'draft',answer:'Our audience needs a clear next step.',evidence_url:''};
    const draft=success(await command(client,w,'learning.submit',payload),'Save private draft');
    assert.equal(success(await rows('learning_submissions',w,owner),'Staff cannot read drafts').length,0);
    assert.equal(success(await rows('learning_submissions',w,client),'Own saved draft')[0].answer,payload.answer);
    const exportData=success(await rpc('platum_export',{workspace_id:w},owner.session.access_token),'Operator export');assert.equal(exportData.learning_submissions.length,0);
    const op=randomUUID(),send={...payload,id:draft.id,revision:draft.revision,status:'submitted'};
    submitted=success(await command(client,w,'learning.submit',send,op),'Submit practice');
    assert.deepEqual(success(await command(client,w,'learning.submit',send,op),'Retry practice'),submitted);
    assert.equal(success(await rows('learning_submissions',w,owner),'Staff sees submission').length,1);
    denied(await command(client,w,'learning.submit',{...payload,status:'submitted'}),'PRACTICE_PENDING');
    denied(await raw('/rest/v1/learning_submissions?id=eq.'+submitted.id,{method:'PATCH',token:client.session.access_token,body:{answer:'Replace accepted bytes'}}));
  });
  await check('feedback, another attempt and explicit completion preserve the earlier answer',async()=>{
    denied(await command(client,w,'learning.feedback',{id:submitted.id,revision:submitted.revision,outcome:'completed',body:'Self approval'}),'FORBIDDEN');
    success(await command(staff,w,'learning.feedback',{id:submitted.id,revision:submitted.revision,outcome:'needs_changes',body:'Please add the concrete outcome.'}),'Team feedback');
    const second=success(await command(client,w,'learning.submit',{version_id:version.id,status:'submitted',answer:'The audience will choose a workshop date.',evidence_url:'https://example.com/brief'}),'Second attempt');assert.equal(second.attempt,2);
    success(await command(owner,w,'learning.feedback',{id:second.id,revision:second.revision,outcome:'completed',body:'The outcome is now concrete. Use it in the next task.'}),'Complete practice');
    const answers=success(await rows('learning_submissions',w,client),'Answer history');assert.equal(answers.length,2);assert.equal(answers.find(s=>s.id===submitted.id).answer,'Our audience needs a clear next step.');
    assert.equal(success(await rows('learning_feedback',w,client),'Feedback history').length,2);
    assert.equal(success(await rows('learning_feedback',w,other),'Foreign feedback').length,0);
  });
  await check('new lesson publication never inherits a prior practice completion',async()=>{
    m=success(await rows('materials',w,owner),'Latest material').find(x=>x.id===unit.material_id);
    const changed=success(await command(owner,w,'learning.save',{...p,id:unit.id,revision:unit.revision,material_revision:m.revision,prompt:'Revise the brief using a real result.'}),'Revise lesson');
    unit=success(await command(owner,w,'learning.publish',{id:changed.unit.id,revision:changed.unit.revision,version_id:changed.version.material_version_id,material_revision:changed.material.revision}),'Publish revision');
    assert.equal(success(await rows('learning_submissions',w,client),'Old attempts').filter(s=>s.version_id===changed.version.id).length,0);
    denied(await command(client,w,'learning.submit',{version_id:version.id,status:'submitted',answer:'Old prompt'}),'CURRENT_VERSION_CHANGED');
    assert.equal(success(await rows('learning_versions',w,client),'Both published lessons').length,2);
    version=changed.version;
  });
  await check('shared references cannot point into another workspace or to internal tasks',async()=>{
    const task=success(await mutate(owner,w,'task.save',{title:'Internal research',description:'Private',status:'open',priority:'medium',assignee_kind:'team',client_visible:false}),'Private task');
    denied(await command(owner,w,'learning.save',{...p,task_id:task.id}),'INVALID_SHARED_REFERENCE');
    denied(await command(owner,w,'inspiration.save',{title:'No private task link',status:'shared',note:'Useful idea',task_id:task.id}),'INVALID_SHARED_REFERENCE');
    denied(await command(owner,w,'inspiration.save',{title:'No foreign link',status:'shared',note:'Useful idea',reference_version_id:randomUUID()}),'INVALID_SHARED_REFERENCE');
  });
  await check('concurrent lesson edits cannot silently replace one another',async()=>{
    m=success(await rows('materials',w,owner),'Current material').find(x=>x.id===unit.material_id);
    const payload={...p,id:unit.id,revision:unit.revision,material_revision:m.revision};
    const responses=await Promise.all([command(owner,w,'learning.save',payload),command(staff,w,'learning.save',{...payload,title:'Alternative draft'})]);
    assert.equal(responses.filter(r=>r.ok).length,1);denied(responses.find(r=>!r.ok),'CONFLICT');
    assert.equal(success(await rows('learning_versions',w,client),'Draft stays hidden').length,2);
  });
  await check('inspiration drafts stay internal and comments retain their reference revision',async()=>{
    const p={title:'A reference',url:'https://example.com/one',note:'A useful format.',relevance:'Helps our next brief.',tag:'Writing',status:'draft'};
    inspiration=success(await command(owner,w,'inspiration.save',p),'Draft reference');
    assert.equal(success(await rows('inspiration_items',w,client),'Private inspiration').length,0);
    denied(await command(owner,w,'inspiration.comment',{id:inspiration.id,revision:inspiration.revision,body:'Internal comment must not later leak'}),'FORBIDDEN');
    inspiration=success(await command(owner,w,'inspiration.save',{...p,id:inspiration.id,revision:inspiration.revision,status:'shared'}),'Share reference');
    const comment=success(await command(client,w,'inspiration.comment',{id:inspiration.id,revision:inspiration.revision,body:'The first example is useful.'}),'Discuss reference');
    inspiration=success(await command(owner,w,'inspiration.save',{...p,id:inspiration.id,revision:inspiration.revision,status:'shared',url:'https://example.com/two'}),'Update reference');
    assert.equal(success(await rows('inspiration_comments',w,client),'Comment snapshot')[0].context_snapshot.url,'https://example.com/one');
    assert.ok(comment.item_revision<inspiration.revision);
    denied(await command(client,w,'inspiration.save',{...p,id:inspiration.id,revision:inspiration.revision,status:'shared'}),'FORBIDDEN');
    denied(await command(client,w,'inspiration.save',{...p,status:'draft'}),'FORBIDDEN');
    success(await command(client,w,'inspiration.save',{...p,status:'shared',title:'Client reference'}),'Client contributes');
    assert.equal(success(await rows('inspiration_items',w,other),'Foreign reference').length,0);
  });
  await check('published lesson, practice feedback and inspiration exports are complete and omit drafts',async()=>{
    success(await command(owner,w,'learning.save',{...p,title:'Do not export this draft'}),'Unpublished lesson');
    success(await command(owner,w,'inspiration.save',{title:'Internal inspiration',note:'Private team idea',status:'draft'}),'Internal reference');
    const exp=success(await rpc('platum_export',{workspace_id:w},client.session.access_token),'Shared export');
    assert.equal(exp.learning_units.length,1);assert.equal(exp.learning_versions.length,2);assert.equal(exp.learning_submissions.length,2);assert.equal(exp.learning_feedback.length,2);assert.equal(exp.inspiration.length,2);assert.equal(exp.inspiration_comments.length,1);
    assert.ok(!JSON.stringify(exp).includes('Private team idea'));assert.ok(!JSON.stringify(exp).includes('Do not export this draft'));
  });
  await check('another client in the same workspace cannot read someone else’s practice or feedback',async()=>{
    success(await team(owner,'invite',w,{email:other.email,role:'client'}),'Invite second local client');success(await rpc('platum_accept_invitations',{},other.session.access_token),'Accept second client');
    assert.equal(success(await rows('learning_submissions',w,other),'Private practice answers').length,0);
    assert.equal(success(await rows('learning_feedback',w,other),'Private practice feedback').length,0);
    const exp=success(await rpc('platum_export',{workspace_id:w},other.session.access_token),'Second client export');assert.equal(exp.learning_submissions.length,0);assert.equal(exp.learning_feedback.length,0);
  });
  fs.writeFileSync(process.env.PLATUM_LEARNING_REPORT||'/private/tmp/platum-learning-results.json',JSON.stringify({scope:'disposable local Supabase',passed},null,2));
  console.log(passed.length+' learning and inspiration integration groups passed.');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
