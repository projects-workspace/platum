'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Writable } = require('node:stream');
const { createHandler } = require('../api/files');
const id = '11111111-1111-4111-8111-111111111111';
const workspace = '22222222-2222-4222-8222-222222222222';
const user = '33333333-3333-4333-8333-333333333333';
const env = { PLATUM_SUPABASE_URL: 'https://platum.test', PLATUM_SUPABASE_SERVICE_ROLE_KEY: 'server-key', PLATUM_APP_URL: 'https://portal.test' };
const file = { id, workspace_id: workspace, path: workspace + '/' + id + '/file', name: 'review.txt', status: 'ready', size_bytes: 6, mime_type: 'text/plain' };

class ResponseSink extends Writable {
  constructor() { super(); this.headers = {}; this.chunks = []; this.headersSent = false; }
  setHeader(k, v) { this.headers[k] = v; }
  flushHeaders() { this.headersSent = true; }
  _write(chunk, encoding, next) { this.chunks.push(Buffer.from(chunk)); next(); }
  body() { return Buffer.concat(this.chunks).toString(); }
}
function fixture({ confirmed = true, visible = true, row = file, storageFailure = false, size = 6, key = env.PLATUM_SUPABASE_SERVICE_ROLE_KEY } = {}) {
  const calls = [];
  let readable = visible;
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/auth/v1/user')) return new Response(JSON.stringify({ id: user, email_confirmed_at: confirmed ? '2026-10-13T00:00:00Z' : null }));
    if (url.includes('/rest/v1/workspace_files?')) return new Response(JSON.stringify(readable ? [row] : []));
    assert.ok(url.includes('/storage/v1/object/authenticated/platum-workspace-files/'));
    return storageFailure ? new Response('private upstream diagnostic', { status: 503 }) : new Response(Buffer.alloc(size, 65));
  };
  const handler = createHandler({ ...env, PLATUM_SUPABASE_SERVICE_ROLE_KEY: key }, fetcher);
  return { calls, revoke() { readable = false; }, async request(changes = {}) {
    const req = { method: 'GET', url: '/api/files?id=' + id, headers: { authorization: 'Bearer user-token', origin: env.PLATUM_APP_URL }, ...changes };
    const res = new ResponseSink(); await handler(req, res); return res;
  } };
}
test('file access requires a confirmed bearer account and rejects a foreign origin', async () => {
  const f = fixture();
  assert.equal((await f.request({ headers: {} })).statusCode, 401);
  assert.equal((await f.request({ headers: { authorization: 'Bearer token', origin: 'https://other.test' } })).statusCode, 403);
  assert.equal(f.calls.length, 0);
  const unconfirmed = fixture({ confirmed: false });
  assert.equal((await unconfirmed.request()).statusCode, 401);
  assert.equal(unconfirmed.calls.length, 1);
});
test('invalid file identifiers and unsupported methods fail before upstream access', async () => {
  const f = fixture();
  assert.equal((await f.request({ url: '/api/files?id=not-a-uuid' })).statusCode, 400);
  assert.equal((await f.request({ url: '/api/files?id=' + id + '&id=' + id })).statusCode, 400);
  assert.equal((await f.request({ method: 'POST' })).statusCode, 405);
  assert.equal(f.calls.length, 0);
});
test('RLS metadata denial prevents a privileged Storage read', async () => {
  const f = fixture({ visible: false });
  assert.equal((await f.request()).statusCode, 404);
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[1].options.headers.Authorization, 'Bearer user-token');
  assert.equal(f.calls[1].options.cache, 'no-store');
});
test('each file request rechecks current authorization even after a successful download', async () => {
  const f = fixture();
  const first = await f.request();
  assert.equal(first.statusCode, 200); assert.equal(first.body(), 'AAAAAA');
  assert.equal(first.headers['Cache-Control'], 'private, no-store, max-age=0');
  assert.equal(first.headers['Vercel-CDN-Cache-Control'], 'no-store');
  assert.equal(f.calls[2].options.headers.Authorization, 'Bearer server-key');
  f.revoke();
  assert.equal((await f.request()).statusCode, 404);
  assert.equal(f.calls.filter(c => c.url.includes('/storage/')).length, 1);
});
test('the server streams files larger than the buffered function limit', async () => {
  const size = 6 * 1024 * 1024;
  const f = fixture({ row: { ...file, size_bytes: size }, size });
  const r = await f.request(); assert.equal(r.statusCode, 200);
  assert.equal(Buffer.concat(r.chunks).length, size);
  assert.equal(r.headersSent, true);
});
test('unready and mismatched object paths never reach privileged Storage', async () => {
  for (const row of [{ ...file, status: 'pending' }, { ...file, path: 'another-workspace/file' }]) {
    const f = fixture({ row }); assert.ok((await f.request()).statusCode >= 400);
    assert.equal(f.calls.length, 2);
  }
});
test('file names cannot inject response headers and provider errors remain private', async () => {
  const f = fixture({ row: { ...file, name: 'report\r\nX-Bad: yes".txt' } });
  const r = await f.request(); assert.equal(r.statusCode, 200);
  assert.equal(/[\r\n]/.test(r.headers['Content-Disposition']), false);
  const failed = await fixture({ storageFailure: true }).request();
  assert.equal(failed.statusCode, 502);
  assert.equal(failed.body().includes('private upstream diagnostic'), false);
});

test('opaque keys reach Storage only after current user authorization', async () => {
  const key = 'sb_secret_synthetic_rotation_fixture';
  const f = fixture({ key });
  assert.equal((await f.request()).body(), 'AAAAAA');
  assert.equal(f.calls[0].options.headers.Authorization, 'Bearer user-token');
  assert.equal(f.calls[1].options.headers.Authorization, 'Bearer user-token');
  assert.equal(f.calls[2].options.headers.Authorization, undefined);
  assert.ok(f.calls.every(c => c.options.headers.apikey === key));
  f.revoke();
  assert.equal((await f.request()).statusCode, 404);
  assert.equal(f.calls.filter(c => c.url.includes('/storage/')).length, 1);
});
