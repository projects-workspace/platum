(() => {
 'use strict';
 window.PLATUM_PERSONAL_UI=ui=>{
  const {state,escape:esc,heading,button,field,select,check,formFoot,uiText,uiOptions,i18n,user,badge,empty,paragraphs,link,edit,render}=ui;
  const data=()=>state.personal||{contacts:[],people:[],events:[],busy:[],joinable:[],applications:[]};
  const fields={name:'Name',specialisation:'Specialisation',phone:'Phone',email:'Email address',socials:'Social links',notes:'Notes'};
  const statuses={active:'Active',hidden:'Hidden',archived:'Archived'};
  const person=id=>esc(data().people.find(p=>p.user_id===id)?.name||i18n.t('Participant'));
  const contact=id=>data().contacts.find(c=>c.id===id);
  const own=c=>c.owner_id===user();
  const title=c=>c.fields.name||i18n.t('Shared contact');
  const attrs=c=>'data-id="'+esc(c.id)+'"';
  const form=(type,item={})=>'<form class="ws-form ws-reading" data-form="'+type+'" data-id="'+esc(item.id||'')+'" data-revision="'+(item.revision||0)+'">';
  const missing=()=>heading(uiText('Not available'))+empty(uiText('This record is not available'),uiText('Your access may have changed. Refresh or return to the list.'));
  const calendarKinds={private:'Private event',free:'Free time',unavailable:'Unavailable for work',shared:'Shared event'};
  function cabinet(){
   const nav=window.PLATUM_NAVIGATION;
   const workLink=(w,view,label)=>'<a href="?workspace='+esc(w.id)+'#'+view+'">'+(typeof label==='string'?i18n.mark(label):label)+'</a>';
   const tasks=state.active&&state.data?nav.myTasks(state.data.tasks||[],user(),state.active.role):[];
   return heading(uiText('My cabinet'),uiText('Your work, contacts and calendar in one place.'))+
    '<div class="ws-project-actions">'+link('my-contacts',uiText('My contacts'))+link('calendar',uiText('Calendar'))+link('communities',uiText('Communities'))+'</div>'+
    '<section class="ws-section"><h2>'+i18n.mark('Your collaborations')+'</h2>'+
    (state.workspaces.length?state.workspaces.map(w=>{
      const modules=w.settings?.modules||['home','work','calendar','materials'];
      return '<article class="ws-work-row ws-cabinet-work"><div><h3><a href="?workspace='+esc(w.id)+'#home">'+esc(w.name)+'</a></h3><p>'+i18n.mark(nav.roleLabel(w.role))+'</p>'+paragraphs(w.current_focus||w.description||'')+'</div><div class="ws-actions">'+workLink(w,'home','Open project')+['work','materials','calendar'].filter(key=>modules.includes(key)).map(key=>workLink(w,key,{work:'Work & requests',materials:'Materials',calendar:'Calendar'}[key])).join('')+'</div></article>';
    }).join(''):empty(uiText('No collaborations yet'),uiText('The team will invite you to the work that involves you.')))+
    (state.capabilities.canCreate?button('new-workspace',uiText('Create workspace'),'','ws-button ws-quiet'):'')+'</section>'+
    (state.active?'<section class="ws-section"><h2>'+i18n.mark('My next actions')+'</h2><p class="ws-help ws-cabinet-context">'+i18n.mark('From {workspace}','span',{workspace:state.active.name})+'</p>'+
      (tasks.length?tasks.slice(0,5).map(t=>'<article class="ws-work-row ws-cabinet-task"><div><h3>'+esc(t.title)+'</h3>'+(t.due_at?'<p>'+i18n.dateMarkup(t.due_at)+'</p>':'')+'</div>'+workLink(state.active,'work','Open work')+'</article>').join(''):i18n.mark('No open tasks are assigned to you in this project.'))+'</section>':'');
  }
  function contacts(){
   const rows=data().contacts;
   return heading(uiText('My contacts'),uiText('Contacts are private until you choose the people and fields to share.'),button('personal-contact-new',uiText('Add contact'),'','ws-button ws-primary'))+
    '<div class="ws-actions">'+button('personal-share-book',uiText('Share all current contacts'))+button('personal-export',uiText('Export my contact book'))+'</div>'+
    field(uiText('Find a contact'),'personal_search','',{max:160})+
    ['own','shared'].map(group=>'<section class="ws-section"><h2>'+i18n.mark(group==='own'?'My contact book':'Shared with me')+'</h2>'+rows.filter(c=>own(c)===(group==='own')).map(c=>'<article class="ws-work-row" data-personal-search="'+esc(Object.values(c.fields).join(' ').toLocaleLowerCase())+'"><div><h3>'+link('my-contact',title(c),c.id)+'</h3>'+paragraphs(c.fields.specialisation||'')+badge(uiText(statuses[c.status]))+(own(c)?badge(uiText(c.status==='active'&&c.grants.length?'Selective sharing':'Private')):'')+'</div></article>').join('')+'</section>').join('');
  }
  function contactView(){
   const c=contact(state.detail);if(!c)return missing();
   const details=Object.entries(fields).filter(([key])=>key!=='name'&&c.fields[key]);
   return '<p>'+link('my-contacts',uiText('My contacts'))+'</p>'+heading(title(c),'',c.editable_fields.length?button('personal-contact-edit',uiText('Edit'),attrs(c)):'')+
    (details.length?'<article class="ws-reading"><dl class="ws-personal-fields">'+details.map(([key,label])=>'<dt>'+i18n.mark(label)+'</dt><dd>'+paragraphs(c.fields[key])+'</dd>').join('')+'</dl></article>':'')+
    (own(c)?'<section class="ws-section"><h2>'+i18n.mark('Sharing permissions')+'</h2><p class="ws-help">'+i18n.mark('Hidden and archived contacts are not shared. New contacts remain private.')+'</p>'+button('personal-contact-share',uiText('Share selected fields'),attrs(c))+
     c.grants.map(g=>'<article class="ws-work-row"><div><h3>'+(g.recipient_id?person(g.recipient_id):esc(state.workspaces.find(w=>w.id===g.workspace_id)?.name||i18n.t('Agency cooperation')))+'</h3><p>'+g.fields.map(k=>i18n.mark(fields[k])).join(', ')+' · '+i18n.mark(g.can_edit?'Can edit shared fields':'Can read shared fields')+'</p></div>'+button('personal-contact-revoke',uiText('Revoke sharing'),'data-id="'+g.id+'" data-revision="'+g.revision+'"')+'</article>').join('')+'</section>':'');
  }
  function eventView(){const e=data().events.find(e=>e.id===state.detail);if(!e)return missing();
   return '<p>'+link('calendar',uiText('Calendar'))+'</p>'+heading(e.title,uiText(calendarKinds[e.kind]),e.owner_id===user()?button('personal-event-edit',uiText('Edit'),attrs(e)):'')+
   '<article class="ws-reading"><p>'+i18n.dateTimeMarkup(e.starts_at,e.timezone)+' — '+i18n.dateTimeMarkup(e.ends_at,e.timezone)+'</p>'+paragraphs(e.notes)+paragraphs(e.location)+
   (e.kind==='private'?'<p class="ws-help">'+i18n.mark('Collaborators see only busy time, never this title or these details.')+'</p>':'')+'</article>';}
  function editor(e){
   const item=e.item||{};
   if(e.type==='personal-contact'){
    const keys=item.id?item.editable_fields:Object.keys(fields);
    return heading(uiText(item.id?'Edit contact':'Add contact'),uiText('Only explicitly shared fields can be edited by another person.'))+form(e.type,item)+
     keys.map(key=>field(uiText(fields[key]),key,item.fields?.[key]||'',{required:key==='name',max:key==='notes'?10000:key==='name'?160:2000,multiline:['notes','socials'].includes(key)})).join('')+
     (!item.id||own(item)?select(uiText('Status'),'status',uiOptions(Object.entries(statuses).map(([key,label])=>[key,uiText(label)])),item.status||'active'):'')+formFoot()+'</form>';
   }
   if(e.type==='personal-share'){
    const choices=[...state.workspaces.map(w=>['agency:'+w.id,uiText('Agency in {workspace}',{workspace:w.name})]),...data().people.map(p=>['user:'+p.user_id,p.name])];
    if(!choices.length)return heading(uiText('Sharing permissions'))+empty(uiText('No sharing audience yet'),uiText('Sharing requires an existing cooperation or visible community participant.'))+button('cancel-editor',uiText('Cancel'));
    return heading(uiText(item.id?'Share selected fields':'Share all current contacts'),uiText('Choose an audience and fields. Other fields remain private. New contacts are not included automatically.'))+form(e.type,item)+
     select(uiText('Share with'),'audience',[['',uiText('Choose an audience')],...choices],'','required')+'<fieldset><legend>'+i18n.mark('Visible fields')+'</legend>'+Object.entries(fields).map(([key,label])=>check(uiText(label),'visible:'+key,['name','specialisation'].includes(key))).join('')+'</fieldset>'+
     check(uiText('Allow editing of these shared fields'),'can_edit',false)+formFoot(uiText('Share selected fields'))+'</form>';
   }
   if(e.type==='personal-event'){
    const zone=item.timezone||Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
    return heading(uiText(item.id?'Edit calendar entry':'Add calendar entry'),uiText('Private entries expose only busy time to your current collaborators.'))+form(e.type,item)+
     select(uiText('Visibility and availability'),'kind',uiOptions(Object.entries(calendarKinds).map(([key,label])=>[key,uiText(label)])),item.kind||'private')+field(uiText('Event title'),'title',item.title,{required:true,max:160})+
     field(uiText('Time zone'),'timezone',zone,{required:true,max:100})+'<div class="ws-form-grid">'+field(uiText('Starts'),'starts',item.starts_at?window.PLATUM_CALENDAR.localTime(item.starts_at,zone):'',{required:true,type:'datetime-local'})+field(uiText('Ends'),'ends',item.ends_at?window.PLATUM_CALENDAR.localTime(item.ends_at,zone):'',{required:true,type:'datetime-local'})+'</div>'+
     field(uiText('Personal details'),'notes',item.notes,{multiline:true,max:10000})+field(uiText('Location or meeting link'),'location',item.location,{max:2000})+
     '<fieldset><legend>'+i18n.mark('Participants for shared events only')+'</legend>'+data().people.filter(p=>p.coworker).map(p=>check(p.name,'participant:'+p.user_id,(item.participants||[]).includes(p.user_id))).join('')+'</fieldset>'+
     select(uiText('Status'),'status',uiOptions([['active',uiText('Active')],['archived',uiText('Archived')]]),item.status||'active')+formFoot()+'</form>';
   }
   if(e.type==='personal-application')return heading(uiText('Request community access'))+form(e.type,item)+field(uiText('Why would you like to join?'),'message','',{multiline:true,max:3000})+formFoot(uiText('Send request'))+'</form>';
   return null;
  }
  function formValue(node,values,value){
   const type=node.dataset.form,id=node.dataset.id||null,revision=Number(node.dataset.revision)||0;
   const command=(action,payload)=>({network:true,personal:true,scope:null,action,payload});
   if(type==='personal-contact'){
    const c=contact(id),keys=c?c.editable_fields:Object.keys(fields),payload={id,revision,fields:Object.fromEntries(keys.map(k=>[k,value(k)]))};
    if(!c||own(c))payload.status=value('status');return command('contact.save',payload);
   }
   if(type==='personal-share'){
    const selected=[...values.keys()].filter(k=>k.startsWith('visible:')).map(k=>k.slice(8));if(!selected.length)throw new Error(i18n.t('Choose at least one field to share.'));
    const [kind,target]=value('audience').split(':');return command(id?'contact.share':'contact.share-book',{id,revision,[kind==='agency'?'workspace_id':'recipient_id']:target,fields:selected,can_edit:values.has('can_edit')});
   }
   if(type==='personal-event'){
    const participants=value('kind')==='shared'?[...values.keys()].filter(k=>k.startsWith('participant:')).map(k=>k.slice(12)):[];
    if(value('kind')==='shared'&&!participants.length)throw new Error(i18n.t('Choose participants for the shared event.'));
    return command('event.save',{id,revision,kind:value('kind'),title:value('title'),notes:value('notes'),location:value('location'),timezone:value('timezone'),starts_at:window.PLATUM_CALENDAR.toInstant(value('starts'),value('timezone')),ends_at:window.PLATUM_CALENDAR.toInstant(value('ends'),value('timezone')),status:value('status'),participants});
   }
   if(type==='personal-application')return command('application.create',{community_id:id,message:value('message')});
   return null;
  }
  function localAction(action,control){const id=control.dataset.id;
   const actions={
    'personal-contact-new':()=>edit('personal-contact'),
    'personal-contact-edit':()=>edit('personal-contact',contact(id)),
    'personal-contact-share':()=>edit('personal-share',contact(id)),
    'personal-share-book':()=>edit('personal-share'),
    'personal-event-new':()=>edit('personal-event'),
    'personal-event-edit':()=>edit('personal-event',data().events.find(e=>e.id===id)),
    'personal-apply':()=>edit('personal-application',{id}),
    'personal-export':()=>ui.api.saveBlob(new Blob([JSON.stringify({format:'platum.personal-contacts.v1',contacts:data().contacts.filter(own)},null,2)],{type:'application/json'}),'platum-personal-contacts.json')
   };if(!actions[action])return false;actions[action]();return true;
  }
  function command(action,control){if(!['personal-contact-revoke','personal-application-withdraw'].includes(action))return null;
   return {network:true,personal:true,scope:null,action:action==='personal-contact-revoke'?'contact.revoke':'application.withdraw',payload:{id:control.dataset.id,revision:Number(control.dataset.revision)}};
  }
  function afterSave(type,result){if(!type.startsWith('personal-'))return;
   state.view=type==='personal-event'?'personal-event':type==='personal-application'?'communities':result.id?'my-contact':'my-contacts';state.detail=type==='personal-application'?null:result.id||null;state.editor=null;
   history.replaceState({},'',location.pathname+location.search+'#'+state.view+(state.detail?'/'+state.detail:''));
  }
  function input(node){if(node.name!=='personal_search')return;for(const row of document.querySelectorAll('[data-personal-search]'))row.hidden=!row.dataset.personalSearch.includes(node.value.toLocaleLowerCase());}
  return {views:{personal:cabinet,'my-contacts':contacts,'my-contact':contactView,'personal-event':eventView},editor,form:formValue,localAction,command,afterSave,input,
   isGlobalView:view=>['personal','my-contacts','my-contact','personal-event'].includes(view)||view==='calendar'&&!state.active,
   editorTable:{'personal-contact':'contacts','personal-event':'events'},reloadEditor:e=>e.type==='personal-contact'?contact(e.item.id):e.type==='personal-event'?data().events.find(x=>x.id===e.item.id):null};
 };
})();
