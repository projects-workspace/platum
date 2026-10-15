(function () {
  'use strict';

  const STORAGE_KEY = 'platum:artist-strategy-intake:v1';
  const SAVE_DELAY = 450;
  const i18n = window.PLATUM_I18N;
  const ui = source => i18n.mark(source);

  const sections = [
    {
      id: 'operations', code: 'A', title: 'Booking operations', priority: 'essential',
      note: 'Booking lead times, inquiry sources, and premium proof for the project funnel.',
      fields: [
        { id: 'booking_lead_time', type: 'radio', label: 'How long does it usually take from the first inquiry to the performance?', options: ['Up to 1 week', '1–4 weeks', '1–3 months', '3+ months', 'It depends on the event'] },
        { id: 'booking_lead_time_context', type: 'textarea', label: 'Add real context about lead times', placeholder: 'For example: private events move faster, while festivals are planned months ahead…' },
        { id: 'booking_sources', type: 'checkboxes', label: 'Where do performance inquiries currently come from?', options: ['Instagram DM', 'WhatsApp or Telegram', 'Personal referrals', 'Promoters', 'Email or website form', 'Other'] },
        { id: 'booking_sources_details', type: 'textarea', label: 'Which channels produce the strongest inquiries?', placeholder: 'What works, what does not, and where the best opportunities come from…' },
        { id: 'premium_precedents', type: 'textarea', label: 'Do you already have premium-tier performances or close precedents?', hint: 'For example: yacht, villa, private event, festival support, or luxury event.', placeholder: 'Give one or two examples with location, format, and result. Write “none yet” if needed.' },
      ],
    },
    {
      id: 'content-production', code: 'B', title: 'Content production', priority: 'essential',
      note: 'Existing raw material and what can realistically become useful content.',
      fields: [
        { id: 'raw_materials', type: 'checkboxes', label: 'What do you currently record or already have as raw material?', options: ['Behind the scenes from sets', 'Studio sessions', 'Travel or lifestyle', 'Music work in progress', 'Equipment or setup', 'Nothing systematic yet'] },
        { id: 'raw_materials_details', type: 'textarea', label: 'What can realistically be found and prepared?', placeholder: 'Where files are stored, their format, and which material carries the strongest emotion…' },
        { id: 'past_show_footage', type: 'textarea', label: 'Is there footage from previous performances?', hint: 'Even three to five clips from different sets are useful.', placeholder: 'Number of clips, locations, quality, vertical or horizontal format…' },
        { id: 'upcoming_events', type: 'textarea', label: 'Which events or trips are planned for the next six months?', placeholder: 'Date, city, format, and what could be captured before, during, and after…' },
        { id: 'ugc_team', type: 'radio', label: 'Is a videographer or content helper available on location?', options: ['Dedicated videographer', 'Someone with a phone', 'Sometimes', 'I record everything myself', 'Not yet'] },
        { id: 'ugc_team_details', type: 'textarea', label: 'How does the recording process work today?', placeholder: 'Who records, when, with what, and whether a shot list can be used…' },
      ],
    },
    {
      id: 'story-narrative', code: 'C', title: 'Story and narrative', priority: 'important',
      note: 'The personal layer of the brand that is not visible in a press document.',
      fields: [
        { id: 'personal_music_story', type: 'textarea', label: 'What is your personal story in music in three to five sentences?', placeholder: 'In your own words: how you started, why music, and what changed over time…' },
        { id: 'why_music_when_hard', type: 'textarea', label: 'What keeps you in music when the work is difficult?', placeholder: 'Personal and honest, without press-release language.' },
        { id: 'career_anchor_moment', type: 'textarea', label: 'Which career moment made you realize this was your path?', placeholder: 'An event, performance, studio moment, audience reaction, or internal decision…' },
      ],
    },
    {
      id: 'technical', code: 'D', title: 'Technical readiness', priority: 'important',
      note: 'Technical rider, set length, and risk reduction for organizers.',
      fields: [
        { id: 'tech_rider_exists', type: 'radio', label: 'Does a technical rider exist?', options: ['Yes, complete', 'Yes, basic', 'Known but not documented', 'Not yet'] },
        { id: 'tech_rider_details', type: 'textarea', label: 'What must the technical rider include?', placeholder: 'Players, audio interface, monitors, microphone, lighting, or B2B requirements…' },
        { id: 'set_lengths', type: 'textarea', label: 'What is the minimum and comfortable set length?', placeholder: '1.5h, 2h, 4h, B2B, private event, festival format…' },
        { id: 'backup_dj', type: 'radio', label: 'Is a backup performer needed for emergencies?', options: ['A backup is available', 'A backup is needed', 'Not needed', 'Not sure'] },
        { id: 'backup_dj_details', type: 'textarea', label: 'How are operational risks handled today?', placeholder: 'Backup equipment, people, travel buffer, and organizer contacts…' },
      ],
    },
    {
      id: 'partnerships', code: 'E', title: 'Partnerships and collaborations', priority: 'additional',
      note: 'Collaboration, cross-promotion, and a realistic 12–24 month direction.',
      fields: [
        { id: 'artist_network', type: 'textarea', label: 'Which artists do you know or have worked with?', placeholder: 'Three to five names and the type of connection or collaboration.' },
        { id: 'future_partners', type: 'textarea', label: 'Which label, management, or booking partners could fit in the future?', placeholder: 'Now, in 12 months, and what must change before it becomes relevant…' },
        { id: 'dream_benchmark_artists', type: 'textarea', label: 'Which artists represent the level you want to reach?', placeholder: 'One or two specific references for the next 12–24 months.' },
      ],
    },
    {
      id: 'tone-of-voice', code: 'F', title: 'Communication tone', priority: 'additional',
      note: 'Social proof, useful content angles, and clear anti-positioning.',
      fields: [
        { id: 'words_from_friends_fans', type: 'textarea', label: 'Which three to five words do friends or fans use to describe you?', placeholder: 'For example: thoughtful, light, honest, energetic…' },
        { id: 'industry_frustrations', type: 'textarea', label: 'What frustrates you about the music industry?', placeholder: 'Myths, false behavior, or approaches you want to challenge or avoid…' },
        { id: 'anti_brand_associations', type: 'textarea', label: 'What should never be associated with your brand?', placeholder: 'Visual style, tone, behavior, audience, or event types…' },
      ],
    },
  ];

  const dom = {
    form: document.getElementById('intake-form'),
    sectionList: document.getElementById('section-list'),
    sectionNav: document.getElementById('section-nav'),
    progressPercent: document.getElementById('progress-percent'),
    progressFill: document.getElementById('progress-fill'),
    saveIndicator: document.getElementById('save-indicator'),
    toast: document.getElementById('toast'),
  };

  const state = loadState();
  normalizeState();
  let saveTimer = null;
  let toastTimer = null;

  function loadState() {
    const params = new URLSearchParams(window.location.search);

    try {
      if (params.get('reset') === '1') {
        localStorage.removeItem(STORAGE_KEY);
      }

      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return {
        currentSection: saved.currentSection || sections[0].id,
        completedSections: Array.isArray(saved.completedSections) ? saved.completedSections : [],
        editedSections: Array.isArray(saved.editedSections) ? saved.editedSections : [],
        answers: saved.answers || {},
        updatedAt: saved.updatedAt || null,
      };
    } catch (error) {
      return {
        currentSection: sections[0].id,
        completedSections: [],
        editedSections: [],
        answers: {},
        updatedAt: null,
      };
    }
  }

  function normalizeState() {
    state.completedSections = state.completedSections.filter((sectionId) => {
      return sections.some((section) => section.id === sectionId);
    });

    state.editedSections = state.editedSections.filter((sectionId) => {
      return sections.some((section) => section.id === sectionId);
    });

    syncCompletedSectionsFromAnswers();

    const currentIndex = sections.findIndex((section) => section.id === state.currentSection);
    if (currentIndex === -1) {
      state.currentSection = sections[0].id;
      saveLocal();
    }
  }

  function saveLocal(message) {
    state.updatedAt = new Date().toISOString();

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

      if (dom.saveIndicator) {
        i18n.setText(dom.saveIndicator, message ? '{message} {time}' : 'Saved locally {time}', {message:i18n.t(message || ''),time:formatTime(state.updatedAt)});
        dom.saveIndicator.classList.remove('is-error');
      }

      return true;
    } catch (error) {
      if (dom.saveIndicator) {
        i18n.setText(dom.saveIndicator, 'The draft could not be saved in this browser');
        dom.saveIndicator.classList.add('is-error');
      }

      return false;
    }
  }

  function formatTime(value) {
    if (!value) return '';
    return new Intl.DateTimeFormat(i18n.language() === 'uk' ? 'uk-UA' : 'en', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  }

  function render() {
    renderNav();
    renderSections();
    updateProgress();
    i18n.apply(dom.form);

    if (dom.saveIndicator && !dom.saveIndicator.textContent) {
      i18n.setText(dom.saveIndicator, state.updatedAt ? 'Saved locally {time}' : 'The draft has not been saved yet', {time:formatTime(state.updatedAt)});
    }
  }

  function renderNav() {
    dom.sectionNav.innerHTML = sections.map((section) => {
      const complete = isSectionComplete(section);
      const active = state.currentSection === section.id;
      const classes = [
        active ? 'is-active' : '',
        complete ? 'is-complete' : '',
      ].filter(Boolean).join(' ');

      return `
        <li>
          <button class="${classes}" type="button" data-nav-section="${section.id}">
            <span class="nav-index">${complete ? '✓' : section.code}</span>
            <span class="nav-title">${ui(section.title)}</span>
          </button>
        </li>
      `;
    }).join('');
  }

  function renderSections() {
    dom.sectionList.innerHTML = sections.map((section, index) => {
      const complete = isSectionComplete(section);
      const edited = state.editedSections.includes(section.id);
      const active = state.currentSection === section.id;
      const showEditButton = !active && (complete || edited);
      const classes = [
        'section-card',
        active ? 'is-active' : '',
        complete ? 'is-complete' : '',
        edited ? 'is-edited' : '',
      ].filter(Boolean).join(' ');

      return `
        <article class="${classes}" data-section-card="${section.id}">
          <div class="section-head is-clickable" data-open-section="${section.id}" role="button" tabindex="0">
            <div>
              <p class="section-kicker">${i18n.mark('Section {code} / {priority}', 'span', {code:section.code, priority:i18n.t(section.priority)})}</p>
              <h2 class="section-title">${ui(section.title)}</h2>
              <p class="section-note">${ui(section.note)}</p>
            </div>
            <div class="section-head-actions">
              <span class="section-state">${ui(getSectionStateLabel(section))}</span>
              ${showEditButton ? `<button class="section-edit-btn" type="button" data-nav-section="${section.id}">${ui('Edit')}</button>` : ''}
            </div>
          </div>
          <div class="section-body">
            <div class="field-grid">
              ${section.fields.map(renderField).join('')}
            </div>
            <div class="actions">
              <button class="action-btn primary" type="button" data-save-section="${section.id}">${ui('Save section locally')}</button>
            </div>
            <div class="completion-panel ${isEverythingComplete() && index === sections.length - 1 ? 'is-visible' : ''}">
              <strong><span data-i18n-key="The local draft is complete.">The local draft is complete.</span></strong>
              ${ui('Answers are stored only in this browser and were not automatically sent to the team.')}
            </div>
          </div>
        </article>
      `;
    }).join('');
  }

  function renderField(field) {
    const answer = state.answers[field.id];
    const hint = field.hint ? `<p class="field-hint">${ui(field.hint)}</p>` : '';

    if (field.type === 'textarea') {
      return `
        <label class="field" for="${field.id}">
          <span class="field-label">${ui(field.label)}</span>
          ${hint}
          <textarea id="${field.id}" name="${field.id}" data-i18n-placeholder="${escapeHtml(field.placeholder || '')}" placeholder="${escapeHtml(i18n.t(field.placeholder || ''))}">${escapeHtml(answer || '')}</textarea>
        </label>
      `;
    }

    if (field.type === 'radio') {
      return `
        <fieldset class="field">
          <legend class="field-label">${ui(field.label)}</legend>
          ${hint}
          <div class="choice-grid">
            ${field.options.map((option) => `
              <label class="choice">
                <input type="checkbox" name="${field.id}" data-single-choice="${field.id}" value="${escapeHtml(option)}" ${answer === option ? 'checked' : ''}>
                <span>${ui(option)}</span>
              </label>
            `).join('')}
          </div>
        </fieldset>
      `;
    }

    if (field.type === 'checkboxes') {
      const values = Array.isArray(answer) ? answer : [];

      return `
        <fieldset class="field">
          <legend class="field-label">${ui(field.label)}</legend>
          ${hint}
          <div class="choice-grid">
            ${field.options.map((option) => `
              <label class="choice">
                <input type="checkbox" name="${field.id}" value="${escapeHtml(option)}" ${values.includes(option) ? 'checked' : ''}>
                <span>${ui(option)}</span>
              </label>
            `).join('')}
          </div>
        </fieldset>
      `;
    }

    return '';
  }

  function getSectionStateLabel(section) {
    if (isSectionComplete(section)) return 'saved';
    if (state.editedSections.includes(section.id)) return 'edited';
    if (state.currentSection === section.id) return 'active';
    return 'open';
  }

  function hasAnswer(value) {
    if (Array.isArray(value)) {
      return value.length > 0;
    }

    return String(value || '').trim() !== '';
  }

  function isSectionComplete(section) {
    return section.fields.every((field) => hasAnswer(state.answers[field.id]));
  }

  function syncCompletedSectionsFromAnswers() {
    state.completedSections = sections
      .filter(isSectionComplete)
      .map((section) => section.id);

    state.editedSections = state.editedSections.filter((sectionId) => {
      return !state.completedSections.includes(sectionId);
    });
  }

  function collectAnswers() {
    sections.forEach((section) => {
      section.fields.forEach((field) => {
        if (field.type === 'checkboxes') {
          state.answers[field.id] = Array.from(dom.form.querySelectorAll(`[name="${field.id}"]:checked`)).map((input) => input.value);
          return;
        }

        if (field.type === 'radio') {
          const checked = dom.form.querySelector(`[name="${field.id}"]:checked`);
          state.answers[field.id] = checked ? checked.value : '';
          return;
        }

        const input = dom.form.elements[field.id];
        state.answers[field.id] = input ? input.value.trim() : '';
      });
    });

    syncCompletedSectionsFromAnswers();
  }

  function setCurrentSection(sectionId) {
    state.currentSection = sectionId;
    saveLocal();
    render();

    requestAnimationFrame(() => {
      const card = document.querySelector(`[data-section-card="${sectionId}"]`);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }

  function saveSection(sectionId) {
    const index = sections.findIndex((section) => section.id === sectionId);
    const section = sections[index];
    if (!section) return;

    clearTimeout(saveTimer);

    const buttons = Array.from(document.querySelectorAll(`[data-save-section="${sectionId}"]`));
    buttons.forEach((button) => {
      button.disabled = true;
      i18n.setText(button, 'Saving…');
    });

    collectAnswers();

    state.editedSections = state.editedSections.filter((editedSectionId) => editedSectionId !== sectionId);

    state.currentSection = sectionId;

    const saved = saveLocal('Draft saved');
    render();

    if (!saved) {
      showToast('The section could not be saved in this browser. Copy important answers before closing the page.');
      return;
    }

    if (isEverythingComplete()) {
      showToast('The local draft is complete and saved on this device.');
    } else {
      showToast('Section saved only on this device.');
    }
  }

  function updateProgress() {
    const percent = getProgressPercent();
    dom.progressPercent.textContent = `${percent}%`;
    dom.progressFill.style.width = `${percent}%`;
  }

  function getProgressPercent() {
    return Math.round((state.completedSections.length / sections.length) * 100);
  }

  function isEverythingComplete() {
    return state.completedSections.length === sections.length;
  }

  function showToast(message) {
    i18n.setText(dom.toast, message);
    dom.toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      dom.toast.classList.remove('is-visible');
    }, 3200);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function markSectionEdited(sectionId) {
    if (!sectionId || !state.completedSections.includes(sectionId) || state.editedSections.includes(sectionId)) {
      return;
    }

    state.editedSections.push(sectionId);

    const card = document.querySelector(`[data-section-card="${sectionId}"]`);
    const badge = card ? card.querySelector('.section-state') : null;
    if (card) card.classList.add('is-edited');
    if (badge) i18n.setText(badge, 'edited');
  }

  dom.form.addEventListener('input', (event) => {
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      const card = event.target.closest('[data-section-card]');
      if (card) {
        markSectionEdited(card.dataset.sectionCard);
      }

      collectAnswers();
      renderNav();
      updateProgress();
      saveLocal('Draft saved');
    }, SAVE_DELAY);
  });

  dom.form.addEventListener('change', (event) => {
    if (event.target.matches('input[data-single-choice]') && event.target.checked) {
      dom.form
        .querySelectorAll(`input[data-single-choice="${event.target.dataset.singleChoice}"]`)
        .forEach((input) => {
          if (input !== event.target) {
            input.checked = false;
          }
        });
    }

    if (!event.target.matches('input[type="radio"], input[type="checkbox"]')) {
      return;
    }

    const card = event.target.closest('[data-section-card]');
    if (card) {
      markSectionEdited(card.dataset.sectionCard);
    }

    collectAnswers();
    renderNav();
    updateProgress();
    saveLocal('Draft saved');
  });

  document.addEventListener('click', (event) => {
    const openedSection = event.target.closest('[data-open-section]');
    if (openedSection && !event.target.closest('button, input, textarea, label, a')) {
      setCurrentSection(openedSection.dataset.openSection);
      return;
    }

    const nav = event.target.closest('[data-nav-section]');
    if (nav) {
      setCurrentSection(nav.dataset.navSection);
      return;
    }

    const saveButton = event.target.closest('[data-save-section]');
    if (saveButton) {
      saveSection(saveButton.dataset.saveSection);
      return;
    }

  });

  document.addEventListener('keydown', (event) => {
    const openedSection = event.target.closest('[data-open-section]');
    if (!openedSection || (event.key !== 'Enter' && event.key !== ' ')) {
      return;
    }

    event.preventDefault();
    setCurrentSection(openedSection.dataset.openSection);
  });

  window.addEventListener('beforeunload', () => {
    collectAnswers();
    saveLocal();
  });

  i18n.subscribe(() => {
    i18n.apply(dom.form);
    if (dom.saveIndicator && !dom.saveIndicator.classList.contains('is-error')) i18n.setText(dom.saveIndicator, state.updatedAt ? 'Saved locally {time}' : 'The draft has not been saved yet', {time:formatTime(state.updatedAt)});
  });
  render();
}());
