(() => {
  'use strict';
  window.PLATUM_CALENDAR_UI = function (ui) {
    const { state, escape: esc, heading, button, field, select, check, formFoot, person, date, dateText, uiText, uiOptions, textNode, i18n, operator, user,
      badge, empty, paragraphs, link, edit, render, api } = ui;
    const domain = window.PLATUM_CALENDAR;
    const weekdays = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    let month = '', selectedDay = '', workspaceId = '';
    const data = () => state.data||{workspace_availability:[],calendar_events:[],calendar_versions:[],calendar_responses:[],tasks:[],work_milestones:[]};
    const personal=()=>state.personal||{events:[],busy:[],people:[]};
    const zone = () => data()?.workspace_availability?.find(a => a.user_id === user())?.timezone || state.active?.settings?.timezone || 'UTC';
    const version = event => data().calendar_versions.find(v => v.id === event.current_version_id);
    const attrs = event => 'data-id="' + event.id + '" data-version="' + event.current_version_id + '"';
    const time = (instant, timezone = zone()) => i18n.dateTimeMarkup(instant, timezone);
    const zoneField = value => field(uiText('Time zone'),'timezone',value,{required:true,max:100,help:uiText('Use an IANA time zone, such as Europe/Prague, Europe/Kyiv or America/New_York. Times below use this zone.')});
    const communityEntries=()=>(state.network?.community_events||[]).filter(e=>e.status==='scheduled').map(e=>{const v=(state.network.community_event_versions||[]).find(v=>v.id===e.current_version_id);return v?{...v,id:e.id,notes:v.description,community_event:true}:null;}).filter(Boolean);
    function calendarView() {
      const today = domain.localTime(new Date(),zone()).slice(0,10);
      if (workspaceId !== (state.active?.id||'personal')) { workspaceId = state.active?.id||'personal'; month = today.slice(0,7); selectedDay = today; }
      const events = data().calendar_events.filter(e=>!['cancelled','declined'].includes(e.status)).map(e=>({event:e,v:version(e)})).filter(x=>x.v);
      const personalEntries=[...personal().events.filter(e=>e.status==='active'),...personal().busy.map(e=>({...e,title:i18n.t(({free:'Free time',busy:'Busy',unavailable:'Unavailable for work'})[e.availability]),redacted:true})),...communityEntries()];
      const personalOnDay=day=>personalEntries.filter(e=>domain.localTime(e.starts_at,zone()).slice(0,10)<=day&&domain.localTime(new Date(new Date(e.ends_at).getTime()-1),zone()).slice(0,10)>=day);
      const tasks = data().tasks.filter(t=>t.due_at && !['completed','cancelled'].includes(t.status));
      const milestones = data().work_milestones.filter(m=>m.due_at&&!['completed','archived'].includes(m.status));
      const onDay = day => events.filter(x=>domain.localTime(x.v.starts_at,zone()).slice(0,10)<=day && domain.localTime(new Date(new Date(x.v.ends_at).getTime()-1),zone()).slice(0,10)>=day);
      const monthTitle = i18n.monthText(month);
      return heading(uiText('Calendar'),uiText('Propose a time, agree it together, and keep the shared agenda.'),(state.active?button('calendar-new',uiText('Propose an event'),'','ws-button ws-primary'):'')+(window.PLATUM_PERSONAL_UI?button('personal-event-new',uiText('Add calendar entry')):''))+
        '<div class="ws-calendar-toolbar"><div class="ws-actions">'+button('calendar-month',uiText('Previous month'),'data-delta="-1"')+'<h2 aria-live="polite">'+i18n.monthMarkup(month)+'</h2>'+button('calendar-month',uiText('Next month'),'data-delta="1"')+'</div><div class="ws-actions">'+button('calendar-today',uiText('Today'))+button('calendar-export',uiText('Download calendar'))+'</div></div>'+
        '<p class="ws-meta"><span data-i18n-key="Displayed in">Displayed in</span> '+esc(zone())+'. '+(state.active?link('availability',uiText('Set your availability and time zone')):i18n.mark('Add free or unavailable periods to your personal schedule.'))+'</p>'+
        '<div class="ws-calendar-grid" aria-label="'+esc(monthTitle)+'" data-i18n-month-label="'+month+'">'+[1,2,3,4,5,6,0].map(i=>'<div class="ws-calendar-weekday" aria-label="'+i18n.t(weekdays[i])+'" data-i18n-aria-label="'+weekdays[i]+'">'+i18n.weekdayMarkup(i)+'</div>').join('')+
        domain.monthDays(month).map(day=>{
          const count=onDay(day.date).length+personalOnDay(day.date).length, due=tasks.filter(t=>t.due_at===day.date).length+milestones.filter(m=>m.due_at===day.date).length;
          return '<button type="button" data-action="calendar-day" data-day="'+day.date+'" class="ws-calendar-day'+(!day.inMonth?' is-outside':'')+(day.date===selectedDay?' is-selected':'')+'" aria-pressed="'+(day.date===selectedDay)+'"'+(day.date===today?' aria-current="date"':'')+' aria-label="'+esc(i18n.t('{date}, {count} events, {due} task or milestone dates',{date:{__platumDate:day.date},count,due}))+'" data-i18n-aria-label="{date}, {count} events, {due} task or milestone dates" data-i18n-params="'+esc(JSON.stringify({date:{__platumDate:day.date},count,due}))+'"><span>'+day.number+'</span>'+(count?'<small>'+i18n.mark('{count} events','span',{count})+'</small>':'')+(due?'<small>'+i18n.mark('{count} due','span',{count:due})+'</small>':'')+'</button>';
        }).join('')+'</div><section class="ws-section"><h2>'+date(selectedDay)+'</h2>'+
        (onDay(selectedDay).map(x=>eventRow(x.event)).join('')+personalOnDay(selectedDay).map(personalRow).join('')||'<p><span data-i18n-key="No events on this date.">No events on this date.</span></p>')+
        tasks.filter(t=>t.due_at===selectedDay).map(t=>'<article class="ws-work-row"><div><strong>'+esc(t.title)+'</strong><p><span data-i18n-key="Task due">Task due</span> '+i18n.mark(t.status.replaceAll('_',' '))+'</p></div>'+link('work',uiText('Open work'))+'</article>').join('')+
        milestones.filter(m=>m.due_at===selectedDay).map(m=>'<article class="ws-work-row"><div><strong>'+link('milestone',m.title,m.id)+'</strong><p><span data-i18n-key="Milestone target">Milestone target</span> '+i18n.mark(m.status.replaceAll('_',' '))+'</p></div></article>').join('')+'</section>'+
        '<section class="ws-section"><h2><span data-i18n-key="My schedule and shared availability">My schedule and shared availability</span></h2>'+personalEntries.slice().sort((a,b)=>a.starts_at.localeCompare(b.starts_at)).map(personalRow).join('')+'</section><section class="ws-section"><h2><span data-i18n-key="All proposals and events">All proposals and events</span></h2>'+(data().calendar_events.length?data().calendar_events.slice().sort((a,b)=>(version(a)?.starts_at||'').localeCompare(version(b)?.starts_at||'')).map(eventRow).join(''):empty(uiText('Agree your first meeting'),uiText('Either side can suggest a date. The other side confirms or proposes a change.')))+'</section>';
    }
    function personalRow(e){
      const person=e.community_event?(state.network.communities.find(c=>c.id===e.community_id)?.name||i18n.t('Communities')):(personal().people.find(p=>p.user_id===e.user_id||p.user_id===e.owner_id)?.name||i18n.t('You'));
      return '<article class="ws-work-row" data-personal-calendar><div><h3>'+(e.redacted?esc(e.title):link(e.community_event?'community-event':'personal-event',e.title,e.id))+'</h3><p>'+time(e.starts_at)+' — '+time(e.ends_at)+'</p><p>'+(person==='Participant'?i18n.mark('Participant'):esc(person))+'</p>'+(e.redacted?'<p class="ws-help">'+i18n.mark('Only availability is shared; personal details stay private.')+'</p>':'')+'</div></article>';
    }
    function eventRow(event) {
      const v=version(event); if(!v)return '';
      return '<article class="ws-work-row"><div><h3>'+link('event',v.title,event.id)+'</h3><p>'+time(v.starts_at)+' – '+time(v.ends_at)+'</p><div class="ws-meta">'+badge(uiText(event.status))+'<span><span data-i18n-key="Proposed by">Proposed by</span> '+i18n.mark(v.proposed_side)+' · '+i18n.mark('proposal')+' '+v.number+'</span></div></div>'+button('calendar-export',uiText('Download event'),attrs(event),'ws-button ws-quiet')+'</article>';
    }
    function eventView() {
      const event=data().calendar_events.find(e=>e.id===state.detail),v=event&&version(event);
      if(!v)return heading(uiText('Event unavailable'))+empty(uiText('This event is not available'),uiText('Open the calendar or ask your team about access.'));
      const canRespond=event.status==='proposed'&&v.proposed_side!==(operator()?'team':'client');
      const closed=['cancelled','completed'].includes(event.status);
      const responseForm=canRespond?'<form class="ws-form ws-reading" data-form="calendar-response" data-id="'+event.id+'" data-revision="'+event.revision+'" data-version="'+v.id+'">'+select(uiText('Your response'),'response',uiOptions([['confirmed',uiText('Confirm this proposal')],['declined',uiText('Decline and explain')]]),'confirmed')+field(uiText('Note'),'note','',{multiline:true,rows:2,max:5000,help:uiText('A note is required if you decline. Use Propose another time to suggest a different date.')})+formFoot(uiText('Send response'))+'</form>':'';
      const periods=[...personal().busy,...personal().events.filter(e=>e.status==='active').map(e=>({...e,user_id:e.owner_id,availability:e.kind==='free'?'free':e.kind==='unavailable'?'unavailable':'busy'}))];
      const available=(data().people||[]).map(member=>{
        const a=data().workspace_availability.find(x=>x.user_id===member.user_id)||{timezone:zone(),weekly:[],unavailable:[]};
        const status=domain.scheduleAt(a,v.starts_at,v.ends_at,periods.filter(p=>p.user_id===member.user_id));
        return '<li>'+person(member.user_id)+': '+i18n.mark(({within_hours:'within shared hours',outside_hours:'outside shared hours',unavailable:'marked unavailable',unknown:'no regular hours specified',busy:'Busy',free:'Free time'})[status])+'</li>';
      }).join('');
      return heading(v.title,uiText('Proposal {number} · {status}',{number:v.number,status:{__platumUi:event.status}}),(!closed?button('calendar-edit',uiText('Propose another time'),attrs(event)):'')+button('calendar-export',uiText('Download event'),attrs(event)))+
        '<article class="ws-reading"><p class="ws-calendar-time">'+time(v.starts_at)+' – '+time(v.ends_at)+'</p><p class="ws-meta"><span data-i18n-key="Proposed in">Proposed in</span> '+esc(v.timezone)+' '+i18n.mark('by')+' '+person(v.proposed_by)+'. '+i18n.mark('Confirmation is on behalf of the responding side.')+'</p>'+
        (v.location?'<h2><span data-i18n-key="Location or meeting link">Location or meeting link</span></h2>'+paragraphs(v.location):'')+'<h2><span data-i18n-key="Agenda">Agenda</span></h2>'+paragraphs(v.agenda||uiText('Add topics in the discussion below.'))+
        (available?'<details><summary><span data-i18n-key="Availability at this time">Availability at this time</span></summary><p><span data-i18n-key="Shared hours are guidance. Confirmation is always explicit.">Shared hours are guidance. Confirmation is always explicit.</span></p><ul>'+available+'</ul></details>':'')+
        responseForm+(!closed&&(operator()||event.created_by===user())?button('calendar-cancel-editor',uiText('Cancel event'),attrs(event),'ws-button ws-quiet'):'')+
        (operator()&&event.status==='confirmed'&&new Date(v.ends_at)<=new Date()?button('calendar-complete',uiText('Mark event completed'),attrs(event)):'')+
        '<section class="ws-section"><h2><span data-i18n-key="Discussion and proposal history">Discussion and proposal history</span></h2>'+data().calendar_versions.filter(x=>x.event_id===event.id).sort((a,b)=>b.number-a.number).map(p=>
          '<details class="ws-calendar-history"'+(p.id===v.id?' open':'')+'><summary><span data-i18n-key="Proposal">Proposal</span> '+p.number+' · '+time(p.starts_at)+'</summary><p>'+esc(p.title)+' · '+person(p.proposed_by)+'</p>'+paragraphs(p.agenda)+
          data().calendar_responses.filter(r=>r.version_id===p.id).sort((a,b)=>a.created_at.localeCompare(b.created_at)).map(r=>'<article class="ws-comment"><div class="ws-meta">'+person(r.author_id)+' · '+i18n.mark(r.response)+' · '+date(r.created_at)+'</div>'+paragraphs(r.note)+'</article>').join('')+'</details>').join('')+
        '<form class="ws-form" data-form="calendar-comment" data-id="'+event.id+'" data-revision="'+event.revision+'" data-version="'+v.id+'">'+field(uiText('Add to this proposal’s discussion'),'note','',{multiline:true,required:true,max:5000,rows:3})+formFoot(uiText('Post comment'))+'</form></section></article>';
    }
    function availabilityView() {
      return heading(uiText('Availability'),uiText('Share your working rhythm with this workspace. It does not reserve or synchronize an external calendar.'),button('calendar-availability',uiText('Edit my availability'),'','ws-button ws-primary'))+
        (data().workspace_availability.length?data().workspace_availability.map(a=>'<article class="ws-reading ws-availability-person"><h2>'+person(a.user_id)+'</h2><p>'+esc(a.timezone)+'</p>'+paragraphs(a.note)+
          '<ul>'+(a.weekly||[]).map(s=>'<li>'+i18n.mark(weekdays[s.day])+' · '+esc(s.start)+'–'+esc(s.end)+'</li>').join('')+'</ul>'+(!(a.weekly||[]).length?'<p><span data-i18n-key="No regular hours specified.">No regular hours specified.</span></p>':'')+
          ((a.unavailable||[]).length?'<h3><span data-i18n-key="Unavailable dates">Unavailable dates</span></h3><ul>'+a.unavailable.map(s=>'<li>'+date(s.start)+' – '+date(s.end)+' '+i18n.mark('(inclusive)')+'</li>').join('')+'</ul>':'')+'</article>').join(''):empty(uiText('Let each other know when you are available'),uiText('Add working hours, travel dates, or a note about your current rhythm.')));
    }
    function weeklyRow(slot={day:1,start:'09:00',end:'17:00'}) {
      return '<fieldset data-availability-slot><legend><span data-i18n-key="Weekly window">Weekly window</span></legend><div class="ws-form-grid">'+select(uiText('Day'),'slot-day',weekdays.map((d,i)=>[String(i),uiText(d)]),String(slot.day))+field(uiText('From'),'slot-start',slot.start,{type:'time',required:true})+field(uiText('Until'),'slot-end',slot.end,{type:'time',required:true})+'</div>'+button('calendar-remove-row',uiText('Remove window'),'','ws-button ws-quiet')+'</fieldset>';
    }
    function unavailableRow(range={}) {
      return '<fieldset data-unavailable-range><legend><span data-i18n-key="Unavailable dates">Unavailable dates</span></legend><div class="ws-form-grid">'+field(uiText('First day'),'range-start',range.start,{type:'date',required:true})+field(uiText('Last day (inclusive)'),'range-end',range.end,{type:'date',required:true})+'</div>'+button('calendar-remove-row',uiText('Remove dates'),'','ws-button ws-quiet')+'</fieldset>';
    }
    function editor(e) {
      const item=e.item||{};
      if(e.type==='calendar-event') {
        const v=item.id?version(item):null,timezone=v?.timezone||zone();
        return heading(uiText(v?'Propose another time':'Propose an event'),uiText('The other side must confirm. A changed proposal replaces the current agreement and keeps its history.'))+
          '<form class="ws-form ws-reading" data-form="calendar-proposal" data-id="'+(item.id||'')+'" data-revision="'+(item.revision||0)+'">'+field(uiText('Event title'),'title',v?.title,{required:true,max:160})+zoneField(timezone)+
          '<div class="ws-form-grid">'+field(uiText('Starts'),'starts',v?domain.localTime(v.starts_at,timezone):(selectedDay||domain.localTime(new Date(),timezone).slice(0,10))+'T10:00',{type:'datetime-local',required:true})+
          field(uiText('Ends'),'ends',v?domain.localTime(v.ends_at,timezone):(selectedDay||domain.localTime(new Date(),timezone).slice(0,10))+'T11:00',{type:'datetime-local',required:true})+'</div>'+field(uiText('Agenda'),'agenda',v?.agenda,{multiline:true,max:10000})+
          field(uiText('Location or meeting link'),'location',v?.location,{max:2000})+formFoot(uiText('Send proposal'))+'</form>';
      }
      if(e.type==='calendar-availability')return heading(uiText('Your availability'),uiText('Visible to everyone in this workspace. Empty weekly hours mean unspecified, not always available.'))+
        '<form class="ws-form ws-reading" data-form="calendar-availability" data-revision="'+(item.revision||0)+'">'+zoneField(item.timezone||zone())+field(uiText('A note about your rhythm'),'note',item.note,{multiline:true,rows:3,max:2000})+
        '<h2><span data-i18n-key="Regular weekly hours">Regular weekly hours</span></h2><div data-weekly-slots>'+(item.weekly||[]).map(weeklyRow).join('')+'</div>'+button('calendar-add-slot',uiText('Add weekly window'))+
        '<h2><span data-i18n-key="Unavailable periods">Unavailable periods</span></h2><div data-unavailable-ranges>'+(item.unavailable||[]).map(unavailableRow).join('')+'</div>'+button('calendar-add-range',uiText('Add unavailable dates'))+formFoot(uiText('Save shared availability'))+'</form>';
      if(e.type==='calendar-cancel')return heading(uiText('Cancel event'),uiText('The cancellation and your explanation remain in the shared history.'))+
        '<form class="ws-form ws-reading" data-form="calendar-cancel" data-id="'+item.id+'" data-version="'+item.current_version_id+'" data-revision="'+item.revision+'">'+field(uiText('Why is this event cancelled?'),'note','',{required:true,multiline:true,max:5000})+formFoot(uiText('Cancel event'))+'</form>';
      return null;
    }
    function form(form,data,value) {
      const type=form.dataset.form,id=form.dataset.id||null,revision=Number(form.dataset.revision)||0;
      if(type==='calendar-proposal')return {action:'calendar.propose',payload:{id,revision,title:value('title'),agenda:value('agenda'),location:value('location'),timezone:value('timezone'),starts_at:domain.toInstant(value('starts'),value('timezone')),ends_at:domain.toInstant(value('ends'),value('timezone'))}};
      if(['calendar-response','calendar-comment','calendar-cancel'].includes(type))return {action:({'calendar-response':'calendar.respond','calendar-comment':'calendar.comment','calendar-cancel':'calendar.cancel'})[type],payload:{id,revision,version_id:form.dataset.version,response:value('response'),note:value('note')}};
      if(type==='calendar-availability')return {action:'availability.save',payload:{revision,timezone:value('timezone'),note:value('note'),
        weekly:[...form.querySelectorAll('[data-availability-slot]')].map(row=>({day:Number(row.querySelector('[name="slot-day"]').value),start:row.querySelector('[name="slot-start"]').value,end:row.querySelector('[name="slot-end"]').value})),
        unavailable:[...form.querySelectorAll('[data-unavailable-range]')].map(row=>({start:row.querySelector('[name="range-start"]').value,end:row.querySelector('[name="range-end"]').value}))}};
      return null;
    }
    function localAction(action,control) {
      if(action==='calendar-new'){edit('calendar-event');return true;}
      if(action==='calendar-edit'){edit('calendar-event',data().calendar_events.find(e=>e.id===control.dataset.id));return true;}
      if(action==='calendar-cancel-editor'){edit('calendar-cancel',data().calendar_events.find(e=>e.id===control.dataset.id));return true;}
      if(action==='calendar-availability'){edit('calendar-availability',data().workspace_availability.find(a=>a.user_id===user())||{});return true;}
      if(action==='calendar-month'){month=domain.shiftMonth(month,Number(control.dataset.delta));selectedDay=month+'-01';render();return true;}
      if(action==='calendar-today'){selectedDay=domain.localTime(new Date(),zone()).slice(0,10);month=selectedDay.slice(0,7);render();return true;}
      if(action==='calendar-day'){selectedDay=control.dataset.day;render();document.querySelector('[data-day="'+selectedDay+'"]')?.focus();return true;}
      if(action==='calendar-add-slot'||action==='calendar-add-range'){
        control.closest('form').querySelector(action==='calendar-add-slot'?'[data-weekly-slots]':'[data-unavailable-ranges]').insertAdjacentHTML('beforeend',action==='calendar-add-slot'?weeklyRow():unavailableRow());state.editorDirty=true;return true;
      }
      if(action==='calendar-remove-row'){control.closest('fieldset').remove();state.editorDirty=true;return true;}
      if(action==='calendar-export'){
        const events=control.dataset.id?data().calendar_events.filter(e=>e.id===control.dataset.id):data().calendar_events;
        const extra=control.dataset.id?[]:[...personal().events.filter(e=>e.status==='active'),...personal().busy.map((e,i)=>({...e,id:'busy-'+i,title:i18n.t(({free:'Free time',busy:'Busy',unavailable:'Unavailable for work'})[e.availability])})),...communityEntries()];
        const personalEvents=extra.map(e=>({id:e.id,current_version_id:e.id,revision:e.revision||1,status:'confirmed',availability:e.kind==='free'?'free':e.availability}));
        const personalVersions=extra.map(e=>({id:e.id,title:e.title,agenda:e.notes||'',location:e.location||'',starts_at:e.starts_at,ends_at:e.ends_at,timezone:e.timezone||zone(),number:e.revision||1}));
        api.saveBlob(new Blob([domain.ics([...events,...personalEvents],[...data().calendar_versions,...personalVersions],state.active?.name||'Platum')],{type:'text/calendar;charset=utf-8'}),'platum-calendar.ics');return true;
      }
      return false;
    }
    function command(action,control) {
      if(action!=='calendar-complete')return null;
      const event=data().calendar_events.find(e=>e.id===control.dataset.id);
      return {action:'calendar.complete',payload:{id:event.id,revision:event.revision,version_id:event.current_version_id,note:''}};
    }
    function afterSave(type,result) {
      if(!type.startsWith('calendar-'))return;
      state.view=type==='calendar-availability'?'availability':'event';state.detail=result.event?.id||result.id;state.version=null;
      history.replaceState({},'',location.pathname+location.search+'#'+state.view+(state.view==='event'?'/'+state.detail:''));
    }
    function home() {
      const relevant=data().calendar_events.filter(e=>['proposed','confirmed'].includes(e.status)&&new Date(version(e)?.ends_at)>new Date()).sort((a,b)=>(version(a)?.starts_at||'').localeCompare(version(b)?.starts_at||'')).slice(0,3);
      return relevant.length?'<section class="ws-section"><div class="ws-section-heading"><h2><span data-i18n-key="Coming up together">Coming up together</span></h2>'+link('calendar',uiText('Calendar'))+'</div>'+relevant.map(eventRow).join('')+'</section>':'';
    }
    return { views:{calendar:calendarView,event:eventView,availability:availabilityView},editor,form,localAction,command,afterSave,home,
      editorTable:{'calendar-event':'calendar_events','calendar-cancel':'calendar_events','calendar-availability':'workspace_availability'} };
  };
})();
