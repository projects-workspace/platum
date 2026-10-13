(() => {
  'use strict';
  const config = window.CLIENT_SPACE_CONFIG || {};
  const base = String(config.supabaseUrl || '').replace(/\/$/, '');
  let serverValidated = false;
  const errors = {
    EMPTY_MATERIAL: 'Add content, a reference or a file before publishing.',
    CONFLICT: 'Someone updated this item. Your draft is still here. Load the latest version before saving again.',
    FORM_CHANGED: 'The questions changed while you were answering. Your answers are kept here. Load the latest form to continue.',
    CURRENT_VERSION_CHANGED: 'A newer version has been published. Open it before giving your decision.',
    FORBIDDEN: 'Your access changed. Refresh the workspace or contact the team.',
    FILE_ACCESS_DENIED: 'One of these files is no longer available in this workspace.',
    ALREADY_SUBMITTED: 'This response has already been submitted.',
    FORM_UNAVAILABLE: 'This form is no longer accepting responses.',
    REQUIRED_ANSWER: 'Complete the required questions before submitting.',
    UPLOAD_NOT_COMPLETE: 'The file upload is incomplete. Keep this page open and try again.',
    CLIENT_REVIEW_REQUIRED: 'A client account must give this decision.',
    INVALID_ASSIGNEE: 'Choose a person from the selected side of the workspace.',
    INVALID_REQUEST: 'Choose a request from this workspace.',
    INVALID_URL: 'Use a complete http or https link.',
    INVALID_BLOCK: 'That section is no longer available. Open the material again.',
    FILE_TOO_LARGE: 'Files must be between 1 byte and 10 MB. Link larger media from a material.',
    UNSUPPORTED_FILE: 'Choose a PDF, text document, DOCX, PNG, JPEG or WebP file.',
    INVALID_FILENAME: 'Rename the file without slashes or control characters, then try again.',
    NOT_FOUND: 'This item is no longer available. Refresh the workspace.',
    IDEMPOTENCY_CONFLICT: 'This action changed while being saved. Refresh and try again.',
    INVALID_TIMEZONE: 'Use a valid IANA time zone, such as Europe/Prague or America/New_York.',
    INVALID_EVENT_TIME: 'Choose an end after the start. Events can last up to seven days and start within the next five years.',
    EVENT_CLOSED: 'This event has changed or is closed. Load its latest proposal.',
    EVENT_NOT_FINISHED: 'Only a confirmed event whose end time has passed can be marked completed.',
    OTHER_SIDE_REQUIRED: 'The other side of the workspace must confirm this proposal.',
    INVALID_AVAILABILITY: 'Check the working hours and unavailable dates. Each end must follow its start.',
    INVALID_SHARED_REFERENCE: 'Choose a shared task or published material from this workspace. Its access may have changed.',
    PRACTICE_PENDING: 'Your practice is already waiting for team feedback. You can submit another attempt after review.',
    PRACTICE_NOT_SUBMITTED: 'This practice has already been reviewed or has not been submitted. Load its latest state.',
    EMPTY_INSPIRATION: 'Add a reference link, notes, or both.',
    USE_LEARNING_EDITOR: 'Open this practice in Learning and save its lesson before publishing.',
    USE_REPORT_EDITOR: 'Publish this report through Progress & reports so its evidence is saved with the publication.',
    MILESTONE_TASKS_OPEN: 'Complete the linked tasks before marking this milestone completed.',
    INVALID_REPORT_PERIOD: 'Choose a reporting period of up to one year, with the end on or after its start.',
    INVALID_METRIC_DATE: 'Give the actual observation date for each metric; it cannot be in the future.',
    REPORT_INCOMPLETE: 'Describe what changed and the next agreed action before publishing.',
    METRICS_UNVERIFIED: 'Check each metric against its source and mark it verified before publishing.',
  };
  async function token() {
    const value = window.CLIENT_SPACE_ACCESS_TOKEN
      ? await window.CLIENT_SPACE_ACCESS_TOKEN()
      : window.CLIENT_SPACE_AUTH_CONTEXT?.accessToken;
    if (!value) throw new Error('Sign in again to continue.');
    return value;
  }
  async function headers() { return { apikey: config.supabasePublishableKey, Authorization: 'Bearer ' + await token() }; }
  async function request(path, options = {}) {
    let response;
    try {
      response = await fetch(base + '/rest/v1/' + path, {
        cache: 'no-store',
        method: options.body === undefined ? 'GET' : 'POST',
        headers: { ...await headers(), ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: options.signal || AbortSignal.timeout(20000),
      });
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      throw new Error('The workspace could not be reached. Your input is still here. Try again.');
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const code = Object.keys(errors).find(key => String(data?.message || '').includes(key));
      const error = new Error(code ? errors[code] : response.status === 401
        ? 'Your session expired. Sign in again to continue.'
        : data?.code === 'PGRST202' || data?.code === 'PGRST205'
          ? 'This workspace needs the collaboration database update. Contact your administrator.'
          : 'This action could not be saved. Check your input, then try again.');
      error.code = code || data?.code; error.status = response.status;
      throw error;
    }
    return data;
  }
  const rpc = (name, body = {}, signal) => request('rpc/' + name, { body, signal });
  async function rows(table, filters = {}, signal) {
    const result = [];
    for (let offset = 0; ; offset += 200) {
      const query = new URLSearchParams({ select: '*', order: 'id.asc', ...filters, limit: '200', offset: String(offset) });
      if (['project_context', 'material_reads', 'workspace_reads', 'workspace_members'].includes(table)) query.delete('order');
      const batch = await request(table + '?' + query, { signal });
      if (!Array.isArray(batch)) throw new Error('The workspace returned an invalid response. Refresh to try again.');
      result.push(...batch);
      if (batch.length < 200) return result;
      if (result.length >= 10000) throw new Error('This workspace is too large to load safely. Ask the team to archive older work.');
    }
  }
  async function access(signal) {
    await rpc('platum_accept_invitations', {}, signal);
    const memberships = await rows('workspace_members', { user_id: 'eq.' + window.CLIENT_SPACE_AUTH_CONTEXT.user.id }, signal);
    const workspaces = await rows('workspaces', {}, signal);
    return workspaces.map(workspace => ({ ...workspace, role: memberships.find(m => m.workspace_id === workspace.id)?.role })).filter(w => w.role);
  }
  async function bundle(workspace, signal) {
    const filter = { workspace_id: 'eq.' + workspace };
    const names = ['project_context', 'tasks', 'requests', 'request_replies', 'materials', 'material_versions', 'material_comments',
      'material_reviews', 'material_reads', 'forms', 'form_submissions', 'workspace_files', 'activity', 'decisions', 'workspace_reads', 'workspace_invitations', 'deliverables',
      'calendar_events', 'calendar_versions', 'calendar_responses', 'workspace_availability',
      'learning_units', 'learning_versions', 'learning_submissions', 'learning_feedback', 'inspiration_items', 'inspiration_comments',
      'work_milestones', 'milestone_history', 'period_reports', 'report_publications', 'template_applications'];
    const values = await Promise.all(names.map(name => rows(name, filter, signal)));
    const people = await rpc('platum_members', { workspace_id: workspace }, signal);
    const templates = await rows('workspace_templates', {}, signal);
    return { ...Object.fromEntries(names.map((name, index) => [name, values[index]])), people, workspace_templates:templates };
  }
  async function team(action, workspace, payload, operation = crypto.randomUUID()) {
    if (action && !serverValidated) await team();
    let response;
    try {
      response = await fetch('/api/team', {
        cache: 'no-store',
        method: action ? 'POST' : 'GET',
        headers: { Authorization: 'Bearer ' + await token(), ...(action ? { 'Content-Type': 'application/json' } : {}) },
        body: action ? JSON.stringify({ action, workspace_id: workspace, payload, operation_id: operation }) : undefined,
        signal: AbortSignal.timeout(30000),
      });
    } catch { throw new Error('Workspace management could not be reached. Your input is kept; try again.'); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Workspace management is not available. Contact your administrator.');
    if (!action && data.supabaseUrl !== base) throw new Error('The browser and server point to different workspaces. Contact your administrator.');
    if (!action) serverValidated = true;
    return data;
  }
  function mutate(action, workspace, payload, operation = crypto.randomUUID()) {
    const regular = action === 'workspace.save' || action.startsWith('calendar.') || action === 'availability.save';
    const learning = action.startsWith('learning.') || action.startsWith('inspiration.');
    const progress = ['milestone.','report.','template.'].some(prefix=>action.startsWith(prefix));
    return rpc(regular ? 'platum_regular_mutate' : learning ? 'platum_learning_mutate' : progress ? 'platum_progress_mutate' : 'platum_mutate', { action, workspace_id: workspace, payload, operation_id: operation });
  }
  async function upload(workspace, file, shared, progress) {
    if (!progress.reservation) {
      progress.reserveId ||= crypto.randomUUID();
      progress.reservation = await mutate('file.reserve', workspace, {
        name: file.name, mime_type: file.type || (/\.md$/i.test(file.name) ? 'text/markdown' : 'text/plain'),
        size_bytes: file.size, client_visible: shared,
      }, progress.reserveId);
    }
    const record = progress.reservation;
    if (!progress.uploaded) {
      let response;
      try {
        response = await fetch(base + '/storage/v1/object/platum-workspace-files/' + record.path, {
          method: 'POST', headers: { ...await headers(), 'Content-Type': record.mime_type, 'x-upsert': 'false' }, body: file,
          signal: AbortSignal.timeout(60000),
        });
      } catch { throw new Error('The upload was interrupted. Keep this page open and try again.'); }
      if (!response.ok && response.status !== 409 && response.status !== 400) throw new Error('The file could not be uploaded. Try again.');
      // A repeated immutable upload may report 400/409. The database still
      // verifies the reserved object's size/type before making it readable.
      progress.uploaded = true;
    }
    progress.finishId ||= crypto.randomUUID();
    try { return await mutate('file.finish', workspace, { id: record.id }, progress.finishId); }
    catch (error) { progress.uploaded = false; throw error; }
  }
  async function download(file) {
    const response = await fetch('/api/files?id=' + encodeURIComponent(file.id), { cache: 'no-store', headers: { Authorization: (await headers()).Authorization }, signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error('This file is no longer available to your account.');
    saveBlob(await response.blob(), file.name);
  }
  function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function exportWorkspace(workspace, format = 'markdown') {
    const data = await rpc('platum_export', { workspace_id: workspace });
    const filename = 'platum-workspace-' + new Date().toISOString().slice(0, 10);
    if (format === 'json') return saveBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), filename + '.json');
    const lines = ['# ' + data.workspace.name, '', 'Exported ' + data.exported_at, '', '## Our agreement', '', data.context?.objective || '',
      ...Object.entries(data.context?.collaboration || {}).flatMap(([key,value])=>['', '### ' + key, '', value]),
      '', '## Work', '', ...data.tasks.flatMap(t=>['### '+t.title,'',t.description,'','Status: '+t.status+(t.due_at?' · Due: '+t.due_at:''),'']),
      '', '## Requests', '', ...data.requests.flatMap(r=>['### '+r.title,'',r.message,'',...data.replies.filter(x=>x.request_id===r.id).flatMap(x=>['Response · '+x.created_at,'',x.body,''])]),
      '', '## Materials', '', ...data.materials.flatMap(m=>['### '+m.title+' · version '+m.number,'',m.summary,'',...m.blocks.flatMap(b=>['#### '+b.label,'',b.text||'',b.url||'',''])]),
      '', '## Decisions', '', ...data.decisions.flatMap(d=>['### '+d.title,'',d.context,d.decision,'']),
      '', '## Review history', '', ...data.reviews.flatMap(r=>[r.created_at+' · '+r.status,'',r.note||'','Version: '+r.version_id,'']),
      '', '## Discussion history', '', ...data.comments.flatMap(c=>[c.created_at+' · Version: '+c.version_id+(c.block_id?' · Section: '+c.block_id:''),'',c.body,'']),
      '', '## Submitted answers', '', ...data.submissions.flatMap(s=>['Form '+s.form_id+' · revision '+s.form_revision,'',...(s.definition_snapshot.fields||[]).flatMap(f=>[f.label,'',String(s.answers[f.id]??''),''])]),
      '', '## Updates', '', ...data.activity.flatMap(a=>['### '+a.summary,'',a.created_at,'',a.metadata?.body||'','']),
      '', '## Linked resources', '', ...[...(data.references||[]),...(data.deliverables||[])].flatMap(m=>[m.title,m.description||'',m.url||'','']),
      '', '## Files', '', 'Download attachments separately from the workspace while you have access.', '', ...data.files.map(f=>'- '+f.name+' ('+f.size_bytes+' bytes)'),
      '', '## Calendar history', '', ...(data.calendar_events||[]).flatMap(event=>[
        '### Event '+event.id+' · '+event.status,'',...(data.calendar_versions||[]).filter(v=>v.event_id===event.id).sort((a,b)=>a.number-b.number).flatMap(v=>[
          '#### '+v.title+' · proposal '+v.number,'',v.starts_at+' – '+v.ends_at+' · '+v.timezone,'',v.agenda,v.location,'',
          ...(data.calendar_responses||[]).filter(r=>r.version_id===v.id).flatMap(r=>[r.created_at+' · '+r.response,'',r.note,''])])]),
      '', '## Shared availability', '', ...(data.availability||[]).flatMap(a=>[a.user_id+' · '+a.timezone,'',a.note,
        ...(a.weekly||[]).map(s=>['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][s.day]+' '+s.start+'–'+s.end),
        ...(a.unavailable||[]).map(s=>'Unavailable: '+s.start+' – '+s.end),'']),
      '', '## Learning and practice', '', ...(data.learning_versions||[]).flatMap(v=>['### '+v.lesson.title+' · lesson version '+v.lesson.number,'',v.lesson.summary,'',...v.lesson.blocks.flatMap(b=>['#### '+b.label,'',b.text,'']),
        ...(data.learning_submissions||[]).filter(s=>s.version_id===v.id).flatMap(s=>['Attempt '+s.attempt+' · '+s.author_id+' · '+s.status,'',s.answer,s.evidence_url,'',
          ...(data.learning_feedback||[]).filter(f=>f.submission_id===s.id).flatMap(f=>['Feedback · '+f.outcome,'',f.body,''])])]),
      '', '## Inspiration', '', ...(data.inspiration||[]).flatMap(i=>['### '+i.title,'',i.url,i.note,'',i.relevance,'',
        ...(data.inspiration_comments||[]).filter(c=>c.item_id===i.id).flatMap(c=>['Comment on revision '+c.item_revision+' · '+c.created_at,'',c.body,''])]),
      '', '## Milestones', '', ...(data.milestones||[]).flatMap(m=>['### '+m.title,'',m.status,m.description,m.completion_note,'']),
      '', '## Milestone history', '', ...(data.milestone_history||[]).flatMap(h=>[h.created_at+' · '+h.snapshot.title+' · '+h.snapshot.status,'',h.snapshot.completion_note||h.snapshot.description,'']),
      '', '## Period report snapshots', '', ...(data.reports||[]).flatMap(p=>['### '+p.snapshot.title,'',p.snapshot.starts_on+' – '+p.snapshot.ends_on+' · '+p.snapshot.timezone,'',p.snapshot.summary,p.snapshot.outcomes,p.snapshot.blockers,p.snapshot.next_step,'',
        ...p.snapshot.metrics.flatMap(m=>[m.name+': '+m.value+' '+m.unit,'Source: '+m.source,m.source_url,'Observed: '+m.observed_on,'']),
        'Completed tasks at publication:',...p.snapshot.completed_tasks.map(t=>'- '+t.title+' · '+t.completed_at),'',
        'Selected results:',...p.snapshot.results.map(v=>'- '+v.title+' · version '+v.number),'']),
    ];
    saveBlob(new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' }), filename + '.md');
  }
  async function queue(workspaces) {
    if (!workspaces.length) return [];
    const filter = { workspace_id: 'in.(' + workspaces.join(',') + ')' };
    const [requests, submissions, materials, reviews, forms, events, proposals, practices, units, lessons] = await Promise.all([
      rows('requests', { ...filter, status: 'eq.waiting_team' }),
      rows('form_submissions', { ...filter, status: 'eq.submitted' }),
      rows('materials', filter), rows('material_reviews', filter), rows('forms', filter),
      rows('calendar_events', {...filter,status:'eq.proposed'}), rows('calendar_versions', filter),
      rows('learning_submissions',{...filter,status:'eq.submitted'}),rows('learning_units',filter),rows('learning_versions',filter),
    ]);
    const latest = [...new Map(reviews.sort((a,b)=>a.created_at.localeCompare(b.created_at)).map(r=>[r.version_id+':'+r.reviewer_id,r])).values()];
    return [
      ...events.flatMap(event=>{const v=proposals.find(v=>v.id===event.current_version_id&&v.proposed_side==='client');return v?[{id:event.id,workspace_id:event.workspace_id,title:v.title,reason:'Time to confirm',view:'event'}]:[];}),
      ...practices.flatMap(s=>{const v=lessons.find(v=>v.id===s.version_id),unit=units.find(l=>l.id===v?.unit_id),m=materials.find(m=>m.id===unit?.material_id);return unit?[{id:unit.id,workspace_id:unit.workspace_id,title:m?.title||'Practice response',reason:'Practice to review',view:'lesson'}]:[];}),
      ...requests.map(r=>({ id:r.id,workspace_id:r.workspace_id,title:r.title,reason:'Client request',view:'request' })),
      ...submissions.map(s=>({ id:s.form_id,workspace_id:s.workspace_id,title:forms.find(f=>f.id===s.form_id)?.title||'Questionnaire response',reason:'Response to review',view:'form' })),
      ...latest.filter(r=>r.status==='changes_requested').flatMap(r=>{
        const m=materials.find(m=>m.published_version_id===r.version_id);
        return m?[{id:m.id,workspace_id:m.workspace_id,title:m.title,reason:'Changes requested',view:'material'}]:[];
      }),
    ];
  }
  window.PLATUM_DATA = Object.freeze({ access, bundle, team, mutate, upload, download, exportWorkspace, rpc, queue, saveBlob });
})();
