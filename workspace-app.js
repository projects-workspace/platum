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
  const state = { workspaces: [], active: null, data: null, network: null, editor: null, capabilities: { canCreate: false }, view: 'home', detail: null, version: null, loading: false, generation: 0, controller: null };
  const inlineDrafts = new Map();
  let pendingSaves = 0;
  let initialized = false;
  const draftKey = form => [state.active?.id,form.dataset.community,form.dataset.form,form.dataset.id,form.dataset.version,form.dataset.block].join(':');
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const i18n = window.PLATUM_I18N;
  const uiText = (source, parameters = {}) => ({ __platumUiText: String(source), parameters });
  const isUiText = value => Boolean(value && typeof value === 'object' && value.__platumUiText);
  const textNode = value => isUiText(value) ? i18n.mark(value.__platumUiText, 'span', value.parameters) : escape(value);
  const textAttribute = (name, value) => isUiText(value)
    ? name + '="' + escape(i18n.t(value.__platumUiText, value.parameters)) + '" data-i18n-' + name + '="' + escape(value.__platumUiText) + '" data-i18n-params="' + escape(JSON.stringify(value.parameters)) + '"'
    : name + '="' + escape(value) + '"';
  const uuid = () => crypto.randomUUID();
  const human = value => String(value || '').replaceAll('_', ' ').replace(/^./, c => c.toUpperCase());
  const date = value => i18n.dateMarkup ? i18n.dateMarkup(value) : i18n.dateText(value);
  const dateText = value => i18n.dateText ? i18n.dateText(value) : String(value || '');
  const operator = () => ['owner', 'admin', 'team'].includes(state.active?.role);
  const manager = () => ['owner', 'admin'].includes(state.active?.role);
  const user = () => window.CLIENT_SPACE_AUTH_CONTEXT.user.id;
  const person = id => {
    const name = state.data?.people.find(p => p.user_id === id)?.name;
    return name ? escape(name) : i18n.mark(id === user() ? 'You' : 'Workspace member');
  };
  const badge = (text, tone = '') => '<span class="ws-badge ' + escape(tone) + '">' + textNode(text) + '</span>';
  const button = (action, text, attrs = '', style = 'ws-button') => '<button type="button" class="' + style + '" data-action="' + action + '" ' + attrs + '>' + textNode(text) + '</button>';
  const link = (view, text, id = '') => '<a href="#' + view + (id ? '/' + encodeURIComponent(id) : '') + '">' + textNode(text) + '</a>';
  const empty = (title, copy) => '<div class="ws-empty"><h2>' + textNode(title) + '</h2><p>' + textNode(copy) + '</p></div>';
  const heading = (title, copy = '', actions = '') => '<div class="ws-page-heading"><div><h1 tabindex="-1">' + textNode(title) + '</h1>' + (copy ? '<p>' + textNode(copy) + '</p>' : '') + '</div><div class="ws-actions">' + actions + '</div></div>';
  const field = (label, name, value = '', options = {}) => '<label class="ws-field' + (options.wide ? ' ws-wide' : '') + '">' + textNode(label) +
    (options.help ? '<span class="ws-help">' + textNode(options.help) + '</span>' : '') +
    (options.multiline ? '<textarea ' + textAttribute('aria-label', label) + ' name="' + escape(name) + '" rows="' + (options.rows || 4) + '" maxlength="' + (options.max || 10000) + '"' + (options.required ? ' required' : '') + '>' + escape(value) + '</textarea>'
      : '<input ' + textAttribute('aria-label', label) + ' name="' + escape(name) + '" type="' + (options.type || 'text') + '" maxlength="' + (options.max || 5000) + '" value="' + escape(value) + '"' + (options.required ? ' required' : '') + '>') + '</label>';
  const uiOptions = options => options.map(option => Array.isArray(option) ? option : [option, uiText(i18n.has?.(option) ? option : human(option))]);
  const select = (label, name, options, value = '', attrs = '') => '<label class="ws-field">' + textNode(label) + '<select ' + textAttribute('aria-label', label) + ' name="' + escape(name) + '" ' + attrs + '>' +
    options.map(o => { const item = Array.isArray(o) ? o : [o, human(o)]; return '<option ' + (isUiText(item[1]) ? 'data-i18n-key="' + escape(item[1].__platumUiText) + '" data-i18n-params="' + escape(JSON.stringify(item[1].parameters)) + '" ' : '') + 'value="' + escape(item[0]) + '"' + (String(value) === String(item[0]) ? ' selected' : '') + '>' + escape(isUiText(item[1]) ? i18n.t(item[1].__platumUiText, item[1].parameters) : item[1]) + '</option>'; }).join('') + '</select></label>';
  const check = (label, name, value) => '<label class="ws-check"><input type="checkbox" name="' + escape(name) + '"' + (value ? ' checked' : '') + '>' + textNode(label) + '</label>';
  const safeUrl = value => { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } };
  const external = (url, label) => safeUrl(url) ? '<a href="' + escape(safeUrl(url)) + '" target="_blank" rel="noopener noreferrer">' + textNode(label || url) + '<span class="ws-sr">' + i18n.mark('(opens in a new tab)') + '</span></a>' : '';
  const paragraphs = text => '<div class="ws-prose">' + textNode(text) + '</div>';
  function structured(value) {
    if(value===null||value===undefined)return '';
    if(Array.isArray(value))return '<ul>'+value.map(v=>'<li>'+structured(v)+'</li>').join('')+'</ul>';
    if(typeof value==='object')return '<dl>'+Object.entries(value).map(([k,v])=>'<dt><strong>'+i18n.mark(human(k.replace(/([a-z])([A-Z])/g,'$1 $2')))+'</strong></dt><dd>'+structured(v)+'</dd>').join('')+'</dl>';
    return escape(value);
  }
  const formFoot = (text = uiText('Save changes'), extra = '') => '<div class="ws-form-error" role="alert" hidden></div><div class="ws-form-actions"><button class="ws-button ws-primary" type="submit">' + textNode(text) + '</button>' + extra + button('cancel-editor', uiText('Cancel'), '', 'ws-button ws-quiet') + '</div>';
  const fileList = ids => (ids || []).map(id => state.data.workspace_files.find(f => f.id === id)).filter(Boolean).map(f => button('download', f.name, 'data-id="' + f.id + '"', 'ws-file-link')).join('');
  const filesPicker = ids => '<fieldset class="ws-files-picker"><legend><span data-i18n-key="Attach existing files">Attach existing files</span></legend><p class="ws-help"><span data-i18n-key="Files attached to a request or published material are shared with this workspace.">Files attached to a request or published material are shared with this workspace.</span></p>' +
    (state.data.workspace_files.filter(f => f.status === 'ready').map(f => check(f.name, 'file:' + f.id, (ids || []).includes(f.id))).join('') || '<p><span data-i18n-key="No uploaded files yet. Add them in Files.">No uploaded files yet. Add them in Files.</span></p>') + '</fieldset>';
  const featureContext = {state,api,escape,heading,button,field,select,check,formFoot,person,date,dateText,uiText,uiOptions,textNode,i18n,operator,user,badge,empty,paragraphs,link,external,edit,render,filesPicker,questionEditor};
  const features = [window.PLATUM_CALENDAR_UI(featureContext),window.PLATUM_LEARNING_UI(featureContext),window.PLATUM_PROGRESS_UI(featureContext)];
  const networkFeature = window.PLATUM_NETWORK_UI?.(featureContext);
  if(networkFeature)features.push(networkFeature);
  const personalFeature=window.PLATUM_PERSONAL_UI?.(featureContext);
  if(personalFeature)features.push(personalFeature);
  const globalView=()=>features.some(f=>f.isGlobalView?.(state.view));

  function notice(message, error = false) {
    const node = document.getElementById('ws-notice');
    if (isUiText(message)) node.innerHTML = textNode(message);
    else i18n.setText(node, message);
    node.classList.toggle('is-error', error); node.hidden = false;
    clearTimeout(notice.timer); notice.timer = setTimeout(() => { node.hidden = true; }, error ? 12000 : 6000);
  }
  function shell() {
    root.innerHTML = '<div class="ws-layout"><aside class="ws-sidebar" id="ws-sidebar"><a class="ws-brand" href="#home"><span class="brand-mark"><span data-i18n-key="P">P</span></span><strong><span data-i18n-key="Platum">Platum</span></strong></a>' +
      '<label class="ws-workspace-picker"><span data-i18n-key="Your workspace">Your workspace</span><select id="ws-workspace-select"></select></label><nav id="ws-nav" aria-label="Workspace navigation"></nav>' +
      '<div class="ws-sidebar-bottom"><p><span data-i18n-key="One place for the work we do together.">One place for the work we do together.</span></p>' + button('export', uiText('Download shared history'), '', 'ws-button ws-sidebar-link')+button('export',uiText('Export with attachments'),'data-format="archive"','ws-button ws-sidebar-link') + '</div></aside>' +
      '<div class="ws-main"><header class="ws-header">' + button('menu', uiText('Menu'), 'aria-controls="ws-sidebar" aria-expanded="false"', 'ws-button ws-mobile-menu') +
      '<span id="ws-location"></span><button type="button" class="ws-button ws-header-refresh" data-action="refresh" aria-label="Refresh"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 8a8 8 0 1 0 1 7M19 3v5h-5"/></svg><span><span data-i18n-key="Refresh">Refresh</span></span></button><div id="ws-account"></div></header><div id="ws-notice" class="ws-notice" role="status" aria-live="polite" hidden></div><main id="ws-content"></main></div></div>';
    const account = document.querySelector('.topbar__actions');
    document.getElementById('ws-account').append(account);
    document.getElementById('admin-home-button').hidden = true;
    document.getElementById('sync-note').hidden = true;
    i18n.apply(root);
  }
  function navigation() {
    for(const control of root.querySelectorAll('[data-action="export"]'))control.hidden=Boolean(!state.active||globalView()||control.dataset.format==='archive'&&state.personal?.available===false);
    document.querySelector('.ws-workspace-picker').hidden=Boolean(globalView());
    document.getElementById('ws-workspace-select').innerHTML = state.workspaces.map(w => '<option value="' + w.id + '"' + (w.id === state.active?.id ? ' selected' : '') + '>' + escape(w.name) + '</option>').join('') || '<option data-i18n-key="No workspace yet">No workspace yet</option>';
    const modules = state.active ? state.active.settings?.modules || Object.keys(labels) : [];
    let items = modules.filter(k => labels[k]).map(k => '<a href="#' + k + '" class="' + (state.view === k || state.view === 'material' && k === 'materials' || state.view === 'request' && k === 'work' || state.view === 'form' && k === 'forms' || ['event','availability'].includes(state.view) && k === 'calendar' || state.view==='lesson' && k==='learning' || state.view==='inspiration-item' && k==='inspiration' || ['report','milestone'].includes(state.view)&&k==='reports' ? 'is-current' : '') + '">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true">' + icons[k] + '</svg><span>' + i18n.mark(labels[k]) + '</span></a>').join('');
    if (state.workspaces.some(w => ['owner','admin','team'].includes(w.role))) items += '<div class="ws-nav-divider"></div><a href="#team"' + (state.view === 'team' ? ' class="is-current"' : '') + ' data-i18n-key="Team inbox">Team inbox</a>';
    if (operator()) items += '<a href="#settings"' + (state.view === 'settings' ? ' class="is-current"' : '') + ' data-i18n-key="Workspace settings">Workspace settings</a>';
    if (operator()) items += '<a href="#templates"' + (state.view === 'templates' ? ' class="is-current"' : '') + ' data-i18n-key="Templates">Templates</a>';
    if (manager()) items += '<a href="#members"' + (state.view === 'members' ? ' class="is-current"' : '') + ' data-i18n-key="People & access">People & access</a>';
    if (state.capabilities.canCreate) items += '<a href="#new-workspace"><span data-i18n-key="Create workspace">Create workspace</span></a>';
    if(networkFeature)items='<a href="#communities"'+(state.view.startsWith('communit')?' class="is-current"':'')+' data-i18n-key="Communities">Communities</a>'+
      (operator()?'<a href="#contacts"'+(['contacts','contact'].includes(state.view)?' class="is-current"':'')+' data-i18n-key="Contact network">Contact network</a>':'')+(modules.length?'<div class="ws-nav-divider"></div>':'')+items;
    if(personalFeature&&state.personal?.available!==false)items='<a href="#personal" data-i18n-key="My cabinet">My cabinet</a><a href="#my-contacts" data-i18n-key="My contacts">My contacts</a>'+(!state.active?'<a href="#calendar" data-i18n-key="Calendar">Calendar</a>':'')+items;
    document.getElementById('ws-nav').innerHTML = items;
    const networkLocation=personalFeature?.isGlobalView(state.view)?i18n.t('My cabinet'):networkFeature?.location();
    document.getElementById('ws-location').textContent = networkLocation || (state.active ? state.active.name + ' / ' + i18n.t(operator() ? 'Team workspace' : 'Shared workspace') : i18n.t('Your workspaces'));
    root.dataset.accent = globalView()?'forest':['forest','slate','clay'].includes(state.active?.settings?.accent) ? state.active.settings.accent : 'forest';
    document.title = networkLocation ? networkLocation+' — Platum' : state.active ? state.active.name + ' — Platum' : 'Platum';
    i18n.apply(root);
  }
  function tasksList(tasks) {
    return tasks.map(t => '<article class="ws-work-row"><div class="ws-work-copy"><strong>' + escape(t.title) + '</strong>' + (t.description ? '<p>' + escape(t.description) + '</p>' : '') +
      '<div class="ws-meta">' + badge(uiText(human(t.status))) + '<span>' + (t.assignee_user_id ? person(t.assignee_user_id) : i18n.mark(human(t.assignee_kind))) + '</span>' +
      (t.due_at ? '<span><span data-i18n-key="Due">Due</span> ' + date(t.due_at) + '</span>' : '') + (!t.client_visible ? badge(uiText('Internal')) : '') + '</div>' +
      (t.request_id ? link('request', uiText('Related request'), t.request_id) : '') + '</div><div class="ws-row-actions">' +
      (operator() ? button('edit-task', uiText('Edit'), 'data-id="' + t.id + '"', 'ws-button ws-quiet') : '') +
      (operator() || t.assignee_kind === 'client' && (!t.assignee_user_id || t.assignee_user_id === user()) ? button('complete-task', uiText(t.status === 'completed' ? 'Reopen' : 'Mark complete'), 'data-id="' + t.id + '"', 'ws-button ws-quiet') : '') + '</div></article>').join('');
  }
  function materialList(materials) {
    return materials.map(m => {
      const version = state.data.material_versions.find(v => v.id === (operator() ? m.draft_version_id || m.published_version_id : m.published_version_id));
      const unread = version?.published_at && !state.data.material_reads.some(r => r.version_id === version.id);
      const title = version?.title || m.title;
      return '<article class="ws-material-row"><div><div class="ws-meta">' + badge(uiText(version?.published_at ? 'Published' : version ? 'Draft' : 'Reference')) + (unread ? badge(uiText('New'), 'ws-new') : '') +
        (m.draft_version_id && m.published_version_id && operator() ? badge(uiText('Unpublished changes')) : '') + '</div><h2>' +
        (version ? link('material', title, m.id) : external(m.url, title)) + '</h2><p>' + escape(version?.summary || m.description) + '</p></div>' +
        (version ? '<span class="ws-meta"><span data-i18n-key="Version">Version</span> ' + version.number + '</span>' : '') + '</article>';
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
    return heading(ws.name, ws.settings?.welcome || uiText('A clear view of what we are working on together.'), button('new-request', uiText('Ask the team'), '', 'ws-button ws-primary')) +
      '<section class="ws-focus"><div><h2><span data-i18n-key="Our focus">Our focus</span></h2><p>' + textNode(ws.current_focus || ctx.objective || uiText('Your team will agree the first focus with you.')) + '</p>' +
      (ctx.next_milestone ? '<p class="ws-next"><strong><span data-i18n-key="Next step">Next step</span></strong> ' + escape(ctx.next_milestone) + '</p>' : '') + '</div>' + link('context', uiText('View our agreement')) + '</section>' +
      '<div class="ws-two-columns"><section><div class="ws-section-heading"><h2>' + i18n.mark(operator() ? 'Needs a response' : 'Your next actions') + '</h2>' + link('work',uiText('All work')) + '</div>' +
      requests.map(r => '<article class="ws-action-row">' + link('request',r.title,r.id) + '<p>' + escape(r.message.slice(0,150)) + '</p></article>').join('') +
      materialActions.map(m=>'<article class="ws-action-row">'+link('material',m.title,m.id)+'<p>'+i18n.mark(operator()?'The client requested changes.':'Ready for your review.')+'</p></article>').join('')+
      submittedForms.map(s=>'<article class="ws-action-row">'+link('form',d.forms.find(f=>f.id===s.form_id)?.title||uiText('Questionnaire response'),s.form_id)+'<p><span data-i18n-key="A submitted response is ready for review.">A submitted response is ready for review.</span></p></article>').join('')+
      (!operator() ? activeForms.map(f => '<article class="ws-action-row">' + link('form',f.title,f.id) + '<p>' + escape(f.description) + '</p></article>').join('') : '') +
      tasksList(tasks.slice(0,5)) + (!requests.length && !tasks.length && !materialActions.length && !submittedForms.length && (operator() || !activeForms.length) ? '<p class="ws-muted"><span data-i18n-key="Nothing is waiting on you right now.">Nothing is waiting on you right now.</span></p>' : '') +
      '</section><section><div class="ws-section-heading"><h2><span data-i18n-key="From the team">From the team</span></h2>' + link('updates',uiText('All updates')) + '</div>' +
      (newMaterials.length ? materialList(newMaterials.slice(0,3)) : '<p class="ws-muted"><span data-i18n-key="You are up to date with published materials.">You are up to date with published materials.</span></p>') +
      (d.activity.filter(a=>a.client_visible).sort((a,b)=>Number(b.id)-Number(a.id)).slice(0,2).map(a=>'<article class="ws-action-row"><strong>'+escape(a.summary)+'</strong><p>'+date(a.created_at)+'</p></article>').join('')) + '</section></div>';
  }
  function workView() {
    const d=state.data;
    return heading(uiText('Work & requests'),uiText('Ideas become agreed work, with a clear owner and next step.'),
      button('new-request',uiText('New request'),'','ws-button ws-primary') + (operator()?button('edit-task',uiText('Create task')):''))
      + '<section><div class="ws-section-heading"><h2><span data-i18n-key="Requests">Requests</span></h2></div>' + (d.requests.length?d.requests.slice().sort((a,b)=>b.created_at.localeCompare(a.created_at)).map(r=>'<article class="ws-work-row"><div><h3>'+link('request',r.title,r.id)+'</h3><p>'+escape(r.message.slice(0,180))+'</p><div class="ws-meta">'+badge(uiText(human(r.status)))+badge(uiText(human(r.scope_status)))+(r.owner_id?'<span>'+person(r.owner_id)+'</span>':'')+'</div></div></article>').join(''):empty(uiText('What would you like help with?'),uiText('Describe the idea or situation. You do not need a finished brief.')))+
      '</section><section class="ws-section"><div class="ws-section-heading"><h2><span data-i18n-key="Tasks">Tasks</span></h2></div>'+(d.tasks.length?tasksList(d.tasks):'<p class="ws-muted"><span data-i18n-key="Agreed tasks will appear here.">Agreed tasks will appear here.</span></p>')+'</section>';
  }
  function requestView() {
    const r=state.data.requests.find(x=>x.id===state.detail);
    if(!r)return empty(uiText('Request unavailable'),uiText('Refresh the workspace or ask your team about access.'));
    const replies=state.data.request_replies.filter(x=>x.request_id===r.id).sort((a,b)=>a.created_at.localeCompare(b.created_at));
    return heading(r.title,uiText(human(r.status)),operator()?button('triage-request',uiText('Manage request'),'data-id="'+r.id+'"')+button('task-from-request',uiText('Create linked task'),'data-id="'+r.id+'"'):'')+
      '<article class="ws-reading">'+paragraphs(r.message)+'<div class="ws-meta">'+badge(uiText(human(r.scope_status)))+'<span><span data-i18n-key="Opened">Opened</span> '+date(r.created_at)+'</span>'+(r.owner_id?'<span><span data-i18n-key="Owner:">Owner:</span> '+person(r.owner_id)+'</span>':'')+'</div><div class="ws-attachments">'+fileList(r.file_ids)+'</div></article>'+
      '<section class="ws-thread"><h2><span data-i18n-key="Conversation">Conversation</span></h2>'+replies.map(x=>'<article class="ws-comment"><div class="ws-meta"><strong>'+person(x.author_id)+'</strong><time>'+date(x.created_at)+'</time></div>'+paragraphs(x.body)+'</article>').join('')+
      '<form data-form="reply" data-id="'+r.id+'" class="ws-form">'+field(uiText('Your reply'),'body','',{multiline:true,required:true,max:5000})+formFoot(uiText('Send reply'))+'</form></section>'+
      (state.data.tasks.some(t=>t.request_id===r.id)?'<section class="ws-section"><h2><span data-i18n-key="Linked work">Linked work</span></h2>'+tasksList(state.data.tasks.filter(t=>t.request_id===r.id))+'</section>':'');
  }
  function contextView() {
    const c=state.data.project_context[0]||{}, a=c.collaboration||{};
    return heading(uiText('Our agreement'),uiText('The shared context behind our work.'),operator()?button('settings',uiText('Edit agreement')):'')+
      '<div class="ws-reading">'+[['Goal',c.objective],['Current scope',a.scope],['Who does what',a.roles],['Working rhythm',a.rhythm],['Scope boundaries',a.boundaries],['Next step',c.next_milestone]].map(([title,text])=>'<section class="ws-agreement-section"><h2>'+i18n.mark(title)+'</h2>'+paragraphs(text||uiText('To be agreed together.'))+'</section>').join('')+'</div>'+
      (c.strategy?'<details class="ws-response"><summary><span data-i18n-key="Existing project direction">Existing project direction</span></summary>'+structured(c.strategy)+'</details>':'')+
      (c.milestones?.length?'<details class="ws-response"><summary><span data-i18n-key="Project milestones">Project milestones</span></summary>'+structured(c.milestones)+'</details>':'')+
      '<section class="ws-section"><div class="ws-section-heading"><h2><span data-i18n-key="Decisions">Decisions</span></h2>'+(operator()?button('record-decision',uiText('Record a decision')):'')+'</div>'+
      (state.data.decisions.map(d=>'<article class="ws-work-row"><div><h3>'+escape(d.title)+'</h3>'+paragraphs(d.decision)+'<p class="ws-meta"><span data-i18n-key="Recorded">Recorded</span> '+date(d.decided_at)+' by '+person(d.created_by)+'</p></div></article>').join('')||'<p class="ws-muted"><span data-i18n-key="Agreed decisions will be recorded here.">Agreed decisions will be recorded here.</span></p>')+'</section>';
  }
  function materialView() {
    const d=state.data,m=d.materials.find(x=>x.id===state.detail);
    if(!m)return empty(uiText('Material unavailable'),uiText('It may have been archived or your access may have changed.'));
    const versions=d.material_versions.filter(v=>v.material_id===m.id).sort((a,b)=>b.number-a.number);
    const v=versions.find(x=>x.id===state.version)||versions.find(x=>x.id===(operator()?m.draft_version_id||m.published_version_id:m.published_version_id));
    if(!v)return empty(uiText('No readable version'),uiText('This material does not have an available page yet.'));
    const current=v.id===m.published_version_id;
    const reviews=d.material_reviews.filter(r=>r.version_id===v.id).sort((a,b)=>a.created_at.localeCompare(b.created_at));
    const latest=[...new Map(reviews.map(r=>[r.reviewer_id,r])).values()];
    const actions=operator()?button('edit-material',uiText('Edit draft'),'data-id="'+m.id+'"')+
      (m.draft_version_id===v.id&&!v.published_at?button('publish-material',uiText('Publish this version'),'data-id="'+m.id+'" data-version="'+v.id+'"','ws-button ws-primary'):'')+
      (m.client_visible?button('archive-material',uiText('Archive'),'data-id="'+m.id+'"','ws-button ws-quiet'):'')
      :current?button('approve-material',uiText('Approve this version'),'data-version="'+v.id+'"','ws-button ws-primary')+button('request-changes',uiText('Request changes'),'data-version="'+v.id+'"'):'';
    function discussion(block) {
      const comments=d.material_comments.filter(c=>c.version_id===v.id&&(c.block_id||'')===(block||''));
      return '<details class="ws-discussion"><summary>'+ i18n.mark(block?'Discuss this section':'General discussion')+' <span>'+comments.length+'</span></summary>'+
        comments.map(c=>'<article class="ws-comment"><div class="ws-meta"><strong>'+person(c.author_id)+'</strong><time>'+date(c.created_at)+'</time></div>'+paragraphs(c.body)+button('reply-comment',uiText('Reply'),'data-id="'+c.id+'"','ws-text-button')+'</article>').join('')+
        '<form data-form="comment" data-version="'+v.id+'" data-block="'+escape(block||'')+'" class="ws-form">'+field(uiText('Comment'),'body','',{multiline:true,required:true,rows:3})+'<input type="hidden" name="parent_id"><div class="ws-form-error" role="alert" hidden></div><button class="ws-button" type="submit"><span data-i18n-key="Post comment">Post comment</span></button></form></details>';
    }
    return heading(v.title,v.summary,actions)+'<div class="ws-version-bar">'+badge(uiText(v.published_at?'Published':'Internal draft'))+
      select(uiText('Version'),'version',versions.map(x=>[x.id,uiText('Version {number} · {status}',{number:x.number,status:{__platumUi:x.id===m.published_version_id?'current':x.published_at?'previous':'draft'}})]),v.id,'data-version-select')+
      '<span>'+date(v.published_at||v.created_at)+'</span></div>'+
      (!current&&!operator()?'<p class="ws-inline-note">You are viewing an earlier version. '+link('material',uiText('Open the current version'),m.id)+'</p>':'')+
      (latest.length?'<section class="ws-review-records" aria-label="Decisions on this version">'+latest.map(r=>'<div>'+badge(uiText(human(r.status)),r.status==='approved'?'ws-positive':'')+' <strong>'+person(r.reviewer_id)+'</strong> · '+date(r.created_at)+(r.note?paragraphs(r.note):'')+'</div>').join('')+'</section>':'')+
      '<article class="ws-reading">'+v.blocks.map(b=>'<section class="ws-document-block" id="block-'+escape(b.id)+'"><h2>'+escape(b.label)+'</h2>'+paragraphs(b.text)+(b.url?'<p>'+external(b.url,uiText('Open reference'))+'</p>':'')+discussion(b.id)+'</section>').join('')+
      '<div class="ws-attachments">'+fileList(v.file_ids)+'</div>'+discussion(null)+'</article>';
  }
  function formsView() {
    return heading(uiText(operator()?'Questionnaires':'Questions for you'),uiText('A little context, exactly where it helps.'),operator()?button('edit-form',uiText('Create questionnaire'),'','ws-button ws-primary'):'')+
      (state.data.forms.length?state.data.forms.map(f=>{const submissions=state.data.form_submissions.filter(s=>s.form_id===f.id&&s.form_revision===f.revision&&s.submitted_by===user());return '<article class="ws-work-row"><div><h2>'+link('form',f.title,f.id)+'</h2><p>'+escape(f.description)+'</p><div class="ws-meta">'+badge(uiText(human(f.status)))+(submissions[0]?badge(uiText(human(submissions[0].status))):'')+'</div></div>'+(operator()?button('edit-form',uiText('Edit'),'data-id="'+f.id+'"'):'')+'</article>';}).join(''):empty(uiText('No questions waiting'),uiText('Your team will ask for information when it is needed.')));
  }
  function formView() {
    const d=state.data,f=d.forms.find(x=>x.id===state.detail);
    if(!f)return empty(uiText('Questionnaire unavailable'),uiText('Your team may have closed or withdrawn this questionnaire.'));
    if(!Array.isArray(f.definition.fields)||!f.definition.fields.length)return heading(f.title,f.description,operator()?button('edit-form',uiText('Configure questions'),'data-id=\"'+f.id+'\"'):'')+empty(uiText('Questions are being prepared'),uiText('The team needs to configure this questionnaire before it can accept answers.'));
    const mine=d.form_submissions.filter(s=>s.form_id===f.id&&s.submitted_by===user()).sort((a,b)=>b.form_revision-a.form_revision);
    const current=mine.find(s=>s.form_revision===f.revision&&s.definition_snapshot?.fields), previous=mine[0], answers=(current||previous)?.answers||{};
    const locked=f.status!=='active'||current&&current.status!=='draft';
    function answerField(q) {
      const value=answers[q.id]??'';
      if(q.type==='select'||q.type==='boolean')return select(q.label,'answer:'+q.id,uiOptions([['',uiText('Choose an answer')],...(q.type==='boolean'?[['true',uiText('Yes')],['false',uiText('No')]]:(q.options||[]).map(v=>[v,v]))]),String(value),(q.required?'required ':'')+(locked?'disabled ':''));
      return field(q.label+(q.required?' *':''),'answer:'+q.id,value,{multiline:q.type==='textarea',type:q.type==='url'?'url':'text',required:q.required,help:q.help});
    }
    const responseForm='<form data-form="submission" data-id="'+f.id+'" data-revision="'+f.revision+'" data-submission-revision="'+(current?.revision||0)+'" class="ws-form ws-reading">'+
      (previous&&!current?'<p class="ws-inline-note"><span data-i18n-key="Your earlier answers are filled in where questions still match. Review them before submitting this version.">Your earlier answers are filled in where questions still match. Review them before submitting this version.</span></p>':'')+
      '<fieldset'+(locked?' disabled':'')+' class="ws-question-fields">'+(f.definition.fields||[]).map(q=>'<div>'+answerField(q)+(q.help&&['select','boolean'].includes(q.type)?'<p class="ws-help">'+escape(q.help)+'</p>':'')+'</div>').join('')+'</fieldset>'+
      (locked?'<p class="ws-inline-note">'+(current?i18n.mark('Response {status}. Your original answers are preserved.', 'span', {status:{__platumUi:human(current.status)}}):i18n.mark('This questionnaire is not accepting responses.'))+'</p>':'<p class="ws-help"><span data-i18n-key="Draft answers stay private until you submit them to the team.">Draft answers stay private until you submit them to the team.</span></p><div class="ws-form-error" role="alert" hidden></div><div class="ws-form-actions"><button class="ws-button ws-primary" type="submit" value="submitted"><span data-i18n-key="Submit to the team">Submit to the team</span></button><button class="ws-button" type="submit" value="draft" formnovalidate><span data-i18n-key="Save draft">Save draft</span></button></div>')+'</form>';
    const responses=operator()?'<section class="ws-section"><h2><span data-i18n-key="Submitted responses">Submitted responses</span></h2>'+d.form_submissions.filter(s=>s.form_id===f.id&&s.status!=='draft').map(s=>'<details class="ws-response"><summary>'+person(s.submitted_by)+' · '+i18n.mark('version')+' '+s.form_revision+' · '+human(s.status)+'</summary>'+
      (s.definition_snapshot.fields||[]).map(q=>'<section><h3>'+escape(q.label)+'</h3>'+paragraphs(typeof s.answers[q.id]==='boolean'?uiText(s.answers[q.id]?'Yes':'No'):s.answers[q.id]||uiText('No answer'))+'</section>').join('')+
      (s.status==='submitted'?button('review-submission',uiText('Mark reviewed'),'data-id="'+s.id+'"'):'')+'</details>').join('')+'</section>':'';
    return heading(f.title,f.description,operator()?button('edit-form',uiText('Edit questionnaire'),'data-id="'+f.id+'"'):'')+(operator()?responses:responseForm);
  }
  function filesView() {
    return heading(uiText('Files'),uiText('Documents and images stay within this workspace.'),button('upload-file',uiText('Upload a file'),'','ws-button ws-primary')+button('export',uiText('Export data (JSON)'),'data-format="json"'))+
      (state.data.workspace_files.length?state.data.workspace_files.map(f=>'<article class="ws-work-row"><div><h3>'+escape(f.name)+'</h3><div class="ws-meta"><span>'+Math.ceil(f.size_bytes/1024)+' KB</span>'+badge(uiText(f.status==='ready'?(f.client_visible?'Shared':'Linked or internal'):'Upload incomplete'))+'<span>'+date(f.created_at)+'</span></div></div><div class="ws-row-actions">'+
        (f.status==='ready'?button('download',uiText('Download'),'data-id="'+f.id+'"'):'')+(operator()&&!f.client_visible&&f.status==='ready'?button('share-file',uiText('Share with client'),'data-id="'+f.id+'"'):'')+'</div></article>').join(''):empty(uiText('A home for useful files'),uiText('Upload a document or image. Add large video projects as external links in a material.')));
  }
  function updatesView() {
    const seen=state.data.workspace_reads[0]?.updates_seen_at;
    const events=state.data.activity.slice().sort((a,b)=>Number(b.id)-Number(a.id));
    return heading(uiText('Updates'),uiText('What changed, what we learned, and what comes next.'),(operator()?button('publish-update',uiText('Write an update'),'','ws-button ws-primary'):'')+button('read-updates',uiText('Mark updates as read')))+
      (events.length?'<div class="ws-timeline">'+events.map(a=>'<article><div class="ws-meta"><time>'+date(a.created_at)+'</time>'+(!seen||a.created_at>seen?badge(uiText('New'),'ws-new'):'')+(!a.client_visible?badge(uiText('Internal')):'')+'</div><h2>'+escape(a.summary)+'</h2>'+
        (a.metadata?.body?paragraphs(a.metadata.body):'')+(a.entity_type==='material'?link('material',uiText('Open material'),a.entity_id):a.entity_type==='request'?link('request',uiText('Open request'),a.entity_id):'')+'</article>').join('')+'</div>':empty(uiText('The story starts here'),uiText('Published updates and important actions will build a shared record of your work.')));
  }
  function membersView() {
    if(!manager())return empty(uiText('Team management'),uiText('Only workspace owners and administrators can manage access.'));
    return heading(uiText('People & access'),uiText('Workspace roles apply here. Platform founders have access across all workspaces.'),button('invite-person',uiText('Invite someone'),'','ws-button ws-primary'))+
      '<section><h2><span data-i18n-key="Members">Members</span></h2>'+state.data.people.map(p=>'<article class="ws-work-row"><div><strong>'+escape(p.name)+'</strong><p>'+escape(p.email||'')+'</p>'+badge(uiText(human(p.role)))+(p.platform_role?badge(uiText(p.platform_role==='founder'?'Platform founder':'Platform administrator')):'')+'</div>'+
        (!p.platform_role&&(state.active.role==='owner'||['client','team'].includes(p.role))?button('revoke-member',uiText('Remove access'),'data-id="'+p.user_id+'"','ws-button ws-quiet'):'')+'</article>').join('')+'</section>'+
      '<section class="ws-section"><h2><span data-i18n-key="Invitations">Invitations</span></h2>'+state.data.workspace_invitations.map(i=>'<article class="ws-work-row"><div><strong>'+escape(i.email)+'</strong><div class="ws-meta">'+badge(uiText(i.status==='pending'&&new Date(i.expires_at)<new Date()?'Expired':human(i.status)))+'<span>'+i18n.mark(human(i.role))+'</span><span><span data-i18n-key="Delivery:">Delivery:</span> '+i18n.mark(human(i.mail_status))+'</span></div></div>'+
        (i.status==='pending'?'<div class="ws-row-actions">'+button('resend-invite',uiText('Resend'),'data-id="'+i.id+'"')+button('revoke-invite',uiText('Revoke'),'data-id="'+i.id+'"','ws-button ws-quiet')+'</div>':'')+'</article>').join('')+'</section>';
  }
  function blockEditor(b = { id: 'b_' + uuid(), label: '', text: '', url: '' }) {
    return '<fieldset class="ws-block-editor" data-block-id="'+escape(b.id)+'"><legend><span data-i18n-key="Material section">Material section</span></legend>'+field(uiText('Section title'),'block-label',b.label,{required:true,max:160})+
      field(uiText('Content'),'block-text',b.text,{multiline:true,rows:5})+field(uiText('Reference link (optional)'),'block-url',b.url,{type:'url',max:2000})+
      button('remove-block',uiText('Remove section'),'','ws-text-button')+'</fieldset>';
  }
  function questionEditor(q = { id: 'q_'+uuid(), label: '', help: uiText(''), type: 'text', required: false, options: [] }) {
    return '<fieldset class="ws-question-editor" data-question-id="'+escape(q.id)+'"><legend><span data-i18n-key="Question">Question</span></legend>'+field(uiText('Question'),'question-label',q.label,{required:true,max:250})+
      field(uiText('Why we are asking'),'question-help',q.help,{max:1500})+select(uiText('Answer format'),'question-type',uiOptions([['text',uiText('Short answer')],['textarea',uiText('Long answer')],['url',uiText('Link')],['select',uiText('Choose an option')],['boolean',uiText('Yes or no')]]),q.type)+
      field(uiText('Choices, one per line (for a choice question)'),'question-options',(q.options||[]).join('\n'),{multiline:true,rows:3,max:3200})+
      check(uiText('Required question'),'question-required',q.required)+button('remove-question',uiText('Remove question'),'','ws-text-button')+'</fieldset>';
  }
  function editorView() {
    const e=state.editor,d=state.data||{},item=e.item||{};
    for(const feature of features){const content=feature.editor?.(e);if(content!==null&&content!==undefined)return content;}
    if(e.type==='workspace')return heading(uiText('Create a workspace'),uiText('Start with a reusable shared workspace.'))+'<form class="ws-form ws-reading" data-form="workspace">'+field(uiText('Workspace name'),'name','',{required:true,max:120})+formFoot(uiText('Create workspace'))+'</form>';
    if(e.type==='request')return heading(uiText('What would you like help with?'),uiText('Share the idea, question, or situation. The team will help define the work.'))+
      '<form class="ws-form ws-reading" data-form="request">'+field(uiText('Short title'),'title','',{required:true,max:160})+field(uiText('Tell us what you need'),'message','',{required:true,multiline:true,max:5000})+
      '<details><summary><span data-i18n-key="Attach files (optional)">Attach files (optional)</span></summary><label class="ws-field">Upload a document or image<input type="file" name="request_file" accept=".pdf,.txt,.md,.docx,.png,.jpg,.jpeg,.webp"></label><p class="ws-help"><span data-i18n-key="Maximum 10 MB. Attachments are shared with this workspace.">Maximum 10 MB. Attachments are shared with this workspace.</span></p>'+filesPicker([])+'</details>'+formFoot(uiText('Send request'))+'</form>';
    if(e.type==='task')return heading(uiText(item.id?'Edit task':'Create a task'),uiText('Make the next action and its owner clear.'))+'<form class="ws-form ws-reading" data-form="task" data-id="'+(item.id||'')+'" data-revision="'+(item.revision||0)+'">'+
      field(uiText('Task title'),'title',item.title,{required:true,max:160})+field(uiText('What needs to happen'),'description',item.description,{multiline:true,max:5000})+
      '<div class="ws-form-grid">'+select(uiText('Assigned to'),'assignee_kind',uiOptions(['client','team']),item.assignee_kind||'client')+
      select(uiText('Person (optional)'),'assignee_user_id',uiOptions([['',uiText('Anyone on that side')],...d.people.map(p=>[p.user_id,p.name+' · '+human(p.role)])]),item.assignee_user_id||'')+
      select(uiText('Status'),'status',uiOptions(['open','in_progress','waiting','review','completed','cancelled']),item.status||'open')+
      select(uiText('Priority'),'priority',uiOptions(['low','medium','high']),item.priority||'medium')+field(uiText('Due date'),'due_at',item.due_at?new Date(item.due_at).toISOString().slice(0,10):'',{type:'date'})+
      select(uiText('Related request'),'request_id',uiOptions([['',uiText('No linked request')],...d.requests.map(r=>[r.id,r.title])]),item.request_id||'')+'</div>'+
      check(uiText('Visible to the client'),'client_visible',item.client_visible!==false)+formFoot()+'</form>';
    if(e.type==='triage')return heading(uiText('Manage request'),item.title)+'<form class="ws-form ws-reading" data-form="triage" data-id="'+item.id+'" data-revision="'+item.revision+'">'+
      select(uiText('Scope decision'),'scope_status',uiOptions([['needs_clarification',uiText('Needs clarification')],['included',uiText('Included in current scope')],['reprioritize',uiText('Requires a priority change')],['separate_agreement',uiText('Needs a separate agreement')]]),item.scope_status)+
      select(uiText('Next action sits with'),'status',uiOptions([['waiting_team',uiText('Team response needed')],['waiting_client',uiText('Client response needed')],['in_progress',uiText('Work in progress')],['responded',uiText('Response delivered')],['resolved',uiText('Resolved')]]),item.status)+
      select(uiText('Team owner'),'owner_id',uiOptions([['',uiText('Not assigned yet')],...d.people.filter(p=>p.role!=='client').map(p=>[p.user_id,p.name])]),item.owner_id||'')+
      '<p class="ws-help"><span data-i18n-key="Explain a scope or priority change in the request conversation. This setting does not charge the client.">Explain a scope or priority change in the request conversation. This setting does not charge the client.</span></p>'+formFoot()+'</form>';
    if(e.type==='material') {
      const v=e.version||{title:'',summary:'',blocks:[{id:'b_'+uuid(),label:i18n.t('Context'),text:''},{id:'b_'+uuid(),label:i18n.t('Recommendation'),text:''},{id:'b_'+uuid(),label:i18n.t('Next step'),text:''}],file_ids:[]};
      return heading(uiText(item.id?'Edit material':'Create a material'),uiText('Save an internal draft, then publish a specific version for the client.'))+
        '<form class="ws-form ws-reading" data-form="material" data-id="'+(item.id||'')+'" data-revision="'+(item.revision||0)+'">'+
        field(uiText('Title'),'title',v.title,{required:true,max:160})+field(uiText('Short summary'),'summary',v.summary,{multiline:true,rows:3,max:3000})+
        '<div data-block-editors>'+v.blocks.map(blockEditor).join('')+'</div>'+button('add-block',uiText('Add section'))+filesPicker(v.file_ids)+formFoot(uiText('Save internal draft'))+'</form>';
    }
    if(e.type==='form')return heading(uiText(item.id?'Edit questionnaire':'Create a questionnaire'),uiText('Ask only for the information that helps the next step.'))+
      '<form class="ws-form ws-reading" data-form="form" data-id="'+(item.id||'')+'" data-revision="'+(item.revision||0)+'">'+field(uiText('Title'),'title',item.title,{required:true,max:160})+
      field(uiText('What these answers will help us do'),'description',item.description,{multiline:true,rows:3,max:5000})+
      '<div data-question-editors>'+(Array.isArray(item.definition?.fields)&&item.definition.fields.length?item.definition.fields:[{id:'q_'+uuid(),label:'',help:'',type:'text',required:true}]).map(questionEditor).join('')+'</div>'+button('add-question',uiText('Add question'))+
      select(uiText('Availability'),'status',uiOptions([['draft',uiText('Internal draft')],['active',uiText('Published · accepting answers')],['closed',uiText('Published · closed')]]),item.status||'draft')+
      '<p class="ws-help"><span data-i18n-key="Changing a questionnaire creates a new revision. Submitted answers keep their original questions.">Changing a questionnaire creates a new revision. Submitted answers keep their original questions.</span></p>'+formFoot()+'</form>';
    if(e.type==='settings') {
      const ws=state.active,c=d.project_context[0]||{},a=c.collaboration||{},modules=ws.settings?.modules||Object.keys(labels),all=[...modules,...Object.keys(labels).filter(k=>!modules.includes(k))];
      return heading(uiText('Workspace settings'),uiText('Keep the experience relevant to this client.'))+'<form class="ws-form ws-reading" data-form="settings" data-revision="'+ws.revision+'">'+
        '<div class="ws-form-grid">'+field(uiText('Workspace name'),'name',ws.name,{required:true,max:120})+select(uiText('Accent'),'accent',uiOptions([['forest',uiText('Forest')],['slate',uiText('Slate')],['clay',uiText('Clay')]]),ws.settings?.accent||'forest')+'</div>'+
        field(uiText('Default time zone'),'timezone',ws.settings?.timezone||'UTC',{required:true,max:100,help:uiText('An IANA zone such as Europe/Prague. Members can set their own display zone in Availability.')})+
        field(uiText('Welcome message'),'welcome',ws.settings?.welcome,{multiline:true,rows:2,max:2000})+field(uiText('Short project description'),'description',ws.description,{multiline:true,max:5000})+
        field(uiText('Current focus'),'focus',ws.current_focus,{max:500})+field(uiText('Current phase'),'phase',ws.current_phase,{max:160})+
        field(uiText('Agreed goal'),'objective',c.objective,{multiline:true,max:5000})+field(uiText('Current scope'),'scope',a.scope,{multiline:true,max:5000})+
        field(uiText('Who does what'),'roles',a.roles,{multiline:true,max:5000})+field(uiText('Working rhythm'),'rhythm',a.rhythm,{multiline:true,rows:3,max:2000})+
        field(uiText('Scope boundaries'),'boundaries',a.boundaries,{multiline:true,rows:3,max:3000})+field(uiText('Next agreed step'),'next_step',c.next_milestone,{max:1000})+
        '<fieldset><legend><span data-i18n-key="Sections and their order">Sections and their order</span></legend><p class="ws-help"><span data-i18n-key="Hidden sections stay available to the team. This does not change data permissions.">Hidden sections stay available to the team. This does not change data permissions.</span></p><ul class="ws-module-list">'+
        all.map(k=>'<li data-module="'+k+'">'+(k==='home'?'<label class="ws-check"><input type="checkbox" name="module:home" checked disabled><span data-i18n-key="Overview">Overview</span></label>':check(uiText(labels[k]),'module:'+k,modules.includes(k)))+
          '<div>'+button('module-up',uiText('Move up'),'','ws-text-button')+button('module-down',uiText('Move down'),'','ws-text-button')+'</div></li>').join('')+'</ul></fieldset>'+formFoot()+'</form>';
    }
    if(e.type==='invite')return heading(uiText('Invite someone'),uiText('They will receive a secure link. Access starts after they sign in with this email.'))+
      '<form class="ws-form ws-reading" data-form="invite">'+field(uiText('Email address'),'email','',{required:true,type:'email',max:254})+
      select(uiText('Workspace role'),'role',uiOptions([['client',uiText('Client')],['team',uiText('Team member')],...(state.active.role==='owner'?[['admin',uiText('Administrator')]]:[])]),'client')+formFoot(uiText('Send invitation'))+'</form>';
    if(e.type==='upload')return heading(uiText('Upload a file'),uiText('PDF, text, DOCX, PNG, JPEG or WebP. Maximum 10 MB. Large videos can be linked in Materials.'))+
      '<form class="ws-form ws-reading" data-form="upload"><label class="ws-field">File<input type="file" name="file" required accept=".pdf,.txt,.md,.docx,.png,.jpg,.jpeg,.webp"></label>'+
      (operator()?check(uiText('Share directly with the client'),'client_visible',false)+'<p class="ws-help"><span data-i18n-key="Otherwise this file stays internal until attached to a published material.">Otherwise this file stays internal until attached to a published material.</span></p>':'<p class="ws-help"><span data-i18n-key="Uploaded files are shared with your workspace team.">Uploaded files are shared with your workspace team.</span></p>')+formFoot(uiText('Upload file'))+'</form>';
    if(e.type==='update')return heading(uiText('Publish an update'),uiText('Help the client see what changed and what comes next.'))+'<form class="ws-form ws-reading" data-form="update">'+
      field(uiText('Title'),'title','',{required:true,max:160})+field(uiText('Update'),'body','',{required:true,multiline:true,help:uiText('Include completed work, any verified results, open decisions and the next step.')})+formFoot(uiText('Publish update'))+'</form>';
    if(e.type==='decision')return heading(uiText('Record a decision'),uiText('Keep the agreed outcome and its context together.'))+'<form class="ws-form ws-reading" data-form="decision">'+
      field(uiText('Decision title'),'title','',{required:true,max:160})+field(uiText('Context'),'context','',{multiline:true,max:5000})+field(uiText('Agreed decision'),'decision','',{required:true,multiline:true})+formFoot(uiText('Record decision'))+'</form>';
    if(e.type==='review')return heading(uiText('Request changes'),uiText('Your feedback is attached to this exact version.'))+'<form class="ws-form ws-reading" data-form="review" data-version="'+e.versionId+'">'+
      field(uiText('What should change?'),'note','',{required:true,multiline:true})+formFoot(uiText('Send feedback'))+'</form>';
    return '';
  }
  async function teamView() {
    const holder=document.getElementById('ws-content'),gen=state.generation;
    holder.innerHTML=heading(uiText('Team inbox'),uiText('Decisions and responses across your assigned client workspaces.'))+'<p role="status"><span data-i18n-key="Loading your inbox…">Loading your inbox…</span></p>';
    i18n.apply(holder);
    try {
      const items=await api.queue(state.workspaces.filter(w=>['owner','admin','team'].includes(w.role)).map(w=>w.id));
      if(gen!==state.generation||state.view!=='team')return;
      holder.innerHTML=heading(uiText('Team inbox'),uiText('Decisions and responses across your assigned client workspaces.'),state.capabilities.canCreate?button('new-workspace',uiText('Create workspace')):'')+
        (items.length?items.map(i=>'<article class="ws-work-row"><div><span class="ws-meta">'+escape(state.workspaces.find(w=>w.id===i.workspace_id)?.name||'Workspace')+'</span><h2>'+escape(i.title)+'</h2>'+badge(uiText(i.reason))+'</div>'+
          button('open-inbox-item',uiText('Open'),'data-workspace="'+i.workspace_id+'" data-view="'+i.view+'" data-id="'+i.id+'"')+'</article>').join(''):empty(uiText('The inbox is clear'),uiText('New client requests, submitted answers and requested changes will appear here.')));
      i18n.apply(holder);
    }catch(error){if(gen===state.generation){holder.innerHTML=heading(uiText('Team inbox'))+empty(uiText('Could not load your inbox'),uiText(error.message))+button('refresh',uiText('Try again'));i18n.apply(holder);}}
  }
  function render() {
    navigation();
    const content=document.getElementById('ws-content');
    if(state.loading){content.innerHTML='<div class="ws-loading" role="status"><span data-i18n-key="Opening your workspace…">Opening your workspace…</span></div>';i18n.apply(content);return;}
    if(personalFeature?.isGlobalView(state.view)&&state.personal?.available===false){content.innerHTML=heading(uiText('Personal features are being prepared.'))+empty(uiText('Refresh later or contact the team.'))+button('refresh',uiText('Try again'));i18n.apply(content);return;}
    if(state.editor){content.innerHTML=editorView();i18n.apply(content);content.querySelector('h1')?.focus({preventScroll:true});return;}
    if(state.view==='new-workspace'&&state.capabilities.canCreate){state.editor={type:'workspace'};content.innerHTML=editorView();i18n.apply(content);return;}
    if((!state.active||!state.data)&&!globalView()){content.innerHTML=heading(uiText('Your workspaces'),uiText('Your account is signed in.'))+
      empty(uiText('No workspace access yet'),state.capabilities.canCreate?'Create your first shared workspace to begin.':'Ask your team to invite this email. An invitation may have expired or been revoked.')+
      (state.capabilities.canCreate?button('new-workspace',uiText('Create workspace'),'','ws-button ws-primary'):'')+button('refresh',uiText('Check again'))+(networkFeature?link('communities',uiText('Open communities')):'');i18n.apply(content);return;}
    if(state.view==='settings'&&operator()){state.editor={type:'settings'};content.innerHTML=editorView();i18n.apply(content);return;}
    if(state.view==='team'){teamView();return;}
    const views={home:homeView,work:workView,request:requestView,context:contextView,material:materialView,forms:formsView,form:formView,files:filesView,updates:updatesView,members:membersView,
      materials:()=>heading(uiText('Materials'),uiText('Ideas, recommendations and results, with room for your feedback.'),operator()?button('edit-material',uiText('Create material'),'','ws-button ws-primary'):'')+
        (state.data.materials.length?materialList(state.data.materials):empty(uiText('Your shared reference point'),uiText('Published recommendations and results will appear here.')))+(state.data.deliverables.length?'<section class=\"ws-section\"><h2><span data-i18n-key="Delivered resources">Delivered resources</span></h2>'+state.data.deliverables.map(d=>'<article class=\"ws-material-row\"><div><h3>'+external(d.url,d.title)+'</h3>'+paragraphs(d.description)+'</div></article>').join('')+'</section>':'')};
    for(const feature of features)Object.assign(views,feature.views);
    content.innerHTML=(views[state.view]||homeView)()+(state.view==='home'?features.map(f=>f.home?.()||'').join(''):'');
    i18n.apply(content);
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
    if(!window.confirm(i18n.t('Discard your unsaved changes?')))return false;
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
      const [data,network,personal]=await Promise.all([state.active?api.bundle(state.active.id,state.controller.signal):null,api.network?api.network(state.controller.signal):null,api.personal?api.personal(state.controller.signal):null]);
      if(generation!==state.generation)return;
      state.data=data;
      state.network=network;
      state.personal=personal;
      if(personalFeature&&personal?.available!==false&&!state.active&&state.view==='home')state.view='personal';
      state.loading=false;render();
    }catch(error){
      if(error.name==='AbortError'||generation!==state.generation)return;
      state.loading=false;state.data=null;navigation();
      document.getElementById('ws-content').innerHTML=heading(uiText('Workspace unavailable'))+empty(uiText('We could not open your workspace'),uiText(error.message))+button('refresh',uiText('Try again'));
    }
  }
  function formError(form,error) {
    const target=form.querySelector('.ws-form-error');if(!target)return;
    target.hidden=false;target.innerHTML=i18n.mark(error.message);
    if(['CONFLICT','FORM_CHANGED','CURRENT_VERSION_CHANGED'].includes(error.code))target.insertAdjacentHTML('beforeend','<div class="ws-actions">'+button('copy-draft',uiText('Copy my draft'))+button('reload-editor',uiText('Load latest version'))+'</div>');
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
    let action,payload,result,featureCommand;
    form._busy=true;pendingSaves++;form.setAttribute('aria-busy','true');const controls=[...form.querySelectorAll('button[type="submit"]')];controls.forEach(b=>b.disabled=true);
    try {
      if(type==='workspace') {payload={name:value('name')};result=await api.team('create_workspace',null,payload,operationFor(form,payload));state.capabilities.canCreate=true;state.editor=null;state.editorDirty=false;state.view='home';history.replaceState({},'',location.pathname+location.search+'#home');await refresh(result.workspace.id);notice('Workspace created. Add context and invite your client.');return;}
      if(type==='invite') {payload={email:value('email'),role:value('role')};result=await api.team('invite',state.active.id,payload,operationFor(form,payload));await refresh();notice(result.delivery==='sent'?'Invitation sent.':result.delivery==='uncertain'?'Invitation saved, but delivery could not be confirmed.':'Invitation saved, but delivery failed. Check the invitation and use Resend.',result.delivery!=='sent');return;}
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
      for(const feature of features){const command=feature.form?.(form,data,value,submitter);if(command){action=command.action;payload=command.payload;featureCommand=command;break;}}
      if(!action)throw new Error('This form is not available.');
      result=featureCommand?.network
        ? await api[featureCommand.personal?'personalMutate':featureCommand.service?'community':'networkMutate'](action,featureCommand.scope,payload,operationFor(form,payload))
        : await api.mutate(action,state.active.id,payload,operationFor(form,payload));
      inlineDrafts.delete(draftKey(form));
      state.editorDirty=false;state.editor=null;
      if(type==='material'){state.view='material';state.detail=result.material.id;state.version=result.version.id;history.replaceState({},'',location.pathname+location.search+'#material/'+state.detail+'/'+state.version);}
      if(type==='request'){state.view='request';state.detail=result.id;history.replaceState({},'',location.pathname+location.search+'#request/'+state.detail);}
      if(type==='form'){state.view='forms';history.replaceState({},'',location.pathname+location.search+'#forms');}
      if(type==='settings'){state.view='context';history.replaceState({},'',location.pathname+location.search+'#context');}
      for(const feature of features)feature.afterSave?.(type,result);
      await refresh();
      notice(result?.delivery ? (result.delivery==='sent'?'Invitation sent.':uiText('Delivery {status}. Check the invitation before trying again.',{status:{__platumUi:result.delivery}})) : type==='material'?'Internal draft saved. Publish this version when it is ready.':type==='submission'&&payload.status==='draft'?'Your draft is saved. It has not been sent to the team.':'Saved.',Boolean(result?.delivery&&result.delivery!=='sent'));
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
    for(const feature of features)if(feature.localAction?.(action,control)){i18n.apply(root);return;}
    if(action==='menu'){const open=root.classList.toggle('ws-menu-open');control.setAttribute('aria-expanded',String(open));return;}
    if(action==='cancel-editor'){if(discard()){state.editor=null;state.editorDirty=false;if(['settings','new-workspace'].includes(state.view))state.view='home';render();}return;}
    if(action==='add-block'){control.closest('form').querySelector('[data-block-editors]').insertAdjacentHTML('beforeend',blockEditor());state.editorDirty=true;i18n.apply(root);return;}
    if(action==='add-question'){control.closest('form').querySelector('[data-question-editors]').insertAdjacentHTML('beforeend',questionEditor());state.editorDirty=true;i18n.apply(root);return;}
    if(action==='remove-block'||action==='remove-question'){const row=control.closest('fieldset');if(row.parentElement.children.length>1){row.remove();state.editorDirty=true;}return;}
    if(action==='module-up'||action==='module-down'){const li=control.closest('li'),neighbor=action==='module-up'?li.previousElementSibling:li.nextElementSibling;if(neighbor){if(action==='module-up')li.parentElement.insertBefore(li,neighbor);else li.parentElement.insertBefore(neighbor,li);state.editorDirty=true;}return;}
    if(action==='reply-comment'){const form=control.closest('details').querySelector('form');form.elements.parent_id.value=id;form.elements.body.focus();return;}
    if(action==='copy-draft'){try{await navigator.clipboard.writeText(JSON.stringify([...new FormData(control.closest('form')).entries()],null,2));notice('Draft copied.');}catch{notice('Select and copy your draft before loading the latest version.',true);}return;}
    if(action==='reload-editor'){
      if(window.confirm(i18n.t('Replace this unsaved draft with the latest saved version?'))){
        state.editorDirty=false;const old=state.editor;await refresh();
        const special=features.map(f=>f.reloadEditor?.(old)).find(Boolean);
        if(special)edit(old.type,special);
        else if(old?.item?.id){
          const maps={task:'tasks',triage:'requests',form:'forms',material:'materials',...Object.assign({},...features.map(f=>f.editorTable||{}))};
          const latest=(state.data?.[maps[old.type]]||state.network?.[maps[old.type]]||[]).find(x=>x.id===old.item.id);
          if(latest)edit(old.type,latest,old.type==='material'?{version:state.data.material_versions.find(v=>v.id===(latest.draft_version_id||latest.published_version_id))}:{});
          else notice('This record is no longer available.',true);
        }else if(old?.type==='settings')edit('settings');
      }
      return;
    }
    if(action==='refresh'){if(discard())await refresh();return;}
    if(control._busy)return;control._busy=true;control.setAttribute('aria-busy','true');control.disabled=true;
    const writing=!['open-inbox-item','download','export'].includes(action);
    if(writing)pendingSaves++;
    try {
      if(action==='open-inbox-item'){if(!discard())return;state.view=control.dataset.view;state.detail=id;state.version=null;history.replaceState({},'',location.pathname+location.search+'#'+state.view+'/'+id);await refresh(control.dataset.workspace);return;}
      if(action==='download'){await api.download(d.workspace_files.find(f=>f.id===id));return;}
      if(action==='export'){if(!state.active){notice('Open a workspace before downloading its shared history.',true);return;}const result=await api.exportWorkspace(state.active.id,control.dataset.format||'markdown');notice(control.dataset.format==='archive'?result.complete?'Archive prepared. Keep all volumes and the manifest.':'Archive is incomplete. Check NOT_INCLUDED files in the manifest.':'Shared history downloaded. Files can be downloaded separately.',control.dataset.format==='archive'&&!result.complete);return;}
      let command,payload,featureCommand;
      for(const feature of features){const next=feature.command?.(action,control);if(next){command=next.action;payload=next.payload;featureCommand=next;break;}}
      if(action==='complete-task'){const t=d.tasks.find(t=>t.id===id);command='task.complete';payload={id,revision:t.revision,status:t.status==='completed'?'open':'completed'};}
      if(action==='publish-material'){const m=d.materials.find(m=>m.id===id);command='material.publish';payload={id,revision:m.revision,version_id:control.dataset.version};}
      if(action==='archive-material'){if(!window.confirm(i18n.t('Archive this material and remove client access to its versions?')))return;const m=d.materials.find(m=>m.id===id);command='material.archive';payload={id,revision:m.revision};state.view='materials';history.replaceState({},'',location.pathname+location.search+'#materials');}
      if(action==='approve-material'){command='material.review';payload={version_id:control.dataset.version,status:'approved',note:''};}
      if(action==='review-submission'){const s=d.form_submissions.find(s=>s.id===id);command='form.review';payload={id,revision:s.revision};}
      if(action==='share-file'){const f=d.workspace_files.find(f=>f.id===id);command='file.share';payload={id,revision:f.revision};}
      if(action==='read-updates'){command='updates.read';payload={};}
      if(['revoke-member','revoke-invite','resend-invite'].includes(action)){
        if(action!=='resend-invite'&&!window.confirm(i18n.t('Remove this access to the current workspace?')))return;
        const target=state.data.people.find(p=>p.user_id===id);
        const exportOffered=action==='revoke-member'&&target?.role==='client'?window.confirm(i18n.t('Has the client been offered an export with attachments before access closes?')):false;
        if(action==='revoke-member'&&target?.role==='client'&&!exportOffered)return;
        const response=await api.team(action==='revoke-member'?'revoke_member':action==='revoke-invite'?'revoke_invite':'resend_invite',state.active.id,{id,...(exportOffered?{export_offered:true}:{})},control._operation||=uuid());
        await refresh();notice(action==='resend-invite'?(response.delivery==='sent'?'Invitation sent.':uiText('Delivery {status}. Check the invitation before trying again.',{status:{__platumUi:response.delivery}})):'Access updated.',action==='resend-invite'&&response.delivery!=='sent');return;
      }
      if(command){const result=featureCommand?.network?await api[featureCommand.personal?'personalMutate':featureCommand.service?'community':'networkMutate'](command,featureCommand.scope,payload,control._operation||=uuid()):await api.mutate(command,state.active.id,payload,control._operation||=uuid());for(const feature of features)feature.afterCommand?.(action,result);await refresh();notice(result?.delivery==='sent'?'Invitation sent.':result?.delivery?uiText('Delivery {status}. Check the invitation before trying again.',{status:{__platumUi:result.delivery}}):'Saved.',Boolean(result?.delivery&&result.delivery!=='sent'));}
    }catch(error){notice(error.message,true);}
    finally{if(writing)pendingSaves--;control._busy=false;control.removeAttribute('aria-busy');control.disabled=false;}
  }
  async function init() {
    const auth=await window.CLIENT_SPACE_AUTH_READY;
    if(!auth?.accessToken||window.CLIENT_SPACE_CONFIG?.enableCollaboration===false)return;
    const requestedWorkspace=new URLSearchParams(location.search).get('workspace');
    root.hidden=false;document.body.classList.add('workspace-mode');shell();readRoute();navigation();
    root.addEventListener('submit',submit);root.addEventListener('click',click);
    root.addEventListener('input',event=>{for(const feature of features)feature.input?.(event.target);const form=event.target.closest('form');if(form){state.editorDirty=true;if(['reply','comment','submission','calendar-comment','calendar-response','learning-answer','learning-feedback','inspiration-comment','network-comment','network-contact-note'].includes(form.dataset.form))inlineDrafts.set(draftKey(form),[...new FormData(form).entries()]);}});
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
  i18n.subscribe(() => { if (initialized) { i18n.apply(root); const locationNode = document.getElementById('ws-location'); if (locationNode) locationNode.textContent = (personalFeature?.isGlobalView(state.view)?i18n.t('My cabinet'):networkFeature?.location()) || (state.active ? state.active.name + ' / ' + i18n.t(operator() ? 'Team workspace' : 'Shared workspace') : i18n.t('Your workspaces')); } });
  init();
})();
