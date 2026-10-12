#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PLATUM_MOCK_PORT || 4177);
const HOST = '127.0.0.1';

const ids = {
  workspaceA: '11111111-1111-4111-8111-111111111111',
  workspaceB: '22222222-2222-4222-8222-222222222222',
  operatorA: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  clientA: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  clientB: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  outsider: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
};

const users = {
  'operator-a': { id: ids.operatorA, email: 'operator-a@platum.test', user_metadata: { full_name: 'Operator A' }, app_metadata: { provider: 'email' } },
  'client-a': { id: ids.clientA, email: 'client-a@platum.test', user_metadata: { full_name: 'Client A' }, app_metadata: { provider: 'email' } },
  'client-b': { id: ids.clientB, email: 'client-b@platum.test', user_metadata: { full_name: 'Client B' }, app_metadata: { provider: 'email' } },
  outsider: { id: ids.outsider, email: 'outsider@platum.test', user_metadata: { full_name: 'Uninvited User' }, app_metadata: { provider: 'email' } },
};

const workspaces = [
  {
    id: ids.workspaceA,
    slug: 'workspace-a',
    name: 'Northstar Project',
    description: 'A shared client-service workspace for the first complete Platum journey.',
    status: 'active',
    current_phase: 'Active collaboration',
    current_focus: 'Resolve the current client request',
    progress: 40,
    latest_update_title: 'The shared workspace is connected',
    latest_update_body: 'Client actions and operator responses now use the same persistent records.',
    latest_update_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: ids.workspaceB,
    slug: 'workspace-b',
    name: 'Second Client Project',
    description: 'Isolation control workspace.',
    status: 'active',
    current_phase: 'Onboarding',
    current_focus: 'Prepare the first brief',
    progress: 10,
    latest_update_title: 'Workspace B is isolated',
    latest_update_body: 'Only its assigned client can access this project.',
    latest_update_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const memberships = [
  { workspace_id: ids.workspaceA, user_id: ids.operatorA, role: 'admin', created_at: new Date().toISOString() },
  { workspace_id: ids.workspaceA, user_id: ids.clientA, role: 'client', created_at: new Date().toISOString() },
  { workspace_id: ids.workspaceB, user_id: ids.clientB, role: 'client', created_at: new Date().toISOString() },
];

const projectContexts = [
  { workspace_id: ids.workspaceA, objective: 'Prove one complete client-to-operator loop.', strategy: null, milestones: [{ title: 'Shared request flow', description: 'Send, answer, and revisit one persisted project request.', status: 'active', timing: 'Current' }], next_milestone: 'First response verified', client_visible: true, updated_at: new Date().toISOString() },
  { workspace_id: ids.workspaceB, objective: 'Remain isolated from workspace A.', strategy: null, milestones: [], next_milestone: 'Complete onboarding', client_visible: true, updated_at: new Date().toISOString() },
];

const tasks = [
  { id: crypto.randomUUID(), workspace_id: ids.workspaceA, title: 'Send one project request', description: 'Ask the team a question that requires a persisted response.', category: 'Collaboration', effort: '5 min', assignee_kind: 'client', assignee_user_id: ids.clientA, status: 'open', priority: 'high', due_at: null, client_response: '', client_visible: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), completed_at: null },
];
const requests = [];
const replies = [];
const activity = [];
const forms = [];
const materials = [];
const deliverables = [];

function send(res, status, payload, contentType = 'application/json; charset=utf-8') {
  const body = contentType.startsWith('application/json') ? JSON.stringify(payload) : payload;
  res.writeHead(status, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
  res.end(body);
}

function tokenFrom(req) {
  return String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
}

function userFrom(req) {
  return users[tokenFrom(req)] || null;
}

function membershipFor(userId, workspaceId) {
  return memberships.find((membership) => membership.user_id === userId && membership.workspace_id === workspaceId) || null;
}

function canRead(userId, workspaceId) {
  return Boolean(membershipFor(userId, workspaceId));
}

function isOperator(userId, workspaceId) {
  return ['owner', 'admin', 'team'].includes(membershipFor(userId, workspaceId)?.role);
}

function filterWorkspaceId(url, rows, field = 'workspace_id') {
  const value = url.searchParams.get(field);
  if (!value) return rows;
  if (value.startsWith('eq.')) return rows.filter((row) => String(row[field]) === value.slice(3));
  if (value.startsWith('in.(')) {
    const allowed = new Set(value.slice(4, -1).split(','));
    return rows.filter((row) => allowed.has(String(row[field])));
  }
  return rows;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function restRows(table, user, url) {
  const allowedWorkspaceIds = new Set(memberships.filter((item) => item.user_id === user.id).map((item) => item.workspace_id));
  const tables = {
    workspace_members: memberships.filter((item) => item.user_id === user.id),
    workspaces: workspaces.filter((item) => allowedWorkspaceIds.has(item.id)),
    project_context: projectContexts.filter((item) => allowedWorkspaceIds.has(item.workspace_id)),
    tasks: tasks.filter((item) => canRead(user.id, item.workspace_id) && (item.client_visible || isOperator(user.id, item.workspace_id))),
    requests: requests.filter((item) => canRead(user.id, item.workspace_id) && (item.client_visible || isOperator(user.id, item.workspace_id))),
    request_replies: replies.filter((item) => canRead(user.id, item.workspace_id) && (item.client_visible || isOperator(user.id, item.workspace_id))),
    forms: forms.filter((item) => canRead(user.id, item.workspace_id)),
    materials: materials.filter((item) => canRead(user.id, item.workspace_id)),
    deliverables: deliverables.filter((item) => canRead(user.id, item.workspace_id)),
    activity: activity.filter((item) => canRead(user.id, item.workspace_id) && (item.client_visible || isOperator(user.id, item.workspace_id))),
  };
  const field = table === 'workspaces' ? 'id' : 'workspace_id';
  return filterWorkspaceId(url, tables[table] || [], field);
}

async function handleRest(req, res, url) {
  const user = userFrom(req);
  if (!user) return send(res, 401, { message: 'Authentication required.' });
  const resource = url.pathname.replace('/rest/v1/', '');

  if (req.method === 'GET') return send(res, 200, restRows(resource, user, url));

  if (req.method === 'POST' && resource === 'requests') {
    const body = await readBody(req);
    if (!canRead(user.id, body.workspace_id) || body.created_by !== user.id) {
      return send(res, 403, { message: 'Workspace request access denied.' });
    }
    const record = { ...body, id: crypto.randomUUID(), responded_at: null, resolved_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    requests.unshift(record);
    activity.unshift({ id: activity.length + 1, workspace_id: record.workspace_id, actor_id: user.id, event_type: 'request_created', entity_type: 'request', entity_id: record.id, summary: `New request: ${record.title}`, client_visible: true, metadata: {}, created_at: record.created_at });
    return send(res, 201, [record]);
  }

  if (req.method === 'POST' && resource === 'rpc/respond_to_request') {
    const body = await readBody(req);
    const request = requests.find((item) => item.id === body.target_request_id);
    if (!request || !isOperator(user.id, request.workspace_id)) return send(res, 403, { message: 'Workspace operator access required.' });
    const reply = { id: crypto.randomUUID(), request_id: request.id, workspace_id: request.workspace_id, author_id: user.id, body: String(body.response_body).trim(), client_visible: true, created_at: new Date().toISOString() };
    replies.push(reply);
    request.status = 'waiting_client';
    request.responded_at = reply.created_at;
    request.updated_at = reply.created_at;
    activity.unshift({ id: activity.length + 1, workspace_id: request.workspace_id, actor_id: user.id, event_type: 'request_replied', entity_type: 'request', entity_id: request.id, summary: 'A response was added to a project request.', client_visible: true, metadata: {}, created_at: reply.created_at });
    return send(res, 200, reply.id);
  }

  if (req.method === 'POST' && resource === 'rpc/set_client_task_status') {
    const body = await readBody(req);
    const task = tasks.find((item) => item.id === body.target_task_id);
    if (!task || !canRead(user.id, task.workspace_id) || task.assignee_kind !== 'client') return send(res, 403, { message: 'Client task access required.' });
    task.status = body.target_status;
    task.completed_at = task.status === 'completed' ? new Date().toISOString() : null;
    task.updated_at = new Date().toISOString();
    return send(res, 200, task.id);
  }

  if (req.method === 'POST' && resource === 'tasks') {
    const body = await readBody(req);
    if (!isOperator(user.id, body.workspace_id)) return send(res, 403, { message: 'Workspace operator access required.' });
    const task = { ...body, id: crypto.randomUUID(), effort: '', due_at: null, assignee_user_id: null, client_response: '', completed_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    tasks.unshift(task);
    return send(res, 201, [task]);
  }

  if (req.method === 'PATCH' && resource.startsWith('tasks?') === false && resource === 'tasks') {
    const body = await readBody(req);
    const id = String(url.searchParams.get('id') || '').replace(/^eq\./, '');
    const task = tasks.find((item) => item.id === id);
    if (!task || !isOperator(user.id, task.workspace_id)) return send(res, 403, { message: 'Task update was not authorized.' });
    task.status = body.status;
    task.updated_at = new Date().toISOString();
    return send(res, 200, [task]);
  }

  return send(res, 404, { message: 'Mock endpoint not found.' });
}

function serveStatic(req, res, url) {
  if (url.pathname === '/client-space.config.js') {
    return send(res, 200, `window.CLIENT_SPACE_CONFIG = Object.freeze({
      supabaseUrl: 'http://${HOST}:${PORT}',
      supabasePublishableKey: 'mock-publishable-key',
      brandName: 'Platum',
      brandMark: 'P',
      enableCollaboration: false,
      testUser: new URLSearchParams(window.location.search).get('test-user') || ''
    });`, 'application/javascript; charset=utf-8');
  }

  const relative = url.pathname === '/' ? 'client-space.html' : decodeURIComponent(url.pathname.slice(1));
  if (relative.split('/').some((part) => part.startsWith('.'))
    || !/\.(?:html|css|js|svg|png|jpe?g|webp)$/i.test(relative)
    || /^(?:api|bot|scripts|supabase|tmp| client-space)\//.test(relative)) {
    return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
  }
  const file = path.resolve(ROOT, relative);
  if (!file.startsWith(`${ROOT}${path.sep}`) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
  const type = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(file)] || 'application/octet-stream';
  send(res, 200, fs.readFileSync(file), `${type}; charset=utf-8`);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  if (url.pathname === '/auth/v1/user') {
    const user = userFrom(req);
    return user ? send(res, 200, user) : send(res, 401, { message: 'Invalid test identity.' });
  }
  if (url.pathname === '/auth/v1/settings') return send(res, 200, { external: { email: true, google: false } });
  if (url.pathname.startsWith('/rest/v1/')) return handleRest(req, res, url).catch((error) => send(res, 500, { message: error.message }));
  return serveStatic(req, res, url);
});

server.listen(PORT, HOST, () => {
  console.log(`Platum mock API listening on http://${HOST}:${PORT}`);
});
