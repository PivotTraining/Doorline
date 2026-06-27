# Doorline — System Architecture

> Senior-architect view of the production system, and the minimal slice we ship first.
> The running app (React SPA + localStorage demo) is the **client** of this system; the
> design below is what the demo's `DEMO`-gated write-through hooks connect to in production.

## 1. Goals & constraints

| Driver | Implication |
|---|---|
| Multi-tenant SaaS (many sales orgs) | Hard tenant isolation; `org_id` on every row; RLS. |
| Field-first, flaky networks | Offline-first client, idempotent writes (client-generated UUIDs), write queue. |
| **GPS firehose** (N reps × 1 point / 5–10 s) | This is the scaling crux — separate ingestion path, batching, partitioned time-series, downsampling. |
| Live collaboration (admin ↔ rep) | Realtime channels per org; presence for live dots. |
| Consent & legal (location) | Consent gate enforced server-side; audit trail; retention/TTL. |
| Small team, fast to production | Buy managed infra (Supabase + Vercel); keep an escape hatch to peel hot paths into dedicated services. |

## 2. Technology choices (and why)

- **Client:** React SPA (Vercel/CDN) today; React Native rep app next (same API). Offline cache + write queue.
- **Backend platform:** **Supabase** = managed **Postgres + PostGIS**, **Auth** (JWT), **PostgREST** (auto REST from schema), **Realtime** (WAL → websockets), **Edge Functions** (Deno), **Storage** (logos). Rationale: a secure multi-tenant API falls out of the schema + **RLS** with almost no bespoke backend, and it scales comfortably into low-millions of rows. When a hot path outgrows it, we peel it out (see §8).
- **Cache/hot state:** Redis (Upstash) for last-known location, rate limits, sessions, and expensive query memoization.
- **Maps:** vector tiles via CARTO (prototype) → Mapbox/Google + Regrid parcels (production), all CDN-cached. Geocoding via provider behind a DB `geocode_cache`.
- **Async/background:** `pg_cron` (or a small worker) for materialized-view refresh, location downsampling, and retention.

## 3. System context

```
              ┌──────────────────────────────────────────────────────────┐
              │                        CLIENTS                            │
              │   Web SPA (Vercel/CDN)        React-Native rep app        │
              │   admin console + portal      background GPS, offline      │
              └───────────────┬───────────────────────┬──────────────────┘
                              │ HTTPS / WSS            │ batched HTTPS (GPS)
                  ┌───────────▼───────────┐  ┌─────────▼──────────────┐
                  │  PostgREST (auto API) │  │  Edge Fn: ingest-      │
                  │  + Realtime (WSS)     │  │  locations (validate   │
                  │  RLS on every row     │  │  consent, batch insert)│
                  └───────────┬───────────┘  └─────────┬──────────────┘
        ┌─────────────────────┼────────────────────────┼───────────────┐
        │                     ▼                         ▼               │
        │  ┌────────────┐  ┌───────────────┐  ┌──────────────────────┐  │
        │  │   Redis    │  │  Postgres +   │  │ locations (partitioned│  │
        │  │ hot cache  │  │  PostGIS      │  │ by month, BRIN ts)    │  │
        │  │ last-known │  │ orgs, profiles│  │  → downsample →       │  │
        │  │ ratelimit  │  │ homes, deals, │  │  location_tracks      │  │
        │  └────────────┘  │ territories…  │  └──────────────────────┘  │
        │                  │ + matviews    │                            │
        │                  └───────────────┘   Storage (logos)          │
        │             DATA TIER                                         │
        └──────────────────────────────────────────────────────────────┘
                  ▲ pg_cron: refresh matviews · downsample · retention
```

## 4. Component structure

**Client (this repo):**
```
src/
  store.js            in-memory cache + optimistic UI (single source the components read)
  supabaseClient.js   client + DEMO switch
  api/                production data layer (gated by DEMO)
    auth.js           Supabase Auth wrapper (sign-in/out, session, profile claims)
    mappers.js        pure camelCase(state) ⇄ snake_case(row) — unit-tested
    services.js       typed CRUD per resource (homes, deals, posts, territories…)
    realtime.js       per-org channel subscriptions → store
    locationQueue.js  offline-safe GPS batcher (enqueue → flush → backoff) — unit-tested
    cache.js          TTL + stale-while-revalidate memo cache — unit-tested
    bootstrap.js      live-mode: hydrate store from Supabase + subscribe realtime
```

**Backend:**
```
supabase/
  migrations/         authoritative schema (RLS, partitions, matviews, functions)
  functions/
    ingest-locations/ Deno edge function: consent check + batched location insert
```

## 5. Data flow (four representative paths)

**A. Rep logs a door (write path, offline-safe)**
1. Component calls `setDoor(id, fields)` → store updates optimistically, emits, UI repaints instantly.
2. `services.upsertHome(row)` upserts by **client-generated UUID** (idempotent; safe to retry from the offline queue).
3. Postgres WAL → Realtime → admin's open Team Map updates within ~1 s.

**B. GPS firehose (the hard path)**
1. Mobile app samples location, appends to a local ring buffer.
2. Every 10–30 s (or on reconnect) it POSTs a **batch** to `ingest-locations`.
3. Edge Fn validates JWT + **active consent**, drops the batch into `locations` (current monthly partition) in one multi-row insert; updates Redis `last_known:{rep}`.
4. `pg_cron` downsamples raw points into `location_tracks` (Douglas–Peucker-simplified path) every few minutes; raw partitions age out per retention policy.
5. Team Map reads the simplified `location_tracks` (cheap) and live dots from Redis/Realtime presence.

**C. Admin opens Team Map (read path)**
1. SWR cache returns last good data instantly, revalidates in background.
2. `homes`/`deals`/`territories` via PostgREST (RLS-scoped to org); `location_tracks` for routes; presence channel for live dots.

**D. Leaderboard / accountability (analytics)**
1. Served from **materialized views** (`mv_leaderboard`, `mv_accountability`) refreshed on a schedule — never an N-table scan on the request path.
2. Cached in Redis with a short TTL; client SWR on top.

## 6. Caching strategy (multi-layer)

| Layer | What | TTL / invalidation | Purpose |
|---|---|---|---|
| **CDN** (Vercel) | SPA bundle, static assets | immutable hashed assets | zero-latency app load |
| **Map tiles** | CARTO/Mapbox tiles | provider CDN, long TTL | offload tile serving |
| **Client SWR** (`api/cache.js`) | resource reads (homes, deals, leaderboard) | stale-while-revalidate, 30–120 s | instant UI, fewer round-trips |
| **Client offline** (localStorage) | last good state + write queue | until synced | works with no signal |
| **Redis** | `last_known:{rep}`, rate limits, session, memoized analytics | seconds–minutes | keep the firehose & hot reads off Postgres |
| **DB matviews** | leaderboard, accountability, org rollups | `pg_cron` refresh (1–5 min) | analytics without request-time scans |
| **`geocode_cache` table** | address↔latlng by query hash | 30–90 days | avoid re-paying geocoder, dodge rate limits |

Write-through + optimistic UI keeps reads cheap; idempotent UUID upserts make retries from any cache safe.

## 7. Security & multi-tenancy

- **Isolation:** every domain row has `org_id`; **RLS** policies use `current_org_id()` / `current_role()` from JWT claims. A tenant can only ever read/write its own rows — enforced in the database, not the app.
- **Roles:** `owner > admin > manager > rep > viewer`. Writes to personnel/territories gated to admin/owner; reps write only their own homes/deals/locations.
- **Consent:** `ingest-locations` rejects writes without an `active` consent row; consent changes are audited; raw location retention is bounded (TTL) and tracking is session-scoped (stops at sign-out).
- **Secrets:** anon key is RLS-safe; service-role key only inside Edge Functions; logos in Storage with signed URLs.

## 8. Scaling tiers (what changes as we grow)

| Stage | Reps online | Bottleneck | Move |
|---|---|---|---|
| **MVP** | < 200 | none | Supabase + Vercel as-is; this migration. |
| **Growth** | 200–2k | location write volume | client batching + monthly partitions + BRIN; Redis last-known; matviews for analytics. |
| **Scale** | 2k–20k | Postgres write IOPS, matview refresh | peel ingestion into a dedicated service (Kafka/NATS → time-series store, e.g. Timescale/Clickhouse); read replicas; per-region. |
| **Large** | 20k+ | single-cluster limits | shard by org, regional cells, async analytics pipeline. |

The schema (org-scoped, UUID PKs, partitioned firehose) is forward-compatible with all of these — the escape hatch is to redirect the **location** path without touching the operational tables.

## 9. Observability & ops

- Structured logs from Edge Functions; `pg_stat_statements` for slow queries; Sentry on the client.
- SLO targets: door-write p95 < 300 ms (optimistic = instant perceived); ingestion accepts a batch p95 < 200 ms; Team Map first paint < 1 s (SWR).
- Backups: Postgres PITR; migrations versioned in `supabase/migrations`.

## 10. Minimal production version (what we ship now)

1. **Schema** — `supabase/migrations/*` applied to a Supabase project (PostGIS on).
2. **Auth** — Supabase Auth; `profiles` row per user carrying `org_id` + role.
3. **Data layer** — `src/api/*` wired into `store.js` write-through and a live `bootstrap()`; **off in demo, on when keys are present**.
4. **Firehose** — `locationQueue` (client) + `ingest-locations` (edge) + partitioned `locations` + downsample job.
5. **Caching** — client SWR + `geocode_cache` + leaderboard/accountability matviews.

Everything else (mobile app background GPS, Regrid parcels, Redis, dedicated ingestion service) is sequenced after, and the design above already accommodates it.
