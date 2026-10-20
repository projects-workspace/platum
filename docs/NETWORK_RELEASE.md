# Contacts and community delivery

The approved first implementation extends the existing Platum application. Delivery is through the partner's GitHub/Supabase/Vercel process. This document is a release guide; `PROJECT_STATE.md` holds the current implementation checkpoint.

Production delivery was completed on 2026-10-20. The steps below record its order and must not be replayed on the existing production project. See `PROJECT_STATE.md` section 12 for the live verification and the manual repair of the predecessor's missing migration-history row.

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

With Playwright available through the local runtime:

    PLATUM_PGLITE_MODULE=/absolute/local/path/to/@electric-sql/pglite NODE_PATH=/absolute/local/node_modules node tests/network.browser.cjs

The browser harness serves only allowlisted application assets on loopback and connects the actual UI/API to synthetic local PostgreSQL. Auth and mail are simulated. It closes the browser/server/database at completion. Screenshots default to `/private/tmp/platum-network-evidence` or `PLATUM_NETWORK_SCREENSHOTS` outside Git. This is not hosted Supabase/email acceptance.

An older frontend remains compatible with the additive schema. If publication fails, preserve any new community/contact records and use a forward fix or the prior compatible frontend; do not drop the new tables as a rollback shortcut.
