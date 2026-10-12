# Platum — Current Implementation State

This Stage 4 technical snapshot describes inspected implementation and scoped verification. The dated release checkpoint distinguishes confirmed hosted facts from unresolved access. AGENTS.md contains working rules and context pointers.

## 1. Current product

Platum, previously Cabinet and Client Cabinet, is an independent client-service workspace. The authenticated Stage 1 interface supports a shared client/team cycle: context, requests, assigned work, published materials, discussion, decisions, and a recorded next step. The initial audience is clients managed by the MOTN team; the implementation remains agency-neutral.

## 2. Major capabilities

- **Access and team management:** Confirmed users enter through Supabase Auth. A server API creates workspaces, sends or resends invitations, and revokes invitations or memberships. Membership controls every workspace. An explicit server-side bootstrap allowance supports the first owner; owners/admins can subsequently create workspaces. Team members cannot manage access, and the last owner cannot be removed. Public test access remains an isolated legacy preview with no authenticated workspace data.
- **Agreement and personalisation:** The team edits goals, scope, roles, working rhythm, boundaries, current focus, next step, welcome text, accent, and section order/visibility through the interface. Navigation visibility does not replace authorization. Existing strategy and milestone records remain readable.
- **Requests and tasks:** Clients describe a need and can attach a file. Operators classify scope, assign a team owner, reply, and create linked tasks. Clients complete their eligible tasks. Writes use revision checks and operation IDs; stale edits report conflicts and repeated requests do not duplicate accepted changes.
- **Materials and review:** Structured text sections, reference links, and attachments form immutable material versions. Drafting and publishing are separate. Discussions bind to a version and optional stable section; client approval/change requests and reading state are separate records. A new publication does not inherit an older approval. Team drafts remain inaccessible to clients.
- **Questionnaires:** Operators configure supported question types and explanations. Clients save private answer drafts, submit responses, and reuse matching earlier answers when questions change. Submitted responses retain their original question definitions. The team reviews submitted responses; older unversioned records remain preserved.
- **Files and exports:** A private Supabase bucket supports documents/images up to 10 MB with reserved immutable paths and authenticated downloads. Team files stay internal until explicitly shared or attached to a shared request/published material. Large videos remain external links. Markdown and JSON exports use a server-enforced shared-data projection; file bytes are downloaded separately.
- **Updates and team inbox:** Real requests, tasks, submissions, material decisions, published updates, and recorded decisions drive the interface. The team sees pending requests, responses, and requested changes across assigned workspaces. Per-user read markers identify new content. Section navigation refreshes data; pending saves and editor drafts are protected from automatic focus refreshes.

## 3. Technical foundation

Static HTML, CSS, and vanilla JavaScript remain the frontend stack. The collaboration surface reuses existing Auth and database foundations; the earlier portal/Agency OS remains an isolated preview.

Supabase Auth, PostgREST, transactional RPCs, RLS, and private Storage provide persistence. New privileged functions live in the private schema behind explicitly granted public wrappers. The Node API uses server-only credentials for Auth invitations and scoped administration. Browser code contains only the publishable key and user session. The collaboration migration must precede the new frontend, and server configuration must target the same Platum backend.

Production target: https://client-cabinet.vercel.app. The existing Vercel project also serves https://platum-client-agency-workspace.vercel.app. The legacy address is a deployment alias and must be verified/reassigned during publication. Only the two non-secret production server URLs have been configured; Stage 1 has not been deployed.

## 4. Useful code map

- client-space.html and client-space-auth.js — entry point, sign-in, session refresh, invalid-link recovery, and isolated preview routing.
- workspace-app.js / workspace-app.css — authenticated client/team interface and editors.
- workspace-data.js — authorized reads, commands, uploads, downloads, and exports.
- api/team.js — server-only workspace creation, invitation delivery, and access management.
- supabase/migrations/20261012163018_collaboration_workspace.sql — Stage 1 records, versioning, commands, authorization, and private file policies; earlier migrations remain intact.
- tests/ — server authorization checks, guarded local fixtures, real local service integration, and browser journeys. Existing SQL isolation tests remain in supabase/tests/.
- docs/COLLABORATION_SETUP.md — configuration, bootstrap, migration/release order, and reproducible local-check instructions. README.md remains the setup/check entry point.

## 5. Current limitations and decisions

Hosted activation is authorized, but still requires administrative access to the assigned Supabase project, the reviewed migration, the verified server secret, operator bootstrap, and publication. Local email-inbox proof does not establish real customer email delivery. The remote main branch is older than the working implementation branch; preserve the current code when preparing delivery. Do not advance the production branch before backend compatibility is established.

Calendar, dedicated learning/practice modules, private client organisers, AI automation, and MOTN OS synchronization are outside Stage 1. Prohor-specific onboarding remains separate. The legacy questionnaire remains device-local; Telegram/Render and Apps Script integrations were not changed or live-checked. Fixed supplementary implementation-state mappings remain not configured; concept documents provide context only.

## 6. Verification checkpoint

Partial implementation update: 2026-10-12, on codex/client-space-prototype, based on commit 2be72f98d3a729006f686c0115f1f31b97eeed31 plus Stage 1 changes. Previous uncommitted documentation was preserved and backed up before edits. This checkpoint covers the collaboration changes, not a whole-project review or later documentation commit.

Verification passed: clean replay of all migrations in a dedicated disposable local Supabase; 48 repository integrity checks; 10 server API authorization tests plus 9 existing bot tests; 15 existing pgTAP isolation checks; 15 integration scenarios using local Auth/PostgREST/Storage; and 12 Chromium browser scenarios covering desktop, 390/320 px, keyboard interaction, actual local invitation email, reload, access revocation, conflicts, and retry after a lost response. The final browser run had no unhandled application errors. The scoped Impeccable detector returned no findings.

These acceptance checks used only disposable local services. The 2026-09-01 public-test production record at 2be72f9 remains historical evidence.

Release preflight, 2026-10-12: implementation commit 019d98cf74ae682b2b71be172d6b84f18cbf97ba was pushed to codex/client-space-prototype and its remote SHA verified. GitHub Actions run 38292230020 passed; the local production-dependency audit reported zero vulnerabilities. SSH access to projects-workspace/platum and CLI access to the existing Vercel project are verified. Vercel's linked repository ID matches the current repository despite old owner/name labels; its production branch is main. Remote main remains 81995251e7532aa7aaca2ea8a90a9fa12296e980 and is an ancestor of the implementation baseline. Both public addresses return the configured Platum frontend, while Vercel still reports deployment 2be72f98d3a729006f686c0115f1f31b97eeed31. PLATUM_SUPABASE_URL and PLATUM_APP_URL are configured for production.

Supabase restoration follow-up, 2026-10-12 21:12 UTC: after the user restored the assigned project, its public Auth health endpoint returned HTTP 200, replacing the earlier DNS failure and transient 502. Public Auth settings confirm email sign-in is disabled and public signup is disabled; email sign-in must be enabled before acceptance. An anonymous workspace read is denied with HTTP 401 / 42501. The exact project and mapped signed-in account were verified in Chrome. Subsequent browser navigation stopped on the shared tab-ownership/snapshot check; the lease was left pending and tabs preserved, with native Full Screen unverified. The Supabase connector still denies access and the CLI account does not list this project. No remote migration, Auth changes, server-secret installation, or hosted client acceptance has occurred. An attempted check using the existing bot key was previously rejected by automatic approval review because its project provenance was unverified; it was not executed or retried. Restore a supported administrative connection to this exact project before publishing Stage 1.
