# Collaboration setup and verification

This guide covers the authenticated Stage 1 workspace. Current implementation and verification status belong in the root PROJECT_STATE.md.

## Server configuration

The static app uses client-space.config.js for its browser-safe Supabase URL and publishable key. The same deployment serves api/team.js, which requires:

| Variable | Purpose |
|---|---|
| PLATUM_SUPABASE_URL | The same verified Platum backend used by the browser |
| PLATUM_SUPABASE_SERVICE_ROLE_KEY | Server-only Auth administration and scoped workspace-management commands |
| PLATUM_APP_URL | Exact application origin and fixed invitation callback destination |
| PLATUM_BOOTSTRAP_USER_IDS | Explicit confirmed Auth user UUIDs permitted to create the first workspace |

Existing workspace owners and administrators may create additional workspaces. A bootstrap identity does not gain access to other workspaces. After establishing the first owner, remove the bootstrap allowance if it is no longer needed. Do not put these identifiers or the server key into browser code.

The management API authenticates the bearer token with Auth, checks workspace membership, and uses service-only transactional commands. Team members can work on assigned client records but cannot invite people or manage memberships. Only owners can grant or revoke administrator access; the last owner cannot be removed.

Email authentication must be enabled while public signup is disabled. In the local CLI configuration, auth.email.enable_signup enables the email provider; auth.enable_signup=false remains the global signup prohibition. The integration suite checks both settings by making actual Auth requests. The browser requests email links with create_user=false.

## Database and release order

When a release is separately authorized:

1. Verify the assigned Platum backend and delivery target. Stage 1 was preserved from codex/client-space-prototype and delivered by fast-forwarding main; do not replace that history with an older checkout.
2. Apply the existing migrations and the collaboration migration to the intended Platum database using the normal migration path. Preserve existing records.
3. Configure server variables, the email provider, and the exact callback allowlist. Invite the first operator through a trusted Auth administration path.
4. Deliver the static application and its Node API together. The new interface requires the collaboration schema and reports missing configuration explicitly.
5. Verify a real invited-user journey and private file access separately from local acceptance. Local test results do not establish hosted-provider or production status.

The configured application origin is client-cabinet.vercel.app. Its deployment alias must be reassigned and verified after a release; the alternate platum-client-agency-workspace.vercel.app hostname redirects to it. A successful main push alone does not prove a Vercel publication. Check the deployed commit and served assets.

Production SMTP is intentionally deferred. Do not treat the built-in Supabase email service or a successful owner-mailbox check as proof that arbitrary external clients can receive invitations. Configure and verify the intended sender before external-client email onboarding.

The collaboration migration retains legacy material links, deliverables, project direction and milestones. Existing task-status and operator-reply RPC signatures remain available. New material versions are immutable; publication, reading and client decisions are separate records. New form responses preserve their question definitions; older unversioned responses remain intact.

The Vercel ignore file excludes private local folders, environment files, internal documents, migrations, test fixtures and development servers from the web deployment. It does not publish or change the Telegram worker.

## Files and publication

The private platum-workspace-files bucket accepts documents and images up to 10 MB. Uploads reserve a unique immutable object path before transmission; completion checks the stored object's size and media type. Downloads go through api/files.js: it verifies the user, queries current file visibility under that user's RLS, and streams the authorized bytes with no-store response headers. Direct client Storage reads are denied. This boundary avoids continuing access through a previously cached Storage response after membership revocation. Bytes already downloaded by a user cannot be recalled.

Team uploads start internal unless explicitly shared. Attaching a file to a shared request or published material grants access within that workspace. A material draft and its unshared attachments remain internal. These controls are not malware scanning or a rights-clearance service. Large source videos remain external links.

Shared-history exports are available as Markdown and JSON. The server projects client-visible records even when the exporter is an operator; credentials, pending invitations and internal material drafts are excluded. Attached file bytes are downloaded separately while access is valid.

## Local checks

Run the existing integrity check and the focused Node authorization tests:

    node scripts/check-integrity.js
    node --test tests/team-api.test.js tests/files-api.test.js tests/workspace-routing.test.js bot/access-control.test.js

The original scripts/mock-platum-api.js remains a small legacy UI fixture. It does not verify the collaboration backend.

The collaboration integration and browser checks require a disposable local Supabase with Auth, PostgREST, Storage and the local email inbox. Use a distinct project ID beginning with platum-stage1- and free ports; do not reset another project's local database. Apply repository migrations, then apply tests/local-bootstrap.sql only to that disposable database.

Create a private JSON configuration outside Git with projectId, apiUrl, appUrl, anonKey, serviceKey, mailUrl and container. Both URLs must be loopback HTTP addresses; container must identify that test database. PLATUM_TEST_CONFIG points to this file. The fixture helpers refuse non-local URLs and require the database guard installed by local-bootstrap.sql.

Run in order:

    node tests/local-fixtures.cjs
    node tests/local-server.cjs

Keep the local server running and run the integration suite in another terminal with the same PLATUM_TEST_CONFIG:

    node tests/collaboration.integration.cjs

The fixture step creates only synthetic users. Repeat a failed full scenario with fresh fixture identities and restart the local server so its bootstrap identity matches. Credentials and browser sessions remain in the private configuration, never in reports or source control. PLATUM_TEST_REPORT can name an external JSON result file containing only scenario names and scope.

The browser suite uses Playwright supplied by the local runtime or the caller's NODE_PATH. It uses separate browser contexts and real local Auth tokens, without borrowing a user's signed-in Chrome profile.

    node tests/collaboration.browser.cjs

Stop only the local server and disposable Supabase instance created for the check. Keep all other projects and private client material untouched.
