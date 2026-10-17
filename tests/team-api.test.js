'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHandler } = require('../api/team');
const actor = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const workspace = '11111111-1111-4111-8111-111111111111';
const invitation = { id: '22222222-2222-4222-8222-222222222222', workspace_id: workspace, email: 'client@platum.test', role: 'client', mail_status: 'pending' };
const operation = '33333333-3333-4333-8333-333333333333';
const env = { PLATUM_SUPABASE_URL: 'https://platum.test', PLATUM_SUPABASE_SERVICE_ROLE_KEY: 'test-server-key', PLATUM_APP_URL: 'https://portal.test' };
function setup({ role = 'owner', platformRole = null, bootstrap = false, mail = 'new', rpcError, memberships, confirmed = true, key = env.PLATUM_SUPABASE_SERVICE_ROLE_KEY } = {}) {
  const calls = [];
  const fetcher = async (url, options) => {
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ url, options, body });
    let status = 200, data = {};
    if (url.endsWith('/auth/v1/user')) data = { id: actor, email_confirmed_at: confirmed ? '2026-10-12T00:00:00Z' : null };
    else if (url.includes('/workspace_members?')) data = memberships || (role ? [{ workspace_id: workspace, role }] : []);
    else if (url.includes('/platform_roles?')) data = platformRole ? [{ role: platformRole }] : [];
    else if (url.includes('/rpc/platum_service_command')) {
      if (rpcError) { status = 400; data = { message: rpcError }; }
      else if (body.action === 'workspace.create') data = { id: workspace, name: body.payload.name };
      else if (body.action === 'invitation.claim_delivery') data = { send: true, invitation };
      else if (body.action === 'invitation.delivery_result') data = { ...invitation, mail_status: body.payload.mail_status };
      else data = invitation;
    } else if (url.includes('/auth/v1/invite?')) {
      if (mail === 'existing') { status = 422; data = { code: 422, error_code: 'email_exists' }; }
      else if (mail === 'failure') { status = 503; data = { message: 'provider-private-diagnostic' }; }
    }
    return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
  };
  const handler = createHandler({ ...env, PLATUM_SUPABASE_SERVICE_ROLE_KEY: key, ...(bootstrap ? { PLATUM_BOOTSTRAP_USER_IDS: actor } : {}) }, fetcher);
  return { calls, async request(body, changes = {}) {
    let result;
    const req = { method: 'POST', headers: { authorization: 'Bearer user-token', origin: 'https://portal.test', 'content-type': 'application/json' }, body, ...changes };
    const headers = {};
    const res = { setHeader(k,v) { headers[k] = v; }, end(value) { result = { status: this.statusCode, body: JSON.parse(value), headers }; } };
    await handler(req,res); return result;
  } };
}
const input = (action, payload = {}, wid = workspace) => ({ action, workspace_id: wid, payload, operation_id: operation });
test('unauthenticated and cross-origin requests cannot reach privileged operations', async () => {
  const s = setup();
  assert.equal((await s.request(input('create_workspace',{name:'Client'}),{headers:{origin:'https://portal.test'}})).status,401);
  assert.equal((await s.request(input('create_workspace',{name:'Client'}),{headers:{authorization:'Bearer user-token',origin:'https://other.test'}})).status,403);
  assert.equal(s.calls.length,0);
});
test('client and unassigned team accounts cannot create workspaces', async () => {
  for(const role of ['client','team',null]) {
    const s=setup({role}); assert.equal((await s.request(input('create_workspace',{name:'Client'}))).status,403);
    assert.equal(s.calls.filter(c=>c.url.includes('/rpc/')).length,0);
  }
});
test('the explicit bootstrap identity can create its first workspace', async () => {
  const s=setup({role:null,bootstrap:true});
  assert.equal((await s.request(input('create_workspace',{name:'Client'},null))).status,201);
  const command=s.calls.find(c=>c.url.includes('/rpc/')).body;
  assert.equal(command.actor_id,actor);assert.equal(command.operation_id,operation);
});
test('a global founder can create a workspace without any workspace membership', async () => {
  const s=setup({role:null,platformRole:'founder'});
  assert.equal((await s.request(input('create_workspace',{name:'Founder workspace'},null))).status,201);
  assert.equal((await s.request(undefined,{method:'GET'})).body.platformRole,'founder');
});
test('global founders can manage an assigned workspace without a local membership row', async () => {
  const s=setup({role:null,platformRole:'founder'});
  assert.equal((await s.request(input('invite',{email:'client@platum.test',role:'client'}))).body.delivery,'sent');
  assert.equal(s.calls.some(c=>c.url.includes('/rpc/platum_service_command')),true);
});
test('a global administrator cannot grant workspace administrator access', async () => {
  const s=setup({role:null,platformRole:'platform_admin'});
  assert.equal((await s.request(input('invite',{email:'client@platum.test',role:'admin'}))).status,403);
  assert.equal(s.calls.some(c=>c.url.includes('/rpc/platum_service_command')),false);
});
test('global role holders cannot be removed as ordinary workspace members', async () => {
  const s=setup({platformRole:'founder'});
  assert.equal((await s.request(input('revoke_member',{id:actor}))).status,403);
  assert.equal(s.calls.some(c=>c.url.includes('/rpc/platum_service_command')),false);
});
test('capabilities expose neither administrative key nor another user identity', async () => {
  const s=setup();const r=await s.request(undefined,{method:'GET'});
  assert.equal(r.body.canCreate,true);assert.equal(r.headers['Cache-Control'],'private, no-store');
  assert.equal(JSON.stringify(r.body).includes(env.PLATUM_SUPABASE_SERVICE_ROLE_KEY),false);
  assert.equal(s.calls[1].options.headers.Authorization,'Bearer user-token');
});
test('an owner cannot manage an unrelated workspace', async () => {
  const s=setup();
  assert.equal((await s.request(input('invite',{email:'client@platum.test',role:'client'},'99999999-9999-4999-8999-999999999999'))).status,403);
  assert.equal(s.calls.some(c=>c.url.includes('/rpc/')),false);
});
test('an administrator cannot grant administrator access', async () => {
  const s=setup({role:'admin'});
  assert.equal((await s.request(input('invite',{email:'client@platum.test',role:'admin'}))).status,403);
});
test('existing users receive an invite-only OTP and the redirect is server-controlled', async () => {
  const s=setup({mail:'existing'});const r=await s.request(input('invite',{email:invitation.email,role:'client',redirect_to:'https://evil.test'}));
  assert.equal(r.body.delivery,'sent');
  const otp=s.calls.find(c=>c.url.includes('/auth/v1/otp?'));
  assert.equal(otp.body.create_user,false);
  assert.equal(new URL(otp.url).searchParams.get('redirect_to'),'https://portal.test/client-space.html');
});
test('mail delivery failure is explicit and does not leak provider diagnostics', async () => {
  const s=setup({mail:'failure'});const r=await s.request(input('invite',{email:invitation.email,role:'client'}));
  assert.equal(r.body.delivery,'failed');assert.equal(JSON.stringify(r).includes('provider-private-diagnostic'),false);
});
test('database last-owner protection survives the HTTP boundary', async () => {
  const s=setup({rpcError:'LAST_OWNER'});
  const r=await s.request(input('revoke_member',{id:actor}));
  assert.equal(r.status,403);assert.match(r.body.error,/last workspace owner/);
});
test('unconfirmed accounts and oversized or malformed actions are rejected', async () => {
  assert.equal((await setup({confirmed:false}).request(input('create_workspace',{name:'Client'}))).status,401);
  assert.equal((await setup().request(input('create_workspace',{name:'x'.repeat(17000)}))).status,400);
  assert.equal((await setup().request({...input('invite'),operation_id:'bad'})).status,400);
});

test('opaque server keys use apikey while identity and membership retain the user JWT', async () => {
  const key = 'sb_secret_synthetic_rotation_fixture';
  const s = setup({ key });
  assert.equal((await s.request(input('create_workspace', { name: 'Rotation fixture' }))).status, 201);
  assert.equal((await s.request(input('invite', { email: invitation.email, role: 'client' }))).body.delivery, 'sent');
  for (const { url, options } of s.calls) {
    assert.equal(options.headers.apikey, key);
    const userScoped = url.endsWith('/auth/v1/user') || url.includes('/workspace_members?');
    assert.equal(options.headers.Authorization, userScoped ? 'Bearer user-token' : undefined);
  }
  const denied = setup({ key, role: 'client' });
  assert.equal((await denied.request(input('create_workspace', { name: 'Denied' }))).status, 403);
  assert.equal(denied.calls.some(c => c.url.includes('/rpc/')), false);
});
