#!/usr/bin/env node
'use strict';

/**
 * Cabinet / Platum — repository integrity smoke check.
 *
 * Lightweight baseline verification for the static application:
 *  1. Key application files exist.
 *  2. Local asset references in HTML pages resolve to real files.
 *  3. Core JavaScript files pass `node --check` syntax validation.
 *  4. Removed legacy routes (calendar.html / calendar.js) are not still referenced.
 *  5. Supabase config does not require nonexistent seed files.
 *  6. Protected private paths ( client-space/, tmp/) are untracked and git-ignored.
 *  7. Public bundles do not reintroduce known client data or unsafe integration paths.
 *
 * Exit code 0 = all checks passed, 1 = at least one check failed.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

const results = [];
function check(label, ok, detail = '') {
  results.push({ label, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

function exists(relativePath) {
  return fs.existsSync(path.join(ROOT, relativePath));
}

function isDirectory(relativePath) {
  try {
    return fs.statSync(path.join(ROOT, relativePath)).isDirectory();
  } catch (error) {
    return false;
  }
}

function walk(dir, out = []) {
  if (!isDirectory(dir)) return out;
  for (const entry of fs.readdirSync(path.join(ROOT, dir))) {
    if (entry === '.git' || entry === 'node_modules' || entry === 'tmp' || entry === ' client-space') continue;
    const relative = path.posix.join(dir, entry);
    if (isDirectory(relative)) walk(relative, out);
    else out.push(relative);
  }
  return out;
}

// ── 1. Key application files ──
const requiredFiles = [
  'index.html',
  'client-space.html',
  'prohor-intake.html',
  'client-space.js',
  'client-space-auth.js',
  'client-space.i18n.js',
  'client-space.config.js',
  'cabinet-data.js',
  'workspace-app.js',
  'workspace-app.css',
  'workspace-data.js',
  'workspace-calendar.js',
  'workspace-calendar-domain.js',
  'workspace-calendar.css',
  'workspace-learning.js',
  'workspace-learning.css',
  'workspace-progress.js',
  'workspace-progress.css',
  'api/team.js',
  'api/files.js',
  'supabase/migrations/20261012163018_collaboration_workspace.sql',
  'supabase/migrations/20261012231141_server_authorized_downloads.sql',
  'agency-os.js',
  'agency-os.css',
  'client-space.css',
  'prohor-intake.css',
  'prohor-intake.js',
  'supabase/config.toml',
  'supabase/migrations/20260812095253_cabinet_workspace_state.sql',
  'supabase/migrations/20260821122450_platum_workspace_mvp.sql',
  'supabase/tests/rls_workspace_isolation.sql',
  'scripts/mock-platum-api.js',
  'bot/bot.js',
  'bot/package.json',
  'render.yaml',
  'vercel.json',
];

console.log('== 1. Key application files ==');
for (const file of requiredFiles) {
  check(`exists: ${file}`, exists(file));
}

// ── 2. Local asset references in HTML pages ──
console.log('\n== 2. HTML local asset integrity ==');
const htmlPages = walk('').filter((file) => file.endsWith('.html'));
const missing = [];
for (const page of htmlPages) {
  const content = fs.readFileSync(path.join(ROOT, page), 'utf8');
  const references = new Set();
  const attributePattern = /\b(?:src|href)\s*=\s*"([^"]+)"/g;
  let match;
  while ((match = attributePattern.exec(content))) {
    const reference = match[1];
    if (!reference || /^(https?:|data:|mailto:|tel:|#|\/\/)/.test(reference)) continue;
    if (reference.includes('?')) continue;
    references.add(reference);
  }
  for (const reference of references) {
    const resolved = path.resolve(path.join(ROOT, path.dirname(page)), reference);
    if (!fs.existsSync(resolved)) {
      missing.push(`${page} -> ${reference}`);
    }
  }
}
check('no HTML page references a missing local asset', missing.length === 0, missing.join('; '));

// ── 3. JavaScript syntax validation ──
console.log('\n== 3. JavaScript syntax validation ==');
const jsFiles = walk('').filter((file) => file.endsWith('.js'));
const syntaxErrors = [];
for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ['--check', path.join(ROOT, file)], { encoding: 'utf8' });
  if (result.status !== 0) {
    syntaxErrors.push(`${file}: ${(result.stderr || result.stdout || '').trim()}`);
  }
}
if (syntaxErrors.length === 0) {
  check(`node --check passes for ${jsFiles.length} JS files`, true);
} else {
  check(`node --check passes for ${jsFiles.length} JS files`, false, syntaxErrors.join('; '));
}

// ── 4. Removed legacy routes must not be referenced ──
console.log('\n== 4. Removed legacy calendar references ==');
const removedRoutes = ['calendar.html', 'calendar.js', 'translations.js', 'style.css'];
const routeReferences = [];
for (const file of walk('')) {
  if (file === 'scripts/check-integrity.js') continue;
  if (!/\.(html|js|json|md|toml|yaml|yml|css)$/.test(file)) continue;
  const content = fs.readFileSync(path.join(ROOT, file), 'utf8');
  for (const route of removedRoutes) {
    // Match the removed filename, not a suffix of a new workspace module.
    const exactRoute = new RegExp('(^|[^a-zA-Z0-9_-])' + route.replace(/\./g, '\\.') + '(?=$|[^a-zA-Z0-9_.-])');
    if (exactRoute.test(content)) {
      routeReferences.push(`${file} -> ${route}`);
    }
  }
}
check('no references to removed legacy calendar assets', routeReferences.length === 0, routeReferences.join('; '));

// ── 5. Supabase seed configuration ──
console.log('\n== 5. Supabase configuration ==');
if (exists('supabase/config.toml')) {
  const config = fs.readFileSync(path.join(ROOT, 'supabase/config.toml'), 'utf8');
  const seedSection = config.match(/\[db\.seed\][\s\S]*?(?=\n\[|\s*$)/);
  const seedEnabled = seedSection && /^\s*enabled\s*=\s*true/m.test(seedSection[0]);
  const sqlPaths = seedSection ? [...seedSection[0].matchAll(/sql_paths\s*=\s*\[(.*?)\]/gs)].flatMap((m) =>
    [...m[1].matchAll(/"([^"]+)"/g)].map((p) => p[1])
  ) : [];
  if (seedEnabled) {
    const missingSeeds = sqlPaths.filter((seedPath) => !exists(path.posix.join('supabase', seedPath)));
    check('supabase seed configuration references only existing files', missingSeeds.length === 0, missingSeeds.join('; '));
  } else {
    check('supabase seeding is disabled (no seed file required)', true);
  }
} else {
  check('supabase/config.toml exists', false);
}

// ── 6. Protected private paths ──
console.log('\n== 6. Protected private paths ==');
const protectedPaths = [' client-space', 'tmp'];
const ignoreStatus = protectedPaths.map((protectedPath) => {
  // Probe a path *inside* the protected directory: git check-ignore does not
  // match trailing-slash patterns against a directory path that does not exist
  // on disk, so a bare directory probe would falsely fail on fresh clones.
  const probePath = `${protectedPath}/__integrity_probe__`;
  const ignoreResult = spawnSync('git', ['check-ignore', '-v', probePath], { cwd: ROOT, encoding: 'utf8' });
  return {
    protectedPath,
    ignored: ignoreResult.status === 0,
    detail: ignoreResult.stdout ? ignoreResult.stdout.trim() : '',
  };
});

const trackedFiles = spawnSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' });
const trackedLines = trackedFiles.status === 0 ? trackedFiles.stdout.split('\n').filter(Boolean) : [];
const trackedProtected = trackedLines.filter((line) =>
  protectedPaths.some((protectedPath) => line === protectedPath || line.startsWith(`${protectedPath}/`))
);
const stagedProtected = [];
if (trackedFiles.status === 0) {
  const stagedStatus = spawnSync('git', ['diff', '--cached', '--name-only'], { cwd: ROOT, encoding: 'utf8' });
  if (stagedStatus.status === 0) {
    const stagedLines = stagedStatus.stdout.split('\n').filter(Boolean);
    for (const line of stagedLines) {
      if (protectedPaths.some((protectedPath) => line === protectedPath || line.startsWith(`${protectedPath}/`))) {
        stagedProtected.push(line);
      }
    }
  }
}
const protectedViolations = [...trackedProtected, ...stagedProtected];
const unignoredPaths = ignoreStatus
  .filter((entry) => !entry.ignored)
  .map((entry) => `${entry.protectedPath} is not ignored by git`);
check(
  `protected private folders (${protectedPaths.join(', ')}) are not tracked or staged`,
  trackedProtected.length === 0 && stagedProtected.length === 0,
  protectedViolations.join('; ')
);

check(
  `protected private folders (${protectedPaths.join(', ')}) are ignored`,
  unignoredPaths.length === 0,
  unignoredPaths.join('; ')
);

// ── 7. Public data and integration boundary ──
console.log('\n== 7. Public data and integration boundary ==');
const publicClientSource = fs.readFileSync(path.join(ROOT, 'client-space.js'), 'utf8');
const publicAgencySource = fs.readFileSync(path.join(ROOT, 'agency-os.js'), 'utf8');
const publicTranslations = fs.readFileSync(path.join(ROOT, 'client-space.i18n.js'), 'utf8');
const browserIntakeSource = fs.readFileSync(path.join(ROOT, 'prohor-intake.js'), 'utf8');
const appsScriptSource = fs.readFileSync(path.join(ROOT, 'google-sheets-intake-webapp.gs'), 'utf8');
const botSource = fs.readFileSync(path.join(ROOT, 'bot/bot.js'), 'utf8');
const renderSource = fs.readFileSync(path.join(ROOT, 'render.yaml'), 'utf8');
const clientHtml = fs.readFileSync(path.join(ROOT, 'client-space.html'), 'utf8');
const clientCss = fs.readFileSync(path.join(ROOT, 'client-space.css'), 'utf8');
const clientAuthSource = fs.readFileSync(path.join(ROOT, 'client-space-auth.js'), 'utf8');
const dataSource = fs.readFileSync(path.join(ROOT, 'cabinet-data.js'), 'utf8');
const intakeHtml = fs.readFileSync(path.join(ROOT, 'prohor-intake.html'), 'utf8');
const migrationSource = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20260821122450_platum_workspace_mvp.sql'), 'utf8');
const rlsTestSource = fs.readFileSync(path.join(ROOT, 'supabase/tests/rls_workspace_isolation.sql'), 'utf8');
const publicConfig = fs.readFileSync(path.join(ROOT, 'client-space.config.js'), 'utf8');
const supabaseConfig = fs.readFileSync(path.join(ROOT, 'supabase/config.toml'), 'utf8');

const knownClientMarkers = [
  /Prohor Music/i,
  /prohormusic/i,
  /Caladan Oceanic/i,
  /Kaitain/i,
  /Cosmic Boys/i,
];
const exposedMarkers = [];
for (const [label, content] of [
  ['client-space.js', publicClientSource],
  ['client-space.i18n.js', publicTranslations],
  ['agency-os.js', publicAgencySource],
]) {
  for (const marker of knownClientMarkers) {
    if (marker.test(content)) exposedMarkers.push(`${label} -> ${marker}`);
  }
}

check('public workspace bundles contain no known client markers', exposedMarkers.length === 0, exposedMarkers.join('; '));
const collaborationSource = ['workspace-app.js', 'workspace-data.js'].map(file => fs.readFileSync(path.join(ROOT, file), 'utf8')).join('\n');
check('collaboration browser code contains no administrative keys or private client seeds',
  !/SUPABASE_SERVICE_ROLE_KEY|sb_secret_/.test(collaborationSource)
    && !knownClientMarkers.some(marker => marker.test(collaborationSource)));
check(
  'public client registry is empty until authenticated data is loaded',
  /const CLIENTS\s*=\s*Object\.freeze\(\{\}\);/.test(publicClientSource)
);
check('public client profile asset is absent', !exists('assets/prohor-profile.jpeg'));
check(
  'browser intake has no direct Apps Script transport',
  !/script\.google\.com\/macros|\bfetch\s*\(/i.test(browserIntakeSource)
);
check(
  'Apps Script credentials are read from Script Properties',
  /PropertiesService\.getScriptProperties\(\)/.test(appsScriptSource)
    && !/const\s+(?:SPREADSHEET_ID|MAINTENANCE_TOKEN)\s*=\s*['"][^'"]+['"]/.test(appsScriptSource)
);
check(
  'obsolete username-based Telegram authorization is absent',
  !/ADMIN_USERNAMES|PROHOR_TELEGRAM_USERNAME/.test(`${botSource}\n${renderSource}`)
);
check(
  'MVP interface and questionnaire are English-only',
  /<html\s+lang="en"/i.test(clientHtml)
    && /<html\s+lang="en"/i.test(intakeHtml)
    && !/data-(?:auth-)?language|>RU<|>EN</.test(clientHtml)
    && !/[А-Яа-яЁё]/.test(`${clientHtml}\n${publicClientSource}\n${clientAuthSource}\n${browserIntakeSource}\n${intakeHtml}`)
);
check(
  'browser configuration targets only the verified Platum Supabase project',
  /https:\/\/mnqrblzdpdttdynlpqey\.supabase\.co/.test(publicConfig)
    && /supabasePublishableKey:\s*'sb_publishable_[^']+'/.test(publicConfig)
    && !/sb_secret_|serviceRole\s*:/i.test(publicConfig)
);
check(
  'authentication is invite-only and token-based test identities stay localhost-only',
  /^enable_signup\s*=\s*false/m.test(supabaseConfig)
    && /\[auth\.email\][\s\S]*?enable_signup\s*=\s*true/.test(supabaseConfig)
    && /create_user:\s*false/.test(clientAuthSource)
    && /dom\.emailForm\.hidden\s*=\s*false/.test(clientAuthSource)
    && /invitation sent by your Platum administrator/i.test(clientHtml)
    && /isLocalHost\s*&&\s*localTestUser/.test(clientAuthSource)
);
check(
  'public test workspace is isolated local demo access',
  /enablePublicTestWorkspace:\s*true/.test(publicConfig)
    && /Enter test workspace/.test(clientHtml)
    && /Test access uses isolated demo data/.test(clientHtml)
    && /TEST_WORKSPACE_SESSION_KEY\s*=\s*'client-cabinet:test-workspace:v1'/.test(clientAuthSource)
    && /sessionStorage\.getItem\(TEST_WORKSPACE_SESSION_KEY\)\s*===\s*'active'/.test(clientAuthSource)
    && /hasAuthRedirect[\s\S]*?if\s*\(hasAuthRedirect\)\s*setPublicTestWorkspace\(false\);[\s\S]*?if\s*\(publicTestWorkspaceRequested\(\)\)/.test(clientAuthSource)
    && /id:\s*'platum-test-user'/.test(clientAuthSource)
    && /app_metadata:\s*\{\s*provider:\s*'test',\s*client_id:\s*'starter',\s*role:\s*'admin'\s*\}/.test(clientAuthSource)
    && /\},\s*null,\s*true\);/.test(clientAuthSource)
    && /isTestWorkspace:\s*!session\s*&&\s*user\?\.app_metadata\?\.provider\s*===\s*'test'/.test(clientAuthSource)
    && /let\s+testWorkspaceActive\s*=\s*false/.test(clientAuthSource)
    && /testWorkspaceActive\s*=\s*true;\s*\n\s*clearSession\(\)/.test(clientAuthSource)
    && /setPublicTestWorkspace\(true\);\s*\n\s*clearSession\(\);\s*\n\s*clearSensitiveWorkspaceCache\(\);\s*\n\s*reloadWithoutWorkspaceHash\(\)/.test(clientAuthSource)
    && /setPublicTestWorkspace\(false\);\s*\n\s*clearSession\(\)/.test(clientAuthSource)
    && /keepalive:\s*true/.test(clientAuthSource)
    && /reloadWithoutWorkspaceHash\(\);/.test(clientAuthSource)
    && /if\s*\(!session\?\.refreshToken\s*\|\|\s*testWorkspaceActive\)\s*return\s+null;/.test(clientAuthSource)
    && /return\s+testWorkspaceActive\s*\?\s*null\s*:\s*saveSession\(payload\)/.test(clientAuthSource)
    && /if\s*\(!session\?\.accessToken\s*\|\|\s*testWorkspaceActive\)\s*return\s+null;/.test(clientAuthSource)
    && /return\s+testWorkspaceActive\s*\?\s*null\s*:\s*user;/.test(clientAuthSource)
    && /if\s*\(testWorkspaceActive\)\s*\{\s*clearSession\(\);\s*return;\s*\}/.test(clientAuthSource)
    && /isAdminMode\s*&&\s*!authContext\.isTestWorkspace/.test(publicClientSource)
    && /dom\.sidebarAccessRole\.textContent\s*=\s*'Test access'/.test(publicClientSource)
);
check(
  'workspace view switching stays deterministic across browsers',
  /\.portal-view\s*\{[^}]*display:\s*none;[^}]*\}/.test(clientCss)
    && /\.portal-view\.is-active\s*\{[^}]*display:\s*block;[^}]*\}/.test(clientCss)
    && !/view-in|\.portal-view(?:\.is-active)?\s*\{[^}]*animation:/.test(clientCss)
);
check(
  'authenticated application uses normalized shared workspace records',
  /workspace_members/.test(dataSource)
    && /loadWorkspaceBundle/.test(dataSource)
    && /createRequest/.test(dataSource)
    && /respond_to_request/.test(dataSource)
    && !/cabinet_workspace_states/.test(dataSource)
);
check(
  'relational migration enables and forces RLS on the core shared journey',
  /create table public\.workspaces/.test(migrationSource)
    && /create table public\.workspace_members/.test(migrationSource)
    && /create table public\.requests/.test(migrationSource)
    && /create table public\.request_replies/.test(migrationSource)
    && /alter table public\.requests force row level security/.test(migrationSource)
    && /revoke all on table public\.requests from anon, authenticated/.test(migrationSource)
    && /drop policy if exists "Cabinet users read assigned workspace state"/.test(migrationSource)
    && /grant select on table public\.request_replies to authenticated/.test(migrationSource)
    && !/grant select, insert on table public\.request_replies to authenticated/.test(migrationSource)
);
check(
  'RLS tests cover anonymous, uninvited, cross-workspace, client, and operator access',
  /anonymous access to requests is denied/.test(rlsTestSource)
    && /uninvited user sees no workspace/.test(rlsTestSource)
    && /client A cannot create a request in workspace B/.test(rlsTestSource)
    && /assigned operator can respond/.test(rlsTestSource)
    && /client A sees the persisted operator response/.test(rlsTestSource)
);

console.log('\n== Summary ==');
const failures = results.filter((result) => !result.ok);
console.log(`${results.length - failures.length} passed, ${failures.length} failed.`);
process.exit(failures.length ? 1 : 0);
