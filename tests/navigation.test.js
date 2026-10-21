'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const nav=require('../workspace-navigation');
test('configured sections preserve order across compact and expanded navigation',()=>{
 const modules=['home','materials','forms','calendar','work','reports'];const p=nav.plan({active:{role:'client',settings:{modules}},view:'form'});
 assert.deepEqual([...p.primary,...p.more],modules);assert.equal(p.current,'forms');assert.equal(p.moreActive,false);assert.deepEqual(p.tools,[]);
 const deep=nav.plan({active:{role:'client',settings:{modules}},view:'event'});assert.equal(deep.moreActive,true);
});
test('client and collaborator menus follow the selected membership without granting another project role',()=>{
 const workspaces=[{id:'a',role:'client'},{id:'b',role:'team'}];let p=nav.plan({active:workspaces[0],workspaces,view:'home'});
 assert.deepEqual(p.tools,['team']);assert.equal(p.tools.includes('contacts'),false);
 p=nav.plan({active:workspaces[1],workspaces,view:'contact'});assert.ok(p.tools.includes('contacts'));assert.ok(p.tools.includes('settings'));assert.equal(p.tools.includes('members'),false);assert.equal(p.toolsActive,true);
});
test('personal-only accounts get personal navigation and no project sections or tools',()=>{
 const p=nav.plan({view:'personal'});assert.deepEqual(p.account,['personal','my-contacts','calendar','communities']);assert.deepEqual(p.primary,[]);assert.deepEqual(p.tools,[]);
 assert.deepEqual(nav.plan({personalReady:false}).account,['communities']);
});
test('project role labels do not turn a client membership into a global role',()=>{assert.equal(nav.roleLabel('team'),'Collaborator');assert.equal(nav.roleLabel('client'),'Client');assert.equal(nav.roleLabel('unknown'),'Participant');});
test('my next actions omit completed work and another participant assignments',()=>{
 const tasks=[{id:1,status:'open',assignee_kind:'client',assignee_user_id:'me'},{id:2,status:'open',assignee_kind:'client',assignee_user_id:'other'},{id:3,status:'completed',assignee_kind:'client',assignee_user_id:'me'},{id:4,status:'open',assignee_kind:'client',assignee_user_id:null},{id:5,status:'open',assignee_kind:'team',assignee_user_id:null}];
 assert.deepEqual(nav.myTasks(tasks,'me','client').map(t=>t.id),[1,4]);assert.deepEqual(nav.myTasks(tasks,'me','team').map(t=>t.id),[1,5]);
});
