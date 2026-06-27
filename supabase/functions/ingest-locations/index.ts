// ============================================================
// ingest-locations — GPS firehose entry point (Deno edge function)
// Validates JWT + active consent, then one batched insert into the
// partitioned `locations` table. Client side: src/api/locationQueue.js
//   POST /functions/v1/ingest-locations
//   { "points": [ { "lat": number, "lng": number, "ts": ISO8601 }, ... ] }
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!; // bypasses RLS; never leaves the edge
const MAX_BATCH = 200;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "unauthenticated" }, 401);

  // Resolve the caller from their JWT (anon client + user token).
  const asUser = createClient(SUPABASE_URL, token, { global: { headers: { Authorization: auth } } });
  const { data: u } = await asUser.auth.getUser();
  if (!u?.user) return json({ error: "unauthenticated" }, 401);

  // Service client for the privileged consent check + insert.
  const svc = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: profile } = await svc.from("profiles").select("org_id").eq("id", u.user.id).single();
  if (!profile) return json({ error: "no_profile" }, 403);

  // Legal gate: refuse to record without active consent.
  const { data: consent } = await svc.from("consents").select("state").eq("rep_id", u.user.id).single();
  if (consent?.state !== "granted") return json({ error: "consent_inactive" }, 403);

  let body: { points?: Array<{ lat: number; lng: number; ts?: string }> };
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  const points = (body.points ?? []).slice(0, MAX_BATCH).filter(
    (p) => typeof p.lat === "number" && typeof p.lng === "number" &&
           Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180
  );
  if (points.length === 0) return json({ accepted: 0 });

  const rows = points.map((p) => ({
    org_id: profile.org_id,
    rep_id: u.user.id,
    lat: p.lat,
    lng: p.lng,
    recorded_at: p.ts ?? new Date().toISOString(),
  }));

  const { error } = await svc.from("locations").insert(rows);
  if (error) return json({ error: "insert_failed", detail: error.message }, 500);

  // (Production) also: update Redis last_known:{rep} + broadcast presence.
  return json({ accepted: rows.length }, 202);
});
