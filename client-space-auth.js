(() => {
  'use strict';

  const config = window.CLIENT_SPACE_CONFIG || {};
  const SUPABASE_URL = config.supabaseUrl || '';
  const SUPABASE_PUBLISHABLE_KEY = config.supabasePublishableKey || '';
  const SESSION_KEY = 'client-cabinet:auth:v1';
  const LEGACY_SESSION_KEY = '34forfree7:cabinet-auth:v1';
  const TEST_WORKSPACE_SESSION_KEY = 'client-cabinet:test-workspace:v1';
  const hasAuthConfig = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
  const publicTestWorkspaceEnabled = config.enablePublicTestWorkspace === true;
  let testWorkspaceActive = false;
  let authReadyResolved = false;
  let resolveAuthReady;

  window.CLIENT_SPACE_AUTH_READY = new Promise((resolve) => {
    resolveAuthReady = resolve;
  });

  const dom = {
    body: document.body,
    gate: document.getElementById('auth-gate'),
    status: document.getElementById('auth-status'),
    telegramLogin: document.getElementById('telegram-login'),
    googleLogin: document.getElementById('google-login'),
    emailForm: document.getElementById('email-login-form'),
    emailInput: document.getElementById('email-login'),
    previewLogin: document.getElementById('preview-login'),
    supportLink: document.getElementById('support-link'),
    accountButton: document.getElementById('account-button'),
    accountMenu: document.getElementById('account-menu'),
    accountName: document.getElementById('account-name'),
    accountProvider: document.getElementById('account-provider'),
    logoutButton: document.getElementById('logout-button'),
  };

  function applyConfiguration() {
    const brandName = String(config.brandName || 'Platum');
    const brandMark = String(config.brandMark || 'P').slice(0, 3);
    document.querySelectorAll('[data-cabinet-brand-name]').forEach((element) => {
      element.textContent = brandName;
    });
    document.querySelectorAll('[data-cabinet-brand-mark]').forEach((element) => {
      element.textContent = brandMark;
    });

    if (config.telegramLoginUrl) {
      dom.telegramLogin.href = config.telegramLoginUrl;
      dom.telegramLogin.hidden = false;
    }
    if (config.supportUrl) {
      dom.supportLink.href = config.supportUrl;
      dom.supportLink.hidden = false;
    }
    if (publicTestWorkspaceEnabled) {
      dom.previewLogin.hidden = false;
    }
  }

  const i18n = window.PLATUM_I18N;
  function translate(message) { return i18n.t(message); }

  function setStatus(message, isError = false) {
    i18n.setText(dom.status, message);
    dom.status.classList.toggle('is-error', isError);
  }

  function publishAuthContext(user, clientId, isAdmin, session = null) {
    const context = {
      user,
      clientId,
      isAdmin,
      accessToken: session?.accessToken || null,
      isLocalPreview: !session,
      isTestWorkspace: !session && user?.app_metadata?.provider === 'test',
    };
    window.CLIENT_SPACE_AUTH_CONTEXT = context;
    if (!authReadyResolved) {
      authReadyResolved = true;
      resolveAuthReady(context);
    }
  }

  function readSession() {
    try {
      const stored = localStorage.getItem(SESSION_KEY) || localStorage.getItem(LEGACY_SESSION_KEY);
      return JSON.parse(stored);
    } catch (error) {
      return null;
    }
  }

  let sessionRefreshFlight = null;
  window.CLIENT_SPACE_ACCESS_TOKEN = async () => {
    const context = window.CLIENT_SPACE_AUTH_CONTEXT;
    if (!context || context.isLocalPreview || testWorkspaceActive) return null;
    if (['localhost', '127.0.0.1'].includes(window.location.hostname) && config.testUser) return context.accessToken;
    let session = readSession();
    if (!session?.accessToken) return null;
    if (session.expiresAt <= Date.now() + 60000) {
      if (!sessionRefreshFlight) sessionRefreshFlight = refreshSession(session).finally(() => { sessionRefreshFlight = null; });
      session = await sessionRefreshFlight;
      if (!session) { clearSession(); showLogin('Your session expired. Sign in again to continue.'); return null; }
    }
    context.accessToken = session.accessToken;
    return session.accessToken;
  };
  window.addEventListener('storage', (event) => {
    if ([SESSION_KEY, LEGACY_SESSION_KEY].includes(event.key) && event.oldValue !== event.newValue) {
      // A token refresh for the same account must not discard another tab's draft.
      // Decoding here only detects account changes; it never grants authorization.
      try {
        const incoming = JSON.parse(event.newValue || 'null');
        const part = incoming?.accessToken?.split('.')[1];
        const claims = part ? JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) : null;
        if (claims?.sub === window.CLIENT_SPACE_AUTH_CONTEXT?.user?.id) return;
      } catch { /* A missing or unrecognised session fails closed below. */ }
      document.body.classList.remove('is-authenticated');
      reloadWithoutWorkspaceHash();
    }
  });

  function saveSession(payload) {
    const expiresIn = Number(payload.expires_in || 3600);
    const session = {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
      expiresAt: Date.now() + (expiresIn * 1000),
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    localStorage.removeItem(LEGACY_SESSION_KEY);
    return session;
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(LEGACY_SESSION_KEY);
  }

  function publicTestWorkspaceRequested() {
    try {
      return publicTestWorkspaceEnabled && sessionStorage.getItem(TEST_WORKSPACE_SESSION_KEY) === 'active';
    } catch (error) {
      return false;
    }
  }

  function setPublicTestWorkspace(active) {
    try {
      if (active) sessionStorage.setItem(TEST_WORKSPACE_SESSION_KEY, 'active');
      else sessionStorage.removeItem(TEST_WORKSPACE_SESSION_KEY);
    } catch (error) {
      // Test access still fails closed when browser storage is unavailable.
    }
  }

  function reloadWithoutWorkspaceHash() {
    window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}`);
    window.location.reload();
  }

  function clearSensitiveWorkspaceCache() {
    const sensitiveKeyPatterns = [
      /^client-cabinet:state:v1:/,
      /^client-cabinet:agency-os:/,
      /^cabinet:agency-os:/,
      /^client-cabinet:.*:(?:tasks|questions):v1$/,
      /^34forfree7:client-space:.*:(?:tasks|questions):v1$/,
    ];

    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key && sensitiveKeyPatterns.some((pattern) => pattern.test(key))) {
        localStorage.removeItem(key);
      }
    }
  }

  function authHeaders(extra = {}) {
    return {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      ...extra,
    };
  }

  function consumeAuthRedirect() {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const error = params.get('error_description') || params.get('error');

    if (error) {
      window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}`);
      setStatus(decodeURIComponent(error.replace(/\+/g, ' ')), true);
      return null;
    }

    if (!accessToken || !refreshToken) return null;

    const session = saveSession({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: params.get('expires_in'),
    });
    window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}`);
    return session;
  }

  async function refreshSession(session) {
    if (!session?.refreshToken || testWorkspaceActive) return null;

    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ refresh_token: session.refreshToken }),
    });

    if (!response.ok) return null;
    const payload = await response.json();
    return testWorkspaceActive ? null : saveSession(payload);
  }

  async function getUser(session) {
    if (!session?.accessToken || testWorkspaceActive) return null;

    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: authHeaders({ Authorization: `Bearer ${session.accessToken}` }),
    });

    if (!response.ok) return null;
    const user = await response.json();
    return testWorkspaceActive ? null : user;
  }

  async function getAuthSettings() {
    if (!hasAuthConfig) return null;
    const response = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
      headers: authHeaders(),
    });
    if (!response.ok) throw new Error('Could not read authentication settings.');
    return response.json();
  }

  function configureProviders(settings) {
    const external = settings?.external || {};
    dom.googleLogin.hidden = !external.google;
    // Invite-only projects report public email signup as disabled even though
    // existing and invited users can still authenticate with an email OTP.
    dom.emailForm.hidden = false;
  }

  function displayName(user) {
    const metadata = user.user_metadata || {};
    return metadata.full_name || metadata.name || metadata.username || user.email?.split('@')[0] || 'Client';
  }

  function providerName(user) {
    if (user.app_metadata?.auth_source === 'telegram') return translate('Telegram access');
    const provider = user.app_metadata?.provider;
    return provider ? `${provider[0].toUpperCase()}${provider.slice(1)} ${translate('access')}` : translate('Secure access');
  }

  function isAdminUser(user) {
    return user.app_metadata?.role === 'admin';
  }

  function showCabinet(user, session = null, previewAdmin = false) {
    const name = displayName(user);
    const isLocalPreview = !session;
    const isAdmin = isLocalPreview && (previewAdmin || isAdminUser(user));
    dom.body.classList.remove('auth-loading');
    dom.body.classList.add('is-authenticated');
    dom.gate.setAttribute('aria-hidden', 'true');
    dom.accountName.textContent = name;
    dom.accountProvider.textContent = providerName(user);
    i18n.subscribe(() => { dom.accountProvider.textContent = providerName(user); });
    dom.accountButton.textContent = name.trim().charAt(0).toUpperCase() || 'C';
    dom.accountButton.title = name;
    publishAuthContext(user, null, isAdmin, session);
  }

  function showLogin(message = '') {
    dom.body.classList.remove('auth-loading', 'is-authenticated');
    dom.gate.removeAttribute('aria-hidden');
    setStatus(message || (publicTestWorkspaceEnabled
      ? 'Sign in securely, or enter the isolated test workspace.'
      : 'Choose a secure sign-in method.'));
  }

  async function initializeAuth() {
    const localPreviewClient = new URLSearchParams(window.location.search).get('preview');
    const redirectParams = new URLSearchParams(window.location.hash.slice(1));
    const hasAuthRedirect = ['access_token', 'refresh_token', 'error', 'error_description']
      .some((key) => redirectParams.has(key));
    const localAdminPreview = localPreviewClient === 'admin';
    const localTestUser = String(config.testUser || '').trim();
    const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    const isLocalPreview = ['localhost', '127.0.0.1'].includes(window.location.hostname)
      && (localPreviewClient === 'starter' || localAdminPreview);

    if (hasAuthRedirect) setPublicTestWorkspace(false);
    if (redirectParams.has('error') || redirectParams.has('error_description')) {
      clearSession();
      clearSensitiveWorkspaceCache();
      window.history.replaceState({}, '', window.location.pathname + window.location.search);
      dom.emailForm.hidden = !hasAuthConfig;
      showLogin('This sign-in link is invalid or has expired. Request a new link below, or contact your team.');
      return;
    }

    if (publicTestWorkspaceRequested()) {
      testWorkspaceActive = true;
      clearSession();
      showCabinet({
        id: 'platum-test-user',
        email: '',
        email_confirmed_at: null,
        user_metadata: { full_name: 'Test User' },
        app_metadata: { provider: 'test', client_id: 'starter', role: 'admin' },
      }, null, true);
      return;
    }

    if (isLocalHost && localTestUser && hasAuthConfig) {
      const testSession = {
        accessToken: localTestUser,
        refreshToken: '',
        expiresAt: Date.now() + 3600000,
      };
      const testUser = await getUser(testSession);
      if (!testUser) {
        showLogin('The local test identity could not be authenticated.');
        return;
      }
      showCabinet(testUser, testSession);
      return;
    }

    if (isLocalPreview) {
      showCabinet({
        id: `local-${localPreviewClient}`,
        email: '',
        email_confirmed_at: null,
        user_metadata: { full_name: localAdminPreview ? 'Platform Admin' : 'New Client' },
        app_metadata: {
          provider: 'prototype',
          client_id: localAdminPreview ? 'starter' : localPreviewClient,
          role: localAdminPreview ? 'admin' : 'client',
        },
      }, null, localAdminPreview);
      return;
    }

    if (!hasAuthConfig) {
      dom.previewLogin.hidden = false;
      showLogin('Secure login is being activated. You can continue to the prototype for now.');
      return;
    }

    try {
      configureProviders(await getAuthSettings());
    } catch (error) {
      console.warn('Cabinet provider settings could not be checked.', error);
      dom.emailForm.hidden = false;
    }

    if (testWorkspaceActive) return;

    let session = consumeAuthRedirect() || readSession();

    try {
      if (session && session.expiresAt <= Date.now() + 30000) {
        session = await refreshSession(session);
      }

      let user = await getUser(session);
      if (!user && session?.refreshToken) {
        session = await refreshSession(session);
        user = await getUser(session);
      }

      if (testWorkspaceActive) {
        clearSession();
        return;
      }

      if (user) {
        showCabinet(user, session);
        return;
      }
    } catch (error) {
      console.warn('Cabinet session check failed.', error);
    }

    if (testWorkspaceActive) return;

    clearSession();
    showLogin();
  }

  dom.googleLogin.addEventListener('click', () => {
    if (!hasAuthConfig) {
      setStatus('Google login needs the final secure project setting.', true);
      return;
    }

    const redirectTo = `${window.location.origin}${window.location.pathname}${window.location.search}`;
    const authUrl = new URL(`${SUPABASE_URL}/auth/v1/authorize`);
    authUrl.searchParams.set('provider', 'google');
    authUrl.searchParams.set('redirect_to', redirectTo);
    setStatus('Opening Google…');
    window.location.assign(authUrl.toString());
  });

  dom.emailForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!hasAuthConfig) {
      setStatus('Email login needs the final secure project setting.', true);
      return;
    }

    const email = String(new FormData(dom.emailForm).get('email') || '').trim().toLowerCase();
    if (!email) return;
    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    setStatus('Sending your secure sign-in link…');
    dom.emailInput.disabled = true;

    try {
      const response = await fetch(`${SUPABASE_URL}/auth/v1/otp?redirect_to=${encodeURIComponent(redirectTo)}`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ email, create_user: false }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.msg || payload.message || 'The sign-in link could not be sent.');
      }
      dom.emailForm.reset();
      setStatus('Check your email for a secure sign-in link.');
    } catch (error) {
      setStatus(error.message || 'The sign-in link could not be sent.', true);
    } finally {
      dom.emailInput.disabled = false;
    }
  });

  dom.telegramLogin.addEventListener('click', (event) => {
    if (hasAuthConfig) return;
    event.preventDefault();
    setStatus('Telegram login needs the final secure project setting.', true);
  });

  dom.previewLogin.addEventListener('click', () => {
    testWorkspaceActive = true;
    setPublicTestWorkspace(true);
    clearSession();
    clearSensitiveWorkspaceCache();
    reloadWithoutWorkspaceHash();
  });

  dom.accountButton.addEventListener('click', () => {
    const isOpen = !dom.accountMenu.hidden;
    dom.accountMenu.hidden = isOpen;
    dom.accountButton.setAttribute('aria-expanded', String(!isOpen));
  });

  dom.logoutButton.addEventListener('click', () => {
    const session = readSession();
    setPublicTestWorkspace(false);
    clearSession();
    clearSensitiveWorkspaceCache();
    dom.accountMenu.hidden = true;
    dom.accountButton.setAttribute('aria-expanded', 'false');

    if (session?.accessToken) {
      fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: 'POST',
        headers: authHeaders({ Authorization: `Bearer ${session.accessToken}` }),
        keepalive: true,
      }).catch(() => {});
    }

    reloadWithoutWorkspaceHash();
  });

  document.addEventListener('click', (event) => {
    if (!dom.accountMenu.hidden && !event.target.closest('#account-menu') && !event.target.closest('#account-button')) {
      dom.accountMenu.hidden = true;
      dom.accountButton.setAttribute('aria-expanded', 'false');
    }
  });

  window.CLIENT_SPACE_DENY_ACCESS = (message = 'Your account does not have access to a Platum workspace.') => {
    clearSensitiveWorkspaceCache();
    showLogin(message);
    dom.status.classList.add('is-error');
  };

  applyConfiguration();
  initializeAuth();
})();
