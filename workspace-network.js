(() => {
  'use strict';
  window.PLATUM_NETWORK_UI = ui => {
    const {state,escape:esc,heading,button,field,select,check,formFoot,person,date,uiText,uiOptions,textNode,i18n,operator,user,badge,empty,paragraphs,link,external,edit,render}=ui;
    const domain=window.PLATUM_CALENDAR;
    const data=()=>state.data||{};
    const network=()=>state.network||{};
    const list=name=>network()[name]||[];
    const categoryNames={client:'Client',team:'Team member',freelancer:'Freelancer',partner:'Partner',prospect:'Prospect',community:'Community member',other:'Other'};
    const kinds={announcement:'Announcement',resource:'Resource',help:'Voluntary help request'};
    const statuses={active:'Active',archived:'Archived',draft:'Internal draft',published:'Published',scheduled:'Scheduled',cancelled:'Cancelled',pending:'Pending',accepted:'Accepted',revoked:'Revoked',approved:'Approved',rejected:'Rejected'};
    const label=value=>uiText(statuses[value]||categoryNames[value]||kinds[value]||value);
    const myMembership=c=>list('community_members').find(m=>m.community_id===c&&m.user_id===user()&&m.status==='active');
    const manager=c=>['founder','platform_admin'].includes(state.capabilities.platformRole)||myMembership(c)?.role==='manager';
    const community=c=>list('communities').find(x=>x.id===c);
    const memberName=(c,id)=>{
      const m=list('community_members').find(x=>x.community_id===c&&x.user_id===id&&x.profile_visible&&x.status==='active');
      return m?esc(m.display_name):i18n.mark(id===user()?'You':'Community member');
    };
    const unavailable=()=>heading(uiText('Not available'))+empty(uiText('This record is not available'),uiText('Your access may have changed. Refresh or return to the list.'));
    const formOpen=(type,item={},c='')=>'<form class="ws-form ws-reading" data-form="'+type+'" data-id="'+esc(item.id||'')+'" data-revision="'+(item.revision||0)+'" data-community="'+esc(c)+'">';
    const navBack=c=>'<p>'+link('community',uiText('Back to community'),c)+'</p>';
    let showArchived=false;
    function contactsView(){
      if(!operator())return unavailable();
      const contacts=(data().workspace_contacts||[]).filter(c=>showArchived||c.status!=='archived');
      return heading(uiText('Contact network'),uiText('Private team contacts for this workspace. Adding a contact does not invite them.'),button('network-contact-new',uiText('Add contact'),'','ws-button ws-primary'))+
        '<div class="ws-network-toolbar">'+field(uiText('Find a contact'),'contact_search','',{max:160})+button('network-contact-archive-toggle',uiText(showArchived?'Hide archived contacts':'Show archived contacts'),'','ws-button ws-quiet')+'</div>'+
        '<div data-contact-list>'+contacts.map(c=>'<article class="ws-work-row" data-contact-search-text="'+esc([c.name,c.organisation,c.role_title,...c.categories].join(' ').toLowerCase())+'"><div><h2>'+link('contact',c.name,c.id)+'</h2><p>'+esc([c.organisation,c.role_title].filter(Boolean).join(' · '))+'</p><div class="ws-meta">'+c.categories.map(k=>badge(label(k))).join('')+(c.status==='archived'?badge(label(c.status)):'')+(c.follow_up_on?date(c.follow_up_on):'')+'</div>'+ (c.next_action?'<p>'+esc(c.next_action)+'</p>':'')+'</div><div class="ws-row-actions">'+button('network-contact-edit',uiText('Edit'),'data-id="'+c.id+'"','ws-button ws-quiet')+'</div></article>').join('')+'</div>'+
        (contacts.length?'':empty(uiText('Keep the relationship in context'),uiText('Add a contact, record how you know them, and agree the next action.')));
    }
    function contactView(){
      if(!operator())return unavailable();
      const c=(data().workspace_contacts||[]).find(x=>x.id===state.detail);if(!c)return unavailable();
      const history=(data().contact_interactions||[]).filter(x=>x.contact_id===c.id).sort((a,b)=>b.created_at.localeCompare(a.created_at));
      const task=(data().tasks||[]).find(t=>t.id===c.task_id);
      return '<p>'+link('contacts',uiText('Back to contacts'))+'</p>'+heading(c.name,[c.organisation,c.role_title].filter(Boolean).join(' · '),button('network-contact-edit',uiText('Edit contact'),'data-id="'+c.id+'"'))+
        '<article class="ws-reading"><div class="ws-meta">'+c.categories.map(k=>badge(label(k))).join('')+badge(uiText('Team only'))+badge(label(c.status))+'</div>'+paragraphs(c.context)+
        (c.email?'<p>'+esc(c.email)+'</p>':'')+(c.phone?'<p>'+esc(c.phone)+'</p>':'')+(c.url?'<p>'+external(c.url,uiText('Contact link'))+'</p>':'')+
        '<h2>'+i18n.mark('Next action')+'</h2>'+paragraphs(c.next_action||uiText('No next action recorded.'))+(c.follow_up_on?'<p>'+date(c.follow_up_on)+'</p>':'')+
        (c.owner_id?'<p>'+i18n.mark('Responsible person')+': '+person(c.owner_id)+'</p>':'')+(c.linked_user_id?'<p>'+i18n.mark('Linked workspace member')+': '+person(c.linked_user_id)+'</p>':'')+
        (task?'<p>'+link('work',task.title)+'</p>':'')+'</article><section class="ws-section"><h2>'+i18n.mark('Relationship history')+'</h2>'+
        history.map(n=>'<article class="ws-comment"><p class="ws-meta">'+person(n.author_id)+' · '+date(n.happened_on)+' · '+i18n.mark(n.kind==='note'?'Note':n.kind==='message'?'Message':n.kind==='meeting'?'Meeting':n.kind==='introduction'?'Introduction':'Follow-up')+'</p>'+paragraphs(n.body)+'</article>').join('')+'</section>'+
        (c.status==='active'?formOpen('network-contact-note',{id:c.id})+select(uiText('Interaction type'),'kind',uiOptions([['note',uiText('Note')],['message',uiText('Message')],['meeting',uiText('Meeting')],['introduction',uiText('Introduction')],['follow_up',uiText('Follow-up')]]),'note')+field(uiText('What happened'),'body','',{required:true,multiline:true,max:10000})+field(uiText('Date'),'happened_on',new Date().toISOString().slice(0,10),{type:'date',required:true})+formFoot(uiText('Add to history'))+'</form>':'');
    }
    function communitiesView(){
      const spaces=list('communities');
      return heading(uiText('Communities'),uiText('Invited professional circles, separate from client workspaces.'),['founder','platform_admin'].includes(state.capabilities.platformRole)?button('network-community-new',uiText('Create community'),'','ws-button ws-primary'):'')+
        (spaces.length?spaces.map(c=>'<article class="ws-work-row"><div><h2>'+link('community',c.name,c.id)+'</h2>'+paragraphs(c.description)+'<div class="ws-meta">'+badge(label(c.status))+(manager(c.id)?badge(uiText('Community manager')):'')+'</div></div></article>').join(''):empty(uiText('No community access yet'),uiText('An invitation grants access only to its community. Client workspaces remain separate.')));
    }
    function communityView(){
      const c=community(state.detail);if(!c)return unavailable();
      const writable=c.status==='active',membership=myMembership(c.id),posts=list('community_posts').filter(p=>p.community_id===c.id&&p.status!=='archived'),events=list('community_events').filter(e=>e.community_id===c.id);
      const members=list('community_members').filter(m=>m.community_id===c.id&&m.status==='active'&&m.profile_visible);
      return '<p>'+link('communities',uiText('All communities'))+'</p><div class="ws-network-heading">'+heading(c.name,c.description,(manager(c.id)?button('network-community-edit',uiText('Community settings'),'data-id="'+c.id+'"')+link('community-members',uiText('Manage community access'),c.id):'')+
        (membership&&writable?button('network-profile',uiText('My community profile'),'data-community="'+c.id+'"'):'')+(writable&&manager(c.id)?button('network-post-new',uiText('Publish an update or request'),'data-community="'+c.id+'"','ws-button ws-primary'):''))+'</div>'+
        '<section class="ws-section"><div class="ws-section-heading"><h2>'+i18n.mark('Resources and requests')+'</h2></div>'+(posts.length?posts.map(p=>'<article class="ws-work-row"><div><div class="ws-meta">'+badge(label(p.kind))+badge(label(p.status))+'</div><h3>'+link('community-post',p.title,p.id)+'</h3><p>'+memberName(c.id,p.author_id)+'</p></div></article>').join(''):empty(uiText('No updates yet'),uiText('The agency shares materials, opportunities and voluntary requests here.')))+'</section>'+
        '<section class="ws-section"><div class="ws-section-heading"><h2>'+i18n.mark('Community events')+'</h2>'+(manager(c.id)&&writable?button('network-event-new',uiText('Create event'),'data-community="'+c.id+'"'):'')+'</div>'+(events.length?events.map(e=>{const v=list('community_event_versions').find(x=>x.id===e.current_version_id);return v?'<article class="ws-work-row"><div><h3>'+link('community-event',v.title,e.id)+'</h3><p>'+i18n.dateTimeMarkup(v.starts_at,v.timezone)+' · '+esc(v.timezone)+'</p>'+badge(label(e.status))+'</div></article>':'';}).join(''):empty(uiText('Meet around shared interests'),uiText('A community manager can arrange an event. Each participant chooses their response.')))+'</section>'+
        '<section class="ws-section"><h2>'+i18n.mark('Member directory')+'</h2><p class="ws-help">'+i18n.mark('Only members who choose to appear are shown here.')+'</p>'+
        (members.length?members.map(m=>'<article class="ws-work-row"><div><h3>'+esc(m.display_name)+'</h3>'+paragraphs(m.bio)+(m.skills?'<p>'+esc(m.skills)+'</p>':'')+(m.url?'<p>'+external(m.url,uiText('Profile link'))+'</p>':'')+'</div></article>').join(''):empty(uiText('Introduce yourself when ready'),uiText('Your profile is hidden until you choose to show it in the directory.')))+'</section>'+
        '<section class="ws-section">'+(writable?button('network-referral-new',uiText('Suggest a participant'),'data-community="'+c.id+'"','ws-button ws-quiet'):'')+(membership?.role==='member'?button('network-community-leave',uiText('Leave community'),'data-community="'+c.id+'"','ws-button ws-quiet'):'')+'</section>';
    }
    function postView(){
      const p=list('community_posts').find(x=>x.id===state.detail);if(!p||!community(p.community_id))return unavailable();
      const comments=list('community_comments').filter(x=>x.post_id===p.id).sort((a,b)=>a.created_at.localeCompare(b.created_at));
      return navBack(p.community_id)+heading(p.title,'',(manager(p.community_id)&&community(p.community_id).status==='active')?button('network-post-edit',uiText('Edit'),'data-id="'+p.id+'"'):'')+
        '<article class="ws-reading"><p class="ws-meta">'+badge(label(p.kind))+badge(label(p.status))+' '+memberName(p.community_id,p.author_id)+'</p>'+paragraphs(p.body)+(p.url?'<p>'+external(p.url,uiText('Open resource'))+'</p>':'')+'</article>'+participationView(p)+'<section class="ws-section"><h2>'+i18n.mark('Discussion')+'</h2>'+
        comments.map(c=>'<article class="ws-comment"><p class="ws-meta">'+memberName(p.community_id,c.author_id)+' · '+date(c.created_at)+'</p>'+paragraphs(c.body)+(c.post_revision!==p.revision?'<details><summary>'+i18n.mark('Resource when this comment was posted')+'</summary><h3>'+esc(c.context_snapshot.title)+'</h3>'+paragraphs(c.context_snapshot.body)+'</details>':'')+'</article>').join('')+'</section>'+
        (p.status==='published'&&community(p.community_id).status==='active'?formOpen('network-comment',p,p.community_id)+field(uiText('Comment'),'body','',{required:true,multiline:true,max:10000})+formFoot(uiText('Add comment'))+'</form>':'');
    }
    function participationView(p){
      if(p.kind!=='help')return '';
      const responses=list('community_participations').filter(r=>r.post_id===p.id);
      const current=responses.filter(r=>r.post_revision===p.revision),mine=current.find(r=>r.user_id===user());
      const earlier=responses.filter(r=>r.post_revision!==p.revision).sort((a,b)=>b.post_revision-a.post_revision);
      const responseLabels={participating:'Taking part',completed:'Reported complete',withdrawn:'Participation withdrawn'};
      const ownEarlier=earlier.filter(r=>r.user_id===user());
      const attrs='data-id="'+esc(p.id)+'" data-community="'+esc(p.community_id)+'" data-post-revision="'+p.revision+'" data-response-revision="'+(mine?.revision||0)+'"';
      const writable=p.status==='published'&&community(p.community_id).status==='active'&&myMembership(p.community_id);
      const controls=writable?'<div class="ws-actions">'+[['participating',"I'll take part"],['completed','Report completion'],...(mine?[['withdrawn','Withdraw participation']]:[])].map(([status,title])=>button('network-participation',uiText(title),attrs+' data-status="'+status+'" aria-pressed="'+(mine?.status===status)+'"')).join('')+'</div>':'';
      const summary=manager(p.community_id)?'<div data-participation-summary><h3>'+i18n.mark('Participation summary')+'</h3><p class="ws-meta">'+Object.keys(responseLabels).map(status=>'<span data-participation-count="'+status+'">'+i18n.mark(responseLabels[status])+': '+current.filter(r=>r.status===status).length+'</span>').join('')+'</p>'+current.map(r=>'<p>'+memberName(p.community_id,r.user_id)+' · '+i18n.mark(responseLabels[r.status])+'</p>').join('')+(earlier.length?'<details><summary>'+i18n.mark('Earlier request responses')+'</summary>'+earlier.map(r=>'<p>'+esc(r.context_snapshot.title)+' · '+memberName(p.community_id,r.user_id)+' · '+i18n.mark(responseLabels[r.status])+'</p>').join('')+'</details>':'')+'</div>':'';
      return '<section class="ws-section" data-participation data-i18n-aria-label="Voluntary participation" aria-label="'+esc(i18n.t('Voluntary participation'))+'"><h2>'+i18n.mark('Voluntary participation')+'</h2><p class="ws-help">'+i18n.mark('Taking part is optional. Completion is reported by the participant and is not independently verified.')+'</p><p role="status">'+(mine?i18n.mark(responseLabels[mine.status]):i18n.mark('You have not responded to this request.'))+'</p>'+
        (!mine&&ownEarlier.length?'<p class="ws-help">'+i18n.mark('This request changed. Choose a response for this version.')+'</p>':'')+controls+
        '<p class="ws-help">'+i18n.mark('Your response is visible to you and community managers.')+'</p>'+summary+'</section>';
    }
    function eventView(){
      const e=list('community_events').find(x=>x.id===state.detail),v=list('community_event_versions').find(x=>x.id===e?.current_version_id);if(!e||!v)return unavailable();
      const rsvps=list('community_rsvps').filter(r=>r.version_id===v.id),mine=rsvps.find(r=>r.user_id===user());
      return navBack(e.community_id)+heading(v.title,'',manager(e.community_id)?button('network-event-edit',uiText('Edit event'),'data-id="'+e.id+'"'):'')+
        '<article class="ws-reading">'+badge(label(e.status))+'<p>'+i18n.dateTimeMarkup(v.starts_at,v.timezone)+' — '+i18n.dateTimeMarkup(v.ends_at,v.timezone)+' · '+esc(v.timezone)+'</p>'+paragraphs(v.description)+paragraphs(v.location)+
        '<h2>'+i18n.mark('Your attendance')+'</h2><p>'+i18n.mark(mine?({yes:'Going',maybe:'Maybe',no:'Not going'}[mine.response]):'No response yet')+'</p>'+
        (e.status==='scheduled'?'<div class="ws-actions">'+[['yes','Going'],['maybe','Maybe'],['no','Not going']].map(([response,title])=>button('network-rsvp',uiText(title),'data-id="'+e.id+'" data-community="'+e.community_id+'" data-version="'+v.id+'" data-response="'+response+'" aria-pressed="'+(mine?.response===response)+'"')).join(''):'')+
        '<p class="ws-help">'+i18n.mark('A new event time needs a new attendance response. Earlier responses stay in history.')+'</p><h2>'+i18n.mark('Responses')+'</h2>'+rsvps.map(r=>'<p>'+memberName(e.community_id,r.user_id)+' · '+i18n.mark({yes:'Going',maybe:'Maybe',no:'Not going'}[r.response])+'</p>').join('')+
        '<details><summary>'+i18n.mark('Event history')+'</summary>'+list('community_event_versions').filter(x=>x.event_id===e.id).sort((a,b)=>b.number-a.number).map(p=>'<section><h3>'+esc(p.title)+' · '+p.number+'</h3><p>'+i18n.dateTimeMarkup(p.starts_at,p.timezone)+'</p>'+list('community_rsvps').filter(r=>r.version_id===p.id).map(r=>'<p>'+memberName(e.community_id,r.user_id)+' · '+i18n.mark({yes:'Going',maybe:'Maybe',no:'Not going'}[r.response])+'</p>').join('')+'</section>').join('')+'</details></article>';
    }
    function membersView(){
      const c=community(state.detail);if(!c||!manager(c.id))return unavailable();
      const attrs='data-community="'+c.id+'"';
      return navBack(c.id)+heading(uiText('Community access'),c.name,button('network-invite-new',uiText('Invite participant'),attrs,'ws-button ws-primary'))+
        '<p class="ws-help">'+i18n.mark('Community access does not grant access to client workspaces.')+'</p><section class="ws-section"><h2>'+i18n.mark('Members')+'</h2>'+
        list('community_members').filter(m=>m.community_id===c.id).map(m=>'<article class="ws-work-row"><div><h3>'+esc(m.display_name)+'</h3>'+badge(uiText(m.role==='manager'?'Community manager':'Community member'))+badge(label(m.status))+'</div>'+(m.role==='member'&&m.status==='active'?button('network-revoke-member',uiText('Remove access'),attrs+' data-id="'+m.user_id+'"','ws-button ws-quiet'):'')+'</article>').join('')+'</section><section class="ws-section"><h2>'+i18n.mark('Invitations')+'</h2>'+
        list('community_invitations').filter(i=>i.community_id===c.id).map(i=>'<article class="ws-work-row"><div><h3>'+esc(i.email)+'</h3><div class="ws-meta">'+badge(label(i.status))+badge(uiText({pending:'Pending',sent:'Sent',failed:'Failed',uncertain:'Uncertain'}[i.mail_status]))+date(i.expires_at)+'</div></div>'+(i.status==='pending'?'<div class="ws-row-actions">'+button('network-resend-invite',uiText('Resend'),attrs+' data-id="'+i.id+'"')+button('network-revoke-invite',uiText('Revoke'),attrs+' data-id="'+i.id+'"','ws-button ws-quiet')+'</div>':'')+'</article>').join('')+'</section><section class="ws-section"><h2>'+i18n.mark('Participant suggestions')+'</h2>'+
        list('community_referrals').filter(r=>r.community_id===c.id).map(r=>'<article class="ws-work-row"><div><h3>'+esc(r.name)+'</h3><p>'+esc(r.email)+'</p>'+paragraphs(r.reason)+badge(label(r.status))+'</div>'+(r.status==='pending'?'<div class="ws-row-actions">'+button('network-referral-invite',uiText('Review invitation'),attrs+' data-id="'+r.id+'"')+button('network-reject-referral',uiText('Decline suggestion'),attrs+' data-id="'+r.id+'"','ws-button ws-quiet')+'</div>':'')+'</article>').join('')+'</section>';
    }
    function editor(e){
      const item=e.item||{},c=item.community_id||'',id=item.id;
      if(e.type==='network-contact')return heading(uiText(id?'Edit contact':'Add contact'),uiText('Contact details and history are visible only to this workspace team.'))+formOpen('network-contact',item)+
        '<div class="ws-form-grid">'+field(uiText('Name'),'name',item.name,{required:true,max:160})+field(uiText('Organisation'),'organisation',item.organisation,{max:160})+field(uiText('Role or profession'),'role_title',item.role_title,{max:160})+field(uiText('Email address'),'email',item.email,{type:'email',max:254})+field(uiText('Phone'),'phone',item.phone,{max:80})+field(uiText('Contact link'),'url',item.url,{type:'url',max:2000})+'</div><fieldset><legend>'+i18n.mark('Relationships')+'</legend><div class="ws-network-categories">'+Object.entries(categoryNames).map(([k,v])=>check(uiText(v),'category:'+k,(item.categories||[]).includes(k))).join('')+'</div></fieldset>'+field(uiText('Relationship context'),'context',item.context,{multiline:true,max:10000})+field(uiText('Next action'),'next_action',item.next_action,{multiline:true,max:3000})+
        '<div class="ws-form-grid">'+field(uiText('Follow-up date'),'follow_up_on',item.follow_up_on,{type:'date'})+select(uiText('Responsible person'),'owner_id',uiOptions([['',uiText('Not assigned')],...(data().people||[]).filter(p=>['owner','admin','team'].includes(p.role)).map(p=>[p.user_id,p.name])]),item.owner_id||'')+
        select(uiText('Linked workspace member'),'linked_user_id',uiOptions([['',uiText('No account linked')],...(data().people||[]).map(p=>[p.user_id,p.name])]),item.linked_user_id||'')+select(uiText('Related task'),'task_id',uiOptions([['',uiText('No task linked')],...(data().tasks||[]).map(t=>[t.id,t.title])]),item.task_id||'')+select(uiText('Status'),'status',uiOptions([['active',uiText('Active')],['archived',uiText('Archived')]]),item.status||'active')+'</div><p class="ws-help">'+i18n.mark('Linking an account never changes its permissions.')+'</p>'+formFoot()+'</form>';
      if(e.type==='network-community')return heading(uiText(id?'Community settings':'Create community'),uiText('Start a separate invited circle. No one is enrolled automatically.'))+formOpen('network-community',item,id||'')+field(uiText('Community name'),'name',item.name,{required:true,max:120})+field(uiText('Purpose and description'),'description',item.description,{multiline:true,max:5000})+(id?select(uiText('Status'),'status',uiOptions([['active',uiText('Active')],['archived',uiText('Archived')]]),item.status):'')+formFoot()+'</form>';
      if(e.type==='network-profile')return heading(uiText('My community profile'),uiText('Choose what to share with members of this community.'))+formOpen('network-profile',item,c)+field(uiText('Display name'),'display_name',item.display_name,{required:true,max:120})+field(uiText('Introduction'),'bio',item.bio,{multiline:true,max:3000})+field(uiText('Skills and interests'),'skills',item.skills,{max:1000})+field(uiText('Profile link'),'url',item.url,{type:'url',max:2000})+check(uiText('Show my profile in the member directory'),'profile_visible',item.profile_visible)+formFoot()+'</form>';
      if(e.type==='network-post'&&(!manager(c)||community(c)?.status!=='active'))return unavailable();
      if(e.type==='network-post')return heading(uiText(id?'Edit resource or request':'Publish an update or request'))+formOpen('network-post',item,c)+select(uiText('Type'),'kind',uiOptions([['resource',uiText('Resource')],['help',uiText('Voluntary help request')],...(manager(c)?[['announcement',uiText('Announcement')]]:[])]),item.kind||'resource')+field(uiText('Title'),'title',item.title,{required:true,max:160})+field(uiText('Details'),'body',item.body,{multiline:true,max:15000})+field(uiText('Resource link (optional)'),'url',item.url,{type:'url',max:2000})+select(uiText('Status'),'status',uiOptions([...(item.published_at?[]:[['draft',uiText('Internal draft')]]),['published',uiText('Published')],...(id?[['archived',uiText('Archived')]]:[])]),item.status||'draft')+formFoot()+'</form>';
      if(e.type==='network-event'){
        const v=list('community_event_versions').find(x=>x.id===item.current_version_id),zone=v?.timezone||Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
        return heading(uiText(id?'Edit event':'Create event'),uiText('Changing the event creates a new version and asks members to respond again.'))+formOpen('network-event',item,c)+field(uiText('Event title'),'title',v?.title,{required:true,max:160})+field(uiText('Time zone'),'timezone',zone,{required:true,max:100})+'<div class="ws-form-grid">'+field(uiText('Starts'),'starts',v?domain.localTime(v.starts_at,zone):'',{type:'datetime-local',required:true})+field(uiText('Ends'),'ends',v?domain.localTime(v.ends_at,zone):'',{type:'datetime-local',required:true})+'</div>'+field(uiText('Details'),'description',v?.description,{multiline:true,max:10000})+field(uiText('Location or meeting link'),'location',v?.location,{max:2000})+select(uiText('Status'),'status',uiOptions([['scheduled',uiText('Scheduled')],['cancelled',uiText('Cancelled')]]),item.status||'scheduled')+formFoot()+'</form>';
      }
      if(e.type==='network-invite')return heading(uiText('Invite participant'),uiText('Access starts after a confirmed account accepts this invitation.'))+formOpen('network-invite',item,c)+field(uiText('Email address'),'email',item.email,{required:true,type:'email',max:254})+'<input type="hidden" name="referral_id" value="'+esc(item.referral_id||'')+'">'+formFoot(uiText('Send invitation'))+'</form>';
      if(e.type==='network-referral')return heading(uiText('Suggest a participant'),uiText('A community manager reviews suggestions. Suggesting someone does not grant access.'))+formOpen('network-referral',item,c)+field(uiText('Name'),'name','',{required:true,max:120})+field(uiText('Email address'),'email','',{required:true,type:'email',max:254})+field(uiText('Why this person'),'reason','',{required:true,multiline:true,max:3000})+formFoot(uiText('Send suggestion'))+'</form>';
      return null;
    }
    function form(node,values,value){
      const type=node.dataset.form,id=node.dataset.id||null,revision=Number(node.dataset.revision)||0,c=node.dataset.community||null;
      const fields=names=>Object.fromEntries(names.map(k=>[k,value(k)]));
      if(type==='network-contact')return {action:'contact.save',payload:{id,revision,...fields(['name','organisation','role_title','email','phone','url','context','next_action','follow_up_on','owner_id','linked_user_id','task_id','status']),categories:[...values.keys()].filter(k=>k.startsWith('category:')).map(k=>k.slice(9))}};
      if(type==='network-contact-note')return {action:'contact.interaction',payload:{id,...fields(['kind','body','happened_on'])}};
      const cmd=(action,payload,service=false)=>({action,payload,scope:c,network:true,service});
      if(type==='network-community')return cmd(id?'community.save':'community.create',{revision,...fields(['name','description','status'])});
      if(type==='network-profile')return cmd('community.profile',{revision,...fields(['display_name','bio','skills','url']),profile_visible:values.has('profile_visible')});
      if(type==='network-post')return cmd('community.post.save',{id,revision,...fields(['kind','title','body','url','status'])});
      if(type==='network-comment')return cmd('community.comment',{id,body:value('body')});
      if(type==='network-event')return cmd('community.event.save',{id,revision,...fields(['title','description','location','timezone','status']),starts_at:domain.toInstant(value('starts'),value('timezone')),ends_at:domain.toInstant(value('ends'),value('timezone'))});
      if(type==='network-invite')return cmd('invitation.create',fields(['email','referral_id']),true);
      if(type==='network-referral')return cmd('community.referral',fields(['name','email','reason']));
      return null;
    }
    function localAction(action,control){
      const id=control.dataset.id,c=control.dataset.community;
      const actions={
        'network-contact-new':()=>edit('network-contact'),
        'network-contact-edit':()=>edit('network-contact',(data().workspace_contacts||[]).find(x=>x.id===id)),
        'network-contact-archive-toggle':()=>{showArchived=!showArchived;render();},
        'network-community-new':()=>edit('network-community'),
        'network-community-edit':()=>edit('network-community',community(id)),
        'network-profile':()=>edit('network-profile',myMembership(c)),
        'network-post-new':()=>edit('network-post',{community_id:c}),
        'network-post-edit':()=>edit('network-post',list('community_posts').find(x=>x.id===id)),
        'network-event-new':()=>edit('network-event',{community_id:c}),
        'network-event-edit':()=>edit('network-event',list('community_events').find(x=>x.id===id)),
        'network-invite-new':()=>edit('network-invite',{community_id:c}),
        'network-referral-new':()=>edit('network-referral',{community_id:c}),
        'network-referral-invite':()=>{const r=list('community_referrals').find(x=>x.id===id);if(r)edit('network-invite',{community_id:c,email:r.email,referral_id:r.id});},
      };
      if(!actions[action])return false;actions[action]();return true;
    }
    function command(action,control){
      const scope=control.dataset.community,id=control.dataset.id;
      if(action==='network-participation')return {network:true,scope,action:'community.participation',payload:{id,post_revision:Number(control.dataset.postRevision),response_revision:Number(control.dataset.responseRevision),status:control.dataset.status}};
      if(action==='network-rsvp')return {network:true,scope,action:'community.rsvp',payload:{id,version_id:control.dataset.version,response:control.dataset.response}};
      const commands={'network-resend-invite':'invitation.resend','network-revoke-invite':'invitation.revoke','network-revoke-member':'member.revoke','network-reject-referral':'referral.reject','network-community-leave':'community.leave'};
      if(!commands[action])return null;
      if(action!=='network-resend-invite'&&!window.confirm(i18n.t(action==='network-community-leave'?'Leave this community?':'Remove this community access or suggestion?')))return null;
      return {network:true,service:action!=='network-community-leave',scope,action:commands[action],payload:{id}};
    }
    function afterSave(type,result){
      if(!type.startsWith('network-'))return;
      if(type==='network-contact'||type==='network-contact-note'){state.view='contact';state.detail=result.contact_id||result.id;}
      else if(type==='network-post'||type==='network-comment'){state.view='community-post';state.detail=result.post_id||result.id;}
      else if(type==='network-event'){state.view='community-event';state.detail=result.id;}
      else {state.view='community';state.detail=result.community_id||result.invitation?.community_id||result.id;}
      state.version=null;history.replaceState({},'',location.pathname+location.search+'#'+state.view+'/'+state.detail);
    }
    function afterCommand(action){if(action==='network-community-leave'){state.view='communities';state.detail=null;history.replaceState({},'',location.pathname+location.search+'#communities');}}
    function input(node){if(node.name!=='contact_search')return;const term=node.value.toLocaleLowerCase();for(const row of document.querySelectorAll('[data-contact-search-text]'))row.hidden=!row.dataset.contactSearchText.includes(term);}
    function location(){
      if(!state.view.startsWith('communit'))return null;
      const id=state.view==='community-post'?list('community_posts').find(p=>p.id===state.detail)?.community_id:state.view==='community-event'?list('community_events').find(e=>e.id===state.detail)?.community_id:state.detail;
      return community(id)?.name||i18n.t('Communities');
    }
    return {views:{contacts:contactsView,contact:contactView,communities:communitiesView,community:communityView,'community-post':postView,'community-event':eventView,'community-members':membersView},
      editor,form,localAction,command,afterSave,afterCommand,input,location,isGlobalView:view=>view.startsWith('communit'),editorTable:{'network-contact':'workspace_contacts','network-community':'communities','network-post':'community_posts','network-event':'community_events'},
      reloadEditor:old=>old.type==='network-profile'?myMembership(old.item.community_id):null};
  };
})();
