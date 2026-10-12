(function () {
  'use strict';

  const staticTextSources = new WeakMap();
  const attributeSources = new WeakMap();
  const currentLanguage = 'en';
  let activeDataWorkspace = null;
  let workspaceAccess = { memberships: [], workspaces: [], isOperator: false, mode: 'local' };
  let activeBundle = null;

  // Reusable client records. Authentication assigns a server-controlled
  // app_metadata.client_id; unknown identities always receive a starter space.
  // Every section can be adapted or omitted as the client project requires.
  // Public bundles contain only reusable, non-client-specific templates.
  // Real workspace content must be loaded from authenticated storage.
  const GENERAL_KNOWLEDGE = [
    {
      id: 'positioning',
      category: 'Strategy',
      duration: '5 min',
      title: 'Positioning is a choice, not a slogan',
      description: 'How choosing the right audience, context, and promise makes later decisions easier.',
      intro: 'Strong positioning makes a project easier to understand, remember, and choose. It is the strategic choice behind the language—not a clever sentence added at the end.',
      steps: [
        ['Choose the context', 'Decide which type of opportunity, audience, or market situation matters most right now.'],
        ['Name the value', 'Translate what you do into the change or experience the right client cares about.'],
        ['Build proof', 'Support the promise with real outcomes, process, and credible signals.'],
      ],
    },
    {
      id: 'proof',
      category: 'Marketing',
      duration: '4 min',
      title: 'Proof before promotion',
      description: 'Why evidence from real work often creates more trust than polished claims.',
      intro: 'People believe what they can see. Useful marketing captures evidence from the work and turns it into clear signals of quality, relevance, and momentum.',
      steps: [
        ['Capture the work', 'Save useful outcomes, project context, preparation, and the details behind the result.'],
        ['Add meaning', 'Explain why the evidence matters instead of presenting it without context.'],
        ['Connect to action', 'Make the next useful decision or conversation clear.'],
      ],
    },
    {
      id: 'content-system',
      category: 'Content',
      duration: '7 min',
      title: 'Build a content system, not a posting habit',
      description: 'A repeatable method for turning real project activity into useful, varied content.',
      intro: 'A content system reduces the pressure to invent ideas every week. It starts with recurring inputs, clear roles, and a few formats that can be repeated.',
      steps: [
        ['Define the raw inputs', 'Use real work, preparation, questions, learning, and project milestones.'],
        ['Create repeatable formats', 'Use a small set of formats for proof, personality, expertise, and conversion.'],
        ['Review what works', 'Track meaningful response and improve the formats that attract the right opportunities.'],
      ],
    },
    {
      id: 'marketing-system',
      category: 'Foundation',
      duration: '6 min',
      title: 'From attention to action: a simple marketing system',
      description: 'How positioning, proof, content, and calls to action connect into a client journey.',
      intro: 'Marketing works better as a connected journey. Attention starts the relationship, proof lowers uncertainty, and a clear next step turns interest into a useful conversation.',
      steps: [
        ['Attention', 'Create a recognizable point of view that is relevant to the opportunities you want.'],
        ['Trust', 'Use clear presentation and real proof so the right client understands the quality.'],
        ['Action', 'Offer one obvious next step with the information needed to begin.'],
      ],
    },
  ];

  const CLIENTS = Object.freeze({});

  let client = null;
  let taskStorageKey = '';
  let questionStorageKey = '';
  let completedTasks = [];
  let savedQuestions = [];
  let activeAuthContext = null;
  let isAdminMode = false;
  let activeTaskFilter = 'all';
  let toastTimer = null;

  const dom = {
    body: document.body,
    sidebar: document.getElementById('sidebar'),
    mobileMenu: document.getElementById('mobile-menu'),
    mobileBackdrop: document.getElementById('mobile-backdrop'),
    currentViewLabel: document.getElementById('current-view-label'),
    greeting: document.getElementById('greeting'),
    adminNav: document.getElementById('admin-nav'),
    adminHomeButton: document.getElementById('admin-home-button'),
    adminCabinetGrid: document.getElementById('admin-cabinet-grid'),
    adminCabinetCount: document.getElementById('admin-cabinet-count'),
    sidebarAccessRole: document.getElementById('sidebar-access-role'),
    projectProgressValue: document.getElementById('project-progress-value'),
    roadmapProgressValue: document.getElementById('roadmap-progress-value'),
    overviewOpenTasks: document.getElementById('overview-open-tasks'),
    overviewMaterialCount: document.getElementById('overview-material-count'),
    sidebarTaskCount: document.getElementById('sidebar-task-count'),
    overviewTaskList: document.getElementById('overview-task-list'),
    fullTaskList: document.getElementById('full-task-list'),
    taskCompletionRatio: document.getElementById('task-completion-ratio'),
    strategyEmptyState: document.getElementById('strategy-empty-state'),
    strategyContent: document.getElementById('strategy-content'),
    strategyVersion: document.getElementById('strategy-version'),
    strategySource: document.getElementById('strategy-source'),
    strategyPositioning: document.getElementById('strategy-positioning'),
    strategyDirection: document.getElementById('strategy-direction'),
    strategyNorthStar: document.getElementById('strategy-north-star'),
    strategyEvidenceGrid: document.getElementById('strategy-evidence-grid'),
    strategyBrandCompass: document.getElementById('strategy-brand-compass'),
    strategyAudiences: document.getElementById('strategy-audiences'),
    strategyGuardrails: document.getElementById('strategy-guardrails'),
    strategyTruthGrid: document.getElementById('strategy-truth-grid'),
    strategyFunnel: document.getElementById('strategy-funnel'),
    strategyContentPillars: document.getElementById('strategy-content-pillars'),
    strategyDecisionGates: document.getElementById('strategy-decision-gates'),
    roadmapList: document.getElementById('roadmap-list'),
    activityTimeline: document.getElementById('activity-timeline'),
    materialGrid: document.getElementById('material-grid'),
    materialTotalCount: document.getElementById('material-total-count'),
    materialReadyCount: document.getElementById('material-ready-count'),
    materialWaitingCount: document.getElementById('material-waiting-count'),
    overviewKnowledgeList: document.getElementById('overview-knowledge-list'),
    knowledgeGrid: document.getElementById('knowledge-grid'),
    formsGrid: document.getElementById('forms-grid'),
    questionForm: document.getElementById('question-form'),
    savedQuestionList: document.getElementById('saved-question-list'),
    savedQuestionCount: document.getElementById('saved-question-count'),
    articleDialog: document.getElementById('article-dialog'),
    articleDialogContent: document.getElementById('article-dialog-content'),
    dialogClose: document.getElementById('dialog-close'),
    toast: document.getElementById('portal-toast'),
  };

  function readJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return Array.isArray(value) ? value : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function readLanguagePreference() {
    return 'en';
  }

  function clientDisplayName(user) {
    const metadata = user?.user_metadata || {};
    return metadata.full_name || metadata.name || metadata.username || 'Client';
  }

  function clientInitials(name) {
    return String(name)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || 'NC';
  }

  function createStarterClient(user) {
    const contactName = clientDisplayName(user);
    const storageIdentity = String(user?.id || 'prototype').replace(/[^a-zA-Z0-9_-]/g, '');
    const generalKnowledge = GENERAL_KNOWLEDGE.filter((article) =>
      ['positioning', 'proof', 'content-system', 'marketing-system'].includes(article.id)
    );

    return {
      id: `starter-${storageIdentity || 'client'}`,
      name: 'New Client Workspace',
      contactName,
      initials: clientInitials(contactName),
      currentPhase: 'Getting started',
      progress: 5,
      nextCheckin: 'To be scheduled',
      latestUpdate: {
        date: 'Today',
        title: 'Your client workspace is ready',
        copy: 'This clean structure is ready for your brief, source materials, project decisions, tasks, and agency updates.',
      },
      strategy: null,
      roadmap: [
        {
          title: 'Workspace access',
          description: 'Your private cabinet structure is created and ready for the project.',
          status: 'done',
          timing: 'Completed',
        },
        {
          title: 'First brief & materials',
          description: 'We collect your goals, context, links, documents, proof, and open questions.',
          status: 'active',
          timing: 'Next step',
        },
        {
          title: 'Agency review',
          description: 'The team organizes the inputs, identifies gaps, and prepares the first working direction.',
          status: 'upcoming',
          timing: 'After the brief',
        },
        {
          title: 'Strategy & delivery system',
          description: 'Approved knowledge becomes visible decisions, materials, tasks, and progress inside this cabinet.',
          status: 'upcoming',
          timing: 'Planned',
        },
      ],
      updates: [
        {
          date: 'Today',
          title: 'A clean client cabinet was created',
          copy: 'Nothing from another client is shown here. We will fill this workspace from your own brief and project folder.',
        },
      ],
      tasks: [
        {
          id: 'prepare-first-brief',
          title: 'Prepare your first project brief',
          description: 'Write down the main goal, current situation, desired result, and the questions you want us to solve.',
          category: 'Getting started',
          effort: '10–15 min',
          priority: 'Next step',
          featured: true,
        },
        {
          id: 'collect-project-links',
          title: 'Collect useful project links and files',
          description: 'Prepare the website, social profiles, documents, brand files, examples, and existing research in one folder.',
          category: 'Materials',
          effort: '15–30 min',
          priority: 'Next step',
          featured: true,
        },
        {
          id: 'send-first-question',
          title: 'Save your first question for the team',
          description: 'Use the Questions page to record anything we should discuss during the first project conversation.',
          category: 'Communication',
          effort: '5 min',
          priority: 'Optional',
        },
      ],
      materials: [],
      knowledge: generalKnowledge,
      forms: [
        {
          title: 'Project starting brief',
          description: 'A reusable first questionnaire for goals, context, materials, decision makers, and project priorities.',
          status: 'draft',
          timing: 'Coming next',
          featured: true,
        },
        {
          title: 'Materials and links',
          description: 'A structured place to share the source files and references we will use for your project.',
          status: 'draft',
          timing: 'Coming next',
        },
        {
          title: 'Strategy feedback',
          description: 'A future review form for decisions, comments, questions, and approvals.',
          status: 'draft',
          timing: 'Coming later',
        },
      ],
    };
  }

  function isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
  }

  function formatDate(value) {
    if (!value) return 'Recently';
    return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
  }

  function formatLabel(value) {
    return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function normalizedStrategy(value) {
    if (!value || typeof value !== 'object') return null;
    const requiredArrays = ['evidence', 'brandCompass', 'audiences', 'guardrails', 'truthGroups', 'funnel', 'contentPillars', 'gates'];
    return requiredArrays.every((key) => Array.isArray(value[key])) ? value : null;
  }

  function createClientFromBundle(bundle, user) {
    const workspace = bundle.workspace;
    const context = bundle.projectContext;
    const contactName = clientDisplayName(user);
    const milestones = Array.isArray(context?.milestones) && context.milestones.length
      ? context.milestones
      : [{
          title: workspace.current_focus || 'Shared workspace active',
          description: context?.objective || workspace.description || 'Client and team are operating from the same project context.',
          status: 'active',
          timing: context?.next_milestone || 'Current',
        }];
    const activity = bundle.activity.length
      ? bundle.activity.map((item) => ({ date: formatDate(item.created_at), title: item.summary, copy: item.metadata?.detail || 'This update is preserved in the project activity history.' }))
      : [{ date: formatDate(workspace.updated_at), title: workspace.latest_update_title, copy: workspace.latest_update_body }];
    const taskRecords = bundle.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      category: task.category || 'Project',
      effort: task.effort || (task.due_at ? `Due ${formatDate(task.due_at)}` : 'No due date'),
      priority: task.priority === 'high' ? 'High priority' : task.priority === 'low' ? 'Low priority' : 'Next step',
      featured: task.status !== 'completed' && task.status !== 'cancelled',
      status: task.status,
    }));
    const materialRecords = [
      ...bundle.materials.map((material) => ({
        id: material.id,
        title: material.title,
        description: material.description,
        type: material.kind.toUpperCase().slice(0, 4),
        style: material.kind,
        status: material.status,
        meta: material.published_at ? `Published ${formatDate(material.published_at)}` : 'Shared resource',
        action: 'Open resource',
        href: material.url,
      })),
      ...bundle.deliverables.map((deliverable) => ({
        id: deliverable.id,
        title: deliverable.title,
        description: deliverable.description,
        type: 'DLV',
        style: 'document',
        status: deliverable.status === 'published' ? 'ready' : deliverable.status,
        meta: deliverable.published_at ? `Published ${formatDate(deliverable.published_at)}` : 'Deliverable',
        action: 'Open deliverable',
        href: deliverable.url,
      })),
    ];

    return {
      id: workspace.id,
      name: workspace.name,
      contactName,
      initials: clientInitials(workspace.name),
      currentPhase: workspace.current_phase,
      progress: workspace.progress,
      nextCheckin: context?.next_milestone || 'To be scheduled',
      latestUpdate: {
        date: formatDate(workspace.latest_update_at),
        title: workspace.latest_update_title,
        copy: workspace.latest_update_body,
      },
      strategy: normalizedStrategy(context?.strategy),
      roadmap: milestones,
      updates: activity,
      tasks: taskRecords,
      materials: materialRecords,
      knowledge: GENERAL_KNOWLEDGE,
      forms: bundle.forms.map((form) => ({
        id: form.id,
        title: form.title,
        description: form.description,
        status: form.status,
        timing: form.status === 'active' ? 'Assigned to this workspace' : 'Not currently available',
        featured: form.status === 'active',
      })),
    };
  }

  function activateClient(authContext, selectedClientId = authContext?.clientId, isAdminPreview = false) {
    const assignedClientId = String(selectedClientId || 'starter').trim().toLowerCase();
    client = CLIENTS[assignedClientId] || createStarterClient(authContext?.user);
    const storageOwner = isAdminPreview
      ? `admin-preview:${authContext?.user?.id || 'admin'}:${client.id}`
      : client.id;
    const legacyTaskStorageKey = `34forfree7:client-space:${storageOwner}:tasks:v1`;
    const legacyQuestionStorageKey = `34forfree7:client-space:${storageOwner}:questions:v1`;
    taskStorageKey = `client-cabinet:${storageOwner}:tasks:v1`;
    questionStorageKey = `client-cabinet:${storageOwner}:questions:v1`;
    completedTasks = readJson(taskStorageKey, readJson(legacyTaskStorageKey, []));
    savedQuestions = readJson(questionStorageKey, readJson(legacyQuestionStorageKey, []));
    activeDataWorkspace = assignedClientId === 'starter'
      ? (isAdminPreview ? 'template' : null)
      : assignedClientId;
    activeBundle = null;
  }

  async function hydrateClientState() {
    if (!window.CABINET_DATA) return;
    if (isUuid(activeDataWorkspace) && window.CABINET_DATA.canUseRemote(activeAuthContext)) {
      activeBundle = await window.CABINET_DATA.loadWorkspaceBundle(activeDataWorkspace, activeAuthContext);
      client = createClientFromBundle(activeBundle, activeAuthContext.user);
      completedTasks = activeBundle.tasks
        .filter((task) => task.status === 'completed')
        .map((task) => task.id);
      savedQuestions = activeBundle.requests.map((request) => ({ ...request, remote: true }));
      return;
    }
    const result = await window.CABINET_DATA.load('client-space', activeAuthContext, {
      workspaceKey: activeDataWorkspace,
      fallback: { completedTasks, savedQuestions },
    });
    if (Array.isArray(result.value?.completedTasks)) completedTasks = result.value.completedTasks;
    if (Array.isArray(result.value?.savedQuestions)) savedQuestions = result.value.savedQuestions;
  }

  function persistClientState() {
    if (!window.CABINET_DATA) return Promise.resolve({ mode: 'local' });
    if (activeBundle) return Promise.resolve({ mode: 'remote' });
    return window.CABINET_DATA.save('client-space', activeAuthContext, {
      completedTasks,
      savedQuestions,
    }, { workspaceKey: activeDataWorkspace });
  }

  function renderAdminCabinets() {
    if (!isAdminMode) return;

    const remoteCabinets = workspaceAccess.workspaces.map((record) => ({
        id: record.id,
        name: record.name,
        initials: clientInitials(record.name),
        phase: record.current_phase,
        progress: record.progress,
        kind: 'Existing client',
        description: 'Open the current client-facing workspace with its strategy, tasks, materials, and forms.',
      }));
    const cabinets = [
      ...remoteCabinets,
      ...(workspaceAccess.mode === 'local' ? [{
        id: 'starter',
        name: 'New client preview',
        initials: 'NC',
        phase: 'Clean template',
        progress: 5,
        kind: 'Template',
        description: 'See exactly what a newly authenticated client receives before their own project information is added.',
      }] : []),
    ];

    dom.adminCabinetCount.textContent = cabinets.length;
    dom.adminCabinetGrid.innerHTML = cabinets.map((cabinet) => `
      <article class="admin-cabinet-card ${cabinet.id === 'starter' ? 'is-template' : ''}">
        <div class="admin-cabinet-card__top">
          <span class="admin-cabinet-avatar">${escapeHtml(cabinet.initials)}</span>
          <span class="admin-cabinet-kind">${escapeHtml(cabinet.kind)}</span>
        </div>
        <div>
          <h2>${escapeHtml(cabinet.name)}</h2>
          <p>${escapeHtml(cabinet.description)}</p>
        </div>
        <div class="admin-cabinet-card__meta">
          <span>${escapeHtml(cabinet.phase)}</span>
          <strong>${escapeHtml(cabinet.progress)}%</strong>
        </div>
        <button class="primary-button" type="button" data-admin-client="${escapeHtml(cabinet.id)}">
          ${cabinet.id === 'starter' ? 'Preview new client' : 'Open cabinet'} <span>→</span>
        </button>
      </article>
    `).join('');
  }

  function showAdminHome() {
    if (!isAdminMode) return;
    renderAdminCabinets();
    document.querySelectorAll('[data-client-name]').forEach((element) => {
      element.textContent = 'Platform Admin';
    });
    document.querySelectorAll('[data-client-initials]').forEach((element) => {
      element.textContent = 'A';
    });
    document.querySelectorAll('[data-client-contact]').forEach((element) => {
      element.textContent = clientDisplayName(activeAuthContext?.user);
    });
    dom.sidebarAccessRole.textContent = 'Admin access';
    switchView('admin');
    translateDocument();
  }

  async function openAdminCabinet(clientId) {
    if (!isAdminMode) return;
    activateClient(activeAuthContext, clientId, true);
    await hydrateClientState();
    dom.sidebarAccessRole.textContent = 'Admin preview';
    renderAllContent();
    switchView('overview');
    showToast(clientId === 'starter' ? 'New client preview opened.' : 'Client cabinet opened.');
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function translate(value) {
    return String(value);
  }

  function translateDocument() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    let node = walker.nextNode();

    while (node) {
      const parent = node.parentElement;
      if (parent && !parent.closest('script, style, [data-no-translate]') && node.nodeValue.trim()) {
        textNodes.push(node);
      }
      node = walker.nextNode();
    }

    textNodes.forEach((textNode) => {
      if (!staticTextSources.has(textNode)) staticTextSources.set(textNode, textNode.nodeValue);
      const source = staticTextSources.get(textNode);
      const match = source.match(/^(\s*)([\s\S]*?)(\s*)$/);
      textNode.nodeValue = `${match[1]}${translate(match[2])}${match[3]}`;
    });

    document.querySelectorAll('[placeholder], [title], [aria-label]').forEach((element) => {
      if (!attributeSources.has(element)) attributeSources.set(element, {});
      const sources = attributeSources.get(element);

      ['placeholder', 'title', 'aria-label'].forEach((attribute) => {
        if (!element.hasAttribute(attribute)) return;
        if (!Object.prototype.hasOwnProperty.call(sources, attribute)) {
          sources[attribute] = element.getAttribute(attribute);
        }
        element.setAttribute(attribute, translate(sources[attribute]));
      });
    });

    document.documentElement.lang = currentLanguage;
    const activeNav = document.querySelector('[data-view-target].is-active span:nth-child(2)');
    if (activeNav) dom.currentViewLabel.textContent = activeNav.textContent;
  }

  function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return translate('Good morning');
    if (hour < 18) return translate('Good afternoon');
    return translate('Good evening');
  }

  function applyClientContent() {
    document.querySelectorAll('[data-client-name]').forEach((element) => {
      element.textContent = client.name;
    });
    document.querySelectorAll('[data-client-contact]').forEach((element) => {
      element.textContent = client.contactName;
    });
    document.querySelectorAll('[data-client-initials]').forEach((element) => {
      element.textContent = client.initials;
    });
    document.querySelectorAll('[data-current-phase]').forEach((element) => {
      element.textContent = client.currentPhase;
    });
    document.querySelectorAll('[data-next-checkin]').forEach((element) => {
      element.textContent = client.nextCheckin;
    });
    document.querySelectorAll('[data-latest-update-date]').forEach((element) => {
      element.textContent = client.latestUpdate.date;
    });
    document.querySelectorAll('[data-latest-update-title]').forEach((element) => {
      element.textContent = client.latestUpdate.title;
    });
    document.querySelectorAll('[data-latest-update-copy]').forEach((element) => {
      element.textContent = client.latestUpdate.copy;
    });

    dom.projectProgressValue.textContent = `${client.progress}%`;
    dom.roadmapProgressValue.textContent = `${client.progress}%`;

    dom.greeting.textContent = getGreeting();
    document.title = `${client.name} — Platum`;
  }

  function switchView(viewName) {
    if (viewName === 'admin' && !isAdminMode) return;
    const targetView = document.querySelector(`[data-view="${viewName}"]`);
    if (!targetView) return;

    document.querySelectorAll('[data-view]').forEach((view) => {
      view.classList.toggle('is-active', view === targetView);
    });
    document.querySelectorAll('[data-view-target]').forEach((button) => {
      const isActive = button.dataset.viewTarget === viewName;
      button.classList.toggle('is-active', isActive);
      if (isActive) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });

    const label = document.querySelector(`[data-view-target="${viewName}"] span:nth-child(2)`);
    dom.currentViewLabel.textContent = label ? label.textContent : 'Client Space';
    closeMobileMenu();
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (window.history && window.history.replaceState) {
      const url = new URL(window.location.href);
      url.hash = viewName === 'overview' ? '' : viewName;
      window.history.replaceState({}, '', url);
    }
  }

  function openMobileMenu() {
    dom.body.classList.add('menu-open');
    dom.mobileMenu.setAttribute('aria-expanded', 'true');
  }

  function closeMobileMenu() {
    dom.body.classList.remove('menu-open');
    dom.mobileMenu.setAttribute('aria-expanded', 'false');
  }

  function isTaskDone(id) {
    return completedTasks.includes(id);
  }

  async function toggleTask(id, isDone) {
    const previous = [...completedTasks];
    if (isDone && !completedTasks.includes(id)) {
      completedTasks.push(id);
    } else if (!isDone) {
      completedTasks = completedTasks.filter((taskId) => taskId !== id);
    }
    renderTasks();
    translateDocument();
    try {
      if (activeBundle) {
        await window.CABINET_DATA.setClientTaskStatus(id, activeAuthContext, isDone ? 'completed' : 'open');
        const task = activeBundle.tasks.find((item) => item.id === id);
        if (task) task.status = isDone ? 'completed' : 'open';
      } else {
        localStorage.setItem(taskStorageKey, JSON.stringify(completedTasks));
        await persistClientState();
      }
      showToast(isDone ? 'Task completed. Nice progress.' : 'Task moved back to open.');
    } catch (error) {
      completedTasks = previous;
      renderTasks();
      translateDocument();
      showToast(error.message || 'The task could not be updated.');
    }
  }

  function taskCheckbox(task) {
    return `
      <input
        class="task-checkbox"
        type="checkbox"
        data-task-checkbox="${escapeHtml(task.id)}"
        aria-label="${escapeHtml(translate('Mark task as completed'))}: ${escapeHtml(translate(task.title))}"
        ${isTaskDone(task.id) ? 'checked' : ''}
      >
    `;
  }

  function renderTasks() {
    const openTasks = client.tasks.filter((task) => !isTaskDone(task.id));
    const featured = [...openTasks.filter((task) => task.featured), ...openTasks.filter((task) => !task.featured)].slice(0, 3);
    const overviewTasks = featured.length ? featured : client.tasks.slice(0, 3);

    dom.overviewTaskList.innerHTML = overviewTasks.map((task) => `
      <article class="compact-task ${isTaskDone(task.id) ? 'is-done' : ''}">
        ${taskCheckbox(task)}
        <div class="compact-task__copy">
          <strong>${escapeHtml(task.title)}</strong>
          <span>${escapeHtml(task.effort)} · ${escapeHtml(task.category)}</span>
        </div>
        <span class="task-status">${isTaskDone(task.id) ? 'Done' : escapeHtml(task.priority)}</span>
      </article>
    `).join('');

    const filteredTasks = client.tasks.filter((task) => {
      if (activeTaskFilter === 'open') return !isTaskDone(task.id);
      if (activeTaskFilter === 'done') return isTaskDone(task.id);
      return true;
    });

    dom.fullTaskList.innerHTML = filteredTasks.length
      ? filteredTasks.map((task) => `
          <article class="full-task ${isTaskDone(task.id) ? 'is-done' : ''}">
            ${taskCheckbox(task)}
            <div class="full-task__main">
              <h2>${escapeHtml(task.title)}</h2>
              <p>${escapeHtml(task.description)}</p>
              <div class="full-task__meta">
                <span class="meta-chip">${escapeHtml(task.category)}</span>
                <span class="meta-chip">${escapeHtml(task.effort)}</span>
              </div>
            </div>
            <span class="task-status">${isTaskDone(task.id) ? 'Completed' : escapeHtml(task.priority)}</span>
          </article>
        `).join('')
      : '<div class="empty-state">No tasks match this filter.</div>';

    dom.overviewOpenTasks.textContent = openTasks.length;
    dom.sidebarTaskCount.textContent = openTasks.length;
    dom.taskCompletionRatio.textContent = `${completedTasks.filter((id) => client.tasks.some((task) => task.id === id)).length} / ${client.tasks.length}`;

    document.querySelectorAll('[data-task-checkbox]').forEach((checkbox) => {
      checkbox.addEventListener('change', () => toggleTask(checkbox.dataset.taskCheckbox, checkbox.checked));
    });
  }

  function renderStrategy() {
    const strategy = client.strategy;

    if (!strategy) {
      dom.strategyEmptyState.hidden = false;
      dom.strategyContent.hidden = true;
      return;
    }

    dom.strategyEmptyState.hidden = true;
    dom.strategyContent.hidden = false;

    dom.strategyVersion.textContent = strategy.version;
    dom.strategySource.textContent = strategy.source;
    dom.strategyPositioning.textContent = strategy.positioning;
    dom.strategyDirection.textContent = strategy.direction;
    dom.strategyNorthStar.textContent = strategy.northStar;

    dom.strategyEvidenceGrid.innerHTML = strategy.evidence.map((item) => `
      <article class="strategy-evidence-card">
        <strong>${escapeHtml(item.value)}</strong>
        <span>${escapeHtml(item.label)}</span>
        <small>${escapeHtml(item.note)}</small>
      </article>
    `).join('');

    dom.strategyBrandCompass.innerHTML = strategy.brandCompass.map((item) => `
      <article class="brand-compass-card brand-compass-card--${escapeHtml(item.key)}">
        <span>${escapeHtml(item.label)}</span>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.detail)}</p>
      </article>
    `).join('');

    dom.strategyAudiences.innerHTML = strategy.audiences.map((audience) => `
      <article class="strategy-audience-card">
        <div class="strategy-audience-card__top">
          <span>${escapeHtml(audience.label)}</span>
          <small>${escapeHtml(audience.status)}</small>
        </div>
        <h3>${escapeHtml(audience.title)}</h3>
        <p>${escapeHtml(audience.detail)}</p>
        <strong>${escapeHtml(audience.role)}</strong>
      </article>
    `).join('');

    dom.strategyGuardrails.innerHTML = strategy.guardrails.map((group) => `
      <section class="brand-guardrail brand-guardrail--${escapeHtml(group.key)}">
        <span>${escapeHtml(group.label)}</span>
        <ul>
          ${group.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
        </ul>
      </section>
    `).join('');

    dom.strategyTruthGrid.innerHTML = strategy.truthGroups.map((group) => `
      <article class="strategy-truth-card strategy-truth-card--${escapeHtml(group.key)}">
        <div class="strategy-truth-card__heading">
          <span class="truth-status-dot"></span>
          <div>
            <h3>${escapeHtml(group.label)}</h3>
            <p>${escapeHtml(group.description)}</p>
          </div>
        </div>
        <ul>
          ${group.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
        </ul>
      </article>
    `).join('');

    dom.strategyFunnel.innerHTML = strategy.funnel.map((step, index) => `
      <article class="funnel-step">
        <div class="funnel-step__top">
          <span>${String(index + 1).padStart(2, '0')}</span>
          <small>${escapeHtml(step.signal)}</small>
        </div>
        <h3>${escapeHtml(step.title)}</h3>
        <p>${escapeHtml(step.detail)}</p>
      </article>
    `).join('');

    dom.strategyContentPillars.innerHTML = strategy.contentPillars.map((pillar) => `
      <article class="strategy-pillar">
        <span class="strategy-pillar__number">${escapeHtml(pillar.number)}</span>
        <div>
          <span class="strategy-pillar__role">${escapeHtml(pillar.role)}</span>
          <h3>${escapeHtml(pillar.title)}</h3>
          <p>${escapeHtml(pillar.detail)}</p>
        </div>
      </article>
    `).join('');

    dom.strategyDecisionGates.innerHTML = strategy.gates.map((gate) => `
      <article class="strategy-gate strategy-gate--${escapeHtml(gate.status)}">
        <span>${escapeHtml(gate.label)}</span>
        <div>
          <h3>${escapeHtml(gate.title)}</h3>
          <p>${escapeHtml(gate.detail)}</p>
        </div>
      </article>
    `).join('');
  }

  function renderRoadmap() {
    dom.roadmapList.innerHTML = client.roadmap.map((item, index) => `
      <article class="roadmap-item is-${escapeHtml(item.status)}">
        <span class="roadmap-index">${item.status === 'done' ? '✓' : String(index + 1).padStart(2, '0')}</span>
        <div class="roadmap-copy">
          <h2>${escapeHtml(item.title)}</h2>
          <p>${escapeHtml(item.description)}</p>
        </div>
        <div class="roadmap-meta">
          <strong>${item.status === 'active' ? 'In progress' : item.status}</strong>
          <span>${escapeHtml(item.timing)}</span>
        </div>
      </article>
    `).join('');

    dom.activityTimeline.innerHTML = client.updates.map((update) => `
      <article class="activity-item">
        <span>${escapeHtml(update.date)}</span>
        <h3>${escapeHtml(update.title)}</h3>
        <p>${escapeHtml(update.copy)}</p>
      </article>
    `).join('');
  }

  function renderMaterials() {
    const readyCount = client.materials.filter((material) => material.status === 'ready').length;
    const waitingCount = client.materials.length - readyCount;
    dom.materialTotalCount.textContent = client.materials.length;
    dom.overviewMaterialCount.textContent = client.materials.length;
    dom.materialReadyCount.textContent = readyCount;
    dom.materialWaitingCount.textContent = waitingCount;

    dom.materialGrid.innerHTML = client.materials.length ? client.materials.map((material) => `
      <article class="material-card">
        <div class="material-card__top">
          <span class="file-type file-type--${escapeHtml(material.style)}">${escapeHtml(material.type)}</span>
          <span class="material-status ${material.status === 'waiting' ? 'is-waiting' : ''}">${escapeHtml(material.status)}</span>
        </div>
        <h2>${escapeHtml(material.title)}</h2>
        <p>${escapeHtml(material.description)}</p>
        <div class="card-footer">
          <span>${escapeHtml(material.meta)}</span>
          ${material.targetView
            ? `<button class="card-action" type="button" data-view-link="${escapeHtml(material.targetView)}">${escapeHtml(material.action)} →</button>`
            : material.href
              ? `<a class="card-action" href="${escapeHtml(material.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(material.action)} →</a>`
            : `<button class="card-action" type="button" data-material-placeholder="${escapeHtml(material.action)}" ${material.status === 'waiting' ? 'aria-disabled="true"' : ''}>${escapeHtml(material.action)}</button>`
          }
        </div>
      </article>
    `).join('') : '<div class="empty-state">No project materials yet. Your team will add files, links, and references here.</div>';
  }

  function renderKnowledge() {
    const recommended = client.knowledge.slice(0, 2);
    dom.overviewKnowledgeList.innerHTML = recommended.map((article) => `
      <button class="mini-knowledge" type="button" data-article-open="${escapeHtml(article.id)}">
        <span>${escapeHtml(article.category)} · ${escapeHtml(article.duration)}</span>
        <strong>${escapeHtml(article.title)}</strong>
      </button>
    `).join('');

    dom.knowledgeGrid.innerHTML = client.knowledge
      .filter((article) => article.id !== 'marketing-system')
      .map((article, index) => `
        <article class="knowledge-card" tabindex="0" role="button" data-article-open="${escapeHtml(article.id)}">
          <div class="knowledge-card__meta">
            <span>${escapeHtml(article.category)} · ${escapeHtml(article.duration)}</span>
            <span class="lesson-number">${String(index + 1).padStart(2, '0')}</span>
          </div>
          <h2>${escapeHtml(article.title)}</h2>
          <p>${escapeHtml(article.description)}</p>
          <span class="card-action" aria-hidden="true">Open guide →</span>
        </article>
      `).join('');
  }

  function openArticle(articleId) {
    const article = client.knowledge.find((item) => item.id === articleId);
    if (!article) return;

    dom.articleDialogContent.innerHTML = `
      <article class="article-content">
        <span class="section-kicker">${escapeHtml(article.category)} · ${escapeHtml(article.duration)} read</span>
        <h2>${escapeHtml(article.title)}</h2>
        <p>${escapeHtml(article.intro)}</p>
        <div class="article-steps">
          ${article.steps.map((step, index) => `
            <section class="article-step">
              <strong>${String(index + 1).padStart(2, '0')} · ${escapeHtml(step[0])}</strong>
              <p>${escapeHtml(step[1])}</p>
            </section>
          `).join('')}
        </div>
      </article>
    `;
    translateDocument();
    dom.articleDialog.showModal();
  }

  function renderForms() {
    dom.formsGrid.innerHTML = client.forms.map((form) => `
      <article class="form-card ${form.featured ? 'is-featured' : ''}">
        <div class="form-card__top">
          <span class="file-type">${form.status === 'active' ? 'FORM' : 'SOON'}</span>
          <span class="form-status ${form.status === 'draft' ? 'is-draft' : ''}">${escapeHtml(form.status)}</span>
        </div>
        <h2>${escapeHtml(form.title)}</h2>
        <p>${escapeHtml(form.description)}</p>
        <div class="card-footer">
          <span>${escapeHtml(form.timing)}</span>
          ${form.href
            ? `<a class="card-action" href="${escapeHtml(form.href)}">Open form →</a>`
            : '<span class="card-action" aria-disabled="true">Not available yet</span>'
          }
        </div>
      </article>
    `).join('');
  }

  function renderQuestions() {
    dom.savedQuestionCount.textContent = savedQuestions.length;
    dom.savedQuestionList.innerHTML = savedQuestions.length
      ? savedQuestions.map((question) => {
          const replies = Array.isArray(question.replies) ? question.replies : [];
          const date = question.created_at ? formatDate(question.created_at) : question.date;
          const status = question.status ? formatLabel(question.status) : 'Saved locally';
          return `
          <article class="saved-question-item">
            <div class="saved-question-item__top">
              <strong>${escapeHtml(question.topic)}</strong>
              <span>${escapeHtml(date)}</span>
            </div>
            <span class="request-status">${escapeHtml(status)}</span>
            <p>${escapeHtml(question.message)}</p>
            ${replies.map((reply) => `
              <div class="request-reply">
                <strong>Project team response</strong>
                <p>${escapeHtml(reply.body)}</p>
                <span>${escapeHtml(formatDate(reply.created_at))}</span>
              </div>
            `).join('')}
            ${question.remote ? '' : `<button class="delete-question" type="button" data-delete-question="${escapeHtml(question.id)}">Delete</button>`}
          </article>
        `;
        }).join('')
      : '<div class="empty-state">No project requests yet. Send a question when the team needs context or a decision.</div>';

    document.querySelectorAll('[data-delete-question]').forEach((button) => {
      button.addEventListener('click', () => {
        savedQuestions = savedQuestions.filter((question) => question.id !== button.dataset.deleteQuestion);
        localStorage.setItem(questionStorageKey, JSON.stringify(savedQuestions));
        persistClientState();
        renderQuestions();
        translateDocument();
      });
    });
  }

  async function saveQuestion(event) {
    event.preventDefault();
    const formData = new FormData(dom.questionForm);
    const message = String(formData.get('message') || '').trim();
    if (!message) return;
    const submitButton = dom.questionForm.querySelector('[type="submit"]');
    submitButton.disabled = true;

    try {
      if (activeBundle) {
        await window.CABINET_DATA.createRequest(activeDataWorkspace, activeAuthContext, {
          topic: String(formData.get('topic') || 'Other'),
          message,
        });
        activeBundle = await window.CABINET_DATA.loadWorkspaceBundle(activeDataWorkspace, activeAuthContext);
        client = createClientFromBundle(activeBundle, activeAuthContext.user);
        savedQuestions = activeBundle.requests.map((request) => ({ ...request, remote: true }));
        completedTasks = activeBundle.tasks.filter((task) => task.status === 'completed').map((task) => task.id);
        showToast('Request sent to the project team.');
      } else {
        savedQuestions.unshift({
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          topic: String(formData.get('topic') || 'Other'),
          message,
          date: formatDate(new Date()),
        });
        localStorage.setItem(questionStorageKey, JSON.stringify(savedQuestions));
        await persistClientState();
        showToast('Request saved in local preview.');
      }
      dom.questionForm.reset();
      renderAllContent();
    } catch (error) {
      showToast(error.message || 'The request could not be sent.');
    } finally {
      submitButton.disabled = false;
    }
  }

  function showToast(message) {
    dom.toast.textContent = translate(message);
    dom.toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      dom.toast.classList.remove('is-visible');
    }, 2800);
  }

  function bindEvents() {
    dom.mobileMenu.addEventListener('click', () => {
      dom.body.classList.contains('menu-open') ? closeMobileMenu() : openMobileMenu();
    });
    dom.mobileBackdrop.addEventListener('click', closeMobileMenu);

    document.querySelectorAll('[data-task-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        activeTaskFilter = button.dataset.taskFilter;
        document.querySelectorAll('[data-task-filter]').forEach((filterButton) => {
          const isActive = filterButton === button;
          filterButton.classList.toggle('is-active', isActive);
          filterButton.setAttribute('aria-pressed', String(isActive));
        });
        renderTasks();
        translateDocument();
      });
    });

    document.addEventListener('click', (event) => {
      const adminClient = event.target.closest('[data-admin-client]');
      if (adminClient) {
        openAdminCabinet(adminClient.dataset.adminClient);
        return;
      }

      const viewControl = event.target.closest('[data-view-target], [data-view-link]');
      if (viewControl) switchView(viewControl.dataset.viewTarget || viewControl.dataset.viewLink);

      const articleTrigger = event.target.closest('[data-article-open]');
      if (articleTrigger) openArticle(articleTrigger.dataset.articleOpen);

      const placeholder = event.target.closest('[data-material-placeholder]');
      if (placeholder && placeholder.getAttribute('aria-disabled') !== 'true') {
        showToast('This material card is ready for a real file or link.');
      }
    });

    document.addEventListener('keydown', (event) => {
      const trigger = event.target.closest('[data-article-open]');
      if (trigger && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        openArticle(trigger.dataset.articleOpen);
      }
      if (event.key === 'Escape') closeMobileMenu();
    });

    dom.dialogClose.addEventListener('click', () => dom.articleDialog.close());
    dom.articleDialog.addEventListener('click', (event) => {
      if (event.target === dom.articleDialog) dom.articleDialog.close();
    });
    dom.questionForm.addEventListener('submit', saveQuestion);
    dom.adminHomeButton.addEventListener('click', showAdminHome);
  }

  function renderAllContent() {
    applyClientContent();
    renderTasks();
    renderStrategy();
    renderRoadmap();
    renderMaterials();
    renderKnowledge();
    renderForms();
    renderQuestions();
    translateDocument();
  }

  async function init() {
    translateDocument();
    const authContext = await (window.CLIENT_SPACE_AUTH_READY || Promise.resolve({ clientId: 'starter', user: null }));
    if (authContext?.accessToken && window.CLIENT_SPACE_CONFIG?.enableCollaboration !== false) return;
    activeAuthContext = authContext;
    try {
      workspaceAccess = window.CABINET_DATA
        ? await window.CABINET_DATA.getWorkspaceAccess(authContext)
        : workspaceAccess;
    } catch (error) {
      window.CLIENT_SPACE_DENY_ACCESS?.(error.message || 'Workspace authorization could not be verified.');
      return;
    }

    if (!authContext.isLocalPreview && workspaceAccess.mode === 'remote' && workspaceAccess.workspaces.length === 0) {
      window.CLIENT_SPACE_DENY_ACCESS?.('Your account is authenticated but has no Platum workspace membership.');
      return;
    }

    isAdminMode = Boolean(authContext.isAdmin || workspaceAccess.isOperator);
    dom.adminNav.hidden = !isAdminMode;
    dom.adminHomeButton.hidden = !isAdminMode;
    const requestedWorkspace = new URLSearchParams(window.location.search).get('workspace');
    const selectedWorkspace = workspaceAccess.workspaces.some((workspace) => workspace.id === requestedWorkspace)
      ? requestedWorkspace
      : workspaceAccess.workspaces[0]?.id || 'starter';
    activateClient(authContext, selectedWorkspace, isAdminMode && workspaceAccess.mode === 'local');
    try {
      await hydrateClientState();
    } catch (error) {
      window.CLIENT_SPACE_DENY_ACCESS?.(error.message || 'The assigned workspace could not be loaded.');
      return;
    }
    const activeMembership = workspaceAccess.memberships.find((membership) => membership.workspace_id === activeDataWorkspace);
    if (activeMembership) dom.sidebarAccessRole.textContent = `${formatLabel(activeMembership.role)} access`;
    renderAllContent();
    bindEvents();

    if (isAdminMode && !authContext.isTestWorkspace) {
      showAdminHome();
      return;
    }

    if (authContext.isTestWorkspace) {
      dom.sidebarAccessRole.textContent = 'Test access';
    }

    const initialView = window.location.hash.replace('#', '');
    if (initialView && document.querySelector(`[data-view="${initialView}"]`)) {
      switchView(initialView);
    } else {
      switchView('overview');
    }
  }

  init();
})();
