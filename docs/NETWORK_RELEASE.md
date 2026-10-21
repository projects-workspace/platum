# Contacts and community delivery

The approved first implementation extends the existing Platum application. Delivery is through the partner's GitHub/Supabase/Vercel process. This document is a release guide; `PROJECT_STATE.md` holds the current implementation checkpoint.

Production delivery was completed on 2026-10-20. The steps below record its order and must not be replayed on the existing production project. See `PROJECT_STATE.md` section 12 for the live verification and the manual repair of the predecessor's missing migration-history row.

## Agency publishing and voluntary participation — merged source, production pending

The user approved only planning steps 1–2 on 2026-10-21: reconcile the current state and refine community behavior. Contact sharing, personal privacy rules, admission/offboarding redesign and integrations remain outside this change. The new source is based on `origin/main` checkpoint `1166851`, which records the completed first release.

Review: [merged PR #2](https://github.com/projects-workspace/platum/pull/2), merged into `main` as `31c03c3` on 2026-10-21 after explicit owner authorization. Implementation `bae4d4d`, reviewed head `b7ce5ec` and main merge checks passed. Production publication remains a separate partner action. A post-merge GET still serves the prior network asset; the new participation-table REST endpoint returns `404 / PGRST205`.

### Короткий промпт для Codex партнера

Ця редакція стосується пакета PR #2. Після наступних робіт перед фінальною передачею звірити перелік нових міграцій.

> Онови Platum з актуального `origin/main`; PR #2 вже змерджено. Прочитай `PROJECT_STATE.md`, секцію 13, та `docs/NETWORK_RELEASE.md`. У призначеному Platum Supabase звір історію міграцій і застосуй лише відсутню `20261021120000_community_participation.sql`; не повторюй старі міграції, repair чи cleanup. Після підтвердження схеми опублікуй відповідний source у наявний Vercel-проєкт на `https://client-cabinet.vercel.app`. Звір commit, deployment і canonical URL; перевір менеджерські публікації, добровільні відповіді та обмеження доступу на дозволених тестових сесіях. Не створюй реальних акаунтів чи запрошень побічно. Онови `PROJECT_STATE.md`; вкажи SHA, міграцію, deployment і результати PASS/NOT_RUN.

### Access contract

| Action or data | Active ordinary community member | Existing community manager / platform operator | Outsider or revoked ordinary member |
| --- | --- | --- | --- |
| Create, edit, publish or archive community posts | Denied, including their legacy posts and cached publication retries | Allowed in active communities | Denied |
| Read published posts and add discussion | Existing rules; discussion requires active community | Existing rules; no new content writes while archived | Denied |
| Respond to a voluntary help request | Own response only, with explicit active membership | Own response only if explicitly enrolled; management authority alone does not enroll them | Denied |
| Read participation records | Own records only, while the post remains readable | All readable request responses for management summaries | Denied |
| Read profiles, RSVP or workspace content | Existing rules unchanged | Existing rules unchanged | Existing revocation rules |

The additive `supabase/migrations/20261021120000_community_participation.sql` adds one table and replaces the existing mutation implementation, retaining its wrapper and grants. It creates no users, communities, memberships, invitations or posts. Existing member posts, private author drafts and discussion snapshots are preserved with their existing read rules; members cannot publish/edit/archive them afterward. Any later decision to archive legacy content must be explicit.

Responses are `participating`, `completed` or `withdrawn`, keyed by request, request revision and authenticated user. A user can correct or withdraw their response. Writes use response revisions and operation IDs; duplicate retries do not create another response. Request changes require a new response, retaining the earlier context snapshot. Manager summaries count current-version responses by their current status, not lifetime completions. `completed` means the participant reported completion; no external action is independently verified. Reports do not create assigned workspace tasks or grant access. Revoked members' historical reports remain available to managers under existing post access; this does not decide future account deletion/offboarding policy.

### Publication prerequisite for this change

1. Confirm the deployed source and the existing `20261017230000` migration history in the assigned Platum project. Do not replay either previous migration, history repair or cleanup.
2. Apply **only** `20261021120000_community_participation.sql` through the partner's migration process, before publishing the matching frontend. Verify its table RLS, grants and replacement RPC. Existing frontend versions remain data-compatible; member publication is denied by the new server policy even if an older interface still offers the button.
3. Publish the reviewed source through the agreed partner process. The new frontend reads `community_participations`; it requires this migration. Keep existing configuration/credentials unchanged.
4. Verify exact served source and canonical URL. With separately authorized test sessions, verify manager publishing, member publication denial, comments, response reload/withdraw/version changes, manager counts, peer-response isolation and revocation. Do not infer hosted Auth/mail acceptance from local simulation or create real invitations as an incidental check.

The 2026-10-21 task prepares source and handoff; it does not apply the new production migration or deploy. The completed 2026-10-20 procedure below is historical guidance.

Review: [draft PR #1](https://github.com/projects-workspace/platum/pull/1), branch `codex/community-contacts`, based on `codex/platform-founder-roles`. Both source layers must be included when the partner publishes; this PR does not merge the predecessor.

## Included behavior

- Contacts belong to a workspace and are readable/writable only by its operators. A contact can exist without an account. Overlapping categories, relationship context, a responsible operator, next action/date, optional existing member/task links, search, history and archive/restore are included. Linking an account grants no access. Client exports do not include contacts.
- Communities have independent manager/member memberships. Creating a community enrolls only its creator as manager; existing platform operators retain their existing platform authority. No community or account is seeded by the migration.
- Each member controls their introductory profile and explicitly opts into the directory. Auth emails are not directory fields. Resources and voluntary requests can be drafted/published/discussed; announcements are manager-only. Comments retain their original post context.
- Event versions and yes/maybe/no responses are separate. A changed event requires a new response; earlier versions/responses remain in history.
- Members can suggest a participant. Only a manager can review the suggestion and send an invitation. Confirmed matching email acceptance creates community access only. Revocation and archived communities deny later member reads and writes.
- The interface supports English/Ukrainian, existing drafts/conflicts, desktop and mobile navigation. Contacts use the selected workspace; community-only accounts do not receive workspace menus or shared-history export.

Paid membership/learning, external calendar sync, Telegram reminders, automatic enrichment, graph visualization and MOTN OS/Linkora integration remain deferred.

## Prerequisites and order

1. Use only the assigned Platum Supabase project and canonical Vercel application. Preserve the cleaned `Platum Team` and real founder accounts.
2. The predecessor `20261017110000_platform_roles.sql` is recorded as applied in production. Confirm normal migration history, then apply **only the new additive** `supabase/migrations/20261017230000_contacts_and_community.sql` through the normal migration path. Do not replay the cleanup or reset data. The new migration creates empty structures/functions/policies; it grants no real community access.
3. Publish the reviewed `codex/community-contacts` source together with its Node API. The new frontend requires the new tables/RPCs. Publishing the frontend first will show a missing-database-update error. The branch includes the predecessor founder API/UI changes that are not yet published.
4. Keep the existing server environment names and canonical callback: `PLATUM_SUPABASE_URL`, `PLATUM_SUPABASE_SERVICE_ROLE_KEY`, `PLATUM_APP_URL`. `api/community.js` uses them; no additional credentials or service are required.
5. Verify actual deployed source/alias and the new public asset. Confirm anonymous reads/RPCs, unassigned users, client/contact isolation, membership revocation and profile privacy. Use controlled synthetic identities only if separately permitted; real invitations are explicit account/access actions.

Existing SMTP remains deferred; a simulated or controlled delivery does not establish reliable external-client email. The API reports sent/failed/uncertain and retains an invitation for manual resend. No real invitations were sent for development.

## First use after release

Open **Communities → Create community** as a confirmed platform operator. Choose its name and purpose, then review access. Invite actual participants deliberately through **Manage community access**; this does not grant a client workspace. The invitee can open **Communities** after signing in with the matching email and publish their profile only when ready.

Open **Contact network** while the intended internal workspace is selected to maintain agency contacts. Do not put a client's private contact data into an unrelated workspace. No client/public contact-sharing switch is included in this first version.

## Local verification

    node --test tests/community-api.test.js tests/team-api.test.js tests/files-api.test.js tests/workspace-routing.test.js tests/calendar-domain.test.js tests/localization.test.js
    node scripts/check-integrity.js
    npm --prefix bot test

The PostgreSQL replay test accepts an externally supplied local PGlite module (pinned at 0.5.10 in CI), without adding a global integration or a production connection:

    PLATUM_PGLITE_MODULE=/absolute/local/path/to/@electric-sql/pglite node tests/network-database.cjs
    PLATUM_PGLITE_MODULE=/absolute/local/path/to/@electric-sql/pglite node tests/community-upgrade.cjs

With Playwright available through the local runtime:

    PLATUM_PGLITE_MODULE=/absolute/local/path/to/@electric-sql/pglite NODE_PATH=/absolute/local/node_modules node tests/network.browser.cjs

The browser harness serves only allowlisted application assets on loopback and connects the actual UI/API to synthetic local PostgreSQL. Auth and mail are simulated. It closes the browser/server/database at completion. Screenshots default to `/private/tmp/platum-network-evidence` or `PLATUM_NETWORK_SCREENSHOTS` outside Git. This is not hosted Supabase/email acceptance.

An older frontend remains compatible with the additive schema. If publication fails, preserve any new community/contact records and use a forward fix or the prior compatible frontend; do not drop the new tables as a rollback shortcut.
