# Doorline — API Design

Three surfaces, one auth model (Supabase JWT carrying `sub`, `org_id`, `role`):

1. **REST resources** — PostgREST, auto-generated from the schema, guarded by RLS.
2. **RPC functions** — Postgres functions for transactional/aggregate operations.
3. **Realtime channels** — WAL-backed websockets for live collaboration.
4. **Edge functions** — custom HTTP for the GPS firehose and other non-CRUD work.

All IDs are **client-generated UUIDs** so writes are idempotent and offline-safe.

---

## 1. Auth

| Action | Call |
|---|---|
| Sign in | `POST /auth/v1/token?grant_type=password` `{ email, password }` → `{ access_token, refresh_token, user }` |
| Session | SDK `supabase.auth.getSession()` / `onAuthStateChange` |
| Sign out | `supabase.auth.signOut()` (also stops the location queue) |

The JWT's `org_id` + `role` claims drive every RLS check. A `profiles` row (1:1 with `auth.users`) holds the org membership and role.

---

## 2. REST resources (PostgREST)

Base: `GET|POST|PATCH|DELETE /rest/v1/<table>`. RLS scopes every row to the caller's org and role.

| Resource | Read | Write | Notes |
|---|---|---|---|
| `organizations` | own org | owner | branding (name, logo path), plan, Stripe ids |
| `profiles` | org | admin/owner | role, status, territory, seat price |
| `homes` | own (rep) / org (mgr+) | own (rep) / org (mgr+) | doors; `status`, `activity jsonb`, lat/lng |
| `deals` | own / org | rep inserts own | contract value |
| `territories` | org | manager/admin | `boundary geography(Polygon)`, schedule, color, `assigned_to` |
| `posts` | org | manager/admin | bulletin board |
| `door_activity` | own / org | rep | append-only funnel events |
| `location_tracks` | own / org | system | downsampled route per rep/day |

**Examples**
```http
# Drop / update a door (idempotent upsert by id)
POST /rest/v1/homes
Prefer: resolution=merge-duplicates
{ "id":"<uuid>", "org_id":"<uuid>", "rep_id":"<uuid>",
  "lat":33.749, "lng":-84.388, "addr":"123 Maple St", "status":"appt" }

# Team map doors (manager) — RLS returns the whole org automatically
GET /rest/v1/homes?select=id,lat,lng,status,rep_id,addr&status=neq.untouched

# Assign + schedule a territory
PATCH /rest/v1/territories?id=eq.<uuid>
{ "assigned_to":"<rep uuid>", "start_on":"2026-07-01", "end_on":"2026-07-07" }
```

---

## 3. RPC functions (`POST /rest/v1/rpc/<fn>`)

Used where a request needs a transaction or an aggregate that shouldn't be a client-side scan.

| Function | Args | Returns | Why RPC |
|---|---|---|---|
| `assign_territory(territory_id, rep_id)` | uuids | void | transactionally moves the assignment **and** syncs `profiles.territory`, clearing the prior rep. |
| `record_door_activity(home_id, type)` | uuid, text | activity row | append + touch `homes.updated_at` atomically. |
| `rep_accountability(org_id, day)` | uuid, date | rows: rep, minutes_on, doors_worked, points | reads matview, never an N-table scan. |
| `leaderboard(org_id, period)` | uuid, text | ranked rows | reads `mv_leaderboard`. |
| `set_consent(granted bool)` | bool | consent row | writes consent + audit in one tx. |

```http
POST /rest/v1/rpc/assign_territory
{ "territory_id":"<uuid>", "rep_id":"<uuid>" }
```

---

## 4. Realtime channels

Subscribe per org; the server only emits rows the caller may see (RLS-filtered).

| Channel | Source | Client effect |
|---|---|---|
| `org:<id>:homes` | `homes` INSERT/UPDATE | live door pins on Team Map |
| `org:<id>:deals` | `deals` INSERT | live deal feed / KPIs |
| `org:<id>:posts` | `posts` INSERT/DELETE | bulletin updates |
| `presence:org:<id>` | Realtime presence | live rep dots (last-known position) |

```js
supabase.channel(`org:${orgId}:homes`)
  .on('postgres_changes', { event:'*', schema:'public', table:'homes', filter:`org_id=eq.${orgId}` },
      (p) => store.applyRemoteHome(p.new))
  .subscribe()
```

---

## 5. Edge function — `ingest-locations` (the firehose)

```http
POST /functions/v1/ingest-locations
Authorization: Bearer <jwt>
{ "points": [ { "lat":33.7491, "lng":-84.3881, "ts":"2026-06-27T15:00:03Z" }, … ] }   // batched 10–30s
→ 202 { "accepted": 18 }
→ 403 { "error": "consent_inactive" }     // server-side consent gate
→ 429 { "error": "rate_limited" }
```

- Validates JWT, looks up `rep_id`/`org_id` from the token.
- **Rejects without an active consent row** (legal gate enforced in the backend, not the client).
- Single multi-row insert into the current `locations` partition; updates Redis `last_known:{rep}` + Realtime presence.
- Rate-limited per rep (Redis token bucket) to cap abuse/runaway clients.

The client side of this contract is `src/api/locationQueue.js`: buffer → batch → POST → on failure, retain and retry with backoff (offline-safe).
