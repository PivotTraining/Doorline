# Doorline — Performance Pass

Performance-engineer review of the client. Each issue below is something a
profiler (or a low-end phone in the field) would surface, with the fix applied.

## Issues found → fixes

### 1. Synchronous full-store serialization on every mutation  ⟵ biggest win
**Bottleneck.** `emit()` ran `localStorage.setItem(KEY, JSON.stringify(state))`
on *every* state change — synchronously, on the main thread. The store holds
homes, deals, street rows, posts, territories, and up to 600 GPS points/rep.
The hot callers are brutal: a **GPS breadcrumb every ~10s** and **every Street
Sheet keystroke** each re-serialized the entire store.

**Fix.** Decouple *notify* (cheap) from *persist* (expensive). `emit()` still
bumps the version and notifies React synchronously, but the localStorage write
is **coalesced into a single idle-time write** (`requestIdleCallback`, 1s
timeout fallback) and flushed on `pagehide`/`visibilitychange`. Many mutations
now cost **one** serialization instead of N. (`src/store.js`)

> Result: typing in the Street Sheet and the GPS firehose no longer touch
> `JSON.stringify` on the keystroke/tick path. Durability preserved via the
> flush-on-hide handlers.

### 2. Whole-tree re-renders from a single global subscription
**Unnecessary rendering.** `App` and `Shell` called `useStore()`, which
subscribes to *any* state change. So the sidebar, nav, topbar, and brand
re-rendered on every door drop, every breadcrumb, every keystroke — none of
which change the shell.

**Fix.** A granular `useSelector(selector, isEqual)` hook (re-renders only when
the selected value changes). The gate subscribes to `sessionId`; the shell
subscribes to a branding string + a tracking boolean. The active **page**
keeps its own `useStore()`, so data still updates — but only the page repaints,
not the chrome. (`src/store.js`, `src/App.jsx`)

### 3. Leaflet icons reallocated per marker per render
**Inefficient logic.** `doorIcon(hex)` / `repIcon(color)` built a new
`L.divIcon` for every marker on every render — dozens of allocations per map
repaint, churning GC.

**Fix.** Module-level icon caches keyed by color; an icon is built once and
reused. (`src/components/FieldMap.jsx`)

### 4. Street Sheet re-rendered all rows on every keystroke
**Unnecessary rendering.** Typing one cell re-rendered the whole grid (~20 rows
× ~10 controlled inputs) and reconciled every input.

**Fix.** Extracted a `memo`-ized `SheetRow` with **primitive props** and stable
`useCallback` handlers, so only the edited row re-renders. (Primitives matter:
the store mutates rows in place, so passing the row object would let memo skip
real updates.) (`src/pages/rep/StreetSheet.jsx`)

### 5. One 370 KB bundle — Leaflet loaded on the login screen
**Scalability / load.** Mapping libs (~150 KB) shipped in the initial chunk,
delaying first paint for every user including those who never open a map.

**Fix.** `React.lazy` + `Suspense` for the map-heavy pages (Doors, Team Map,
Territories). Leaflet now lives in an on-demand chunk.

| | before | after (initial) |
|---|---|---|
| main JS (gzip) | ~111 KB | **~60 KB** |
| Leaflet | in main | separate 45 KB chunk, lazy |

### 6. O(reps × homes) analytics on the client
**Scalability.** Leaderboard / accountability / office rollup filter all homes
or street rows per rep on each data change. Fine at demo scale (tens of reps,
thousands of rows) since the subscription model means this runs **once per data
change**, not per render.

**Strategy (already built for scale).** The production schema computes these as
**materialized views** (`mv_leaderboard`, `mv_accountability`, `office_rollup`)
refreshed by `pg_cron`, so the client reads a pre-aggregated result instead of
scanning — see `supabase/migrations/0003_*` and `docs/ARCHITECTURE.md`. The GPS
firehose is likewise downsampled server-side into `location_tracks` so the map
draws a simplified path, not raw points.

## Net effect
- Hot-path writes (keystrokes, GPS ticks): **no synchronous serialization**.
- Shell/nav: **0 re-renders** on data mutations (was: every mutation).
- Street Sheet: **1 row** re-renders per keystroke (was: all rows).
- Initial JS: **~46% smaller**; Leaflet loaded on demand.
- Map markers: **0 icon allocations** after warm-up (was: N per render).

## Profiling notes (how to verify)
- React DevTools Profiler → highlight updates: edit a Street Sheet cell; only
  that row and the totals footer flash.
- Performance panel → record while a rep is "tracking": no long tasks from
  `setItem` on the 10s tick.
- Network → the `TileLayer`/`FieldMap` chunks load only when a map opens.
