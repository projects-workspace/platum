'use strict';

const { randomUUID } = require('node:crypto');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIONS = new Set(['create_workspace', 'invite', 'resend_invite', 'revoke_invite', 'revoke_member']);
const safeErrors = {
  FORBIDDEN: 'You do not have permission to manage this workspace.',
  FORBIDDEN_ROLE: 'Only a workspace owner can manage administrators.',
  LAST_OWNER: 'The last workspace owner cannot be removed.',
  INVITATION_RATE_LIMIT: 'Please wait before sending another invitation.',
  INVITATION_UNAVAILABLE: 'This invitation is no longer available.',
  INVITATION_EXISTS_WITH_DIFFERENT_ROLE: 'Revoke the pending invitation before changing its role.',
  IDEMPOTENCY_CONFLICT: 'This action has already been used for different information.',
  MEMBER_NOT_FOUND: 'This person no longer belongs to the workspace.',
  INVALID_EMAIL: 'Enter a valid email address.',
};

function failure(status, message) { return Object.assign(new Error(message), { status }); }

function createHandler(env = process.env, fetcher = globalThis.fetch) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, body) => { res.statusCode = status; res.end(JSON.stringify(body)); };
    try {
      if (!['GET', 'POST'].includes(req.method)) {
        res.setHeader('Allow', 'GET, POST');
        throw failure(405, 'Method not allowed.');
      }
      const base = String(env.PLATUM_SUPABASE_URL || '').replace(/\/$/, '');
      const secret = env.PLATUM_SUPABASE_SERVICE_ROLE_KEY;
      let app;
      try { app = new URL(env.PLATUM_APP_URL); } catch { throw failure(503, 'Workspace management is not configured.'); }
      if (!base || !secret || !/^https:\/\//.test(base) && !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)) {
        throw failure(503, 'Workspace management is not configured.');
      }
      if (app.protocol !== 'https:' && !['127.0.0.1', 'localhost'].includes(app.hostname)) throw failure(503, 'Workspace management is not configured.');
      if ((req.headers.origin && req.headers.origin !== app.origin) || (req.method === 'POST' && req.headers.origin !== app.origin)) {
        throw failure(403, 'This request must come from your Platum workspace.');
      }
      const authorization = String(req.headers.authorization || '');
      if (!/^Bearer [^\s]+$/.test(authorization)) throw failure(401, 'Sign in again to continue.');
      async function call(path, { body, user = false, raw = false } = {}) {
        let response;
        try {
          response = await fetcher(base + path, {
            method: body === undefined ? 'GET' : 'POST',
            headers: { apikey: secret, Authorization: user ? authorization : 'Bearer ' + secret, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: AbortSignal.timeout(15000),
          });
        } catch { throw failure(502, 'The workspace service could not be reached. Your input has been kept; try again.'); }
        const data = await response.json().catch(() => ({}));
        if (raw) return { ok: response.ok, status: response.status, data };
        if (!response.ok) {
          const code = Object.keys(safeErrors).find(key => String(data.message || '').includes(key));
          throw failure(response.status === 401 ? 401 : code === 'INVITATION_RATE_LIMIT' ? 429 : code ? 403 : 502,
            code ? safeErrors[code] : response.status === 401 ? 'Sign in again to continue.' : 'The workspace service rejected this action. Refresh and try again.');
        }
        return data;
      }
      const user = await call('/auth/v1/user', { user: true });
      if (!UUID.test(user.id || '') || !user.email_confirmed_at) throw failure(401, 'Use a confirmed account to continue.');
      const memberships = await call('/rest/v1/workspace_members?select=workspace_id,role&user_id=eq.' + user.id, { user: true });
      if (!Array.isArray(memberships)) throw failure(502, 'Workspace access could not be verified.');
      const bootstrap = String(env.PLATUM_BOOTSTRAP_USER_IDS || '').split(',').map(value => value.trim()).filter(value => UUID.test(value));
      const canCreate = bootstrap.includes(user.id) || memberships.some(m => ['owner', 'admin'].includes(m.role));
      if (req.method === 'GET') return send(200, { canCreate, supabaseUrl: base });
      if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw failure(415, 'Send a JSON request.');
      let input = req.body;
      if (input === undefined) {
        const chunks = []; let size = 0;
        for await (const chunk of req) {
          size += Buffer.byteLength(chunk);
          if (size > 16384) throw failure(413, 'This request is too large.');
          chunks.push(Buffer.from(chunk));
        }
        input = Buffer.concat(chunks).toString('utf8');
      }
      if (typeof input === 'string' || Buffer.isBuffer(input)) {
        try { input = JSON.parse(input.toString()); } catch { throw failure(400, 'Invalid request.'); }
      }
      if (!input || typeof input !== 'object' || Array.isArray(input) || Buffer.byteLength(JSON.stringify(input)) > 16384) throw failure(400, 'Invalid request.');
      const { action, workspace_id: workspace, operation_id: operation } = input;
      const payload = input.payload || {};
      if (!ACTIONS.has(action) || !UUID.test(operation || '') || typeof payload !== 'object' || Array.isArray(payload)) throw failure(400, 'Invalid action.');
      if (action === 'create_workspace') {
        if (!canCreate) throw failure(403, 'Ask a workspace owner to create your workspace.');
        if (typeof payload.name !== 'string' || !payload.name.trim() || payload.name.length > 120) throw failure(400, 'Enter a workspace name of up to 120 characters.');
      } else {
        const membership = memberships.find(m => m.workspace_id === workspace);
        if (!UUID.test(workspace || '') || !membership || !['owner', 'admin'].includes(membership.role)) throw failure(403, safeErrors.FORBIDDEN);
        if (action === 'invite') {
          if (typeof payload.email !== 'string' || payload.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email.trim())) throw failure(400, safeErrors.INVALID_EMAIL);
          if (!['client', 'team', 'admin'].includes(payload.role) || payload.role === 'admin' && membership.role !== 'owner') throw failure(403, safeErrors.FORBIDDEN_ROLE);
        } else if (!UUID.test(payload.id || '')) throw failure(400, 'Select a valid person or invitation.');
      }
      const command = (name, data, id = randomUUID()) => call('/rest/v1/rpc/platum_service_command', {
        body: { action: name, actor_id: user.id, workspace_id: workspace || null, payload: data, operation_id: id },
      });
      if (action === 'create_workspace') return send(201, { workspace: await command('workspace.create', { name: payload.name.trim() }, operation) });
      if (action === 'revoke_invite') return send(200, await command('invitation.revoke', { id: payload.id }, operation));
      if (action === 'revoke_member') return send(200, await command('member.revoke', { id: payload.id }, operation));
      let invitation = await command(action === 'invite' ? 'invitation.create' : 'invitation.resend',
        action === 'invite' ? { email: payload.email.trim().toLowerCase(), role: payload.role } : { id: payload.id }, operation);
      const claimed = await command('invitation.claim_delivery', { id: invitation.id });
      if (!claimed.send) {
        invitation = claimed.invitation || invitation;
        return send(200, { invitation, delivery: invitation.mail_status });
      }
      let delivery = 'uncertain';
      try {
        const redirect = encodeURIComponent(new URL('/client-space.html', app).href);
        let mail = await call('/auth/v1/invite?redirect_to=' + redirect, { body: { email: invitation.email }, raw: true });
        if (!mail.ok && [mail.data.code, mail.data.error_code].some(code => ['email_exists', 'user_already_exists'].includes(code))) {
          mail = await call('/auth/v1/otp?redirect_to=' + redirect, { body: { email: invitation.email, create_user: false }, raw: true });
        }
        delivery = mail.ok ? 'sent' : 'failed';
      } catch { delivery = 'uncertain'; }
      try { invitation = await command('invitation.delivery_result', { id: invitation.id, mail_status: delivery }); }
      catch { delivery = 'uncertain'; }
      return send(200, { invitation, delivery });
    } catch (error) {
      return send(error.status || 500, { error: error.status ? error.message : 'Workspace management is temporarily unavailable. Try again.' });
    }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
