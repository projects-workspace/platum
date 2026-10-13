(() => {
  'use strict';
  window.PLATUM_CALENDAR_UI = function (ui) {
    const { state, escape: esc, heading, button, field, select, check, formFoot, person, date, operator, user,
      badge, empty, paragraphs, link, edit, render, api } = ui;
    const domain = window.PLATUM_CALENDAR;
    const weekdays = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    let month = '', selectedDay = '', workspaceId = '';
    const data = () => state.data;
    const zone = () => data()?.workspace_availability?.find(a => a.user_id === user())?.timezone || state.active?.settings?.timezone || 'UTC';
    const version = event => data().calendar_versions.find(v => v.id === event.current_version_id);
    const attrs = event => 'data-id="' + event.id + '" data-version="' + event.current_version_id + '"';
    const time = (instant, timezone = zone()) => new Intl.DateTimeFormat('en', { timeZone: timezone, month:'short', day:'numeric', year:'numeric', hour:'2-digit', minute:'2-digit', timeZoneName:'short' }).format(new Date(instant));
    const zoneField = value => field('Time zone','timezone',value,{required:true,max:100,help:'Use an IANA time zone, such as Europe/Prague, Europe/Kyiv or America/New_York. Times below use this zone.'});
    function calendarView() {
      const today = domain.localTime(new Date(),zone()).slice(0,10);
      if (workspaceId !== state.active.id) { workspaceId = state.active.id; month = today.slice(0,7); selectedDay = today; }
      const events = data().calendar_events.filter(e=>!['cancelled','declined'].includes(e.status)).map(e=>({event:e,v:version(e)})).filter(x=>x.v);
      const tasks = data().tasks.filter(t=>t.due_at && !['completed','cancelled'].includes(t.status));
      const milestones = data().work_milestones.filter(m=>m.due_at&&!['completed','archived'].includes(m.status));
      const onDay = day => events.filter(x=>domain.localTime(x.v.starts_at,zone()).slice(0,10)<=day && domain.localTime(new Date(new Date(x.v.ends_at).getTime()-1),zone()).slice(0,10)>=day);
      const monthTitle = new Intl.DateTimeFormat('en',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(month+'-01T12:00:00Z'));
      return heading('Calendar','Propose a time, agree it together, and keep the shared agenda.',button('calendar-new','Propose an event','','ws-button ws-primary'))+
        '<div class="ws-calendar-toolbar"><div class="ws-actions">'+button('calendar-month','Previous month','data-delta="-1"')+'<h2 aria-live="polite">'+esc(monthTitle)+'</h2>'+button('calendar-month','Next month','data-delta="1"')+'</div><div class="ws-actions">'+button('calendar-today','Today')+button('calendar-export','Download calendar')+'</div></div>'+
        '<p class="ws-meta">Displayed in '+esc(zone())+'. '+link('availability','Set your availability and time zone')+'</p>'+
        '<div class="ws-calendar-grid" aria-label="'+esc(monthTitle)+'">'+[1,2,3,4,5,6,0].map(i=>'<div class="ws-calendar-weekday" aria-label="'+weekdays[i]+'">'+weekdays[i].slice(0,3)+'</div>').join('')+
        domain.monthDays(month).map(day=>{
          const count=onDay(day.date).length, due=tasks.filter(t=>t.due_at===day.date).length+milestones.filter(m=>m.due_at===day.date).length;
          return '<button type="button" data-action="calendar-day" data-day="'+day.date+'" class="ws-calendar-day'+(!day.inMonth?' is-outside':'')+(day.date===selectedDay?' is-selected':'')+'" aria-pressed="'+(day.date===selectedDay)+'"'+(day.date===today?' aria-current="date"':'')+' aria-label="'+esc(date(day.date)+', '+count+' events, '+due+' task or milestone dates')+'"><span>'+day.number+'</span>'+(count?'<small>'+count+' event'+(count===1?'':'s')+'</small>':'')+(due?'<small>'+due+' due</small>':'')+'</button>';
        }).join('')+'</div><section class="ws-section"><h2>'+date(selectedDay)+'</h2>'+
        (onDay(selectedDay).map(x=>eventRow(x.event)).join('')||'<p>No events on this date.</p>')+
        tasks.filter(t=>t.due_at===selectedDay).map(t=>'<article class="ws-work-row"><div><strong>'+esc(t.title)+'</strong><p>Task due · '+esc(t.status.replaceAll('_',' '))+'</p></div>'+link('work','Open work')+'</article>').join('')+
        milestones.filter(m=>m.due_at===selectedDay).map(m=>'<article class="ws-work-row"><div><strong>'+link('milestone',m.title,m.id)+'</strong><p>Milestone target · '+esc(m.status.replaceAll('_',' '))+'</p></div></article>').join('')+'</section>'+
        '<section class="ws-section"><h2>All proposals and events</h2>'+(data().calendar_events.length?data().calendar_events.slice().sort((a,b)=>(version(a)?.starts_at||'').localeCompare(version(b)?.starts_at||'')).map(eventRow).join(''):empty('Agree your first meeting','Either side can suggest a date. The other side confirms or proposes a change.'))+'</section>';
    }
    function eventRow(event) {
      const v=version(event); if(!v)return '';
      return '<article class="ws-work-row"><div><h3>'+link('event',v.title,event.id)+'</h3><p>'+esc(time(v.starts_at))+' – '+esc(time(v.ends_at))+'</p><div class="ws-meta">'+badge(event.status)+'<span>Proposed by '+esc(v.proposed_side)+' · proposal '+v.number+'</span></div></div>'+button('calendar-export','Download event',attrs(event),'ws-button ws-quiet')+'</article>';
    }
    function eventView() {
      const event=data().calendar_events.find(e=>e.id===state.detail),v=event&&version(event);
      if(!v)return heading('Event unavailable')+empty('This event is not available','Open the calendar or ask your team about access.');
      const canRespond=event.status==='proposed'&&v.proposed_side!==(operator()?'team':'client');
      const closed=['cancelled','completed'].includes(event.status);
      const responseForm=canRespond?'<form class="ws-form ws-reading" data-form="calendar-response" data-id="'+event.id+'" data-revision="'+event.revision+'" data-version="'+v.id+'">'+select('Your response','response',[['confirmed','Confirm this proposal'],['declined','Decline and explain']],'confirmed')+field('Note','note','',{multiline:true,rows:2,max:5000,help:'A note is required if you decline. Use Propose another time to suggest a different date.'})+formFoot('Send response')+'</form>':'';
      const available=data().workspace_availability.map(a=>'<li>'+person(a.user_id)+': '+esc(({within_hours:'within shared hours',outside_hours:'outside shared hours',unavailable:'marked unavailable',unknown:'no regular hours specified'})[domain.availabilityAt(a,v.starts_at,v.ends_at)])+'</li>').join('');
      return heading(v.title,'Proposal '+v.number+' · '+event.status,(!closed?button('calendar-edit','Propose another time',attrs(event)):'')+button('calendar-export','Download event',attrs(event)))+
        '<article class="ws-reading"><p class="ws-calendar-time">'+esc(time(v.starts_at))+' – '+esc(time(v.ends_at))+'</p><p class="ws-meta">Proposed in '+esc(v.timezone)+' by '+person(v.proposed_by)+'. Confirmation is on behalf of the responding side.</p>'+
        (v.location?'<h2>Location or meeting link</h2>'+paragraphs(v.location):'')+'<h2>Agenda</h2>'+paragraphs(v.agenda||'Add topics in the discussion below.')+
        (available?'<details><summary>Availability at this time</summary><p>Shared hours are guidance. Confirmation is always explicit.</p><ul>'+available+'</ul></details>':'')+
        responseForm+(!closed&&(operator()||event.created_by===user())?button('calendar-cancel-editor','Cancel event',attrs(event),'ws-button ws-quiet'):'')+
        (operator()&&event.status==='confirmed'&&new Date(v.ends_at)<=new Date()?button('calendar-complete','Mark event completed',attrs(event)):'')+
        '<section class="ws-section"><h2>Discussion and proposal history</h2>'+data().calendar_versions.filter(x=>x.event_id===event.id).sort((a,b)=>b.number-a.number).map(p=>
          '<details class="ws-calendar-history"'+(p.id===v.id?' open':'')+'><summary>Proposal '+p.number+' · '+esc(time(p.starts_at))+'</summary><p>'+esc(p.title)+' · '+person(p.proposed_by)+'</p>'+paragraphs(p.agenda)+
          data().calendar_responses.filter(r=>r.version_id===p.id).sort((a,b)=>a.created_at.localeCompare(b.created_at)).map(r=>'<article class="ws-comment"><div class="ws-meta">'+person(r.author_id)+' · '+esc(r.response)+' · '+date(r.created_at)+'</div>'+paragraphs(r.note)+'</article>').join('')+'</details>').join('')+
        '<form class="ws-form" data-form="calendar-comment" data-id="'+event.id+'" data-revision="'+event.revision+'" data-version="'+v.id+'">'+field('Add to this proposal’s discussion','note','',{multiline:true,required:true,max:5000,rows:3})+formFoot('Post comment')+'</form></section></article>';
    }
    function availabilityView() {
      return heading('Availability','Share your working rhythm with this workspace. It does not reserve or synchronize an external calendar.',button('calendar-availability','Edit my availability','','ws-button ws-primary'))+
        (data().workspace_availability.length?data().workspace_availability.map(a=>'<article class="ws-reading ws-availability-person"><h2>'+person(a.user_id)+'</h2><p>'+esc(a.timezone)+'</p>'+paragraphs(a.note)+
          '<ul>'+(a.weekly||[]).map(s=>'<li>'+weekdays[s.day]+' · '+esc(s.start)+'–'+esc(s.end)+'</li>').join('')+'</ul>'+(!(a.weekly||[]).length?'<p>No regular hours specified.</p>':'')+
          ((a.unavailable||[]).length?'<h3>Unavailable dates</h3><ul>'+a.unavailable.map(s=>'<li>'+date(s.start)+' – '+date(s.end)+' (inclusive)</li>').join('')+'</ul>':'')+'</article>').join(''):empty('Let each other know when you are available','Add working hours, travel dates, or a note about your current rhythm.'));
    }
    function weeklyRow(slot={day:1,start:'09:00',end:'17:00'}) {
      return '<fieldset data-availability-slot><legend>Weekly window</legend><div class="ws-form-grid">'+select('Day','slot-day',weekdays.map((d,i)=>[String(i),d]),String(slot.day))+field('From','slot-start',slot.start,{type:'time',required:true})+field('Until','slot-end',slot.end,{type:'time',required:true})+'</div>'+button('calendar-remove-row','Remove window','','ws-button ws-quiet')+'</fieldset>';
    }
    function unavailableRow(range={}) {
      return '<fieldset data-unavailable-range><legend>Unavailable dates</legend><div class="ws-form-grid">'+field('First day','range-start',range.start,{type:'date',required:true})+field('Last day (inclusive)','range-end',range.end,{type:'date',required:true})+'</div>'+button('calendar-remove-row','Remove dates','','ws-button ws-quiet')+'</fieldset>';
    }
    function editor(e) {
      const item=e.item||{};
      if(e.type==='calendar-event') {
        const v=item.id?version(item):null,timezone=v?.timezone||zone();
        return heading(v?'Propose another time':'Propose an event','The other side must confirm. A changed proposal replaces the current agreement and keeps its history.')+
          '<form class="ws-form ws-reading" data-form="calendar-proposal" data-id="'+(item.id||'')+'" data-revision="'+(item.revision||0)+'">'+field('Event title','title',v?.title,{required:true,max:160})+zoneField(timezone)+
          '<div class="ws-form-grid">'+field('Starts','starts',v?domain.localTime(v.starts_at,timezone):(selectedDay||domain.localTime(new Date(),timezone).slice(0,10))+'T10:00',{type:'datetime-local',required:true})+
          field('Ends','ends',v?domain.localTime(v.ends_at,timezone):(selectedDay||domain.localTime(new Date(),timezone).slice(0,10))+'T11:00',{type:'datetime-local',required:true})+'</div>'+field('Agenda','agenda',v?.agenda,{multiline:true,max:10000})+
          field('Location or meeting link','location',v?.location,{max:2000})+formFoot('Send proposal')+'</form>';
      }
      if(e.type==='calendar-availability')return heading('Your availability','Visible to everyone in this workspace. Empty weekly hours mean unspecified, not always available.')+
        '<form class="ws-form ws-reading" data-form="calendar-availability" data-revision="'+(item.revision||0)+'">'+zoneField(item.timezone||zone())+field('A note about your rhythm','note',item.note,{multiline:true,rows:3,max:2000})+
        '<h2>Regular weekly hours</h2><div data-weekly-slots>'+(item.weekly||[]).map(weeklyRow).join('')+'</div>'+button('calendar-add-slot','Add weekly window')+
        '<h2>Unavailable periods</h2><div data-unavailable-ranges>'+(item.unavailable||[]).map(unavailableRow).join('')+'</div>'+button('calendar-add-range','Add unavailable dates')+formFoot('Save shared availability')+'</form>';
      if(e.type==='calendar-cancel')return heading('Cancel event','The cancellation and your explanation remain in the shared history.')+
        '<form class="ws-form ws-reading" data-form="calendar-cancel" data-id="'+item.id+'" data-version="'+item.current_version_id+'" data-revision="'+item.revision+'">'+field('Why is this event cancelled?','note','',{required:true,multiline:true,max:5000})+formFoot('Cancel event')+'</form>';
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
        api.saveBlob(new Blob([domain.ics(events,data().calendar_versions,state.active.name)],{type:'text/calendar;charset=utf-8'}),'platum-calendar.ics');return true;
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
      return relevant.length?'<section class="ws-section"><div class="ws-section-heading"><h2>Coming up together</h2>'+link('calendar','Calendar')+'</div>'+relevant.map(eventRow).join('')+'</section>':'';
    }
    return { views:{calendar:calendarView,event:eventView,availability:availabilityView},editor,form,localAction,command,afterSave,home,
      editorTable:{'calendar-event':'calendar_events','calendar-cancel':'calendar_events','calendar-availability':'workspace_availability'} };
  };
})();
