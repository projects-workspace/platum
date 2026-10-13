'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {cfg,guard,team,rpc,raw,rows,success,randomUUID,createSuiteUsers}=require('./local-support.cjs');
let owner,staff,client,other,outsider;
const passed=[];
async function check(name,fn){await fn();passed.push(name);console.log('PASS '+name);}
function denied(result,code){assert.equal(result.ok,false);if(code)assert.equal(result.data?.message,code);}
const command=(actor,w,action,payload,operation=randomUUID())=>rpc('platum_regular_mutate',{action,workspace_id:w,payload,operation_id:operation},actor.session.access_token);
async function invite(w,actor,role='client'){
  success(await team(owner,'invite',w,{email:actor.email,role}),'Invite local member');
  success(await rpc('platum_accept_invitations',{},actor.session.access_token),'Accept local membership');
}
(async()=>{
  await guard();
  ({Owner:owner,Teammate:staff,ClientA:client,ClientB:other,Outsider:outsider}=await createSuiteUsers('CalendarApi'));
  const wa=success(await team(owner,'create_workspace',null,{name:'Calendar local verification A'}),'Create A').workspace.id;
  const wb=success(await team(owner,'create_workspace',null,{name:'Calendar local verification B'}),'Create B').workspace.id;
  await invite(wa,client);await invite(wa,staff,'team');await invite(wb,other);
  let event,first,second;
  const now=Date.now(),proposal={title:'Direction review',agenda:'Review the next shared action.',location:'Online',timezone:'Europe/Prague',starts_at:new Date(now+86400000).toISOString(),ends_at:new Date(now+90000000).toISOString()};
  await check('proposal creation is scoped, persisted and idempotent',async()=>{
    const op=randomUUID();const created=success(await command(owner,wa,'calendar.propose',proposal,op),'Propose');
    event=created.event;first=created.version;
    assert.deepEqual(success(await command(owner,wa,'calendar.propose',proposal,op),'Replay proposal'),created);
    denied(await command(owner,wa,'calendar.propose',{...proposal,title:'Other'},op),'IDEMPOTENCY_CONFLICT');
    assert.equal(success(await rows('calendar_events',wa,client),'Client sees event').length,1);
    assert.equal(success(await rows('calendar_versions',wa,client),'Client sees version')[0].title,proposal.title);
    assert.equal(success(await rows('calendar_events',wa,other),'Other client isolated').length,0);
    for(const actor of [other,outsider])denied(await command(actor,wa,'calendar.propose',proposal),'FORBIDDEN');
    denied(await raw('/rest/v1/calendar_events',{token:client.session.access_token,body:{workspace_id:wa,created_by:client.id}}));
    denied(await rpc('platum_regular_mutate',{action:'calendar.propose',workspace_id:wa,payload:proposal,operation_id:randomUUID()}));
  });
  await check('the proposing side cannot confirm itself, including a second employee',async()=>{
    const p={id:event.id,revision:event.revision,version_id:first.id,response:'confirmed',note:''};
    denied(await command(owner,wa,'calendar.respond',p),'OTHER_SIDE_REQUIRED');
    denied(await command(staff,wa,'calendar.respond',p),'OTHER_SIDE_REQUIRED');
    event=success(await command(client,wa,'calendar.respond',p),'Client confirms');assert.equal(event.status,'confirmed');
  });
  await check('rescheduling requires a fresh opposite-side confirmation and preserves history',async()=>{
    const changed=success(await command(client,wa,'calendar.propose',{...proposal,id:event.id,revision:event.revision,starts_at:new Date(now+172800000).toISOString(),ends_at:new Date(now+176400000).toISOString()}),'Client reschedule');
    event=changed.event;second=changed.version;assert.equal(event.status,'proposed');assert.equal(second.number,2);
    assert.equal(second.proposed_side,'client');
    denied(await command(owner,wa,'calendar.respond',{id:event.id,revision:event.revision,version_id:first.id,response:'confirmed'}),'CONFLICT');
    const history=success(await rows('calendar_responses',wa,client),'History');assert.equal(history.length,1);assert.equal(history[0].version_id,first.id);
    event=success(await command(owner,wa,'calendar.respond',{id:event.id,revision:event.revision,version_id:second.id,response:'confirmed'}),'Team confirms');
  });
  await check('simultaneous staff proposals yield one explicit conflict',async()=>{
    const payload={...proposal,id:event.id,revision:event.revision};
    const results=await Promise.all([command(owner,wa,'calendar.propose',payload),command(staff,wa,'calendar.propose',{...payload,title:'Another proposal'})]);
    assert.equal(results.filter(r=>r.ok).length,1);denied(results.find(r=>!r.ok),'CONFLICT');event=results.find(r=>r.ok).data.event;
    assert.equal(success(await rows('calendar_versions',wa,client),'Preserved versions').length,3);
  });
  await check('availability belongs to its author, validates ranges and stays workspace scoped',async()=>{
    const p={revision:0,timezone:'Asia/Kathmandu',weekly:[{day:2,start:'09:00',end:'17:00'}],unavailable:[{start:'2026-12-20',end:'2026-12-22'}],note:'Travelling in December.'};
    const av=success(await command(client,wa,'availability.save',p),'Save availability');assert.equal(av.user_id,client.id);
    assert.equal(success(await rows('workspace_availability',wa,owner),'Shared availability')[0].note,p.note);
    assert.equal(success(await rows('workspace_availability',wa,other),'Cross-client availability').length,0);
    denied(await command(client,wa,'availability.save',p),'CONFLICT');
    denied(await command(client,wa,'availability.save',{...p,revision:av.revision,weekly:[{day:2,start:'17:00',end:'09:00'}]}),'INVALID_AVAILABILITY');
    denied(await command(owner,wa,'availability.save',{...p,timezone:'Invented/Zone'}),'INVALID_TIMEZONE');
    const own=success(await command(owner,wa,'availability.save',{...p,id:av.id,user_id:client.id}),'Only own record is written');assert.equal(own.user_id,owner.id);assert.notEqual(own.id,av.id);
    assert.equal(success(await rows('workspace_availability',wa,client),'Availability retained').length,2);
  });
  await check('event time validation and state transitions reject invalid requests',async()=>{
    denied(await command(owner,wa,'calendar.propose',{...proposal,ends_at:proposal.starts_at}),'INVALID_EVENT_TIME');
    denied(await command(owner,wa,'calendar.propose',{...proposal,starts_at:'infinity',ends_at:'infinity'}),'INVALID_EVENT_TIME');
    denied(await command(owner,wa,'calendar.complete',{id:event.id,revision:event.revision,version_id:event.current_version_id}),'EVENT_NOT_FINISHED');
    event=success(await command(client,wa,'calendar.respond',{id:event.id,revision:event.revision,version_id:event.current_version_id,response:'declined',note:'Please suggest a later date.'}),'Decline proposal');
    const another=success(await command(owner,wa,'calendar.propose',{...proposal,id:event.id,revision:event.revision}),'New proposal after decline');event=another.event;
    denied(await command(client,wa,'calendar.cancel',{id:event.id,revision:event.revision,version_id:event.current_version_id,note:'Cannot cancel another person’s event.'}),'FORBIDDEN');
    event=success(await command(owner,wa,'calendar.cancel',{id:event.id,revision:event.revision,version_id:event.current_version_id,note:'We agreed to handle this asynchronously.'}),'Cancel');
    denied(await command(owner,wa,'calendar.propose',{...proposal,id:event.id,revision:event.revision}),'EVENT_CLOSED');
  });
  await check('export carries proposal/response history and revoked users lose reads, commands and export',async()=>{
    const exp=success(await rpc('platum_export',{workspace_id:wa},client.session.access_token),'Export');
    assert.equal(exp.calendar_events[0].status,'cancelled');assert.equal(exp.calendar_versions.length,4);assert.equal(exp.calendar_responses.length,4);assert.equal(exp.availability.length,2);
    const op=randomUUID();const before=success(await command(client,wa,'calendar.propose',proposal,op),'Client own proposal');assert.equal(before.event.created_by,client.id);
    success(await team(owner,'revoke_member',wa,{id:client.id}),'Revoke local client');
    assert.equal(success(await rows('calendar_events',wa,client),'Revoked events').length,0);
    denied(await command(client,wa,'calendar.propose',proposal,op),'FORBIDDEN');
    denied(await rpc('platum_export',{workspace_id:wa},client.session.access_token),'FORBIDDEN');
  });
  cfg.calendarFixture={workspaceA:wa,workspaceB:wb};fs.writeFileSync(process.env.PLATUM_TEST_CONFIG,JSON.stringify(cfg,null,2),{mode:0o600});
  fs.writeFileSync(process.env.PLATUM_CALENDAR_REPORT||'/private/tmp/platum-calendar-results.json',JSON.stringify({scope:'disposable local Supabase',passed},null,2));
  console.log(passed.length+' calendar integration groups passed.');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
