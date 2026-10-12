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
- **Files and exports:** A private Supabase bucket supports documents/images up to 10 MB with reserved immutable paths. Downloads pass through the server, which checks current file visibility under the user's RLS before streaming bytes with no-store headers; direct client Storage reads are denied. Team files stay internal until explicitly shared or attached to a shared request/published material. Large videos remain external links. Markdown and JSON exports use a server-enforced shared-data projection; file bytes are downloaded separately.
- **Updates and team inbox:** Real requests, tasks, submissions, material decisions, published updates, and recorded decisions drive the interface. The team sees pending requests, responses, and requested changes across assigned workspaces. Per-user read markers identify new content. Section navigation refreshes data; pending saves and editor drafts are protected from automatic focus refreshes.

## 3. Technical foundation

Static HTML, CSS, and vanilla JavaScript remain the frontend stack. The collaboration surface reuses existing Auth and database foundations; the earlier portal/Agency OS remains an isolated preview.

Supabase Auth, PostgREST, transactional RPCs, RLS, and private Storage provide persistence. New privileged functions live in the private schema behind explicitly granted public wrappers. The Node API uses server-only credentials for Auth invitations and scoped administration. Browser code contains only the publishable key and user session. The collaboration migration must precede the new frontend, and server configuration must target the same Platum backend.

Production target: https://client-cabinet.vercel.app. The alternate https://platum-client-agency-workspace.vercel.app redirects there so browser origins and Auth callbacks agree. The canonical address remains a deployment alias and must be verified/reassigned during publication. The Stage 1 migration, server URL/secret/app origin and explicit initial-operator allowance are configured. The first operator accepted a real email invitation and created a workspace through the published interface.

## 4. Useful code map

- client-space.html and client-space-auth.js — entry point, sign-in, session refresh, invalid-link recovery, and isolated preview routing.
- workspace-app.js / workspace-app.css — authenticated client/team interface and editors.
- workspace-data.js — authorized reads, commands, uploads, downloads, and exports.
- api/team.js — server-only workspace creation, invitation delivery, and access management.
- api/files.js — authenticated, freshly authorized, uncached streaming downloads.
- supabase/migrations/20261012163018_collaboration_workspace.sql — Stage 1 records, versioning, commands, authorization, and private file policies; earlier migrations remain intact.
- supabase/migrations/20261012231141_server_authorized_downloads.sql — denies direct client Storage reads after a hosted CDN revocation check exposed cached responses.
- tests/ — server authorization checks, guarded local fixtures, real local service integration, and browser journeys. Existing SQL isolation tests remain in supabase/tests/.
- docs/COLLABORATION_SETUP.md — configuration, bootstrap, migration/release order, and reproducible local-check instructions. README.md remains the setup/check entry point.

## 5. Current limitations and decisions

Stage 1 is deployed. Production SMTP remains deferred at the user's explicit request: the built-in Supabase mail service delivered the operator invitation and one controlled client sign-in email, while a second controlled client's delivery failed. This is not evidence of reliable external-client email delivery. The user also explicitly skipped the second-employee hosted test; simultaneous updates were checked with two requests from the existing operator. Earlier local coverage used distinct staff identities.

The delivery branch is now main, fast-forwarded from the preserved implementation branch. Vercel's repository ID matches the current GitHub repository despite historical owner/name labels; no automatic deployment followed the observed main pushes. The release used the existing Vercel CLI and explicitly reassigned the canonical deployment alias. No preview project or separate Supabase environment was created.

Calendar, dedicated learning/practice modules, private client organisers, AI automation, and MOTN OS synchronization are outside Stage 1. Prohor-specific onboarding remains separate. The legacy questionnaire remains device-local; Telegram/Render and Apps Script integrations were not changed or live-checked. Fixed supplementary implementation-state mappings remain not configured; concept documents provide context only.

## 6. Verification checkpoint

Partial implementation update: 2026-10-12, on codex/client-space-prototype, based on commit 2be72f98d3a729006f686c0115f1f31b97eeed31 plus Stage 1 changes. Previous uncommitted documentation was preserved and backed up before edits. This checkpoint covers the collaboration changes, not a whole-project review or later documentation commit.

Verification passed: clean replay of all migrations in a dedicated disposable local Supabase; 48 repository integrity checks; 10 server API authorization tests plus 9 existing bot tests; 15 existing pgTAP isolation checks; 15 integration scenarios using local Auth/PostgREST/Storage; and 12 Chromium browser scenarios covering desktop, 390/320 px, keyboard interaction, actual local invitation email, reload, access revocation, conflicts, and retry after a lost response. The final browser run had no unhandled application errors. The scoped Impeccable detector returned no findings.

These acceptance checks used only disposable local services. The 2026-09-01 public-test production record at 2be72f9 remains historical evidence.

Hosted release, 2026-10-13: implementation 019d98c and its state checkpoint 61f91ad were preserved when advancing main. Live first-use verification found the new-workspace route was below the no-membership branch; 5625787b72615a89889e5ec79ac3b5fbe27f6904 fixes that ordering, requires creation capability, and adds the canonical-origin redirect. Three routing regressions and ten API authorization checks pass. GitHub Actions run 38318404119 passed for that exact source revision; 48 integrity checks also pass. Vercel deployment dpl_CQNjjJAhk7qy7p6ctk4bmq26JGkY is READY/production with that main SHA. The canonical script bytes match the checkout and the alternate address returns a 307 to the canonical site.

The restored Supabase project was verified through the existing mapped Chrome session. The prerequisite migrations were present and there were zero workspaces/memberships before acceptance. The collaboration migration was applied transactionally with its normal history record; its recorded source MD5 matches the local file (f4d1863495cda848545713d33628f427). A SQL-editor partial-buffer error failed before changes; the corrected full buffer was compared exactly before execution. All public tables have enabled/forced RLS; anonymous mutation and client administrative RPC access are denied; the file bucket is private. Email sign-in is enabled, public signup remains disabled, email confirmation is required, and the canonical callback is allowlisted.

Controlled hosted checks use only two clearly labeled verification spaces and owner-controlled client aliases. Nine scenario groups pass: unassigned access denial; cross-client and administrative isolation; idempotent requests/replies/tasks; private files/drafts/publication; forms/context; persistence of browser comments/approval/submission/completion; concurrent edit conflict/version history; frozen form definitions/review; and filtered exports. The real browser journey confirms first workspace creation, client request submission, team reply/scope/owner assignment, linked task creation, keyboard discussion/approval, private form drafts, reload and fresh-login persistence. Downloaded Markdown and attachment bytes were checked. Client layouts at 390/320 px have no horizontal overflow and the phone menu works from the keyboard. Version history retains the original comment/approval while the next publication starts unapproved; no client-page console errors were captured.

The hosted revocation check denied database rows and exports but exposed a previously cached direct Storage response. The follow-up policy migration is applied, and the server download boundary is implemented with seven focused tests; twenty API/routing checks, nine bot checks and fifty integrity checks pass. Publication and hosted acceptance of that correction are still pending in this partial checkpoint. Previously downloaded bytes cannot be recalled; controlled acceptance files contain no real client material.

The shared browser connection repair is local to MacBook-Control: delayed titles are reconciled only for the same retained tab/profile/extension/URL, under the existing lease/action lock. Two causal reproductions failed before the repair; eleven focused stock/provider checks passed afterward and live Supabase continuation succeeded. URL/identity changes and shared Chrome locks remain enforced. MacBook-Control changes are uncommitted and were not published; native Full Screen remains unverified.
