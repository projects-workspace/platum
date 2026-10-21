# Platum

Platum, previously developed as Cabinet and Client Cabinet, is an independent, agency-neutral client-service workspace. One authenticated workspace connects a client and the assigned project team around the same project context, tasks, requests, responses, materials, and activity history.

Agency websites remain separate projects. They can link to Platum but must not share source code, authentication state, or client data with this repository.

Production target: <https://client-cabinet.vercel.app>

**Current implementation snapshot:** [PROJECT_STATE.md](PROJECT_STATE.md). This README remains the setup, local-check, and release guide.

The source includes a client portal, an Agency OS interface, normalized Supabase migrations, and deployment configuration. Source and configuration files do not establish the current hosted application, database, Auth, membership, or integration state. Recheck the relevant provider before making release decisions; the procedures below are guidance, not a live status report.

## MVP workflow

The MVP centers on an authorized client and project team sharing workspace context, tasks, requests, and responses. See PROJECT_STATE.md for the current implementation, persistence boundaries, and verification checkpoint.

## Application boundary

Platum is an independent, agency-neutral platform. Agency websites and marketing pages stay in their own projects and connect through external links or documented integrations. See AGENTS.md for repository boundaries and PROJECT_STATE.md for the current code map and implementation boundaries.

## Local verification

For the authenticated collaboration workspace, server setup, file access, and the full local Auth/data journey, see [Collaboration setup and verification](docs/COLLABORATION_SETUP.md).

Run the repository and bot checks:

```sh
node scripts/check-integrity.js
node --test tests/team-api.test.js
npm --prefix bot test
```

For the approved contacts/closed-community extension, its schema prerequisites, local PostgreSQL/browser checks and partner release handoff are in [Contacts and community delivery](docs/NETWORK_RELEASE.md). Source implementation does not establish a hosted release.

The accepted personal privacy/access extension reuses the same account/workspace shell and calendar. Its source, ownership/field-sharing contract, attachment archive and ordered pending migrations are described in PROJECT_STATE.md section 14 and the same release guide. No personal workspace, external integration or provider is automatically created.

The original deterministic mock remains a legacy UI fixture:

```sh
node scripts/mock-platum-api.js
```

Then open these test identities on `http://127.0.0.1:4177/client-space.html`:

- `?test-user=client-a#questions` — assigned client in workspace A.
- `?test-user=operator-a` — assigned administrator in workspace A.
- `?test-user=client-b#questions` — client in isolated workspace B.
- `?test-user=outsider` — authenticated user with no membership; access must be denied.

The `test-user` path is accepted only on localhost and only when the local test configuration supplies it. It is absent from production configuration.

For full local database verification, Docker and the Supabase CLI are required:

```sh
npx supabase@latest start
npx supabase@latest db reset
npx supabase@latest test db
```

## Platum Supabase activation

This is a first-time setup or recovery checklist, not evidence that Platum is currently unconfigured. Verify the existing Platum project and live state before any environment-changing action.

Use only the Supabase project assigned to Platum. Do not reuse another ecosystem project's database, key, users, or service credentials.

1. Sign in to the Platum-owned Supabase account and link this repository to that project.
2. Confirm the project reference before applying anything.
3. Run a clean local reset and the pgTAP isolation suite.
4. Review the migration diff, then apply the migrations to the Platum project.
5. Keep public signup disabled. Invite real test users through a trusted administrative path.
6. Provision one workspace plus explicit owner/admin/team/client memberships. Do not authorize users from browser-controlled metadata or Telegram usernames.
7. Run the RLS tests and Supabase security/performance advisors.
8. Put only the Platum API URL and publishable key in `client-space.config.js`. Never place a secret or service-role key in the browser.
9. Configure the production Site URL and exact redirect allow list.
10. Browser-test the full journey with two client identities and one operator, including reload/new-session persistence and direct cross-workspace denial.

## Release checks

These are release criteria, not confirmation of current production status.

Before production release:

- verify real email and any enabled OAuth login;
- verify anonymous, uninvited, client, team, administrator, and cross-client RLS behavior;
- verify a client request, operator reply, client reload, and corresponding database activity records;
- deploy the exact reviewed revision to Vercel and verify the production URL;
- configure Render and Telegram only if they are part of the release journey;
- complete the separately authorized containment work for data previously exposed in repository history and the legacy Apps Script deployment.

No Git-history rewrite, credential rotation, endpoint shutdown, database migration, or deployment is performed by the local setup commands above.

## Protected local material

Private source and temporary folders are ignored and must not be committed. Preserve any required client source in an approved private backup before separately authorized repository sanitation.
