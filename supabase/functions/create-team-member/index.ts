// ============================================================
// create-team-member — an owner/admin adds a rep/manager to their org.
// The browser can't do this directly: profiles.id must reference a real
// auth.users row, which only the service role can create. This function
// verifies the caller is an owner/admin, creates the auth user with a
// temporary password, and inserts the matching profile in the caller's
// org — atomically (rolls back the auth user if the profile insert fails).
//   POST /functions/v1/create-team-member
//   { name, email, role, plan?, territory?, timezone?, homeZip?, homeLat?, homeLng?, password? }
//   -> 201 { id, email, tempPassword }
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!; // never leaves the edge

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const ALLOWED_ROLES = ["rep", "manager", "admin", "viewer"];
const FREE_ROLES = ["admin", "owner", "viewer"];

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "unauthenticated" }, 401);

  // Who's calling?
  const asUser = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
  const { data: u } = await asUser.auth.getUser(token);
  if (!u?.user) return json({ error: "unauthenticated" }, 401);

  const svc = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: caller } = await svc.from("profiles").select("org_id, role, status").eq("id", u.user.id).single();
  if (!caller) return json({ error: "no_profile" }, 403);
  // Deactivation takes effect immediately, even while a JWT remains valid.
  if (caller.status !== "active" || !["owner", "admin"].includes(caller.role)) {
    return json({ error: "forbidden" }, 403);
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }

  const email = String(body.email ?? "").trim().toLowerCase();
  const name = String(body.name ?? "").trim();
  const role = ALLOWED_ROLES.includes(String(body.role)) ? String(body.role) : "rep";
  if (!email || !name) return json({ error: "missing_fields" }, 400);

  // The same one-use company invitation powers admin-created accounts and
  // self-enrollment. This avoids trusting forgeable user_metadata authorization
  // flags and guarantees the auth trigger joins this administrator's org.
  const { data: inviteToken, error: inviteError } = await asUser.rpc("create_company_invite", {
    p_max_uses: 1,
    p_expires_days: 1,
  });
  if (inviteError || !inviteToken) return json({
    error: "invite_failed",
    detail: inviteError?.message ?? "Could not issue a company-bound invitation.",
  }, 400);

  // A temporary password the admin relays to the new hire (they can be
  // prompted to change it later). Admin may also supply their own.
  const tempPassword = (typeof body.password === "string" && body.password.length >= 6)
    ? body.password
    : crypto.randomUUID().replace(/-/g, "").slice(0, 10) + "A9!";

  const { data: created, error: cErr } = await svc.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    // Migration 0019 validates this one-use invite *inside* the auth.users
    // insertion transaction and creates a rep profile in the correct company.
    user_metadata: { full_name: name, doorline_invite: inviteToken },
  });
  if (cErr || !created?.user) return json({ error: "create_failed", detail: cErr?.message ?? "no_user" }, 400);

  const free = FREE_ROLES.includes(role);
  const { error: pErr } = await svc.from("profiles").update({
    full_name: name,
    email,
    role,
    status: "active",
    territory: (body.territory as string) || "—",
    seat_price_cents: free ? 0 : (typeof body.plan === "number" ? body.plan : 5900),
    timezone: (body.timezone as string) || null,
    home_zip: (body.homeZip as string) || null,
    home_lat: typeof body.homeLat === "number" ? body.homeLat : null,
    home_lng: typeof body.homeLng === "number" ? body.homeLng : null,
  }).eq("id", created.user.id).eq("org_id", caller.org_id).select("id").single();
  if (pErr) {
    // Don't leave an orphan auth user if the profile couldn't be written.
    await svc.auth.admin.deleteUser(created.user.id);
    return json({ error: "profile_failed", detail: pErr.message }, 400);
  }

  return json({ id: created.user.id, email, tempPassword }, 201);
});
