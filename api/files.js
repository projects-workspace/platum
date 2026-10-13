'use strict';

const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const failure = (status, message) => Object.assign(new Error(message), { status });

function createHandler(env = process.env, fetcher = globalThis.fetch) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('CDN-Cache-Control', 'no-store');
    res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
    res.setHeader('Vary', 'Authorization');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); throw failure(405, 'Method not allowed.'); }
      const base = String(env.PLATUM_SUPABASE_URL || '').replace(/\/$/, '');
      const key = env.PLATUM_SUPABASE_SERVICE_ROLE_KEY;
      let origin;
      try { origin = new URL(env.PLATUM_APP_URL); } catch { throw failure(503, 'File delivery is not configured.'); }
      if (!key || (!/^https:\/\//.test(base) && !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)) ||
          (origin.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(origin.hostname))) throw failure(503, 'File delivery is not configured.');
      if (req.headers.origin && req.headers.origin !== origin.origin) throw failure(403, 'Open this file from your Platum workspace.');
      const authorization = String(req.headers.authorization || '');
      if (!/^Bearer [^\s]+$/.test(authorization)) throw failure(401, 'Sign in again to continue.');
      const query = new URL(req.url, origin).searchParams;
      const id = query.get('id');
      if (query.getAll('id').length !== 1 || !UUID.test(id || '')) throw failure(400, 'Select a valid file.');
      async function read(path) {
        const r = await fetcher(base + path, { cache: 'no-store', headers: { apikey: key, Authorization: authorization }, signal: AbortSignal.timeout(15000) });
        if (!r.ok) throw failure(r.status === 401 ? 401 : 502, r.status === 401 ? 'Sign in again to continue.' : 'File access could not be checked. Try again.');
        return r.json();
      }
      const user = await read('/auth/v1/user');
      if (!UUID.test(user.id || '') || !user.email_confirmed_at) throw failure(401, 'Use a confirmed account to continue.');
      // The user's token, not the service role, authorizes the metadata query.
      // RLS checks current membership/publication even if Storage has cached bytes.
      const rows = await read('/rest/v1/workspace_files?select=id,workspace_id,path,name,mime_type,status,size_bytes&id=eq.' + id);
      const file = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
      if (!file || file.id !== id || file.status !== 'ready') throw failure(404, 'This file is no longer available to your account.');
      if (!UUID.test(file.workspace_id) || !file.path?.startsWith(file.workspace_id + '/' + id + '/') || file.path.split('/').includes('..') ||
          !Number.isSafeInteger(Number(file.size_bytes)) || Number(file.size_bytes) < 1 || Number(file.size_bytes) > 10485760) throw failure(502, 'This file is unavailable.');
      const storage = await fetcher(base + '/storage/v1/object/authenticated/platum-workspace-files/' + file.path.split('/').map(encodeURIComponent).join('/'), {
        cache: 'no-store', headers: { apikey: key, ...(key.startsWith('sb_secret_') ? {} : { Authorization: 'Bearer ' + key }) }, signal: AbortSignal.timeout(60000),
      });
      if (!storage.ok || !storage.body) throw failure(502, 'The file could not be downloaded. Try again.');
      const filename = String(file.name || 'download').replace(/[\r\n]/g, '');
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', 'attachment; filename="' + filename.replace(/[^\x20-\x7e]|["\\]/g, '_') + '"; filename*=UTF-8\'\'' + encodeURIComponent(filename));
      res.statusCode = 200;
      res.flushHeaders?.();
      // Streaming preserves the 10 MB product limit without a buffered response.
      await pipeline(Readable.fromWeb(storage.body), res);
    } catch (error) {
      if (res.headersSent) { res.destroy?.(); return; }
      res.statusCode = error.status || 502;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: error.status ? error.message : 'File delivery is temporarily unavailable. Try again.' }));
    }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
