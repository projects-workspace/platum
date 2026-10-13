(() => {
  'use strict';
  const root = document.getElementById('workspace-app');
  const api = window.PLATUM_DATA;
  const labels = { home: 'Overview', work: 'Work & requests', calendar: 'Calendar', learning: 'Learning & practice', inspiration: 'Inspiration', reports: 'Progress & reports', context: 'Our agreement', materials: 'Materials', forms: 'Questions for you', files: 'Files', updates: 'Updates' };
  const icons = {
    home: '<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',
    work: '<rect x="4" y="4" width="16" height="17" rx="2"/><path d="m8 12 2 2 5-5M8 17h8"/>',
    context: '<path d="M5 3h14v18H5Z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    materials: '<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 10h18M9 10v10"/>',
    forms: '<path d="M8 3h8v4H8Z"/><path d="M8 5H5v16h14V5h-3M8 12h8M8 16h5"/>',
    files: '<path d="M3 7h7l2 3h9v10H3Z"/><path d="M3 7V4h7l2 3h7v3"/>',
    updates: '<path d="M5 5h14v12H9l-4 4Z"/><path d="M8 9h8M8 13h5"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 11h18M7 15h3M14 15h3"/>',
    learning: '<path d="M12 5v16M3 4h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5v15h-5a4 4 0 0 0-4 2 4 4 0 0 0-4-2H3Z"/>',
    inspiration: '<path d="M8 15a7 7 0 1 1 8 0v3H8ZM8 21h8M12 2V0"/>',
    reports: '<path d="M4 3h16v18H4ZM8 16v-4M12 16V8M16 16v-6"/>',
  };
  const state = { workspaces: [], active: null, data: null, editor: null, capabilities: { canCreate: false }, view: 'home', detail: null, version: null, loading: false, generation: 0, controller: null };
  const inlineDrafts = new Map();
  let pendingSaves = 0;
  let initialized = false;
  const draftKey = form => [state.active?.id,form.dataset.form,form.dataset.id,form.dataset.version,form.dataset.block].join(':');
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uuid = () => crypto.randomUUID();
  const human = value => String(value || '').replaceAll('_', ' ').replace(/^./, c => c.toUpperCase());
  const date = value => value ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? value+'T12:00:00' : value).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No date';
  const operator = () => ['owner', 'admin', 'team'].includes(state.active?.role);
  const manager = () => ['owner', 'admin'].includes(state.active?.role);
  const user = () => window.CLIENT_SPACE_AUTH_CONTEXT.user.id;
  const person = id => escape(state.data?.people.find(p => p.user_id === id)?.name || (id === user() ? 'You' : 'Workspace member'));
  const badge = (text, tone = '') => '<span class="ws-badge ' + escape(tone) + '">' + escape(text) + '</span>';
  const button = (action, text, attrs = '', style = 'ws-button') => '<button type="button" class="' + style + '" data-action="' + action + '" ' + attrs + '>' + escape(text) + '</button>';
  const link = (view, text, id = '') => '<a href="#' + view + (id ? '/' + encodeURIComponent(id) : '') + '">' + escape(text) + '</a>';
  const empty = (title, copy) => '<div class="ws-empty"><h2>' + escape(title) + '</h2><p>' + escape(copy) + '</p></div>';
  const heading = (title, copy = '', actions = '') => '<div class="ws-page-heading"><div><h1 tabindex="-1">' + escape(title) + '</h1>' + (copy ? '<p>' + escape(copy) + '</p>' : '') + '</div><div class="ws-actions">' + actions + '</div></div>';
  const field = (label, name, value = '', options = {}) => '<label class="ws-field' + (options.wide ? ' ws-wide' : '') + '">' + escape(label) +
    (options.help ? '<span class="ws-help">' + escape(options.help) + '</span>' : '') +
    (options.multiline ? '<textarea aria-label="' + escape(label) + '" name="' + escape(name) + '" rows="' + (options.rows || 4) + '" maxlength="' + (options.max || 10000) + '"' + (options.required ? ' required' : '') + '>' + escape(value) + '</textarea>'
      : '<input aria-label="' + escape(label) + '" name="' + escape(name) + '" type="' + (options.type || 'text') + '" maxlength="' + (options.max || 5000) + '" value="' + escape(value) + '"' + (options.required ? ' required' : '') + '>') + '</label>';
  const select = (label, name, options, value = '', attrs = '') => '<label class="ws-field">' + escape(label) + '<select aria-label="' + escape(label) + '" name="' + escape(name) + '" ' + attrs + '>' +
    options.map(o => { const item = Array.isArray(o) ? o : [o, human(o)]; return '<option value="' + escape(item[0]) + '"' + (String(value) === String(item[0]) ? ' selected' : '') + '>' + escape(item[1]) + '</option>'; }).join('') + '</select></label>';
  const check = (label, name, value) => '<label class="ws-check"><input type="checkbox" name="' + escape(name) + '"' + (value ? ' checked' : '') + '>' + escape(label) + '</label>';
  const safeUrl = value => { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } };
  const external = (url, label) => safeUrl(url) ? '<a href="' + escape(safeUrl(url)) + '" target="_blank" rel="noopener noreferrer">' + escape(label || url) + '<span class="ws-sr"> (opens in a new tab)</span></a>' : '';
  const paragraphs = text => '<div class="ws-prose">' + escape(text) + '</div>';
  function structured(value) {
    if(value===null||value===undefined)return '';
    if(Array.isArray(value))return '<ul>'+value.map(v=>'<li>'+structured(v)+'</li>').join('')+'</ul>';
    if(typeof value==='object')return '<dl>'+Object.entries(value).map(([k,v])=>'<dt><strong>'+escape(human(k.replace(/([a-z])([A-Z])/g,'$1 $2')))+'</strong></dt><dd>'+structured(v)+'</dd>').join('')+'</dl>';
    return escape(value);
  }
  const formFoot = (text = 'Save changes', extra = '') => '<div class="ws-form-error" role="alert" hidden></div><div class="ws-form-actions"><button class="ws-button ws-primary" type="submit">' + escape(text) + '</button>' + extra + button('cancel-editor', 'Cancel', '', 'ws-button ws-quiet') + '</div>';
  const fileList = ids => (ids || []).map(id => state.data.workspace_files.find(f => f.id === id)).filter(Boolean).map(f => button('download', f.name, 'data-id="' + f.id + '"', 'ws-file-link')).join('');
  const filesPicker = ids => '<fieldset class="ws-files-picker"><legend>Attach existing files</legend><p class="ws-help">Files attached to a request or published material are shared with this workspace.</p>' +
    (state.data.workspace_files.filter(f => f.status === 'ready').map(f => check(f.name, 'file:' + f.id, (ids || []).includes(f.id))).join('') || '<p>No uploaded files yet. Add them in Files.</p>') + '</fieldset>';
  const featureContext = {state,api,escape,heading,button,field,select,check,formFoot,person,date,operator,user,badge,empty,paragraphs,link,external,edit,render,filesPicker,questionEditor};
  const features = [window.PLATUM_CALENDAR_UI(featureContext),window.PLATUM_LEARNING_UI(featureContext),window.PLATUM_PROGRESS_UI(featureContext)];

  function notice(message, error = false) {
    const node = document.getElementById('ws-notice'); node.textContent = message; node.classList.toggle('is-error', error); node.hidden = false;
    clearTimeout(notice.timer); notice.timer = setTimeout(() => { node.hidden = true; }, error ? 12000 : 6000);
  }
  function shell() {
    root.innerHTML = '<div class="ws-layout"><aside class="ws-sidebar" id="ws-sidebar"><a class="ws-brand" href="#home"><span class="brand-mark">P</span><strong>Platum</strong></a>' +
      '<label class="ws-workspace-picker">Your workspace<select id="ws-workspace-select"></select></label><nav id="ws-nav" aria-label="Workspace navigation"></nav>' +
      '<div class="ws-sidebar-bottom"><p>One place for the work we do together.</p>' + button('export', 'Download shared history', '', 'ws-button ws-sidebar-link') + '</div></aside>' +
      '<div class="ws-main"><header class="ws-header">' + button('menu', 'Menu', 'aria-controls="ws-sidebar" aria-expanded="false"', 'ws-button ws-mobile-menu') +
      '<span id="ws-location"></span><button type="button" class="ws-button ws-header-refresh" data-action="refresh" aria-label="Refresh"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 8a8 8 0 1 0 1 7M19 3v5h-5"/></svg><span>Refresh</span></button><div id="ws-account"></div></header><div id="ws-notice" class="ws-notice" role="status" aria-live="polite" hidden></div><main id="ws-content"></main></div></div>';
    const account = document.querySelector('.topbar__actions');
    document.getElementById('ws-account').append(account);
    document.getElementById('admin-home-button').hidden = true;
    document.getElementById('sync-note').hidden = true;
  }
  function navigation() {
    root.querySelector('[data-action="export"]').hidden = !state.active;
    document.getElementById('ws-workspace-select').innerHTML = state.workspaces.map(w => '<option value="' + w.id + '"' + (w.id === state.active?.id ? ' selected' : '') + '>' + escape(w.name) + '</option>').join('') || '<option>No workspace yet</option>';
    const modules = state.active?.settings?.modules || Object.keys(labels);
    let items = modules.filter(k => labels[k]).map(k => '<a href="#' + k + '" class="' + (state.view === k || state.view === 'material' && k === 'materials' || state.view === 'request' && k === 'work' || state.view === 'form' && k === 'forms' || ['event','availability'].includes(state.view) && k === 'calendar' || state.view==='lesson' && k==='learning' || state.view==='inspiration-item' && k==='inspiration' || ['report','milestone'].includes(state.view)&&k==='reports' ? 'is-current' : '') + '">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true">' + icons[k] + '</svg><span>' + labels[k] + '</span></a>').join('');
    if (state.workspaces.some(w => ['owner','admin','team'].includes(w.role))) items += '<div class="ws-nav-divider"></div><a href="#team"' + (state.view === 'team' ? ' class="is-current"' : '') + '>Team inbox</a>';
    if (operator()) items += '<a href="#settings"' + (state.view === 'settings' ? ' class="is-current"' : '') + '>Workspace settings</a>';
    if (operator()) items += '<a href="#templates"' + (state.view === 'templates' ? ' class="is-current"' : '') + '>Templates</a>';
    if (manager()) items += '<a href="#members"' + (state.view === 'members' ? ' class="is-current"' : '') + '>People & access</a>';
    if (state.capabilities.canCreate) items += '<a href="#new-workspace">Create workspace</a>';
    document.getElementById('ws-nav').innerHTML = items;
    document.getElementById('ws-location').textContent = state.active ? state.active.name + ' / ' + (operator() ? 'Team workspace' : 'Shared workspace') : 'Your workspaces';
    root.dataset.accent = ['forest','slate','clay'].includes(state.active?.settings?.accent) ? state.active.settings.accent : 'forest';
    document.title = state.active ? state.active.name + ' — Platum' : 'Platum';
  }
  function tasksList(tasks) {
    return tasks.map(t => '<article class="ws-work-row"><div class="ws-work-copy"><strong>' + escape(t.title) + '</strong>' + (t.description ? '<p>' + escape(t.description) + '</p>' : '') +
      '<div class="ws-meta">' + badge(human(t.status)) + '<span>' + (t.assignee_user_id ? person(t.assignee_user_id) : human(t.assignee_kind)) + '</span>' +
      (t.due_at ? '<span>Due ' + date(t.due_at) + '</span>' : '') + (!t.client_visible ? badge('Internal') : '') + '</div>' +
      (t.request_id ? link('request', 'Related request', t.request_id) : '') + '</div><div class="ws-row-actions">' +
      (operator() ? button('edit-task', 'Edit', 'data-id="' + t.id + '"', 'ws-button ws-quiet') : '') +
      (operator() || t.assignee_kind === 'client' && (!t.assignee_user_id || t.assignee_user_id === user()) ? button('complete-task', t.status === 'completed' ? 'Reopen' : 'Mark complete', 'data-id="' + t.id + '"', 'ws-button ws-quiet') : '') + '</div></article>').join('');
  }
  function materialList(materials) {
    return materials.map(m => {
      const version = state.data.material_versions.find(v => v.id === (operator() ? m.draft_version_id || m.published_version_id : m.published_version_id));
      const unread = version?.published_at && !state.data.material_reads.some(r => r.version_id === version.id);
      const title = version?.title || m.title;
      return '<article class="ws-material-row"><div><div class="ws-meta">' + badge(version?.published_at ? 'Published' : version ? 'Draft' : 'Reference') + (unread ? badge('New', 'ws-new') : '') +
        (m.draft_version_id && m.published_version_id && operator() ? badge('Unpublished changes') : '') + '</div><h2>' +
        (version ? link('material', title, m.id) : external(m.url, title)) + '</h2><p>' + escape(version?.summary || m.description) + '</p></div>' +
        (version ? '<span class="ws-meta">Version ' + version.number + '</span>' : '') + '</article>';
    }).join('');
  }
  function homeView() {
    const d = state.data, ws = state.active, ctx = d.project_context[0] || {};
    const tasks = d.tasks.filter(t => !['completed','cancelled'].includes(t.status) && (operator() || t.assignee_kind === 'client'));
    const requests = d.requests.filter(r => r.status !== 'resolved' && (operator() ? r.status === 'waiting_team' : r.status === 'waiting_client'));
    const published = d.materials.filter(m => m.published_version_id).sort((a,b) => String(b.published_at).localeCompare(String(a.published_at)));
    const newMaterials = published.filter(m => !d.material_reads.some(r => r.version_id === m.published_version_id));
    const activeForms = d.forms.filter(f => f.status === 'active' && !d.form_submissions.some(s => s.form_id === f.id && s.form_revision === f.revision && s.submitted_by === user() && s.status !== 'draft'));
    const materialActions = published.filter(m => {
      const reviews=[...new Map(d.material_reviews.filter(r=>r.version_id===m.published_version_id).sort((a,b)=>a.created_at.localeCompare(b.created_at)).map(r=>[r.reviewer_id,r])).values()];
      return operator()?reviews.some(r=>r.status==='changes_requested'):!reviews.some(r=>r.reviewer_id===user());
    });
    const submittedForms=operator()?d.form_submissions.filter(s=>s.status==='submitted'):[];
    return heading(ws.name, ws.settings?.welcome || 'A clear view of what we are working on together.', button('new-request', 'Ask the team', '', 'ws-button ws-primary')) +
      '<section class="ws-focus"><div><h2>Our focus</h2><p>' + escape(ws.current_focus || ctx.objective || 'Your team will agree the first focus with you.') + '</p>' +
      (ctx.next_milestone ? '<p class="ws-next"><strong>Next step</strong> ' + escape(ctx.next_milestone) + '</p>' : '') + '</div>' + link('context', 'View our agreement') + '</section>' +
      '<div class="ws-two-columns"><section><div class="ws-section-heading"><h2>' + (operator() ? 'Needs a response' : 'Your next actions') + '</h2>' + link('work','All work') + '</div>' +
      requests.map(r => '<article class="ws-action-row">' + link('request',r.title,r.id) + '<p>' + escape(r.message.slice(0,150)) + '</p></article>').join('') +
      materialActions.map(m=>'<article class="ws-action-row">'+link('material',m.title,m.id)+'<p>'+(operator()?'The client requested changes.':'Ready for your review.')+'</p></article>').join('')+
      submittedForms.map(s=>'<article class="ws-action-row">'+link('form',d.forms.find(f=>f.id===s.form_id)?.title||'Questionnaire response',s.form_id)+'<p>A submitted response is ready for review.</p></article>').join('')+
      (!operator() ? activeForms.map(f => '<article class="ws-action-row">' + link('form',f.title,f.id) + '<p>' + escape(f.description) + '</p></article>').join('') : '') +
      tasksList(tasks.slice(0,5)) + (!requests.length && !tasks.length && !materialActions.length && !submittedForms.length && (operator() || !activeForms.length) ? '<p class="ws-muted">Nothing is waiting on you right now.</p>' : '') +
      '</section><section><div class="ws-section-heading"><h2>From the team</h2>' + link('updates','All updates') + '</div>' +
      (newMaterials.length ? materialList(newMaterials.slice(0,3)) : '<p class="ws-muted">You are up to date with published materials.</p>') +
      (d.activity.filter(a=>a.client_visible).sort((a,b)=>Number(b.id)-Number(a.id)).slice(0,2).map(a=>'<article class="ws-action-row"><strong>'+escape(a.summary)+'</strong><p>'+date(a.created_at)+'</p></article>').join('')) + '</section></div>';
  }
  function workView() {
    const d=state.data;
    return heading('Work & requests','Ideas become agreed work, with a clear owner and next step.',
      button('new-request','New request','','ws-button ws-primary') + (operator()?button('edit-task','Create task'):''))
      + '<section><div class="ws-section-heading"><h2>Requests</h2></div>' + (d.requests.length?d.requests.slice().sort((a,b)=>b.created_at.localeCompare(a.created_at)).map(r=>'<article class="ws-work-row"><div><h3>'+link('request',r.title,r.id)+'</h3><p>'+escape(r.message.slice(0,180))+'</p><div class="ws-meta">'+badge(human(r.status))+badge(human(r.scope_status))+(r.owner_id?'<span>'+person(r.owner_id)+'</span>':'')+'</div></div></article>').join(''):empty('What would you like help with?','Describe the idea or situation. You do not need a finished brief.'))+
      '</section><section class="ws-section"><div class="ws-section-heading"><h2>Tasks</h2></div>'+(d.tasks.length?tasksList(d.tasks):'<p class="ws-muted">Agreed tasks will appear here.</p>')+'</section>';
  }
  function requestView() {
    const r=state.data.requests.find(x=>x.id===state.detail);
    if(!r)return empty('Request unavailable','Refresh the workspace or ask your team about access.');
    const replies=state.data.request_replies.filter(x=>x.request_id===r.id).sort((a,b)=>a.created_at.localeCompare(b.created_at));
    return heading(r.title,human(r.status),operator()?button('triage-request','Manage request','data-id="'+r.id+'"')+button('task-from-request','Create linked task','data-id="'+r.id+'"'):'')+
      '<article class="ws-reading">'+paragraphs(r.message)+'<div class="ws-meta">'+badge(human(r.scope_status))+'<span>Opened '+date(r.created_at)+'</span>'+(r.owner_id?'<span>Owner: '+person(r.owner_id)+'</span>':'')+'</div><div class="ws-attachments">'+fileList(r.file_ids)+'</div></article>'+
      '<section class="ws-thread"><h2>Conversation</h2>'+replies.map(x=>'<article class="ws-comment"><div class="ws-meta"><strong>'+person(x.author_id)+'</strong><time>'+date(x.created_at)+'</time></div>'+paragraphs(x.body)+'</article>').join('')+
      '<form data-form="reply" data-id="'+r.id+'" class="ws-form">'+field('Your reply','body','',{multiline:true,required:true,max:5000})+formFoot('Send reply')+'</form></section>'+
      (state.data.tasks.some(t=>t.request_id===r.id)?'<section class="ws-section"><h2>Linked work</h2>'+tasksList(state.data.tasks.filter(t=>t.request_id===r.id))+'</section>':'');
  }
  function contextView() {
    const c=state.data.project_context[0]||{}, a=c.collaboration||{};
    return heading('Our agreement','The shared context behind our work.',operator()?button('settings','Edit agreement'):'')+
      '<div class="ws-reading">'+[['Goal',c.objective],['Current scope',a.scope],['Who does what',a.roles],['Working rhythm',a.rhythm],['Scope boundaries',a.boundaries],['Next step',c.next_milestone]].map(([title,text])=>'<section class="ws-agreement-section"><h2>'+title+'</h2>'+paragraphs(text||'To be agreed together.')+'</section>').join('')+'</div>'+
      (c.strategy?'<details class="ws-response"><summary>Existing project direction</summary>'+structured(c.strategy)+'</details>':'')+
      (c.milestones?.length?'<details class="ws-response"><summary>Project milestones</summary>'+structured(c.milestones)+'</details>':'')+
      '<section class="ws-section"><div class="ws-section-heading"><h2>Decisions</h2>'+(operator()?button('record-decision','Record a decision'):'')+'</div>'+
      (state.data.decisions.map(d=>'<article class="ws-work-row"><div><h3>'+escape(d.title)+'</h3>'+paragraphs(d.decision)+'<p class="ws-meta">Recorded '+date(d.decided_at)+' by '+person(d.created_by)+'</p></div></article>').join('')||'<p class="ws-muted">Agreed decisions will be recorded here.</p>')+'</section>';
  }
  function materialView() {
    const d=state.data,m=d.materials.find(x=>x.id===state.detail);
    if(!m)return empty('Material unavailable','It may have been archived or your access may have changed.');
    const versions=d.material_versions.filter(v=>v.material_id===m.id).sort((a,b)=>b.number-a.number);
    const v=versions.find(x=>x.id===state.version)||versions.find(x=>x.id===(operator()?m.draft_version_id||m.published_version_id:m.published_version_id));
    if(!v)return empty('No readable version','This material does not have an available page yet.');
    const current=v.id===m.published_version_id;
    const reviews=d.material_reviews.filter(r=>r.version_id===v.id).sort((a,b)=>a.created_at.localeCompare(b.created_at));
    const latest=[...new Map(reviews.map(r=>[r.reviewer_id,r])).values()];
    const actions=operator()?button('edit-material','Edit draft','data-id="'+m.id+'"')+
      (m.draft_version_id===v.id&&!v.published_at?button('publish-material','Publish this version','data-id="'+m.id+'" data-version="'+v.id+'"','ws-button ws-primary'):'')+
      (m.client_visible?button('archive-material','Archive','data-id="'+m.id+'"','ws-button ws-quiet'):'')
      :current?button('approve-material','Approve this version','data-version="'+v.id+'"','ws-button ws-primary')+button('request-changes','Request changes','data-version="'+v.id+'"'):'';
    function discussion(block) {
      const comments=d.material_comments.filter(c=>c.version_id===v.id&&(c.block_id||'')===(block||''));
      return '<details class="ws-discussion"><summary>'+ (block?'Discuss this section':'General discussion')+' <span>'+comments.length+'</span></summary>'+
        comments.map(c=>'<article class="ws-comment"><div class="ws-meta"><strong>'+person(c.author_id)+'</strong><time>'+date(c.created_at)+'</time></div>'+paragraphs(c.body)+button('reply-comment','Reply','data-id="'+c.id+'"','ws-text-button')+'</article>').join('')+
        '<form data-form="comment" data-version="'+v.id+'" data-block="'+escape(block||'')+'" class="ws-form">'+field('Comment','body','',{multiline:true,required:true,rows:3})+'<input type="hidden" name="parent_id"><div class="ws-form-error" role="alert" hidden></div><button class="ws-button" type="submit">Post comment</button></form></details>';
    }
    return heading(v.title,v.summary,actions)+'<div class="ws-version-bar">'+badge(v.published_at?'Published':'Internal draft')+
      select('Version','version',versions.map(x=>[x.id,'Version '+x.number+(x.id===m.published_version_id?' · current':x.published_at?' · previous':' · draft')]),v.id,'data-version-select')+
      '<span>'+date(v.published_at||v.created_at)+'</span></div>'+
      (!current&&!operator()?'<p class="ws-inline-note">You are viewing an earlier version. '+link('material','Open the current version',m.id)+'</p>':'')+
      (latest.length?'<section class="ws-review-records" aria-label="Decisions on this version">'+latest.map(r=>'<div>'+badge(human(r.status),r.status==='approved'?'ws-positive':'')+' <strong>'+person(r.reviewer_id)+'</strong> · '+date(r.created_at)+(r.note?paragraphs(r.note):'')+'</div>').join('')+'</section>':'')+
      '<article class="ws-reading">'+v.blocks.map(b=>'<section class="ws-document-block" id="block-'+escape(b.id)+'"><h2>'+escape(b.label)+'</h2>'+paragraphs(b.text)+(b.url?'<p>'+external(b.url,'Open reference')+'</p>':'')+discussion(b.id)+'</section>').join('')+
      '<div class="ws-attachments">'+fileList(v.file_ids)+'</div>'+discussion(null)+'</article>';
  }
  function formsView() {
    return heading(operator()?'Questionnaires':'Questions for you','A little context, exactly where it helps.',operator()?button('edit-form','Create questionnaire','','ws-button ws-primary'):'')+
      (state.data.forms.length?state.data.forms.map(f=>{const submissions=state.data.form_submissions.filter(s=>s.form_id===f.id&&s.form_revision===f.revision&&s.submitted_by===user());return '<article class="ws-work-row"><div><h2>'+link('form',f.title,f.id)+'</h2><p>'+escape(f.description)+'</p><div class="ws-meta">'+badge(human(f.status))+(submissions[0]?badge(human(submissions[0].status)):'')+'</div></div>'+(operator()?button('edit-form','Edit','data-id="'+f.id+'"'):'')+'</article>';}).join(''):empty('No questions waiting','Your team will ask for information when it is needed.'));
  }
  function formView() {
    const d=state.data,f=d.forms.find(x=>x.id===state.detail);
    if(!f)return empty('Questionnaire unavailable','Your team may have closed or withdrawn this questionnaire.');
    if(!Array.isArray(f.definition.fields)||!f.definition.fields.length)return heading(f.title,f.description,operator()?button('edit-form','Configure questions','data-id=\"'+f.id+'\"'):'')+empty('Questions are being prepared','The team needs to configure this questionnaire before it can accept answers.');
    const mine=d.form_submissions.filter(s=>s.form_id===f.id&&s.submitted_by===user()).sort((a,b)=>b.form_revision-a.form_revision);
    const current=mine.find(s=>s.form_revision===f.revision&&s.definition_snapshot?.fields), previous=mine[0], answers=(current||previous)?.answers||{};
    const locked=f.status!=='active'||current&&current.status!=='draft';
    function answerField(q) {
      const value=answers[q.id]??'';
      if(q.type==='select'||q.type==='boolean')return select(q.label,'answer:'+q.id,[['','Choose an answer'],...(q.type==='boolean'?[['true','Yes'],['false','No']]:(q.options||[]).map(v=>[v,v]))],String(value),(q.required?'required ':'')+(locked?'disabled ':''));
      return field(q.label+(q.required?' *':''),'answer:'+q.id,value,{multiline:q.type==='textarea',type:q.type==='url'?'url':'text',required:q.required,help:q.help});
    }
    const responseForm='<form data-form="submission" data-id="'+f.id+'" data-revision="'+f.revision+'" data-submission-revision="'+(current?.revision||0)+'" class="ws-form ws-reading">'+
      (previous&&!current?'<p class="ws-inline-note">Your earlier answers are filled in where questions still match. Review them before submitting this version.</p>':'')+
      '<fieldset'+(locked?' disabled':'')+' class="ws-question-fields">'+(f.definition.fields||[]).map(q=>'<div>'+answerField(q)+(q.help&&['select','boolean'].includes(q.type)?'<p class="ws-help">'+escape(q.help)+'</p>':'')+'</div>').join('')+'</fieldset>'+
      (locked?'<p class="ws-inline-note">'+(current?'Response '+human(current.status).toLowerCase()+'. Your original answers are preserved.':'This questionnaire is not accepting responses.')+'</p>':'<p class="ws-help">Draft answers stay private until you submit them to the team.</p><div class="ws-form-error" role="alert" hidden></div><div class="ws-form-actions"><button class="ws-button ws-primary" type="submit" value="submitted">Submit to the team</button><button class="ws-button" type="submit" value="draft" formnovalidate>Save draft</button></div>')+'</form>';
    const responses=operator()?'<section class="ws-section"><h2>Submitted responses</h2>'+d.form_submissions.filter(s=>s.form_id===f.id&&s.status!=='draft').map(s=>'<details class="ws-response"><summary>'+person(s.submitted_by)+' · version '+s.form_revision+' · '+human(s.status)+'</summary>'+
      (s.definition_snapshot.fields||[]).map(q=>'<section><h3>'+escape(q.label)+'</h3>'+paragraphs(typeof s.answers[q.id]==='boolean'?(s.answers[q.id]?'Yes':'No'):s.answers[q.id]||'No answer')+'</section>').join('')+
      (s.status==='submitted'?button('review-submission','Mark reviewed','data-id="'+s.id+'"'):'')+'</details>').join('')+'</section>':'';
    return heading(f.title,f.description,operator()?button('edit-form','Edit questionnaire','data-id="'+f.id+'"'):'')+(operator()?responses:responseForm);
  }
  function filesView() {
    return heading('Files','Documents and images stay within this workspace.',button('upload-file','Upload a file','','ws-button ws-primary')+button('export','Export data (JSON)','data-format="json"'))+
      (state.data.workspace_files.length?state.data.workspace_files.map(f=>'<article class="ws-work-row"><div><h3>'+escape(f.name)+'</h3><div class="ws-meta"><span>'+Math.ceil(f.size_bytes/1024)+' KB</span>'+badge(f.status==='ready'?(f.client_visible?'Shared':'Linked or internal'):'Upload incomplete')+'<span>'+date(f.created_at)+'</span></div></div><div class="ws-row-actions">'+
        (f.status==='ready'?button('download','Download','data-id="'+f.id+'"'):'')+(operator()&&!f.client_visible&&f.status==='ready'?button('share-file','Share with client','data-id="'+f.id+'"'):'')+'</div></article>').join(''):empty('A home for useful files','Upload a document or image. Add large video projects as external links in a material.'));
  }
  function updatesView() {
    const seen=state.data.workspace_reads[0]?.updates_seen_at;
    const events=state.data.activity.slice().sort((a,b)=>Number(b.id)-Number(a.id));
    return heading('Updates','What changed, what we learned, and what comes next.',(operator()?button('publish-update','Write an update','','ws-button ws-primary'):'')+button('read-updates','Mark updates as read'))+
      (events.length?'<div class="ws-timeline">'+events.map(a=>'<article><div class="ws-meta"><time>'+date(a.created_at)+'</time>'+(!seen||a.created_at>seen?badge('New','ws-new'):'')+(!a.client_visible?badge('Internal'):'')+'</div><h2>'+escape(a.summary)+'</h2>'+
        (a.metadata?.body?paragraphs(a.metadata.body):'')+(a.entity_type==='material'?link('material','Open material',a.entity_id):a.entity_type==='request'?link('request','Open request',a.entity_id):'')+'</article>').join('')+'</div>':empty('The story starts here','Published updates and important actions will build a shared record of your work.'));
  }
  function membersView() {
    if(!manager())return empty('Team management','Only workspace owners and administrators can manage access.');
    return heading('People & access','Access applies to this workspace only.',button('invite-person','Invite someone','','ws-button ws-primary'))+
      '<section><h2>Members</h2>'+state.data.people.map(p=>'<article class="ws-work-row"><div><strong>'+escape(p.name)+'</strong><p>'+escape(p.email||'')+'</p>'+badge(human(p.role))+'</div>'+
        ((state.active.role==='owner'||['client','team'].includes(p.role))?button('revoke-member','Remove access','data-id="'+p.user_id+'"','ws-button ws-quiet'):'')+'</article>').join('')+'</section>'+
      '<section class="ws-section"><h2>Invitations</h2>'+state.data.workspace_invitations.map(i=>'<article class="ws-work-row"><div><strong>'+escape(i.email)+'</strong><div class="ws-meta">'+badge(i.status==='pending'&&new Date(i.expires_at)<new Date()?'Expired':human(i.status))+'<span>'+human(i.role)+'</span><span>Delivery: '+human(i.mail_status)+'</span></div></div>'+
        (i.status==='pending'?'<div class="ws-row-actions">'+button('resend-invite','Resend','data-id="'+i.id+'"')+button('revoke-invite','Revoke','data-id="'+i.id+'"','ws-button ws-quiet')+'</div>':'')+'</article>').join('')+'</section>';
  }
  function blockEditor(b = { id: 'b_' + uuid(), label: '', text: '', url: '' }) {
    return '<fieldset class="ws-block-editor" data-block-id="'+escape(b.id)+'"><legend>Material section</legend>'+field('Section title','block-label',b.label,{required:true,max:160})+
      field('Content','block-text',b.text,{multiline:true,rows:5})+field('Reference link (optional)','block-url',b.url,{type:'url',max:2000})+
      button('remove-block','Remove section','','ws-text-button')+'</fieldset>';
  }
  function questionEditor(q = { id: 'q_'+uuid(), label: '', help: '', type: 'text', required: false, options: [] }) {
    return '<fieldset class="ws-question-editor" data-question-id="'+escape(q.id)+'"><legend>Question</legend>'+field('Question','question-label',q.label,{required:true,max:250})+
      field('Why we are asking','question-help',q.help,{max:1500})+select('Answer format','question-type',[['text','Short answer'],['textarea','Long answer'],['url','Link'],['select','Choose an option'],['boolean','Yes or no']],q.type)+
      field('Choices, one per line (for a choice question)','question-options',(q.options||[]).join('\n'),{multiline:true,rows:3,max:3200})+
      check('Required question','question-required',q.required)+button('remove-question','Remove question','','ws-text-button')+'</fieldset>';
  }
  function editorView() {
    const e=state.editor,d=state.data||{},item=e.item||{};
    for(const feature of features){const content=feature.editor?.(e);if(content!==null&&content!==undefined)return content;}
    if(e.type==='workspace')return heading('Create a workspace','Start with a reusable shared workspace.')+'<form class="ws-form ws-reading" data-form="workspace">'+field('Workspace name','name','',{required:true,max:120})+formFoot('Create workspace')+'</form>';
    if(e.type==='request')return heading('What would you like help with?','Share the idea, question, or situation. The team will help define the work.')+
      '<form class="ws-form ws-reading" data-form="request">'+field('Short title','title','',{required:true,max:160})+field('Tell us what you need','message','',{required:true,multiline:true,max:5000})+
      '<details><summary>Attach files (optional)</summary><label class="ws-field">Upload a document or image<input type="file" name="request_file" accept=".pdf,.txt,.md,.docx,.png,.jpg,.jpeg,.webp"></label><p class="ws-help">Maximum 10 MB. Attachments are shared with this workspace.</p>'+filesPicker([])+'</details>'+formFoot('Send request')+'</form>';
    if(e.type==='task')return heading(item.id?'Edit task':'Create a task','Make the next action and its owner clear.')+'<form class="ws-form ws-reading" data-form="task" data-id="'+(item.id||'')+'" data-revision="'+(item.revision||0)+'">'+
      field('Task title','title',item.title,{required:true,max:160})+field('What needs to happen','description',item.description,{multiline:true,max:5000})+
      '<div class="ws-form-grid">'+select('Assigned to','assignee_kind',['client','team'],item.assignee_kind||'client')+
      select('Person (optional)','assignee_user_id',[['','Anyone on that side'],...d.people.map(p=>[p.user_id,p.name+' · '+human(p.role)])],item.assignee_user_id||'')+
      select('Status','status',['open','in_progress','waiting','review','completed','cancelled'],item.status||'open')+
      select('Priority','priority',['low','medium','high'],item.priority||'medium')+field('Due date','due_at',item.due_at?new Date(item.due_at).toISOString().slice(0,10):'',{type:'date'})+
      select('Related request','request_id',[['','No linked request'],...d.requests.map(r=>[r.id,r.title])],item.request_id||'')+'</div>'+
      check('Visible to the client','client_visible',item.client_visible!==false)+formFoot()+'</form>';
    if(e.type==='triage')return heading('Manage request',item.title)+'<form class="ws-form ws-reading" data-form="triage" data-id="'+item.id+'" data-revision="'+item.revision+'">'+
      select('Scope decision','scope_status',[['needs_clarification','Needs clarification'],['included','Included in current scope'],['reprioritize','Requires a priority change'],['separate_agreement','Needs a separate agreement']],item.scope_status)+
      select('Next action sits with','status',[['waiting_team','Team response needed'],['waiting_client','Client response needed'],['in_progress','Work in progress'],['responded','Response delivered'],['resolved','Resolved']],item.status)+
      select('Team owner','owner_id',[['','Not assigned yet'],...d.people.filter(p=>p.role!=='client').map(p=>[p.user_id,p.name])],item.owner_id||'')+
      '<p class="ws-help">Explain a scope or priority change in the request conversation. This setting does not charge the client.</p>'+formFoot()+'</form>';
    if(e.type==='material') {
      const v=e.version||{title:'',summary:'',blocks:[{id:'b_'+uuid(),label:'Context',text:''},{id:'b_'+uuid(),label:'Recommendation',text:''},{id:'b_'+uuid(),label:'Next step',text:''}],file_ids:[]};
      return heading(item.id?'Edit material':'Create a material','Save an internal draft, then publish a specific version for the client.')+
        '<form class="ws-form ws-reading" data-form="material" data-id="'+(item.id||'')+'" data-revision="'+(item.revision||0)+'">'+
        field('Title','title',v.title,{required:true,max:160})+field('Short summary','summary',v.summary,{multiline:true,rows:3,max:3000})+
        '<div data-block-editors>'+v.blocks.map(blockEditor).join('')+'</div>'+button('add-block','Add section')+filesPicker(v.file_ids)+formFoot('Save internal draft')+'</form>';
    }
    if(e.type==='form')return heading(item.id?'Edit questionnaire':'Create a questionnaire','Ask only for the information that helps the next step.')+
      '<form class="ws-form ws-reading" data-form="form" data-id="'+(item.id||'')+'" data-revision="'+(item.revision||0)+'">'+field('Title','title',item.title,{required:true,max:160})+
      field('What these answers will help us do','description',item.description,{multiline:true,rows:3,max:5000})+
      '<div data-question-editors>'+(Array.isArray(item.definition?.fields)&&item.definition.fields.length?item.definition.fields:[{id:'q_'+uuid(),label:'',help:'',type:'text',required:true}]).map(questionEditor).join('')+'</div>'+button('add-question','Add question')+
      select('Availability','status',[['draft','Internal draft'],['active','Published · accepting answers'],['closed','Published · closed']],item.status||'draft')+
      '<p class="ws-help">Changing a questionnaire creates a new revision. Submitted answers keep their original questions.</p>'+formFoot()+'</form>';
    if(e.type==='settings') {
      const ws=state.active,c=d.project_context[0]||{},a=c.collaboration||{},modules=ws.settings?.modules||Object.keys(labels),all=[...modules,...Object.keys(labels).filter(k=>!modules.includes(k))];
      return heading('Workspace settings','Keep the experience relevant to this client.')+'<form class="ws-form ws-reading" data-form="settings" data-revision="'+ws.revision+'">'+
        '<div class="ws-form-grid">'+field('Workspace name','name',ws.name,{required:true,max:120})+select('Accent','accent',[['forest','Forest'],['slate','Slate'],['clay','Clay']],ws.settings?.accent||'forest')+'</div>'+
        field('Default time zone','timezone',ws.settings?.timezone||'UTC',{required:true,max:100,help:'An IANA zone such as Europe/Prague. Members can set their own display zone in Availability.'})+
        field('Welcome message','welcome',ws.settings?.welcome,{multiline:true,rows:2,max:2000})+field('Short project description','description',ws.description,{multiline:true,max:5000})+
        field('Current focus','focus',ws.current_focus,{max:500})+field('Current phase','phase',ws.current_phase,{max:160})+
        field('Agreed goal','objective',c.objective,{multiline:true,max:5000})+field('Current scope','scope',a.scope,{multiline:true,max:5000})+
        field('Who does what','roles',a.roles,{multiline:true,max:5000})+field('Working rhythm','rhythm',a.rhythm,{multiline:true,rows:3,max:2000})+
        field('Scope boundaries','boundaries',a.boundaries,{multiline:true,rows:3,max:3000})+field('Next agreed step','next_step',c.next_milestone,{max:1000})+
        '<fieldset><legend>Sections and their order</legend><p class="ws-help">Hidden sections stay available to the team. This does not change data permissions.</p><ul class="ws-module-list">'+
        all.map(k=>'<li data-module="'+k+'">'+(k==='home'?'<label class="ws-check"><input type="checkbox" name="module:home" checked disabled>Overview</label>':check(labels[k],'module:'+k,modules.includes(k)))+
          '<div>'+button('module-up','Move up','','ws-text-button')+button('module-down','Move down','','ws-text-button')+'</div></li>').join('')+'</ul></fieldset>'+formFoot()+'</form>';
    }
    if(e.type==='invite')return heading('Invite someone','They will receive a secure link. Access starts after they sign in with this email.')+
      '<form class="ws-form ws-reading" data-form="invite">'+field('Email address','email','',{required:true,type:'email',max:254})+
      select('Workspace role','role',[['client','Client'],['team','Team member'],...(state.active.role==='owner'?[['admin','Administrator']]:[])],'client')+formFoot('Send invitation')+'</form>';
    if(e.type==='upload')return heading('Upload a file','PDF, text, DOCX, PNG, JPEG or WebP. Maximum 10 MB. Large videos can be linked in Materials.')+
      '<form class="ws-form ws-reading" data-form="upload"><label class="ws-field">File<input type="file" name="file" required accept=".pdf,.txt,.md,.docx,.png,.jpg,.jpeg,.webp"></label>'+
      (operator()?check('Share directly with the client','client_visible',false)+'<p class="ws-help">Otherwise this file stays internal until attached to a published material.</p>':'<p class="ws-help">Uploaded files are shared with your workspace team.</p>')+formFoot('Upload file')+'</form>';
    if(e.type==='update')return heading('Publish an update','Help the client see what changed and what comes next.')+'<form class="ws-form ws-reading" data-form="update">'+
      field('Title','title','',{required:true,max:160})+field('Update','body','',{required:true,multiline:true,help:'Include completed work, any verified results, open decisions and the next step.'})+formFoot('Publish update')+'</form>';
    if(e.type==='decision')return heading('Record a decision','Keep the agreed outcome and its context together.')+'<form class="ws-form ws-reading" data-form="decision">'+
      field('Decision title','title','',{required:true,max:160})+field('Context','context','',{multiline:true,max:5000})+field('Agreed decision','decision','',{required:true,multiline:true})+formFoot('Record decision')+'</form>';
    if(e.type==='review')return heading('Request changes','Your feedback is attached to this exact version.')+'<form class="ws-form ws-reading" data-form="review" data-version="'+e.versionId+'">'+
      field('What should change?','note','',{required:true,multiline:true})+formFoot('Send feedback')+'</form>';
    return '';
  }
  async function teamView() {
    const holder=document.getElementById('ws-content'),gen=state.generation;
    holder.innerHTML=heading('Team inbox','Decisions and responses across your assigned client workspaces.')+'<p role="status">Loading your inbox…</p>';
    try {
      const items=await api.queue(state.workspaces.filter(w=>['owner','admin','team'].includes(w.role)).map(w=>w.id));
      if(gen!==state.generation||state.view!=='team')return;
      holder.innerHTML=heading('Team inbox','Decisions and responses across your assigned client workspaces.',state.capabilities.canCreate?button('new-workspace','Create workspace'):'')+
        (items.length?items.map(i=>'<article class="ws-work-row"><div><span class="ws-meta">'+escape(state.workspaces.find(w=>w.id===i.workspace_id)?.name||'Workspace')+'</span><h2>'+escape(i.title)+'</h2>'+badge(i.reason)+'</div>'+
          button('open-inbox-item','Open','data-workspace="'+i.workspace_id+'" data-view="'+i.view+'" data-id="'+i.id+'"')+'</article>').join(''):empty('The inbox is clear','New client requests, submitted answers and requested changes will appear here.'));
    }catch(error){if(gen===state.generation)holder.innerHTML=heading('Team inbox')+empty('Could not load your inbox',error.message)+button('refresh','Try again');}
  }
  function render() {
    navigation();
    const content=document.getElementById('ws-content');
    if(state.loading){content.innerHTML='<div class="ws-loading" role="status">Opening your workspace…</div>';return;}
    if(state.editor){content.innerHTML=editorView();content.querySelector('h1')?.focus({preventScroll:true});return;}
    if(state.view==='new-workspace'&&state.capabilities.canCreate){state.editor={type:'workspace'};content.innerHTML=editorView();return;}
    if(!state.active||!state.data){content.innerHTML=heading('Your workspaces','Your account is signed in.')+
      empty('No workspace access yet',state.capabilities.canCreate?'Create your first shared workspace to begin.':'Ask your team to invite this email. An invitation may have expired or been revoked.')+
      (state.capabilities.canCreate?button('new-workspace','Create workspace','','ws-button ws-primary'):'')+button('refresh','Check again');return;}
    if(state.view==='settings'&&operator()){state.editor={type:'settings'};content.innerHTML=editorView();return;}
    if(state.view==='team'){teamView();return;}
    const views={home:homeView,work:workView,request:requestView,context:contextView,material:materialView,forms:formsView,form:formView,files:filesView,updates:updatesView,members:membersView,
      materials:()=>heading('Materials','Ideas, recommendations and results, with room for your feedback.',operator()?button('edit-material','Create material','','ws-button ws-primary'):'')+
        (state.data.materials.length?materialList(state.data.materials):empty('Your shared reference point','Published recommendations and results will appear here.'))+(state.data.deliverables.length?'<section class=\"ws-section\"><h2>Delivered resources</h2>'+state.data.deliverables.map(d=>'<article class=\"ws-material-row\"><div><h3>'+external(d.url,d.title)+'</h3>'+paragraphs(d.description)+'</div></article>').join('')+'</section>':'')};
    for(const feature of features)Object.assign(views,feature.views);
    content.innerHTML=(views[state.view]||homeView)()+(state.view==='home'?features.map(f=>f.home?.()||'').join(''):'');
    for(const form of content.querySelectorAll('form[data-form]')) {
      const saved=inlineDrafts.get(draftKey(form));
      if(saved){for(const [name,value] of saved){const input=form.elements.namedItem(name);if(input&&input.type!=='file')input.value=value;}const details=form.closest('details');if(details)details.open=true;state.editorDirty=true;}
    }
    if(state.view==='material') {
      const m=state.data.materials.find(x=>x.id===state.detail),id=state.version||m?.published_version_id;
      const readTarget=state.data;
      if(id&&!readTarget.material_reads.some(r=>r.version_id===id))api.mutate('material.read',state.active.id,{version_id:id}).then(()=>readTarget.material_reads.push({version_id:id})).catch(()=>{});
    }
  }
  function readRoute() {
    const parts=location.hash.slice(1).split('/');
    state.view=parts[0]==='questions'?'work':parts[0]||'home';state.detail=parts[1]||null;state.version=parts[2]||null;
  }
  function discard() {
    if(pendingSaves){notice('Please wait for the current change to finish saving.');return false;}
    if(!state.editorDirty)return true;
    if(!window.confirm('Discard your unsaved changes?'))return false;
    inlineDrafts.clear();state.editorDirty=false;return true;
  }
  function edit(type,item={},extra={}) {
    if(!discard())return;
    state.editor={type,item,...extra};state.editorDirty=false;render();
  }
  async function refresh(preferred=state.active?.id,keepEditor=false) {
    const generation=++state.generation;
    state.controller?.abort();state.controller=new AbortController();
    state.loading=true;state.data=null;
    if(!keepEditor){state.editor=null;state.editorDirty=false;}
    render();
    try {
      const workspaces=await api.access(state.controller.signal);
      if(generation!==state.generation)return;
      state.workspaces=workspaces;
      state.active=state.workspaces.find(w=>w.id===preferred)||state.workspaces[0]||null;
      if(state.active){const url=new URL(location.href);url.searchParams.set('workspace',state.active.id);history.replaceState({},'',url);}
      if(preferred&&!state.workspaces.some(w=>w.id===preferred))notice('The selected workspace is no longer available to your account.',true);
      const data=state.active?await api.bundle(state.active.id,state.controller.signal):null;
      if(generation!==state.generation)return;
      state.data=data;
      state.loading=false;render();
    }catch(error){
      if(error.name==='AbortError'||generation!==state.generation)return;
      state.loading=false;state.data=null;navigation();
      document.getElementById('ws-content').innerHTML=heading('Workspace unavailable')+empty('We could not open your workspace',error.message)+button('refresh','Try again');
    }
  }
  function formError(form,error) {
    const target=form.querySelector('.ws-form-error');if(!target)return;
    target.hidden=false;target.textContent=error.message;
    if(['CONFLICT','FORM_CHANGED','CURRENT_VERSION_CHANGED'].includes(error.code))target.insertAdjacentHTML('beforeend','<div class="ws-actions">'+button('copy-draft','Copy my draft')+button('reload-editor','Load latest version')+'</div>');
    target.scrollIntoView({block:'nearest'});target.tabIndex=-1;target.focus();
  }
  function operationFor(form,payload) {
    const signature=JSON.stringify(payload);
    if(form._operation?.signature!==signature)form._operation={signature,id:uuid()};
    return form._operation.id;
  }
  async function submit(event) {
    const form=event.target.closest('form[data-form]');if(!form)return;
    event.preventDefault();if(form._busy)return;
    const data=new FormData(form),type=form.dataset.form,submitter=event.submitter;
    const value=k=>String(data.get(k)||'').trim();
    const id=form.dataset.id||null,revision=Number(form.dataset.revision)||0;
    const fileIds=[...data.keys()].filter(k=>k.startsWith('file:')).map(k=>k.slice(5));
    let action,payload,result;
    form._busy=true;pendingSaves++;form.setAttribute('aria-busy','true');const controls=[...form.querySelectorAll('button[type="submit"]')];controls.forEach(b=>b.disabled=true);
    try {
      if(type==='workspace') {payload={name:value('name')};result=await api.team('create_workspace',null,payload,operationFor(form,payload));state.capabilities.canCreate=true;state.editor=null;state.editorDirty=false;state.view='home';history.replaceState({},'',location.pathname+location.search+'#home');await refresh(result.workspace.id);notice('Workspace created. Add context and invite your client.');return;}
      if(type==='invite') {payload={email:value('email'),role:value('role')};result=await api.team('invite',state.active.id,payload,operationFor(form,payload));await refresh();notice(result.delivery==='sent'?'Invitation sent.':'Invitation saved, but delivery '+(result.delivery==='uncertain'?'could not be confirmed.':'failed. Check the invitation and use Resend.'),result.delivery!=='sent');return;}
      if(type==='upload') {const file=data.get('file');if(!file?.size)throw new Error('Choose a non-empty file.');if(form._upload?.file!==file) {
          // File objects from FormData may be recreated; the input File is stable across retries.
          const selected=form.elements.file.files[0];if(form._upload?.file!==selected)form._upload={file:selected,progress:{}};
        }
        await api.upload(state.active.id,form._upload.file,data.has('client_visible'),form._upload.progress);await refresh();notice('File uploaded.');return;}
      if(type==='request'){
        const attachment=form.elements.request_file?.files[0];
        if(attachment){if(form._attachment?.file!==attachment)form._attachment={file:attachment,progress:{}};const uploaded=await api.upload(state.active.id,attachment,true,form._attachment.progress);fileIds.push(uploaded.id);}
        action='request.create';payload={title:value('title'),message:value('message'),topic:'General',file_ids:fileIds};
      }
      if(type==='reply'){action='request.reply';payload={id,body:value('body')};}
      if(type==='triage'){action='request.triage';payload={id,revision,scope_status:value('scope_status'),status:value('status'),owner_id:value('owner_id')||null};}
      if(type==='task'){action='task.save';payload={id,revision,title:value('title'),description:value('description'),status:value('status'),priority:value('priority'),assignee_kind:value('assignee_kind'),assignee_user_id:value('assignee_user_id')||null,due_at:value('due_at')||null,request_id:value('request_id')||null,client_visible:data.has('client_visible')};}
      if(type==='material'){action='material.save';payload={id,revision,title:value('title'),summary:value('summary'),file_ids:fileIds,
        blocks:[...form.querySelectorAll('[data-block-id]')].map(b=>({id:b.dataset.blockId,label:b.querySelector('[name="block-label"]').value.trim(),text:b.querySelector('[name="block-text"]').value.trim(),url:b.querySelector('[name="block-url"]').value.trim()}))};}
      if(type==='form'){action='form.save';payload={id,revision,title:value('title'),description:value('description'),status:value('status'),
        fields:[...form.querySelectorAll('[data-question-id]')].map(q=>({id:q.dataset.questionId,label:q.querySelector('[name="question-label"]').value.trim(),help:q.querySelector('[name="question-help"]').value.trim(),type:q.querySelector('[name="question-type"]').value,required:q.querySelector('[name="question-required"]').checked,options:q.querySelector('[name="question-options"]').value.split('\n').map(x=>x.trim()).filter(Boolean)}))};}
      if(type==='submission'){const f=state.data.forms.find(x=>x.id===id),answers={};for(const q of f.definition.fields){const answer=value('answer:'+q.id);answers[q.id]=q.type==='boolean'&&answer!==''?answer==='true':answer;}action='form.submit';payload={id,form_revision:revision,revision:Number(form.dataset.submissionRevision),answers,status:submitter?.value||'submitted'};}
      if(type==='comment'){action='material.comment';payload={version_id:form.dataset.version,block_id:form.dataset.block||null,parent_id:value('parent_id')||null,body:value('body')};}
      if(type==='review'){action='material.review';payload={version_id:form.dataset.version,status:'changes_requested',note:value('note')};}
      if(type==='update'){action='update.publish';payload={title:value('title'),body:value('body')};}
      if(type==='decision'){action='decision.record';payload={title:value('title'),context:value('context'),decision:value('decision')};}
      if(type==='settings'){action='workspace.save';payload={revision,...Object.fromEntries(['name','welcome','description','focus','phase','objective','scope','roles','rhythm','boundaries','next_step','accent','timezone'].map(k=>[k,value(k)])),
        modules:[...form.querySelectorAll('[data-module]')].filter(li=>li.dataset.module==='home'||li.querySelector('input').checked).map(li=>li.dataset.module)};}
      for(const feature of features){const command=feature.form?.(form,data,value,submitter);if(command){action=command.action;payload=command.payload;break;}}
      if(!action)throw new Error('This form is not available.');
      result=await api.mutate(action,state.active.id,payload,operationFor(form,payload));
      inlineDrafts.delete(draftKey(form));
      state.editorDirty=false;state.editor=null;
      if(type==='material'){state.view='material';state.detail=result.material.id;state.version=result.version.id;history.replaceState({},'',location.pathname+location.search+'#material/'+state.detail+'/'+state.version);}
      if(type==='request'){state.view='request';state.detail=result.id;history.replaceState({},'',location.pathname+location.search+'#request/'+state.detail);}
      if(type==='form'){state.view='forms';history.replaceState({},'',location.pathname+location.search+'#forms');}
      if(type==='settings'){state.view='context';history.replaceState({},'',location.pathname+location.search+'#context');}
      for(const feature of features)feature.afterSave?.(type,result);
      await refresh();
      notice(type==='material'?'Internal draft saved. Publish this version when it is ready.':type==='submission'&&payload.status==='draft'?'Your draft is saved. It has not been sent to the team.':'Saved.');
    }catch(error){formError(form,error);}
    finally{pendingSaves--;form._busy=false;form.removeAttribute('aria-busy');controls.forEach(b=>b.disabled=false);}
  }
  async function click(event) {
    const control=event.target.closest('[data-action]');if(!control)return;
    const action=control.dataset.action,id=control.dataset.id,d=state.data;
    const editors={
      'new-workspace':()=>edit('workspace'),'new-request':()=>edit('request'),'edit-task':()=>edit('task',d.tasks.find(t=>t.id===id)||{}),
      'task-from-request':()=>edit('task',{request_id:id,title:d.requests.find(r=>r.id===id)?.title||''}),
      'triage-request':()=>edit('triage',d.requests.find(r=>r.id===id)),
      'edit-material':()=>{const m=d.materials.find(m=>m.id===id)||{};const lesson=d.learning_units.find(l=>l.material_id===m.id);if(lesson){edit('learning',lesson);return;}const report=d.period_reports.find(r=>r.material_id===m.id);if(report){edit('report',report);return;}edit('material',m,{version:d.material_versions.find(v=>v.id===(m.draft_version_id||m.published_version_id))});},
      'edit-form':()=>edit('form',d.forms.find(f=>f.id===id)||{}),'invite-person':()=>edit('invite'),'upload-file':()=>edit('upload'),
      'publish-update':()=>edit('update'),'record-decision':()=>edit('decision'),'settings':()=>edit('settings'),
      'request-changes':()=>edit('review',{}, {versionId:control.dataset.version}),
    };
    if(editors[action]){editors[action]();return;}
    for(const feature of features)if(feature.localAction?.(action,control))return;
    if(action==='menu'){const open=root.classList.toggle('ws-menu-open');control.setAttribute('aria-expanded',String(open));return;}
    if(action==='cancel-editor'){if(discard()){state.editor=null;state.editorDirty=false;if(['settings','new-workspace'].includes(state.view))state.view='home';render();}return;}
    if(action==='add-block'){control.closest('form').querySelector('[data-block-editors]').insertAdjacentHTML('beforeend',blockEditor());state.editorDirty=true;return;}
    if(action==='add-question'){control.closest('form').querySelector('[data-question-editors]').insertAdjacentHTML('beforeend',questionEditor());state.editorDirty=true;return;}
    if(action==='remove-block'||action==='remove-question'){const row=control.closest('fieldset');if(row.parentElement.children.length>1){row.remove();state.editorDirty=true;}return;}
    if(action==='module-up'||action==='module-down'){const li=control.closest('li'),neighbor=action==='module-up'?li.previousElementSibling:li.nextElementSibling;if(neighbor){if(action==='module-up')li.parentElement.insertBefore(li,neighbor);else li.parentElement.insertBefore(neighbor,li);state.editorDirty=true;}return;}
    if(action==='reply-comment'){const form=control.closest('details').querySelector('form');form.elements.parent_id.value=id;form.elements.body.focus();return;}
    if(action==='copy-draft'){try{await navigator.clipboard.writeText(JSON.stringify([...new FormData(control.closest('form')).entries()],null,2));notice('Draft copied.');}catch{notice('Select and copy your draft before loading the latest version.',true);}return;}
    if(action==='reload-editor'){if(window.confirm('Replace this unsaved draft with the latest saved version?')){state.editorDirty=false;const old=state.editor;await refresh();if(old?.item?.id){const maps={task:'tasks',triage:'requests',form:'forms',material:'materials',...Object.assign({},...features.map(f=>f.editorTable||{}))};const latest=state.data[maps[old.type]]?.find(x=>x.id===old.item.id);if(latest)edit(old.type,latest,old.type==='material'?{version:state.data.material_versions.find(v=>v.id===(latest.draft_version_id||latest.published_version_id))}:{});}else if(old?.type==='settings')edit('settings');}return;}
    if(action==='refresh'){if(discard())await refresh();return;}
    if(control._busy)return;control._busy=true;control.setAttribute('aria-busy','true');control.disabled=true;
    const writing=!['open-inbox-item','download','export'].includes(action);
    if(writing)pendingSaves++;
    try {
      if(action==='open-inbox-item'){if(!discard())return;state.view=control.dataset.view;state.detail=id;state.version=null;history.replaceState({},'',location.pathname+location.search+'#'+state.view+'/'+id);await refresh(control.dataset.workspace);return;}
      if(action==='download'){await api.download(d.workspace_files.find(f=>f.id===id));return;}
      if(action==='export'){if(!state.active){notice('Open a workspace before downloading its shared history.',true);return;}await api.exportWorkspace(state.active.id,control.dataset.format||'markdown');notice('Shared history downloaded. Files can be downloaded separately.');return;}
      let command,payload;
      for(const feature of features){const next=feature.command?.(action,control);if(next){command=next.action;payload=next.payload;break;}}
      if(action==='complete-task'){const t=d.tasks.find(t=>t.id===id);command='task.complete';payload={id,revision:t.revision,status:t.status==='completed'?'open':'completed'};}
      if(action==='publish-material'){const m=d.materials.find(m=>m.id===id);command='material.publish';payload={id,revision:m.revision,version_id:control.dataset.version};}
      if(action==='archive-material'){if(!window.confirm('Archive this material and remove client access to its versions?'))return;const m=d.materials.find(m=>m.id===id);command='material.archive';payload={id,revision:m.revision};state.view='materials';history.replaceState({},'',location.pathname+location.search+'#materials');}
      if(action==='approve-material'){command='material.review';payload={version_id:control.dataset.version,status:'approved',note:''};}
      if(action==='review-submission'){const s=d.form_submissions.find(s=>s.id===id);command='form.review';payload={id,revision:s.revision};}
      if(action==='share-file'){const f=d.workspace_files.find(f=>f.id===id);command='file.share';payload={id,revision:f.revision};}
      if(action==='read-updates'){command='updates.read';payload={};}
      if(['revoke-member','revoke-invite','resend-invite'].includes(action)){
        if(action!=='resend-invite'&&!window.confirm('Remove this access to the current workspace?'))return;
        const response=await api.team(action==='revoke-member'?'revoke_member':action==='revoke-invite'?'revoke_invite':'resend_invite',state.active.id,{id},control._operation||=uuid());
        await refresh();notice(action==='resend-invite'?(response.delivery==='sent'?'Invitation sent.':'Delivery '+response.delivery+'. Check the invitation before trying again.'):'Access updated.',action==='resend-invite'&&response.delivery!=='sent');return;
      }
      if(command){const result=await api.mutate(command,state.active.id,payload,control._operation||=uuid());for(const feature of features)feature.afterCommand?.(action,result);await refresh();notice('Saved.');}
    }catch(error){notice(error.message,true);}
    finally{if(writing)pendingSaves--;control._busy=false;control.removeAttribute('aria-busy');control.disabled=false;}
  }
  async function init() {
    const auth=await window.CLIENT_SPACE_AUTH_READY;
    if(!auth?.accessToken||window.CLIENT_SPACE_CONFIG?.enableCollaboration===false)return;
    const requestedWorkspace=new URLSearchParams(location.search).get('workspace');
    root.hidden=false;document.body.classList.add('workspace-mode');shell();readRoute();navigation();
    root.addEventListener('submit',submit);root.addEventListener('click',click);
    root.addEventListener('input',event=>{const form=event.target.closest('form');if(form){state.editorDirty=true;if(['reply','comment','submission','calendar-comment','calendar-response','learning-answer','learning-feedback','inspiration-comment'].includes(form.dataset.form))inlineDrafts.set(draftKey(form),[...new FormData(form).entries()]);}});
    root.addEventListener('change',async event=>{
      if(event.target.id==='ws-workspace-select'){if(!discard()){event.target.value=state.active?.id;return;}state.view='home';state.detail=null;state.version=null;const url=new URL(location.href);url.searchParams.set('workspace',event.target.value);url.hash='home';history.replaceState({},'',url);await refresh(event.target.value);}
      if(event.target.matches('[data-version-select]'))location.hash='material/'+state.detail+'/'+event.target.value;
      for(const feature of features)feature.change?.(event.target);
    });
    root.addEventListener('click',event=>{const a=event.target.closest('a[href^="#"]');if(!a)return;if(!discard()){event.preventDefault();return;}state.editorDirty=false;state.editor=null;root.classList.remove('ws-menu-open');root.querySelector('[data-action="menu"]').setAttribute('aria-expanded','false');});
    root.addEventListener('click',event=>{if(root.classList.contains('ws-menu-open')&&!event.target.closest('#ws-sidebar,[data-action="menu"]')){root.classList.remove('ws-menu-open');root.querySelector('[data-action="menu"]').setAttribute('aria-expanded','false');}});
    window.addEventListener('focus',()=>{if(initialized&&!pendingSaves&&!state.loading&&!state.editor&&!state.editorDirty)refresh();});
    window.addEventListener('hashchange',async()=>{if(!discard()){history.replaceState({},'',location.pathname+location.search+'#'+state.view+(state.detail?'/'+state.detail:'')+(state.version?'/'+state.version:''));return;}state.editor=null;state.editorDirty=false;readRoute();await refresh();document.querySelector('#ws-content h1')?.focus({preventScroll:true});});
    window.addEventListener('beforeunload',event=>{if(state.editorDirty){event.preventDefault();event.returnValue='';}});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'){root.classList.remove('ws-menu-open');root.querySelector('[data-action="menu"]')?.setAttribute('aria-expanded','false');}});
    try{state.capabilities=await api.team();}catch(error){state.capabilities={canCreate:false};notice(error.message,true);}
    await refresh(requestedWorkspace);
    initialized=true;
  }
  init();
})();
