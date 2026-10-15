(function () {
  'use strict';
  const i18n = window.PLATUM_I18N;
  const ui = source => i18n.mark(source);
  const token = (source, parameters = {}) => ({uiKey:source,parameters});
  const rowText = value => value && typeof value === 'object' && value.uiKey ? i18n.mark(value.uiKey,'span',value.parameters) : escapeHtml(value);
  const seedToken = (record,key) => seedSources.get(record)?.has(key) ? token(record[key]) : record[key];

  const STORAGE_KEY = 'client-cabinet:agency-os:v2';
  const PREVIOUS_STORAGE_KEY = 'client-cabinet:agency-os:v1';
  const LEGACY_STORAGE_KEY = 'cabinet:agency-os:prototype:v1';
  const STATE_VERSION = 2;
  const TASK_STATUSES = ['open', 'in_progress', 'waiting', 'review', 'completed', 'cancelled'];

  // Public seed data is intentionally generic. Real client and internal records
  // must be loaded from authenticated workspace storage.
  const SEED = {
    workspaces: [
      {
        id: 'agency',
        cabinetId: null,
        name: 'Internal operations',
        initials: 'IO',
        kind: 'Internal workspace',
        phase: 'MVP foundation',
        progress: 20,
        health: 'attention',
        nextGate: 'Connect the shared workspace backend',
        summary: 'Release preparation, data contracts, security validation, and operational readiness.',
      },
      {
        id: 'template',
        cabinetId: 'starter',
        name: 'New client template',
        initials: 'NC',
        kind: 'Reusable template',
        phase: 'Onboarding shell',
        progress: 5,
        health: 'ready',
        nextGate: 'Create a workspace from an authenticated brief',
        summary: 'A generic cabinet structure with no client-specific information in the public bundle.',
      },
    ],
    domains: [
      {
        id: 'product',
        name: 'Product',
        owner: 'Product team',
        status: 'active',
        description: 'Shared workspace contracts, client participation, operator controls, and release quality.',
      },
      {
        id: 'delivery',
        name: 'Delivery',
        owner: 'Delivery team',
        status: 'planned',
        description: 'Tasks, requests, forms, materials, progress, and controlled client publication.',
      },
    ],
    skills: [
      {
        id: 'context-intake',
        number: '01',
        category: 'Foundation',
        name: 'Context Intake',
        goal: 'Turn an authenticated brief and approved source material into a reliable project context.',
        input: 'Brief, links, approved source files',
        output: 'Structured context and missing-input list',
        quality: 'Facts and assumptions are separated; no private data enters public assets',
        version: 'v0.1',
      },
      {
        id: 'release-review',
        number: '02',
        category: 'Quality',
        name: 'Release Review',
        goal: 'Verify one complete client and operator journey before production.',
        input: 'Feature branch, test accounts, environment inventory',
        output: 'Evidence-backed release decision',
        quality: 'Auth, isolation, data integrity, browser flows, and rollback are verified',
        version: 'v0.1',
      },
      {
        id: 'controlled-handoff',
        number: '03',
        category: 'Automation',
        name: 'Controlled AI Handoff',
        goal: 'Prepare portable project context for assisted execution with human review.',
        input: 'Approved task, relevant context, constraints',
        output: 'Model-neutral handoff package',
        quality: 'No automatic client publication; a human reviewer remains accountable',
        version: 'v0.1',
      },
    ],
    pipelines: [
      {
        id: 'mvp-release',
        workspaceId: 'agency',
        domainId: 'product',
        name: 'MVP Release Readiness',
        purpose: 'Move from a static prototype to one secure, shared, tester-ready client-service loop.',
        version: 'Internal v0.1',
        stages: [
          { name: 'Audit current state', skillId: 'release-review', status: 'done' },
          { name: 'Remove public client data', skillId: 'context-intake', status: 'in_progress' },
          { name: 'Connect shared records', skillId: null, status: 'blocked' },
          { name: 'Verify isolation', skillId: 'release-review', status: 'planned' },
          { name: 'Release review', skillId: 'release-review', status: 'planned' },
        ],
      },
    ],
    tasks: [
      {
        id: 't-201',
        workspaceId: 'agency',
        domainId: 'product',
        skillId: 'context-intake',
        title: 'Keep private workspace content out of public assets',
        description: 'Load client and internal records only after authenticated authorization succeeds.',
        assigneeType: 'human',
        assignee: 'Platform',
        status: 'in_progress',
        priority: 'high',
        due: 'Before deployment',
        clientVisible: false,
      },
      {
        id: 't-202',
        workspaceId: 'agency',
        domainId: 'product',
        skillId: null,
        title: 'Connect a valid Supabase project and shared workspace model',
        description: 'Apply reviewed migrations, verify RLS, and test two-client isolation.',
        assigneeType: 'human',
        assignee: 'Platform',
        status: 'waiting',
        priority: 'high',
        due: 'Environment required',
        clientVisible: false,
      },
      {
        id: 't-203',
        workspaceId: 'agency',
        domainId: 'delivery',
        skillId: 'release-review',
        title: 'Verify the complete client and operator loop',
        description: 'Test tasks, requests, forms, progress, and a deliverable across two authenticated sessions.',
        assigneeType: 'human',
        assignee: 'Release reviewer',
        status: 'open',
        priority: 'high',
        due: 'After backend connection',
        clientVisible: false,
      },
    ],
    artifacts: [
      {
        id: 'a-201',
        workspaceId: 'agency',
        domainId: 'product',
        title: 'Platum product vision',
        type: 'Product',
        version: 'v1.0',
        status: 'approved',
        visibility: 'internal',
        source: 'Canonical project documentation',
        updated: 'Current',
      },
      {
        id: 'a-202',
        workspaceId: 'agency',
        domainId: 'product',
        title: 'MVP completion assessment',
        type: 'Release',
        version: 'v0.1',
        status: 'ready_for_review',
        visibility: 'internal',
        source: 'Repository and environment audit',
        updated: 'Current',
      },
    ],
    decisions: [
      {
        id: 'd-201',
        workspaceId: 'agency',
        date: 'Current',
        status: 'approved',
        title: 'Keep client-specific content out of public bundles',
        summary: 'Authenticated workspace records are the only source for private client and internal information.',
        reason: 'A visual browser gate cannot protect static JavaScript or repository history.',
        owner: 'Platform',
      },
      {
        id: 'd-202',
        workspaceId: 'agency',
        date: 'Current',
        status: 'approved',
        title: 'Require human review before client delivery',
        summary: 'Assisted outputs remain internal drafts until a responsible person approves visibility.',
        reason: 'Client trust and professional accountability remain human responsibilities.',
        owner: 'Delivery team',
      },
    ],
    clientRequests: [],
    agentJobs: [
      {
        id: 'j-201',
        workspaceId: 'agency',
        taskId: 't-203',
        skillId: 'controlled-handoff',
        title: 'Prepare final release verification handoff',
        model: 'Provider not selected',
        status: 'ready',
        context: ['MVP scope', 'Security requirements', 'Acceptance journey'],
        output: 'Release verification package',
        review: 'Release reviewer',
      },
    ],
  };
  const root = document.getElementById('agency-os-root');
  const workspaceFilter = document.querySelector('[data-os-workspace-filter]');
  const toast = document.getElementById('portal-toast');
  let activeTab = 'command';
  let activeWorkspace = 'all';
  let searchTerm = '';
  let toastTimer = null;
  let activeAuthContext = null;
  let isRemoteMode = false;
  const seedSources = new WeakMap();
  let state = hydrateState();
  function registerSeed(value) {
    if (!value || typeof value !== 'object') return value;
    seedSources.set(value, new Set(Object.keys(value))); Object.values(value).forEach(registerSeed); return value;
  }
  function seedOption(record, key) { return seedSources.get(record)?.has(key) ? 'data-i18n-key="'+escapeHtml(record[key])+'" ' : ''; }
  function seedPlain(record, key) { return escapeHtml(seedSources.get(record)?.has(key) ? i18n.t(record[key]) : record[key]); }
  function seedText(record, key) { return seedSources.get(record)?.has(key) ? ui(record[key]) : escapeHtml(record[key]); }

  function clone(value) {
    return registerSeed(JSON.parse(JSON.stringify(value)));
  }

  function readSavedState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return parsed?.version === STATE_VERSION ? parsed : null;
    } catch (error) {
      return null;
    }
  }

  function mergeRecords(seedRecords, savedRecords) {
    if (!Array.isArray(savedRecords)) return clone(seedRecords);
    const savedById = new Map(savedRecords.map((record) => [record.id, record]));
    const merged = seedRecords.map((record) => { const saved = savedById.get(record.id) || {}; const result = {...clone(record),...saved}; seedSources.set(result,new Set(Object.keys(record).filter(key => !Object.prototype.hasOwnProperty.call(saved,key)))); return result; });
    savedRecords.forEach((record) => {
      if (!seedRecords.some((seedRecord) => seedRecord.id === record.id)) merged.push(record);
    });
    return merged;
  }

  function hydrateState(savedState = readSavedState()) {
    const saved = savedState;
    if (!saved || saved.version !== STATE_VERSION) return clone(SEED);
    return {
      ...clone(SEED),
      tasks: mergeRecords(SEED.tasks, saved.tasks),
      artifacts: mergeRecords(SEED.artifacts, saved.artifacts),
      agentJobs: mergeRecords(SEED.agentJobs, saved.agentJobs),
    };
  }

  function workspaceInitials(name) {
    return String(name || 'Workspace')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  }

  function mapRemoteTask(task) {
    return {
      id: task.id,
      workspaceId: task.workspace_id,
      domainId: 'delivery',
      skillId: null,
      title: task.title,
      description: task.description,
      assigneeType: task.assignee_kind,
      assignee: task.assignee_kind === 'client' ? 'Client' : 'Project team',
      status: task.status,
      priority: task.priority,
      due: task.due_at || 'Not scheduled',
      clientVisible: task.client_visible,
    };
  }

  function mapRemoteRequest(request) {
    return {
      id: request.id,
      workspaceId: request.workspace_id,
      title: request.title,
      detail: request.message,
      topic: request.topic,
      status: request.status,
      due: request.responded_at ? 'Responded' : 'Needs team response',
      createdAt: request.created_at,
      replies: request.replies || [],
    };
  }

  async function loadRemoteState(access) {
    const bundles = await Promise.all(
      access.workspaces.map((workspace) => window.CABINET_DATA.loadWorkspaceBundle(workspace.id, activeAuthContext))
    );
    state = {
      ...clone(SEED),
      workspaces: access.workspaces.map((workspace) => ({
        id: workspace.id,
        cabinetId: workspace.id,
        name: workspace.name,
        initials: workspaceInitials(workspace.name),
        kind: `${formatLabel(workspace.role)} workspace`,
        phase: workspace.current_phase,
        progress: workspace.progress,
        health: workspace.status === 'active' ? 'ready' : 'attention',
        nextGate: workspace.current_focus || 'Review current client actions',
        summary: workspace.description || workspace.current_focus || 'Shared client-service workspace.',
      })),
      tasks: bundles.flatMap((bundle) => bundle.tasks.map(mapRemoteTask)),
      clientRequests: bundles.flatMap((bundle) => bundle.requests.map(mapRemoteRequest)),
    };
    isRemoteMode = true;
  }

  function saveState() {
    const savedState = {
      version: STATE_VERSION,
      tasks: state.tasks,
      artifacts: state.artifacts,
      agentJobs: state.agentJobs,
    };
    if (!isRemoteMode) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedState));
      localStorage.removeItem(PREVIOUS_STORAGE_KEY);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      window.CABINET_DATA?.save('agency-os', activeAuthContext, savedState, { workspaceKey: 'agency' });
    }
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatLabel(value) {
    return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function workspaceName(id) {
    return state.workspaces.find((workspace) => workspace.id === id)?.name || id;
  }

  function renderWorkspaceFilter() {
    if (!workspaceFilter) return;
    const selectable = state.workspaces.filter((workspace) => workspace.id !== 'template');
    workspaceFilter.innerHTML = [
      '<option value="all" data-i18n-key="All workspaces">All workspaces</option>',
      ...selectable.map((workspace) => `<option ${seedOption(workspace, 'name')}value="${escapeHtml(workspace.id)}">${seedPlain(workspace, 'name')}</option>`),
    ].join('');
    if (activeWorkspace !== 'all' && !selectable.some((workspace) => workspace.id === activeWorkspace)) {
      activeWorkspace = 'all';
    }
    workspaceFilter.value = activeWorkspace;
    i18n.apply(workspaceFilter.parentElement);
  }

  function domainName(id) {
    return state.domains.find((domain) => domain.id === id)?.name || id;
  }

  function skillName(id) {
    return state.skills.find((skill) => skill.id === id)?.name || 'No skill assigned';
  }

  function matchesWorkspace(record) {
    return activeWorkspace === 'all' || record.workspaceId === activeWorkspace || record.id === activeWorkspace;
  }

  function filtered(records) {
    return records.filter(matchesWorkspace);
  }

  function statusBadge(status) {
    return `<span class="agency-os-status agency-os-status--${escapeHtml(status)}">${ui(formatLabel(status))}</span>`;
  }

  function showToast(message) {
    if (!toast) return;
    i18n.setText(toast, message);
    toast.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 3000);
  }

  function renderMetric(label, value, note, attention = false) {
    return `
      <article class="agency-os-metric ${attention ? 'agency-os-metric--attention' : ''}">
        <span>${ui(label)}</span>
        <strong>${escapeHtml(value)}</strong>
        <small>${ui(note)}</small>
      </article>
    `;
  }

  function renderRow(title, detail, status, side = '') {
    return `
      <article class="agency-os-row">
        <div>
          <strong>${rowText(title)}</strong>
          <small>${rowText(detail)}</small>
        </div>
        <div class="agency-os-row__side">
          ${status ? statusBadge(status) : ''}
          ${side ? `<small>${rowText(side)}</small>` : ''}
        </div>
      </article>
    `;
  }

  function commandView() {
    const tasks = filtered(state.tasks);
    const requests = filtered(state.clientRequests);
    const artifacts = filtered(state.artifacts);
    const jobs = filtered(state.agentJobs);
    const workspaces = activeWorkspace === 'all'
      ? state.workspaces.filter((workspace) => workspace.id !== 'template')
      : state.workspaces.filter((workspace) => workspace.id === activeWorkspace);
    const blocked = tasks.filter((task) => task.status === 'waiting');
    const reviews = artifacts.filter((artifact) => artifact.status === 'ready_for_review');
    const waiting = requests.filter((request) => ['waiting_team', 'waiting_client'].includes(request.status));
    const readyJobs = jobs.filter((job) => job.status === 'ready');

    return `
      <div class="agency-os-metrics">
        ${renderMetric('Active workspaces', workspaces.length, 'Client and internal projects')}
        ${renderMetric('Needs a decision', reviews.length + tasks.filter((task) => task.status === 'review').length, 'Human review before work moves', true)}
        ${renderMetric('Waiting on clients', waiting.length, 'Inputs or approvals visible to clients')}
        ${renderMetric('Blocked work', blocked.length, 'Dependencies must be resolved')}
        ${renderMetric('AI-ready tasks', readyJobs.length, 'Portable handoffs, model not locked')}
      </div>

      <div class="agency-os-grid">
        <section class="agency-os-panel agency-os-panel--wide">
          <div class="agency-os-panel-heading">
            <div><span><span data-i18n-key="Operating focus">Operating focus</span></span><h2><span data-i18n-key="What needs attention now">What needs attention now</span></h2></div>
            <strong>${reviews.length + blocked.length + waiting.length}</strong>
          </div>
          <div class="agency-os-list">
            ${reviews.slice(0, 3).map((artifact) => renderRow(seedToken(artifact,'title'), `${workspaceName(artifact.workspaceId)} · ${artifact.type} ${artifact.version}`, artifact.status, token('Artifact'))).join('')}
            ${blocked.slice(0, 3).map((task) => renderRow(seedToken(task,'title'), token('{workspace} · blocked by a dependency',{workspace:workspaceName(task.workspaceId)}), task.status, seedToken(task,'assignee'))).join('')}
            ${waiting.slice(0, 3).map((request) => renderRow(request.title, `${workspaceName(request.workspaceId)} · ${request.detail}`, request.status, request.due)).join('')}
            ${!reviews.length && !blocked.length && !waiting.length ? '<div class="agency-os-empty" data-i18n-key="Nothing needs immediate attention in this workspace.">Nothing needs immediate attention in this workspace.</div>' : ''}
          </div>
        </section>

        <section class="agency-os-panel agency-os-panel--narrow agency-os-panel--dark">
          <div class="agency-os-panel-heading">
            <div><span><span data-i18n-key="Client side">Client side</span></span><h2><span data-i18n-key="Inputs &amp; approvals">Inputs & approvals</span></h2></div>
            <strong>${requests.length}</strong>
          </div>
          <div class="agency-os-list">
            ${requests.slice(0, 4).map((request) => renderRow(request.title, request.detail, request.status, request.due)).join('') || '<div class="agency-os-empty" data-i18n-key="No client requests here.">No client requests here.</div>'}
          </div>
        </section>

        <section class="agency-os-panel agency-os-panel--full">
          <div class="agency-os-panel-heading">
            <div><span><span data-i18n-key="Live workspaces">Live workspaces</span></span><h2><span data-i18n-key="One system, different journeys">One system, different journeys</span></h2></div>
            <strong>${workspaces.length}</strong>
          </div>
          <div class="agency-os-card-grid">
            ${workspaces.map(renderWorkspaceCard).join('') || '<div class="agency-os-empty" data-i18n-key="Choose All workspaces to see the full portfolio.">Choose All workspaces to see the full portfolio.</div>'}
          </div>
        </section>

        <section class="agency-os-panel agency-os-panel--wide">
          <div class="agency-os-panel-heading">
            <div><span><span data-i18n-key="Methodology in motion">Methodology in motion</span></span><h2><span data-i18n-key="Pipeline status">Pipeline status</span></h2></div>
            <strong>${filtered(state.pipelines).length}</strong>
          </div>
          <div class="agency-os-list">
            ${filtered(state.pipelines).map((pipeline) => {
              const done = pipeline.stages.filter((stage) => ['done', 'approved', 'complete'].includes(stage.status)).length;
              const active = pipeline.stages.find((stage) => ['active', 'in_progress', 'review', 'waiting_client', 'blocked'].includes(stage.status));
              return renderRow(seedToken(pipeline,'name'), token('{done}/{total} stages complete · next: {next}',{done,total:pipeline.stages.length,next:active?{__platumUi:active.name}:{__platumUi:'complete'}}), active?.status || 'complete', workspaceName(pipeline.workspaceId));
            }).join('') || '<div class="agency-os-empty" data-i18n-key="No pipelines match this workspace.">No pipelines match this workspace.</div>'}
          </div>
        </section>

        <section class="agency-os-panel agency-os-panel--narrow">
          <div class="agency-os-panel-heading">
            <div><span><span data-i18n-key="Agent handoff">Agent handoff</span></span><h2><span data-i18n-key="Ready to execute">Ready to execute</span></h2></div>
            <strong>${readyJobs.length}</strong>
          </div>
          <div class="agency-os-list">
            ${readyJobs.map((job) => renderRow(seedToken(job,'title'), token('{skill} · review: {review}',{skill:skillName(job.skillId),review:job.review}), job.status, workspaceName(job.workspaceId))).join('') || '<div class="agency-os-empty" data-i18n-key="No AI-ready tasks in this workspace.">No AI-ready tasks in this workspace.</div>'}
          </div>
        </section>

        <section class="agency-os-panel agency-os-panel--full agency-os-panel--dark">
          <div class="agency-os-panel-heading">
            <div><span><span data-i18n-key="No-regrets foundation">No-regrets foundation</span></span><h2><span data-i18n-key="What this prototype already separates">What this prototype already separates</span></h2></div>
            <strong>4</strong>
          </div>
          <div class="agency-os-readiness">
            <article><span><span data-i18n-key="Method">Method</span></span><strong><span data-i18n-key="Skills own the process">Skills own the process</span></strong><small><span data-i18n-key="Instructions and quality gates do not depend on a model.">Instructions and quality gates do not depend on a model.</span></small></article>
            <article><span><span data-i18n-key="Execution">Execution</span></span><strong><span data-i18n-key="Tasks own the work">Tasks own the work</span></strong><small><span data-i18n-key="Human, client, or AI can be the executor with the same contract.">Human, client, or AI can be the executor with the same contract.</span></small></article>
            <article><span><span data-i18n-key="Memory">Memory</span></span><strong><span data-i18n-key="Artifacts and decisions persist">Artifacts and decisions persist</span></strong><small><span data-i18n-key="Results, reasons, sources, and versions stay addressable.">Results, reasons, sources, and versions stay addressable.</span></small></article>
            <article><span><span data-i18n-key="Visibility">Visibility</span></span><strong><span data-i18n-key="Client delivery is explicit">Client delivery is explicit</span></strong><small><span data-i18n-key="Internal drafts do not become client-visible without review.">Internal drafts do not become client-visible without review.</span></small></article>
          </div>
        </section>
      </div>
    `;
  }

  function renderWorkspaceCard(workspace) {
    const action = workspace.cabinetId
      ? `<button class="${workspace.id === 'template' ? 'secondary-button' : 'primary-button'}" type="button" data-admin-client="${escapeHtml(workspace.cabinetId)}">${ui(workspace.id === 'template' ? 'Preview template' : 'Open client cabinet')} <span>→</span></button>`
      : '<button class="secondary-button" type="button" data-os-tab-jump="command"><span data-i18n-key="Open internal command center">Open internal command center</span></button>';
    return `
      <article class="agency-os-card ${workspace.id === 'template' ? 'agency-os-card--template' : ''}">
        <div class="agency-os-card-head">
          <span class="agency-os-avatar">${escapeHtml(workspace.initials)}</span>
          ${statusBadge(workspace.health)}
        </div>
        <h3>${seedText(workspace, 'name')}</h3>
        <p>${seedText(workspace, 'summary')}</p>
        <div class="agency-os-progress">
          <div class="agency-os-progress__copy"><span>${seedText(workspace, 'phase')}</span><strong>${escapeHtml(workspace.progress)}%</strong></div>
          <div class="agency-os-progress__track"><span style="width: ${Math.max(0, Math.min(100, Number(workspace.progress)))}%"></span></div>
        </div>
        ${action}
      </article>
    `;
  }

  function workspacesView() {
    const visible = activeWorkspace === 'all'
      ? state.workspaces
      : state.workspaces.filter((workspace) => workspace.id === activeWorkspace);
    return `
      <div class="agency-os-section-heading">
        <div><span class="section-kicker"><span data-i18n-key="Company → workspace">Company → workspace</span></span><h2><span data-i18n-key="Client and internal workspaces">Client and internal workspaces</span></h2></div>
        <p><span data-i18n-key="Each workspace owns its operational state. The client portal is a filtered view of the same project, not a separately maintained page.">Each workspace owns its operational state. The client portal is a filtered view of the same project, not a separately maintained page.</span></p>
      </div>
      <div class="agency-os-card-grid">${visible.map(renderWorkspaceCard).join('')}</div>
      <article class="strategy-method-note">
        <span class="future-panel__index"><span data-i18n-key="Rule">Rule</span></span>
        <div><span class="section-kicker"><span data-i18n-key="Reusable by design">Reusable by design</span></span><h2><span data-i18n-key="Template → real workspace → domains → pipelines → deliverables">Template → real workspace → domains → pipelines → deliverables</span></h2><p><span data-i18n-key="A new client receives the shared structure, then only its own records, permissions, files, decisions, and progress.">A new client receives the shared structure, then only its own records, permissions, files, decisions, and progress.</span></p></div>
      </article>
    `;
  }

  function pipelinesView() {
    const pipelines = filtered(state.pipelines);
    return `
      <div class="agency-os-section-heading">
        <div><span class="section-kicker"><span data-i18n-key="Method in sequence">Method in sequence</span></span><h2><span data-i18n-key="Reusable pipelines">Reusable pipelines</span></h2></div>
        <p><span data-i18n-key="The agency defines the order and dependencies. An AI model only performs a bounded task inside a stage.">The agency defines the order and dependencies. An AI model only performs a bounded task inside a stage.</span></p>
      </div>
      <div class="agency-os-pipeline-list">
        ${pipelines.map((pipeline) => `
          <article class="agency-os-pipeline">
            <div class="agency-os-pipeline__head">
              <div>
                <span class="agency-os-chip">${escapeHtml(domainName(pipeline.domainId))} · ${escapeHtml(workspaceName(pipeline.workspaceId))}</span>
                <h2>${seedText(pipeline, 'name')}</h2>
                <p>${seedText(pipeline, 'purpose')}</p>
              </div>
              <span class="agency-os-badge">${seedText(pipeline, 'version')}</span>
            </div>
            <div class="agency-os-stages">
              ${pipeline.stages.map((stage, index) => `
                <article class="agency-os-stage">
                  <div class="agency-os-stage-head"><span class="agency-os-chip">${String(index + 1).padStart(2, '0')}</span>${statusBadge(stage.status)}</div>
                  <h3>${seedText(stage, 'name')}</h3>
                  <p>${stage.skillId ? escapeHtml(skillName(stage.skillId)) : ui('Human decision or operational gate')}</p>
                  <div class="agency-os-stage-foot"><span>${ui(stage.skillId ? 'Skill' : 'Gate')}</span><strong>${ui(formatLabel(stage.status))}</strong></div>
                </article>
              `).join('')}
            </div>
          </article>
        `).join('') || '<div class="agency-os-empty" data-i18n-key="No pipelines match this workspace.">No pipelines match this workspace.</div>'}
      </div>
    `;
  }

  function skillsView() {
    const term = searchTerm.toLowerCase();
    const skills = state.skills.filter((skill) => !term || [skill.name, skill.category, skill.goal, skill.output].join(' ').toLowerCase().includes(term));
    return `
      <div class="agency-os-section-heading">
        <div><span class="section-kicker"><span data-i18n-key="Agency intellectual property">Agency intellectual property</span></span><h2><span data-i18n-key="Marketing skill library">Marketing skill library</span></h2></div>
        <p><span data-i18n-key="Versioned, model-independent definitions of how the agency performs and reviews important work.">Versioned, model-independent definitions of how the agency performs and reviews important work.</span></p>
      </div>
      <div class="agency-os-skill-toolbar">
        <input class="agency-os-search" type="search" data-os-skill-search value="${escapeHtml(searchTerm)}" placeholder="Search skills, outputs, or categories…" data-i18n-placeholder="Search skills, outputs, or categories…" aria-label="Search marketing skills" data-i18n-aria-label="Search marketing skills">
        <span class="agency-os-badge">${skills.length} of ${state.skills.length} skills</span>
      </div>
      <div class="agency-os-skill-grid">
        ${skills.map((skill) => `
          <article class="agency-os-skill">
            <div class="agency-os-card-head"><span class="agency-os-chip">${escapeHtml(skill.number)} · ${seedText(skill, 'category')}</span><span class="agency-os-badge">${escapeHtml(skill.version)}</span></div>
            <h3>${seedText(skill, 'name')}</h3>
            <p>${seedText(skill, 'goal')}</p>
            <div class="agency-os-skill__io">
              <div><span data-i18n-key="Inputs">Inputs</span><strong>${seedText(skill, 'input')}</strong></div>
              <div><span data-i18n-key="Output">Output</span><strong>${seedText(skill, 'output')}</strong></div>
              <div><span data-i18n-key="Quality gate">Quality gate</span><strong>${seedText(skill, 'quality')}</strong></div>
            </div>
            <div class="agency-os-skill-foot"><span data-i18n-key="Portable to any approved agent">Portable to any approved agent</span><strong data-i18n-key="Human review">Human review</strong></div>
          </article>
        `).join('') || '<div class="agency-os-empty" data-i18n-key="No skills match this search.">No skills match this search.</div>'}
      </div>
    `;
  }

  function tasksView() {
    const tasks = filtered(state.tasks);
    const groups = [
      { label: 'Open', statuses: ['open'] },
      { label: 'In progress', statuses: ['in_progress'] },
      { label: 'Waiting / review', statuses: ['waiting', 'review'] },
      { label: 'Completed', statuses: ['completed'] },
      { label: 'Cancelled', statuses: ['cancelled'] },
    ];
    return `
      <div class="agency-os-section-heading">
        <div><span class="section-kicker"><span data-i18n-key="Shared work queue">Shared work queue</span></span><h2><span data-i18n-key="Human, client, and AI tasks">Human, client, and AI tasks</span></h2></div>
        <p><span data-i18n-key="Every task carries a workspace, domain, skill, assignee type, visibility, dependency state, and expected outcome.">Every task carries a workspace, domain, skill, assignee type, visibility, dependency state, and expected outcome.</span></p>
      </div>
      <div class="agency-os-task-toolbar">
        <span class="agency-os-badge">${i18n.mark('{count} tasks in view','span',{count:tasks.length})}</span>
        <button class="secondary-button" type="button" data-os-new-task><span data-i18n-key="Add task">Add task</span></button>
      </div>
      <div class="agency-os-board">
        ${groups.map((group) => {
          const groupTasks = tasks.filter((task) => group.statuses.includes(task.status));
          return `
            <section class="agency-os-board-column">
              <div class="agency-os-board-column__head"><strong>${ui(group.label)}</strong><span>${groupTasks.length}</span></div>
              <div class="agency-os-task-stack">
                ${groupTasks.map((task) => `
                  <article class="agency-os-task">
                    <div class="agency-os-task-meta"><span>${escapeHtml(domainName(task.domainId))}</span><span>${ui(task.priority)}</span></div>
                    <h3>${seedText(task, 'title')}</h3>
                    <p>${seedText(task, 'description')}</p>
                    <div class="agency-os-task-meta"><span>${ui(task.assigneeType)} · ${seedText(task, 'assignee')}</span><span>${seedText(task, 'due')}</span></div>
                    <select data-os-task-status="${escapeHtml(task.id)}" data-i18n-aria-label="Change status for {title}" data-i18n-params="${escapeHtml(JSON.stringify({title:task.title}))}" aria-label="${escapeHtml(i18n.t('Change status for {title}',{title:task.title}))}">
                      ${TASK_STATUSES.map((status) => `<option data-i18n-key="${escapeHtml(formatLabel(status))}" value="${status}" ${task.status === status ? 'selected' : ''}>${escapeHtml(i18n.t(formatLabel(status)))}</option>`).join('')}
                    </select>
                  </article>
                `).join('') || '<div class="agency-os-empty" data-i18n-key="No tasks">No tasks</div>'}
              </div>
            </section>
          `;
        }).join('')}
      </div>
    `;
  }

  function requestsView() {
    const requests = filtered(state.clientRequests);
    return `
      <div class="agency-os-section-heading">
        <div><span class="section-kicker"><span data-i18n-key="Client participation">Client participation</span></span><h2><span data-i18n-key="Questions and requests">Questions and requests</span></h2></div>
        <p><span data-i18n-key="Client actions arrive here from the same authenticated workspace. Responses are persisted and become visible to the client after reload or a later session.">Client actions arrive here from the same authenticated workspace. Responses are persisted and become visible to the client after reload or a later session.</span></p>
      </div>
      <div class="agency-os-request-list">
        ${requests.map((request) => `
          <article class="agency-os-panel agency-os-request">
            <div class="agency-os-panel-heading">
              <div><span>${escapeHtml(request.topic || 'Request')} · ${escapeHtml(workspaceName(request.workspaceId))}</span><h2>${escapeHtml(request.title)}</h2></div>
              ${statusBadge(request.status)}
            </div>
            <p>${escapeHtml(request.detail)}</p>
            <div class="agency-os-request-replies">
              ${(request.replies || []).map((reply) => `
                <div>
                  <strong data-i18n-key="Published response">Published response</strong>
                  <p>${escapeHtml(reply.body)}</p>
                  <small>${i18n.dateMarkup(reply.created_at)}</small>
                </div>
              `).join('')}
            </div>
            ${isRemoteMode && request.status !== 'resolved' ? `
              <form class="agency-os-response-form" data-os-response-form="${escapeHtml(request.id)}">
                <label for="response-${escapeHtml(request.id)}">Respond to the client</label>
                <textarea id="response-${escapeHtml(request.id)}" name="response" rows="4" maxlength="5000" required placeholder="Write the project update or answer that the client should see." data-i18n-placeholder="Write the project update or answer that the client should see."></textarea>
                <button class="primary-button" type="submit">Publish response <span>→</span></button>
              </form>
            ` : ''}
          </article>
        `).join('') || '<div class="agency-os-empty" data-i18n-key="No client requests need attention.">No client requests need attention.</div>'}
      </div>
    `;
  }

  function artifactsView() {
    const artifacts = filtered(state.artifacts);
    return `
      <div class="agency-os-section-heading">
        <div><span class="section-kicker"><span data-i18n-key="Structured results">Structured results</span></span><h2><span data-i18n-key="Artifact registry">Artifact registry</span></h2></div>
        <p><span data-i18n-key="Chats are temporary. Each meaningful task creates or updates a versioned artifact with sources, status, and visibility.">Chats are temporary. Each meaningful task creates or updates a versioned artifact with sources, status, and visibility.</span></p>
      </div>
      <div class="agency-os-artifact-grid">
        ${artifacts.map((artifact) => `
          <article class="agency-os-artifact">
            <div class="agency-os-card-head"><span class="agency-os-artifact__type">${escapeHtml(artifact.type.slice(0, 3).toUpperCase())}</span>${statusBadge(artifact.status)}</div>
            <h3>${seedText(artifact, 'title')}</h3>
            <p>${escapeHtml(workspaceName(artifact.workspaceId))} · ${escapeHtml(domainName(artifact.domainId))}</p>
            <div class="agency-os-artifact__meta">
              <span><em data-i18n-key="Version">Version</em><strong>${escapeHtml(artifact.version)}</strong></span>
              <span><em data-i18n-key="Source">Source</em><strong>${seedText(artifact, 'source')}</strong></span>
              <span><em data-i18n-key="Updated">Updated</em><strong>${seedText(artifact, 'updated')}</strong></span>
            </div>
            <div class="agency-os-artifact-foot">
              <span class="agency-os-visibility">${artifact.visibility === 'client' ? 'Client delivery' : 'Internal only'}</span>
              <button type="button" data-os-toggle-visibility="${escapeHtml(artifact.id)}">${ui(artifact.visibility === 'client' ? 'Make internal' : 'Mark delivery')}</button>
            </div>
          </article>
        `).join('') || '<div class="agency-os-empty" data-i18n-key="No artifacts match this workspace.">No artifacts match this workspace.</div>'}
      </div>
    `;
  }

  function decisionsView() {
    const decisions = filtered(state.decisions);
    return `
      <div class="agency-os-section-heading">
        <div><span class="section-kicker"><span data-i18n-key="Project memory">Project memory</span></span><h2><span data-i18n-key="Decision log">Decision log</span></h2></div>
        <p><span data-i18n-key="Future teammates and agents need the reason behind a decision, not only the latest final document.">Future teammates and agents need the reason behind a decision, not only the latest final document.</span></p>
      </div>
      <section class="agency-os-panel agency-os-panel--full">
        <div class="agency-os-timeline">
          ${decisions.map((decision) => `
            <article class="agency-os-decision">
              <div><time>${seedText(decision, 'date')}</time><div>${statusBadge(decision.status)}</div></div>
              <div><small>${escapeHtml(workspaceName(decision.workspaceId))}</small><h3>${seedText(decision, 'title')}</h3><p>${seedText(decision, 'summary')}</p></div>
              <aside class="agency-os-decision__reason"><strong data-i18n-key="Why">Why</strong><small>${seedText(decision, 'reason')}</small><strong data-i18n-key="Owner">Owner</strong><small>${seedText(decision, 'owner')}</small></aside>
            </article>
          `).join('') || '<div class="agency-os-empty" data-i18n-key="No decisions match this workspace.">No decisions match this workspace.</div>'}
        </div>
      </section>
    `;
  }

  function agentsView() {
    const jobs = filtered(state.agentJobs);
    return `
      <div class="agency-os-section-heading">
        <div><span class="section-kicker"><span data-i18n-key="Manual first, automated later">Manual first, automated later</span></span><h2><span data-i18n-key="AI execution queue">AI execution queue</span></h2></div>
        <p><span data-i18n-key="Download a complete, model-neutral task handoff. The selected agent returns an artifact for human review; it never publishes directly to the client.">Download a complete, model-neutral task handoff. The selected agent returns an artifact for human review; it never publishes directly to the client.</span></p>
      </div>
      <div class="agency-os-agent-list">
        ${jobs.map((job) => `
          <article class="agency-os-agent">
            <div>
              <div class="agency-os-card-head"><span class="agency-os-chip">${escapeHtml(workspaceName(job.workspaceId))}</span>${statusBadge(job.status)}</div>
              <h3>${seedText(job, 'title')}</h3>
              <p>${escapeHtml(skillName(job.skillId))} → ${seedText(job, 'output')}</p>
            </div>
            <div class="agency-os-agent__context">
              <strong data-i18n-key="Context pack">Context pack</strong>
              ${job.context.map((item) => `<span>• ${seedSources.get(job)?.has('context') ? ui(item) : escapeHtml(item)}</span>`).join('')}
            </div>
            <div class="agency-os-agent__action">
              <span class="agency-os-badge">${ui('Review:')} ${seedText(job, 'review')}</span>
              <button type="button" data-os-download-handoff="${escapeHtml(job.id)}" data-i18n-key="Download agent handoff">Download agent handoff</button>
            </div>
          </article>
        `).join('') || '<div class="agency-os-empty" data-i18n-key="No agent jobs match this workspace.">No agent jobs match this workspace.</div>'}
      </div>
      <article class="strategy-method-note">
        <span class="future-panel__index"><span data-i18n-key="API">API</span></span>
        <div><span class="section-kicker"><span data-i18n-key="Stable boundary">Stable boundary</span></span><h2><span data-i18n-key="Task + skill + context + output contract + review gate">Task + skill + context + output contract + review gate</span></h2><p><span data-i18n-key="This handoff can be used manually with Codex, Claude, Hermes, or another agent today. A queue worker can automate the same contract later without changing the methodology.">This handoff can be used manually with Codex, Claude, Hermes, or another agent today. A queue worker can automate the same contract later without changing the methodology.</span></p></div>
      </article>
    `;
  }

  function render() {
    if (!root) return;
    const views = {
      command: commandView,
      workspaces: workspacesView,
      pipelines: pipelinesView,
      skills: skillsView,
      tasks: tasksView,
      requests: requestsView,
      artifacts: artifactsView,
      decisions: decisionsView,
      agents: agentsView,
    };
    root.innerHTML = (views[activeTab] || commandView)();
    i18n.apply(root);
    document.querySelectorAll('[data-os-tab]').forEach((button) => {
      const isActive = button.dataset.osTab === activeTab;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });
  }

  function createTaskDialog() {
    if (document.getElementById('agency-os-task-dialog')) return;
    const dialog = document.createElement('dialog');
    dialog.className = 'agency-os-dialog';
    dialog.id = 'agency-os-task-dialog';
    dialog.innerHTML = `
      <form method="dialog" data-os-task-form>
        <div class="agency-os-dialog__head">
          <div><span class="section-kicker"><span data-i18n-key="Operating task">Operating task</span></span><h2><span data-i18n-key="Create a work item">Create a work item</span></h2></div>
          <button class="agency-os-dialog__close" type="button" data-os-close-dialog aria-label="Close" data-i18n-aria-label="Close">×</button>
        </div>
        <label><span data-i18n-key="Task title">Task title</span><input name="title" required maxlength="120" placeholder="A clear outcome, not a vague activity" data-i18n-placeholder="A clear outcome, not a vague activity"></label>
        <label><span data-i18n-key="Description">Description</span><textarea name="description" required maxlength="500" placeholder="Context, expected result, and important constraints" data-i18n-placeholder="Context, expected result, and important constraints"></textarea></label>
        <div class="agency-os-dialog__grid">
          <label><span data-i18n-key="Workspace">Workspace</span><select name="workspaceId">${state.workspaces.filter((workspace) => workspace.id !== 'template').map((workspace) => `<option ${seedOption(workspace, 'name')}value="${escapeHtml(workspace.id)}">${seedPlain(workspace, 'name')}</option>`).join('')}</select></label>
          <label><span data-i18n-key="Domain">Domain</span><select name="domainId">${state.domains.map((domain) => `<option value="${escapeHtml(domain.id)}">${escapeHtml(domain.name)}</option>`).join('')}</select></label>
          <label><span data-i18n-key="Executor">Executor</span><select name="assigneeType"><option value="human" data-i18n-key="Human">Human</option><option value="client" data-i18n-key="Client">Client</option><option value="agent" data-i18n-key="AI agent">AI agent</option></select></label>
          <label><span data-i18n-key="Skill">Skill</span><select name="skillId"><option value="" data-i18n-key="No skill yet">No skill yet</option>${state.skills.map((skill) => `<option ${seedOption(skill, 'name')}value="${escapeHtml(skill.id)}">${seedPlain(skill, 'name')}</option>`).join('')}</select></label>
          <label><span data-i18n-key="Priority">Priority</span><select name="priority"><option value="high" data-i18n-key="High">High</option><option value="medium" selected data-i18n-key="Medium">Medium</option><option value="low" data-i18n-key="Low">Low</option></select></label>
          <label><span data-i18n-key="Initial status">Initial status</span><select name="status">${TASK_STATUSES.filter((status) => status !== 'done').map((status) => `<option data-i18n-key="${escapeHtml(formatLabel(status))}" value="${status}">${escapeHtml(i18n.t(formatLabel(status)))}</option>`).join('')}</select></label>
        </div>
        <div class="agency-os-dialog__foot"><button class="secondary-button" type="button" data-os-close-dialog><span data-i18n-key="Cancel">Cancel</span></button><button class="primary-button" type="submit"><span data-i18n-key="Create task">Create task</span></button></div>
      </form>
    `;
    document.body.appendChild(dialog);
    i18n.apply(dialog);
    dialog.querySelector('[data-os-task-form]').addEventListener('submit', saveNewTask);
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
  }

  function openTaskDialog() {
    const dialog = document.getElementById('agency-os-task-dialog');
    if (!dialog) return;
    const workspaceSelect = dialog.querySelector('[name="workspaceId"]');
    if (activeWorkspace !== 'all' && activeWorkspace !== 'template') workspaceSelect.value = activeWorkspace;
    dialog.showModal();
    dialog.querySelector('[name="title"]').focus();
  }

  async function saveNewTask(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const workspaceId = String(data.get('workspaceId'));
    const assigneeType = String(data.get('assigneeType'));
    try {
      if (isRemoteMode) {
        const created = await window.CABINET_DATA.createTask(workspaceId, activeAuthContext, {
          title: String(data.get('title')).trim(),
          description: String(data.get('description')).trim(),
          category: domainName(String(data.get('domainId'))),
          assigneeKind: assigneeType === 'client' ? 'client' : 'team',
          status: String(data.get('status')),
          priority: String(data.get('priority')),
        });
        state.tasks.unshift(mapRemoteTask(created));
      } else {
        state.tasks.unshift({
          id: `custom-${Date.now()}`,
          workspaceId,
          domainId: String(data.get('domainId')),
          skillId: String(data.get('skillId')) || null,
          title: String(data.get('title')).trim(),
          description: String(data.get('description')).trim(),
          assigneeType,
          assignee: assigneeType === 'client' ? workspaceName(workspaceId) : assigneeType === 'agent' ? 'Unassigned AI' : 'Unassigned team member',
          status: String(data.get('status')),
          priority: String(data.get('priority')),
          due: 'Not scheduled',
          clientVisible: assigneeType === 'client',
        });
        saveState();
      }
      form.reset();
      document.getElementById('agency-os-task-dialog').close();
      activeTab = 'tasks';
      render();
      showToast('Task created.');
    } catch (error) {
      showToast(error.message || 'The task could not be created.');
    }
  }

  async function updateTaskStatus(taskId, status) {
    const task = state.tasks.find((item) => item.id === taskId);
    if (!task || !TASK_STATUSES.includes(status)) return;
    const previous = task.status;
    task.status = status;
    render();
    try {
      if (isRemoteMode) {
        await window.CABINET_DATA.updateTaskStatus(taskId, task.workspaceId, activeAuthContext, status);
      } else {
        saveState();
      }
      showToast(`Task moved to ${formatLabel(status)}.`);
    } catch (error) {
      task.status = previous;
      render();
      showToast(error.message || 'The task status could not be updated.');
    }
  }

  async function respondToClientRequest(event) {
    event.preventDefault();
    if (!isRemoteMode) return;
    const form = event.target;
    const response = String(new FormData(form).get('response') || '').trim();
    const button = form.querySelector('[type="submit"]');
    if (!response) return;
    button.disabled = true;
    try {
      await window.CABINET_DATA.respondToRequest(form.dataset.osResponseForm, activeAuthContext, response);
      const access = await window.CABINET_DATA.getWorkspaceAccess(activeAuthContext);
      await loadRemoteState(access);
      renderWorkspaceFilter();
      activeTab = 'requests';
      render();
      showToast('Response published to the client workspace.');
    } catch (error) {
      button.disabled = false;
      showToast(error.message || 'The response could not be published.');
    }
  }

  function toggleArtifactVisibility(artifactId) {
    const artifact = state.artifacts.find((item) => item.id === artifactId);
    if (!artifact) return;
    artifact.visibility = artifact.visibility === 'client' ? 'internal' : 'client';
    saveState();
    render();
    showToast(artifact.visibility === 'client' ? 'Artifact marked for client delivery.' : 'Artifact returned to internal visibility.');
  }

  function buildAgentHandoff(job) {
    const task = state.tasks.find((item) => item.id === job.taskId);
    const skill = state.skills.find((item) => item.id === job.skillId) || null;
    const decisions = state.decisions.filter((decision) => decision.workspaceId === job.workspaceId);
    const artifacts = state.artifacts.filter((artifact) => artifact.workspaceId === job.workspaceId);
    return {
      protocol: 'cabinet.agent-handoff',
      protocolVersion: '1.0',
      createdAt: new Date().toISOString(),
      executionPolicy: {
        providerIndependent: true,
        clientPublicationAllowed: false,
        humanReviewRequired: true,
        dataRule: 'Use only the supplied context and explicitly cited sources. Label unknowns and assumptions.',
      },
      workspace: {
        id: job.workspaceId,
        name: workspaceName(job.workspaceId),
      },
      task,
      skill,
      contextPack: {
        requestedBlocks: job.context,
        relevantDecisions: decisions,
        availableArtifacts: artifacts.map(({ id, title, type, version, status, visibility, source }) => ({ id, title, type, version, status, visibility, source })),
      },
      expectedOutput: {
        artifactType: job.output,
        initialVisibility: 'internal',
        reviewer: job.review,
        include: ['result', 'sources used', 'assumptions', 'open questions', 'recommended next action'],
      },
      returnContract: {
        taskStatus: 'review',
        createArtifactVersion: true,
        appendActivityLog: true,
        neverOverwriteApprovedVersion: true,
      },
    };
  }

  function downloadAgentHandoff(jobId) {
    const job = state.agentJobs.find((item) => item.id === jobId);
    if (!job) return;
    const handoff = buildAgentHandoff(job);
    const blob = new Blob([JSON.stringify(handoff, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${job.id}-${job.skillId || 'manual'}-handoff.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    job.status = job.status === 'ready' ? 'prepared' : job.status;
    saveState();
    render();
    showToast('Agent handoff downloaded. It is ready for any approved model.');
  }

  function bindEvents() {
    document.addEventListener('submit', (event) => {
      if (event.target.matches('[data-os-response-form]')) respondToClientRequest(event);
    });

    document.addEventListener('click', (event) => {
      const tabButton = event.target.closest('[data-os-tab], [data-os-tab-jump]');
      if (tabButton) {
        activeTab = tabButton.dataset.osTab || tabButton.dataset.osTabJump;
        searchTerm = '';
        render();
        root?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      if (event.target.closest('[data-os-new-task]')) {
        openTaskDialog();
        return;
      }

      const visibility = event.target.closest('[data-os-toggle-visibility]');
      if (visibility) {
        toggleArtifactVisibility(visibility.dataset.osToggleVisibility);
        return;
      }

      const handoff = event.target.closest('[data-os-download-handoff]');
      if (handoff) {
        downloadAgentHandoff(handoff.dataset.osDownloadHandoff);
        return;
      }

      if (event.target.closest('[data-os-close-dialog]')) {
        document.getElementById('agency-os-task-dialog')?.close();
      }
    });

    document.addEventListener('change', (event) => {
      if (event.target.matches('[data-os-workspace-filter]')) {
        activeWorkspace = event.target.value;
        render();
        return;
      }
      if (event.target.matches('[data-os-task-status]')) {
        updateTaskStatus(event.target.dataset.osTaskStatus, event.target.value);
      }
    });

    document.addEventListener('input', (event) => {
      if (!event.target.matches('[data-os-skill-search]')) return;
      searchTerm = event.target.value;
      render();
      const input = document.querySelector('[data-os-skill-search]');
      input?.focus();
      input?.setSelectionRange(searchTerm.length, searchTerm.length);
    });
  }

  async function init() {
    if (!root) return;
    const authContext = await (window.CLIENT_SPACE_AUTH_READY || Promise.resolve({ isAdmin: false }));
    if (authContext?.accessToken && window.CLIENT_SPACE_CONFIG?.enableCollaboration !== false) return;
    activeAuthContext = authContext;
    const access = window.CABINET_DATA
      ? await window.CABINET_DATA.getWorkspaceAccess(authContext).catch(() => null)
      : null;
    if (!authContext?.isAdmin && !access?.isOperator) return;
    if (access?.mode === 'remote') {
      try {
        await loadRemoteState(access);
      } catch (error) {
        root.innerHTML = `<div class="agency-os-empty">${escapeHtml(error.message || 'Agency OS could not load shared workspace data.')}</div>`;
        return;
      }
    } else if (window.CABINET_DATA) {
      const result = await window.CABINET_DATA.load('agency-os', authContext, {
        workspaceKey: 'agency',
        fallback: readSavedState(),
      });
      state = hydrateState(result.value);
    }
    renderWorkspaceFilter();
    createTaskDialog();
    bindEvents();
    render();
  }

  init();
})();
