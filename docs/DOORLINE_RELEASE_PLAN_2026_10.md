# Doorline rollout: tenant enrollment, street sheets, shift GPS, and closeouts

## Release gate

This branch is implementation work, NOT a production release. The Doorline Vercel project has
production Supabase environment variables, but the currently accessible Supabase connection
does not expose Doorline's database. The SQL migration has therefore NOT been run or verified
against the production database. Do not merge/deploy live until the checklist below is green.

## Deployment order

1. Confirm the Doorline Supabase project ID using the Doorline Vercel VITE_SUPABASE_URL
   in the owner's Vercel environment settings. Do not disclose the anon key or any service key.
2. Obtain authorized access to that exact Supabase project, not a different app's database.
3. Verify schema migrations 0001-0018 exist, along with the service-role edge functions
   currently used to add agents and ingest GPS; back up the database before alterations.
4. Apply `supabase/migrations/0019_company_invites_presence_closeouts.sql` to the
   Doorline database. Keep `0018_open_signup_joins_org.sql` only as migration history:
   migration 0019 replaces its insecure trigger.
5. Confirm `public.company_invites`, `public.agent_presence` and
   `public.daily_submissions` exist with RLS enabled, appropriate grants, and that
   `agent_presence` and `daily_submissions` are in the `supabase_realtime` publication.
6. Deploy this application branch to a protected preview environment configured with
   the same *staging* schema. Do not enable self-service invitations on an unpatched database.
7. Validate each acceptance case below with test organizations and consenting test agents.
8. Only after manual checks and a green CI build, merge and promote to production.

## Agent enrollment

- On Personnel, an owner/admin generates an enrollment link. Tokens are 256-bit random,
  stored only as SHA-256 hashes in the database, valid for 14 days and up to 25 enrollments.
- The link opens `/app?invite=<token>`; it displays the server-validated company name.
- The `auth.users` trigger atomically validates the invitation and provisions a rep
  profile under that invitation's org, never under the first/oldest org.
- Signup without an invitation can only bootstrap the very first organization. If the
  platform must support independent new-company self-service onboarding, that is a separate
  owner-provisioning flow and needs its own abuse/identity controls.
- Current Doorline is a web app/PWA with an installable manifest, not a native
  App Store / Play Store download. The invitation link works directly in mobile browsers;
  agents may add Doorline to their device's home screen.

## Live map

- The browser requests actual location permissions before starting the shift.
- Agent presence is stored under the agent's authenticated org and broadcast via Realtime
  to authorized company admins. Signout writes `online=false` and clears coordinates.
- An unexpected tab closure or network failure cannot transmit a signout; a 90-second
  freshness limit hides stale locations. Browsers cannot guarantee background GPS tracking.
- The route simulator is limited to DEMO builds and never feeds production map locations.

## Daily closeouts

- The Street Sheet guards creation of new blank slots to prevent duplicate records
  from typing or tapping before the next React render.
- The agent reviews the existing disposition counts and adds shift notes, then submits.
- A `daily_submissions` receipt is written using the existing durable write queue, so
  offline closeouts retry when connectivity returns; the UI must surface pending writes.
- Admins use Daily Closeouts to view status, per-agent counts, notes, and export a company
  CSV for a chosen day. CSVs include one row for an agent with no doors.

## Manual acceptance tests

- [ ] Create invitations from Company A and Company B and verify each agent joins only
      the originating company. Try an expired, exhausted, invalid, and missing token.
- [ ] Verify a newly signed-up rep is never an owner and cannot issue new invitations.
- [ ] Verify a rep from Company A cannot read or update Company B's people,
      street rows, GPS presence, and daily closeouts through the API.
- [ ] On an iPhone and Android device, enter a Street Sheet row quickly while tapping
      flags and switching fields; confirm exactly one row per slot on the manager account.
- [ ] Toggle airplane mode during edits. Restore connectivity and confirm all queued
      changes are saved, including linked deals and closeout submissions.
- [ ] Deny GPS permission and confirm no live location appears. Grant permission,
      start a shift, confirm a real coordinate appears on the correct company map.
- [ ] Sign out and confirm the marker disappears. Force-close the browser and confirm
      the marker expires after 90 seconds even if a signout is not received.
- [ ] Submit a shift with a callback, sale, and manager note. Confirm the admin sees
      the correct dispositions and the exported CSV contains the same source data.
- [ ] Reopen the shift, correct the entry, resubmit, and confirm company totals update.
- [ ] Verify existing report uploads, personnel changes, and regular sign-in still work.
- [ ] Run Supabase security/performance advisors against the Doorline project;
      inspect findings and confirm RLS with separate users before going live.

## Known constraints

The web application cannot provide native background GPS when closed. Stale or denied
locations are not invented. The currently available Supabase integration cannot verify
the Doorline database, and passing front-end build tests is not an end-to-end backend test.

## Offline, security and release notes (continuation)

- In live mode, `doorline_state_v1` is no longer used as a shared cache of
  company records. Demo mode still uses that key. Tenant- and agent-specific
  pending mutations live in the v2 offline write queue.
- The older `doorline_write_queue_v1` is deliberately not replayed into the
  new scoped queue: its originating user/org cannot be established from the
  shared key. For installations with outstanding offline work, reconcile
  local entries against a signed-in owner's verified server records before
  clearing browser data. Do not silently discard or migrate these records.
- Switching agents pauses the old user's outstanding queue. A future session
  for that same agent can resume its own queue, but a different company's
  account cannot inherit it.
- Reconnect snapshots overlay pending local Street Sheet changes, and stale
  Realtime updates cannot overwrite still-queued edits.
- Submitting a daily closeout locally now shows "queued for sync" until the
  durable write has been accepted. Do not claim a company received it while
  offline.
- A prior migration's permissive RLS street and home writes are tightened;
  new writes must point to records in the authenticated company. A unique
  street-slot index deduplicates preexisting colliding entries by clearing
  the later slot number *without deleting the underlying row*.
- Sign-out is serialized with a subsequent browser account switch; tracking
  stops on unmount and location credentials are not reused across tenants.

### Release constraints discovered

The Doorline Vercel project currently lists its Supabase URL and anon-key
variables for **production** only. Review the preview environment before
testing live Supabase integration. Do not copy the production configuration to
preview without a deliberate staging plan and verified migration.

CI runs JavaScript tests and a Vite build. SQL validity tests are structural
checks only; they do not run the migration inside PostgreSQL and do not test
Postgres RLS execution or tenant boundary isolation. Those remain manual
release blockers.

## Security and smoke-test remediation (October 27, 2026)

- Migration 0020 `supabase/migrations/0020_active_agent_rpc_hardening.sql`
  replaces an unsafe `record_door_activity` SECURITY DEFINER implementation:
  an authenticated agent may update only authorized doors belonging to their
  organization; reps are restricted to their assigned doors.
- Inactive/deactivated users lose `current_org_id()` and `current_user_role()`
  scope immediately even with still-valid JWTs; `set_consent` now requires an
  active rep. Maintenance functions are no longer executable by app roles.
- Both Supabase Edge Functions validate that the caller's profile is active.
  GPS ingestion rejects invalid coordinate values, invalid timestamps,
  non-arrays, and oversized or partially invalid batches.
- Both browser-called Edge Functions now respond to OPTIONS and include CORS
  headers on every response. Without this, browser-based team creation and
  GPS upload fail at preflight.
- GPS buffer now serializes concurrent flushes and preserves partially
  accepted samples. CSV exports escape dangerous user-entered spreadsheet
  formulas in fields and column headings. New `test/security-smoke.test.mjs`
  covers these cases.
- Failed initial Supabase hydration clears tenant context, old subscriptions,
  and retry timers instead of retaining a half-open previous session.
- `supabase/tests/doorline_smoke_readonly.sql` can be run in Doorline's SQL
  Editor to verify policy and schema presence, tenant IDs, and RPC privilege
  hardening without mutating any records.

### Execution and production blockers

**Not a live penetration test.** Supabase connector calls currently fail with
`link_id must identify an eligible linked account`. CI security tests inspect
source and exercise pure client-side functions, not a production Postgres
connection. Edge TypeScript functions have not been deployed/tested in
Doorline's Supabase environment, and browser GPS has not been tested with real
user accounts.

Before production launch, run migrations 0019 and 0020 in order on a backed-up
Doorline database, execute `doorline_smoke_readonly.sql` and examine failures,
deploy both Edge Functions, and test authenticated browser calls including
OPTIONS preflight, active/deactivated agents and two-company RLS isolation.
Only then consider merging PR #5 or promoting a Vercel deployment.
