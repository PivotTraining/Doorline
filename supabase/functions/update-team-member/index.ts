// ============================================================
// update-team-member — an owner/admin changes a teammate's sign-in email
// or resets their password.
//
// The browser cannot do either: changing another user's credentials is a
// service-role operation on auth.users. This verifies the caller is an
// active owner/admin, verifies the target is in the CALLER'S OWN org, and
// then applies the change.
//
//   POST /functions/v1/update-team-member
//   { id, email?, password? }   password: "" or omitted = leave alone,
//                               true = generate one and return it
//   -> 200 { id, email, tempPassword? }
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!; // never leaves the edge

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "3600",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "content-type": "application/json" },
  });

const generatePassword = () =>
  crypto.randomUUID().replace(/-/g, "").slice(0, 12) + "A9!";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "unauthenticated" }, 401);

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

  const id = String(body.id ?? "").trim();
  if (!id) return json({ error: "missing_id" }, 400);

  // The target must belong to the caller's own company. Reading the target
  // through the service role means RLS is not doing this check for us, so
  // the org comparison below is the only thing standing between an admin
  // and another tenant's accounts. It is not optional.
  const { data: target } = await svc.from("profiles").select("id, org_id, role, email").eq("id", id).single();
  if (!target || target.org_id !== caller.org_id) return json({ error: "not_found" }, 404);

  // An admin must not be able to seize the owner's account by resetting its
  // password. Owners may change anyone's; admins may change anyone but an
  // owner. Either may always change their own.
  if (target.role === "owner" && caller.role !== "owner" && target.id !== u.user.id) {
    return json({ error: "forbidden_owner" }, 403);
  }

  const wantsEmail = typeof body.email === "string" && body.email.trim() !== "";
  const email = wantsEmail ? String(body.email).trim().toLowerCase() : "";
  if (wantsEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ error: "bad_email" }, 400);
  }

  // password: a string sets it explicitly; `true` means "generate one".
  let password = "";
  if (body.password === true) password = generatePassword();
  else if (typeof body.password === "string" && body.password !== "") {
    if (body.password.length < 6) return json({ error: "weak_password" }, 400);
    password = body.password;
  }

  if (!wantsEmail && !password) return json({ error: "nothing_to_do" }, 400);

  const attrs: Record<string, unknown> = {};
  if (wantsEmail) { attrs.email = email; attrs.email_confirm = true; }
  if (password) attrs.password = password;

  const { error: uErr } = await svc.auth.admin.updateUserById(id, attrs);
  if (uErr) return json({ error: "update_failed", detail: uErr.message }, 400);

  // profiles carries its own email column; leaving it stale would make the
  // roster disagree with what the person actually signs in with.
  if (wantsEmail) {
    const { error: pErr } = await svc.from("profiles")
      .update({ email }).eq("id", id).eq("org_id", caller.org_id);
    if (pErr) {
      // Put the auth email back so the two cannot drift apart.
      await svc.auth.admin.updateUserById(id, { email: target.email, email_confirm: true });
      return json({ error: "profile_failed", detail: pErr.message }, 400);
    }
  }

  return json({
    id,
    email: wantsEmail ? email : target.email,
    ...(body.password === true ? { tempPassword: password } : {}),
  }, 200);
});
