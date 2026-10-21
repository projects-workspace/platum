(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PLATUM_NAVIGATION=api;})(typeof window==='undefined'?globalThis:window,()=>{
 'use strict';
 const modules=['home','work','calendar','learning','inspiration','reports','context','materials','forms','files','updates'];
 const routeModule={contact:'contacts','my-contact':'my-contacts','personal-event':'calendar','community':'communities','community-members':'communities','community-post':'communities','community-event':'communities',request:'work',material:'materials',form:'forms',event:'calendar',availability:'calendar',lesson:'learning','inspiration-item':'inspiration',report:'reports',milestone:'reports'};
 function plan({active,workspaces=[],view='home',canCreate=false,personalReady=true}){
  const configured=Array.isArray(active?.settings?.modules)?active.settings.modules:modules;
  const ordered=active?[...new Set(configured.filter(k=>modules.includes(k)))]:[];
  const current=routeModule[view]||view,operator=['owner','admin','team'].includes(active?.role);
  const tools=[];
  if(workspaces.some(w=>['owner','admin','team'].includes(w.role)))tools.push('team');
  if(operator)tools.push('contacts','settings','templates');
  if(['owner','admin'].includes(active?.role))tools.push('members');
  if(canCreate)tools.push('new-workspace');
  return {account:personalReady?['personal','my-contacts',...(!active||view==='personal-event'?['calendar']:[]),'communities']:['communities'],primary:ordered.slice(0,3),more:ordered.slice(3),tools,current,
   moreActive:ordered.slice(3).includes(current),toolsActive:tools.includes(view)||view==='contact'&&tools.includes('contacts')};
 }
 function roleLabel(role){return ({client:'Client',team:'Collaborator',admin:'Workspace administrator',owner:'Workspace owner'})[role]||'Participant';}
 function myTasks(tasks,user,role){return tasks.filter(t=>!['completed','cancelled'].includes(t.status)&&(t.assignee_user_id===user||!t.assignee_user_id&&t.assignee_kind===(role==='client'?'client':'team')));}
 return Object.freeze({plan,roleLabel,myTasks});
});
