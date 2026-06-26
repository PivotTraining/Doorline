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

## Structure

```
src/
  store.js              shared data + actions (localStorage now, Supabase-ready)
  supabaseClient.js     client + DEMO switch
  App.jsx               shell, login gate, role-based nav
  components/
    FieldMap.jsx        Leaflet map: streets/satellite, geolocate, geocode,
                        drop door, disposition + deal capture, live rep dots
    DoorEditor.jsx      disposition + deal capture modal
    Modal.jsx
  pages/
    Login.jsx
    rep/   MyDay, Doors, FollowUps, MyDeals, Leaderboard, Profile
    admin/ Personnel, TeamMap, ActivitySheet, Deals, Billing
supabase/schema.sql     Postgres schema + RLS + homes/deals tables
```

## Honest status

This is a real, runnable app and a true foundation, not a mock. What's still demo-grade: auth is local (real Supabase Auth swaps in), data is per-browser until you connect Supabase, the live rep dots are simulated movement (real GPS comes from the mobile app), and the map uses free tiles. The mobile rep app (background GPS, offline capture, consent gate) is the next build, sequenced in the sprint plan. Continuous location tracking has legal/consent requirements; review with counsel before tracking real reps.
