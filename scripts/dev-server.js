#!/usr/bin/env node
'use strict';
// Local collaboration verification only. Never loads the repository's .env.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const handler = require('../api/team');
const fileHandler = require('../api/files');
const root = path.resolve(__dirname, '..');
const host = '127.0.0.1';
const port = Number(process.env.PLATUM_DEV_PORT || 4180);
const backend = new URL(process.env.PLATUM_SUPABASE_URL || 'http://127.0.0.1:60421');
if (!['127.0.0.1','localhost'].includes(backend.hostname) || !process.env.PLATUM_SUPABASE_PUBLISHABLE_KEY) {
  throw new Error('This server requires explicit local Supabase configuration. Remote projects are refused.');
}
const publicFiles = new Set(['index.html','client-space.html','client-space.css','client-space.js','client-space-auth.js','client-space.i18n.js',
  'cabinet-data.js','agency-os.js','agency-os.css','workspace-app.js','workspace-app.css','workspace-data.js','prohor-intake.html','prohor-intake.js','prohor-intake.css']);
const server = http.createServer(async (req,res) => {
  const url = new URL(req.url, 'http://' + host + ':' + port);
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Security-Policy',"default-src 'self'; connect-src 'self' "+backend.origin+"; font-src 'self' https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:; frame-ancestors 'none'");
  if (url.pathname === '/api/team') return handler(req,res);
  if (url.pathname === '/api/files') return fileHandler(req,res);
  if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
  if (url.pathname === '/client-space.config.js') {
    res.setHeader('Content-Type','application/javascript');
    return res.end('window.CLIENT_SPACE_CONFIG = Object.freeze('+JSON.stringify({
      supabaseUrl:backend.origin,supabasePublishableKey:process.env.PLATUM_SUPABASE_PUBLISHABLE_KEY,
      brandName:'Platum',brandMark:'P',enablePublicTestWorkspace:true,enableCollaboration:true,
      telegramLoginUrl:'',supportUrl:'',
    })+');');
  }
  const file = url.pathname === '/' ? 'client-space.html' : url.pathname.slice(1);
  if (!publicFiles.has(file)) { res.writeHead(404); return res.end('Not found'); }
  const full = path.join(root,file);
  const type={'.html':'text/html','.css':'text/css','.js':'application/javascript'}[path.extname(file)]||'application/octet-stream';
  try { const content=fs.readFileSync(full);res.setHeader('Content-Type',type+'; charset=utf-8');res.end(req.method==='HEAD'?undefined:content); }
  catch { res.writeHead(404);res.end('Not found'); }
});
server.listen(port,host,()=>console.log('Platum local collaboration server: http://'+host+':'+port));
