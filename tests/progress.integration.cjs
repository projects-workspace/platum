'use strict';
const assert=require('node:assert/strict');const fs=require('node:fs');
const {cfg,guard,team,rpc,mutate,rows,raw,success,randomUUID,createSuiteUsers}=require('./local-support.cjs');
let owner,staff,client,other;
const command=(actor,w,action,payload,operation=randomUUID())=>rpc('platum_progress_mutate',{action,workspace_id:w,payload,operation_id:operation},actor.session.access_token);
const denied=(r,code)=>{assert.equal(r.ok,false);if(code)assert.equal(r.data?.message,code);};
const passed=[];async function check(name,fn){await fn();passed.push(name);console.log('PASS '+name);}
async function invite(w,person,role){success(await team(owner,'invite',w,{email:person.email,role}),'Invite');success(await rpc('platum_accept_invitations',{},person.session.access_token),'Accept');}
(async()=>{
  await guard();({Owner:owner,Teammate:staff,ClientA:client,ClientB:other}=await createSuiteUsers('ProgressApi'));const w=success(await team(owner,'create_workspace',null,{name:'Progress source verification'}),'Source space').workspace.id;
  const target=success(await team(owner,'create_workspace',null,{name:'Template destination verification'}),'Target space').workspace.id;
  await invite(w,client,'client');await invite(w,staff,'team');await invite(target,other,'team');
  let task,milestone,report,publication,template;
  const today=new Date().toISOString().slice(0,10);
  const material=success(await mutate(owner,w,'material.save',{title:'Published result',summary:'First result.',blocks:[{id:'result',label:'Result',text:'A practical outcome.'}],file_ids:[]}),'Result draft');
  success(await mutate(owner,w,'material.publish',{id:material.material.id,revision:material.material.revision,version_id:material.version.id}),'Publish result');
  await check('milestones require completed linked tasks and retain every change',async()=>{
    task=success(await mutate(owner,w,'task.save',{title:'Deliver the first result',description:'Review and finish.',status:'open',priority:'medium',assignee_kind:'team',client_visible:true}),'Task');
    const p={title:'First useful outcome',description:'Our first deliverable.',due_at:today,status:'in_progress',task_ids:[task.id],result_version_ids:[material.version.id],completion_note:''};
    milestone=success(await command(owner,w,'milestone.save',p),'Milestone');
    denied(await command(client,w,'milestone.save',p),'FORBIDDEN');
    denied(await command(owner,w,'milestone.save',{...p,id:milestone.id,revision:milestone.revision,status:'completed',completion_note:'Delivered.'}),'MILESTONE_TASKS_OPEN');
    task=success(await mutate(owner,w,'task.complete',{id:task.id,revision:task.revision,status:'completed'}),'Complete work');assert.ok(task.completed_at);
    milestone=success(await command(owner,w,'milestone.save',{...p,id:milestone.id,revision:milestone.revision,status:'completed',completion_note:'The first useful result is delivered.'}),'Complete milestone');
    assert.equal(success(await rows('milestone_history',w,client),'Shared history').length,2);
    assert.equal(success(await rows('work_milestones',w,other),'Foreign milestones').length,0);
  });
  const draft={title:'Our first period',starts_on:today,ends_on:today,timezone:'UTC',summary:'A useful step forward.',outcomes:'Delivered the first result.',blockers:'Awaiting the next input.',next_step:'Agree the next task.',result_version_ids:[material.version.id],milestone_ids:[],metrics:[{name:'Responses',value:'12',unit:'people',source:'Manually counted from the agreed source.',source_url:'https://example.com/source',observed_on:today,verified:false}]};
  await check('reports are internal until publication and require verified metric sources',async()=>{
    report=success(await command(owner,w,'report.save',{...draft,milestone_ids:[milestone.id]}),'Report draft');
    assert.equal(success(await rows('period_reports',w,client),'Internal report').length,0);
    denied(await command(owner,w,'report.publish',{id:report.id,revision:report.revision}),'METRICS_UNVERIFIED');
    denied(await command(owner,target,'report.save',draft),'INVALID_SHARED_REFERENCE');
    denied(await command(client,w,'report.publish',{id:report.id,revision:report.revision}),'FORBIDDEN');
    report=success(await command(owner,w,'report.save',{...draft,id:report.id,revision:report.revision,milestone_ids:[milestone.id],metrics:draft.metrics.map(m=>({...m,verified:true}))}),'Verified draft');
    const op=randomUUID(),p={id:report.id,revision:report.revision};publication=success(await command(owner,w,'report.publish',p,op),'Publish report');
    assert.deepEqual(success(await command(owner,w,'report.publish',p,op),'Replay report publication'),publication);
    assert.equal(publication.snapshot.completed_tasks[0].title,task.title);assert.equal(publication.snapshot.results[0].title,'Published result');assert.equal(publication.snapshot.milestones[0].completion_note,milestone.completion_note);
    assert.equal(success(await rows('report_publications',w,client),'Shared report').length,1);
  });
  await check('published reports freeze evidence and use version-bound discussion and approval',async()=>{
    success(await mutate(client,w,'material.comment',{version_id:publication.material_version_id,body:'The next step is clear.'}),'Discuss report');
    success(await mutate(client,w,'material.review',{version_id:publication.material_version_id,status:'approved',note:''}),'Approve report');
    success(await mutate(owner,w,'task.complete',{id:task.id,revision:task.revision,status:'open'}),'Reopen task');
    report=success(await rows('period_reports',w,owner),'Current draft')[0];
    report=success(await command(owner,w,'report.save',{...draft,id:report.id,revision:report.revision,outcomes:'A revised explanation.',metrics:[]}),'Revise report');
    const revised=success(await command(owner,w,'report.publish',{id:report.id,revision:report.revision}),'Publish revised report');
    assert.equal(revised.snapshot.completed_tasks.length,0);
    const old=success(await rows('report_publications',w,client),'Old report').find(p=>p.id===publication.id);assert.equal(old.snapshot.completed_tasks.length,1);assert.equal(old.snapshot.metrics[0].value,'12');
    assert.equal(success(await rows('material_reviews',w,client),'Approvals').filter(r=>r.version_id===revised.material_version_id).length,0);
    assert.equal(success(await rows('material_comments',w,client),'Comments')[0].version_id,publication.material_version_id);
  });
  const definition={configuration:{welcome:'Welcome to our shared work.',objective:'Agree one useful outcome.',accent:'clay',timezone:'Europe/Prague',modules:['home','calendar','learning','reports','materials','forms']},items:[
    {kind:'material',title:'How we work',summary:'Our rhythm.',body:'Share a need, discuss the work, review a result.',next_step:'Agree the first action.',file_ids:[randomUUID()]},
    {kind:'learning',title:'Describe a useful action',summary:'One practical step.',body:'Make the result concrete.',next_step:'Write one sentence describing the outcome.'},
    {kind:'form',title:'A focused clarification',summary:'Only what we need now.',fields:[{label:'What outcome matters?',help:'This sets our first priority.',type:'textarea',required:true,options:[]}]}]};
  await check('templates store only reusable definitions and keep client data and source records out',async()=>{
    template=success(await command(owner,w,'template.save',{name:'Shared collaboration starter',description:'For a new project.',definition}),'Template');
    assert.equal(template.definition.items[0].file_ids,undefined);
    assert.equal(success(await rows('workspace_templates',w,client),'Client template catalog').length,0);
    assert.equal(success(await rows('workspace_templates',w,other),'Unassigned team catalog').length,0);
    denied(await command(other,target,'template.apply',{template_id:template.id,template_revision:template.revision}),'FORBIDDEN');
    denied(await command(staff,target,'template.apply',{template_id:template.id,template_revision:template.revision}),'FORBIDDEN');
  });
  await check('template application is atomic, retry-safe and creates editable internal drafts',async()=>{
    const workspace=success(await raw('/rest/v1/workspaces?id=eq.'+target,{token:owner.session.access_token}),'Target')[0];
    const op=randomUUID(),p={template_id:template.id,template_revision:template.revision,workspace_revision:workspace.revision,apply_configuration:true};
    const applied=success(await command(owner,target,'template.apply',p,op),'Apply template');assert.equal(applied.created_records.length,3);
    assert.deepEqual(success(await command(owner,target,'template.apply',p,op),'Retry application'),applied);
    const current=success(await raw('/rest/v1/workspaces?id=eq.'+target,{token:owner.session.access_token}),'Target config')[0];assert.equal(current.settings.accent,'clay');assert.equal(current.settings.welcome,definition.configuration.welcome);
    const context=success(await rows('project_context',target,owner),'Target goal')[0];assert.equal(context.objective,definition.configuration.objective);
    assert.equal(success(await rows('learning_units',target,owner),'Practice drafts').length,1);
    assert.equal(success(await rows('forms',target,owner),'Form drafts')[0].status,'draft');
    assert.equal(success(await rows('materials',target,owner),'Material drafts').length,2);
    denied(await command(owner,target,'template.apply',{...p,workspace_revision:workspace.revision}),'CONFLICT');
    assert.equal(success(await rows('template_applications',target,owner),'Atomic receipts').length,1);
    const exp=success(await rpc('platum_export',{workspace_id:target},owner.session.access_token),'Target shared export');assert.equal(exp.materials.length,0);assert.equal(exp.learning_units.length,0);assert.equal(exp.workspace_templates,undefined);
  });
  await check('template replay rechecks source access after revocation',async()=>{
    await invite(target,staff,'team');const p={template_id:template.id,template_revision:template.revision,apply_configuration:false},op=randomUUID();
    success(await command(staff,target,'template.apply',p,op),'Assigned staff applies');
    success(await team(owner,'revoke_member',w,{id:staff.id}),'Revoke source membership');
    denied(await command(staff,target,'template.apply',p,op),'FORBIDDEN');
  });
  await check('shared export includes milestone history and every published report, with no template or report drafts',async()=>{
    const exp=success(await rpc('platum_export',{workspace_id:w},client.session.access_token),'Shared export');assert.equal(exp.milestones.length,1);assert.equal(exp.milestone_history.length,2);assert.equal(exp.reports.length,2);
    assert.equal(exp.workspace_templates,undefined);assert.equal(exp.period_reports,undefined);
  });
  fs.writeFileSync(process.env.PLATUM_PROGRESS_REPORT||'/private/tmp/platum-progress-results.json',JSON.stringify({scope:'disposable local Supabase',passed},null,2));console.log(passed.length+' progress and template integration groups passed.');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
