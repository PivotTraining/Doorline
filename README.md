# Doorline — the app

The working product: a React web app with real maps, login, an admin console, and a rep portal that all share one data store. It runs in your browser with no backend (data saves to local storage), and flips onto Supabase for real multi-device sync when you add keys.

## Run it

```bash
npm install
npm run dev
```

Open the local URL it prints (usually http://localhost:5173). It opens on the login screen.

**Demo logins** (or use the quick-login buttons):

- Admin / Owner: `admin@doorline.app` / `admin`
- Field Rep: `jordan@doorline.app` / `rep`

## See the full loop

1. Quick-login as the Field Rep.
2. Open **Map / Doors**. You get a real street map (toggle Streets / Satellite).
3. Search an address, tap **My location**, or tap any house to drop a door.
4. Pick an outcome: Not home, Come back, Appointment, Not interested, or **Sold** (Sold opens the deal form). Add notes.
5. Check **Follow-ups**, **My Deals**, **Leaderboard**.
6. Sign out, quick-login as **Admin**. Your doors, activity, and deals are all there under **Team Map**, **Activity Sheet**, and **Deals**, because both sides share the same store.
7. In **Personnel**, add / edit / deactivate / remove users. **Billing** updates live.

Because the store persists to local storage, what the rep did is still there when you log in as admin in the same browser.

## Maps

The map is **Leaflet** with free **OpenStreetMap** street tiles, an **Esri** satellite layer, geolocation, and address geocoding via OpenStreetMap's **Nominatim**. These call the internet from your browser, so the map needs a connection. Free tiers are fine for a prototype but rate-limited; for production move to Mapbox or Google Maps with an API key, and add the Regrid parcel layer so every property loads automatically.

## Go live with Supabase (multi-device sync)

1. Create a Supabase project, run `supabase/schema.sql` (needs the `postgis` extension).
2. Copy `.env.example` to `.env`, fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. The app leaves demo mode automatically. The store's action functions (`src/store.js`) already have the write-through hook points; wire each to its Supabase insert/update and add a Realtime subscription so reps and admins on different devices see each other live.

## Features

- **Company branding** — admins upload a logo and set the company name (Settings); it shows app-wide and on sign-in.
- **Bulletin board** — admins/managers broadcast announcements to the whole team; the latest shows on each rep's My Day.
- **Light / dark themes** — lighter sky-blue palette, light by default, with a one-tap toggle in the top bar.
- **Route tracking + accountability** — with a consent gate on sign-in, Doorline records each rep's route while signed in (real GPS when available, simulated in the browser demo) and stops on sign-out. The Team Map draws each rep's path and an accountability table (time on the clock vs. doors worked).
- **Door activity funnel** — reps tap Knocked → Contact made → Presentation made → Follow-up set on each door, on top of the final outcome.
- **Territory scheduling & zones** — managers assign and date-schedule territory blocks to reps (the assignment updates the rep's territory everywhere), and draw each territory's boundary on the map — by tapping vertices or by loading a **ZIP code's outline**. Zones render on the Team Map and on the assigned rep's map.

> Note on tracking: a browser can only record location while the app is open. True background GPS (screen off, app closed) requires the native mobile rep app — sequenced next in the sprint plan. Continuous location tracking has legal/consent requirements; review with counsel before tracking real reps.

## Structure

```
src/
  store.js              shared data + actions (localStorage now, Supabase-ready)
  supabaseClient.js     client + DEMO switch
  theme.js              light/dark preference (per device)
  App.jsx               shell, login gate, role-based nav, theme toggle
  components/
    FieldMap.jsx        Leaflet map: streets/satellite, geolocate, geocode,
                        drop door, disposition, live rep dots, route polylines
    DoorEditor.jsx      activity funnel + disposition + deal capture modal
    RepTracker.jsx      consent gate + GPS breadcrumb recorder
    Modal.jsx
  pages/
    Login.jsx  Bulletin.jsx
    rep/   MyDay, Doors, FollowUps, MyDeals, Leaderboard, Profile
    admin/ Personnel, TeamMap, Territories, ActivitySheet, Deals, Billing, Settings
supabase/schema.sql     Postgres schema + RLS + homes/deals tables
```

## Honest status

This is a real, runnable app and a true foundation, not a mock. What's still demo-grade: auth is local (real Supabase Auth swaps in), data is per-browser until you connect Supabase, the live rep dots are simulated movement (real GPS comes from the mobile app), and the map uses free tiles. The mobile rep app (background GPS, offline capture, consent gate) is the next build, sequenced in the sprint plan. Continuous location tracking has legal/consent requirements; review with counsel before tracking real reps.
