# Contacts and community delivery

The approved first implementation extends the existing Platum application. Delivery is through the partner's GitHub/Supabase/Vercel process. This document is a release guide; `PROJECT_STATE.md` holds the current implementation checkpoint.

Production delivery was completed on 2026-10-20. The steps below record its order and must not be replayed on the existing production project. See `PROJECT_STATE.md` section 12 for the live verification and the manual repair of the predecessor's missing migration-history row.

## Cabinet personalisation and navigation — release guide

Source branch `codex/cabinet-personalization` extends the existing cabinet and configured navigation. `PROJECT_STATE.md` section 15 holds the implementation checkpoint. Production delivery is recorded in section 15. The steps below are release guidance; do not replay migrations already present in the assigned project.

Review: [merged PR #4](https://github.com/projects-workspace/platum/pull/4), merge `c42791a`, reviewed reconciliation head `4a64c31`. The published package includes `workspace-navigation.js` and matching entry/shell/data assets; exact deployment and verification evidence are in `PROJECT_STATE.md` section 15.

- Personal/project navigation is separated, with configured module order preserved, scoped next actions and current-role tool visibility. These are presentation changes; authorization remains server-side. Common Platum pages retain their existing identity.
- Welcome text and the three existing palettes use the current settings path. A logo is optional and requires a ready, explicitly client-visible PNG/JPEG/WebP from the same workspace. Upload/share it through Files first; choosing it does not change file permissions. Clients cannot edit appearance.
- Apply only missing `20261021180000_workspace_branding.sql` through the existing transactional process after confirming the current migration chain. It adds no tables or seed data, preserves old callers/preferences and keeps the original settings/calendar wrapper and grants. Do not replay earlier migrations, repair or cleanup. The logo selector alone waits for this optional capability; ordinary navigation/settings continue without it.
- After an approved source merge, verify the matching Vercel source and canonical URL. The CSP change permits blob images without adding script/frame origins. Verify shared logo delivery as an assigned client, rejection of private/cross-project/wrong-type logo references, failure fallback/removal, common-page identity, client/collaborator menus, current section disclosure and mobile keyboard/touch behavior. No real users/invitations or membership changes are needed incidentally.
- No new provider, integration or public Storage bucket is required. Existing Supabase/Storage/Auth and the file API are reused; local synthetic bytes are not proof of hosted acceptance or approval of a real customer's branding.

Additional local checks:

    node --test tests/navigation.test.js tests/branding.test.js
    PLATUM_PGLITE_MODULE=/absolute/local/path/to/@electric-sql/pglite node tests/branding-database.cjs

The existing guarded browser harness also covers this package and missing-branding-schema behavior. Its fixture PNG is synthetic; choosing a real logo is a deliberate later project action.

## Personal privacy and account cabinet — predecessor package

The owner accepted the initial personal privacy/access model and authorized implementation after PR #2. Source branch: `codex/personal-privacy`, based on `main` `c46a9ac`. `PROJECT_STATE.md` section 14 is the current implementation checkpoint. This section supersedes the old PR #2-only publication prompt; previous procedures below remain historical or describe the predecessor.

Review: [merged PR #3](https://github.com/projects-workspace/platum/pull/3), merge `f97e5f7`, reviewed head `e839426` including the readiness guard. GitHub runs `39577251646` and `39577258001` passed. Publish from the matching `origin/main`, preserving the partner release record. This merge task performed no SQL or manual Vercel deployment.

Predecessor release update: partner checkpoint `3669ff3` records PR #2's `20261021120000` migration and matching Vercel source as published. Confirm this history rather than replaying it. The remaining privacy migration is `20261021160000`. Git deployments from `main` are enabled, so the frontend now keeps prior work available while a missing privacy RPC is reported as pending; privacy controls and attachment archives wait for schema readiness. This guard is not hosted privacy acceptance.

### Privacy and ownership contract

- One existing Auth account owns its personal contact book and calendar entries. No personal/client workspace is created automatically; existing workspaces remain work contexts. Unassigned confirmed accounts can use their own cabinet without gaining workspace access.
- Raw personal contacts/calendar rows are owner-readable only, with forced RLS and no direct browser writes. Recipient contact reads use an RPC projection: only chosen fields are returned; named users or the selected workspace's agency operators may receive a separate edit grant. Global platform roles do not bypass these restrictions. Edit rights cover only granted fields, and cached replies are reprojected against current permissions.
- Sharing the whole book means the current active contacts only, excluding hidden/archived and future contacts. It does not change ownership. A contact can remain unregistered. Neither automatic merge nor personal-contact/account matching is implemented. Agency contact links require deliberate operator verification; this attests a human check, not independently proven identity.
- Busy/free/unavailable slots are visible to current explicit workspace coworkers. Private entry IDs, titles, notes, locations and original timezones are absent from that projection. Full shared-event details require named participants with current coworker access. Community-only membership does not disclose personal availability. Opt-in community names use chosen profile aliases rather than private Auth names.
- Applications start disabled for existing communities. An application grants no access; an existing manager approves/rejects it. Recommendations and invitations retain manager control. Leaving/revoking community membership does not change independent workspace roles. Ending work does not delete personal books or revoke unrelated community membership.
- Client access closure requires an operator acknowledgement that an export was offered. This is not a download receipt or a new automatic notification. Exports preserve the authorized collaboration projection and freshly checked file bytes. Keep every ZIP volume plus the final manifest; `NOT_INCLUDED` is explicit incomplete delivery. External links stay links. Previously closed access cannot be restored through export, and bytes already downloaded cannot be recalled.

### Ordered migration and publication

1. Confirm that the reviewed privacy source is on the branch/revision approved for release. If it is still only in an unmerged PR, obtain the intended source through the agreed review process; do not deploy an unrelated `main` revision.
2. Read the assigned Platum migration history. If still missing, apply `20261021120000_community_participation.sql`, then `20261021160000_personal_privacy.sql`, through the normal transactional migration process. Do not replay the 2026-10-17 founder/contact migrations, the one-time history repair or cleanup. The new privacy migration creates empty tables/functions/policies and preserves existing records; it seeds no person, membership, content or invite.
3. Verify forced RLS/owner-only raw reads, authenticated projection/mutation grants, service-only review/offboarding commands and the export wrapper. No new provider, credentials or integration is required. Publication must follow schema readiness: the new frontend calls `platum_personal_data`/`platum_personal_mutate` and uses new static assets.
4. Publish the matching source/API to the existing Vercel target and verify exact commit/deployment and `https://client-cabinet.vercel.app`. Confirm `workspace-personal.js` and `workspace-archive.js` are served, while private sources, migrations and state documents remain unavailable.
5. With authorized test sessions verify default-private books even for founders, field-limited read/edit/revoke and cached retries, private/busy/shared calendar views, application approval/exit, an attachment archive and client access closure. Explicitly report unavailable hosted/Auth/mail/Storage journeys. Do not create/invite real people or remove real memberships as an incidental smoke check.

### Короткий промпт для Codex партнера

> Онови Platum з `origin/main` після merge PR #3. Прочитай `PROJECT_STATE.md` §14 і `docs/NETWORK_RELEASE.md`. У призначеному Supabase звір історію: `20261021120000` уже записана як застосована; застосуй лише відсутню `20261021160000_personal_privacy.sql` після підтвердження передумов. Старі міграції, repair і cleanup не повторюй. Потім перевір можливий автодеплой і онови matching source/API у наявному Vercel на `https://client-cabinet.vercel.app`. Перевір приватність, календар, заявки й експорт на дозволених тестових сесіях. Реальних акаунтів, запрошень чи видалень побічно не роби. Запиши в `PROJECT_STATE.md` commit, міграцію, deployment і PASS/NOT_RUN.

### Additional local checks

    node --test tests/archive.test.js tests/export.test.js
    PLATUM_PGLITE_MODULE=/absolute/local/path/to/@electric-sql/pglite node tests/personal-database.cjs
    PLATUM_PGLITE_MODULE=/absolute/local/path/to/@electric-sql/pglite node tests/personal-upgrade.cjs

The expanded existing `tests/network.browser.cjs` exercises frontend → real local community/file handlers → PostgreSQL/RLS, with synthetic Auth, email and Storage bytes. ZIP interoperability/CRC is also checked with a separate reader. This does not establish production email delivery or hosted authorization acceptance.

## Agency publishing and voluntary participation — merged predecessor

The user approved only planning steps 1–2 on 2026-10-21: reconcile the current state and refine community behavior. Contact sharing, personal privacy rules, admission/offboarding redesign and integrations remain outside this change. The new source is based on `origin/main` checkpoint `1166851`, which records the completed first release.

Review: [merged PR #2](https://github.com/projects-workspace/platum/pull/2), merged into `main` as `31c03c3` on 2026-10-21 after explicit owner authorization. Implementation `bae4d4d`, reviewed head `b7ce5ec` and main merge checks passed. Production publication remains a separate partner action. A post-merge GET still serves the prior network asset; the new participation-table REST endpoint returns `404 / PGRST205`.

The current partner prompt and full pending migration order are in the personal-privacy section above.

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

## First release behavior — historical, 2026-10-20

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
