// ============================================================
// Typed-ish CRUD per resource over Supabase (PostgREST + RPC).
// Used only in live mode (keys present). Mappers keep the
// component/store layer in camelCase.
// ============================================================
import { supabase } from "../supabaseClient";
import * as M from "./mappers";
import { getCtx } from "./context";
import { optionalRead } from "../lib/optionalRead.js";

const org = () => getCtx().orgId;

// Tables introduced by migration 0021 go through optionalRead(), which
// degrades a missing table to "no rows" plus an `absent` flag instead of
// failing the whole hydrate. See src/lib/optionalRead.js.
const optional = optionalRead;

// Initial hydrate: one round of reads → a store-shaped snapshot.
export async function loadAll() {
  const [o, profiles, homes, deals, posts, territories, street, presence, closeouts,
         campaigns, campaignMembers, offices] = await Promise.all([
    supabase.from("organizations").select("*").limit(1).single(),
    supabase.from("profiles").select("*"),
    supabase.from("homes").select("*"),
    supabase.from("deals").select("*, homes(addr)"),
    supabase.from("posts").select("*, profiles(full_name)"),
    supabase.from("territories").select("*"),
    supabase.from("street_rows").select("*").order("slot", { nullsFirst: false }).order("created_at"),
    supabase.from("agent_presence").select("*"),
    supabase.from("daily_submissions").select("*"),
    optional(supabase.from("campaigns").select("*")),
    optional(supabase.from("campaign_members").select("*")),
    optional(supabase.from("offices").select("*")),
  ]);
  // A missing migration, inaccessible table, or RLS error is NOT an empty
  // company's activity. Never replace a rep's pending local work with a
  // fabricated empty server snapshot when these reads fail.
  const checked = { organizations: o, profiles, homes, deals, posts, territories,
    street_rows: street, agent_presence: presence, daily_submissions: closeouts };
  const failed = Object.entries(checked).find(([, response]) => response.error);
  if (failed) throw new Error(`Doorline company data unavailable: ${failed[0]}`);
  return {
    org: o.data
      ? { name: o.data.name, logo: o.data.logo_path, homeZip: o.data.home_zip || null, homeLat: o.data.home_lat ?? null, homeLng: o.data.home_lng ?? null,
          followup: o.data.followup || null, products: o.data.products || null }
      : { name: "Doorline", logo: null, homeZip: null, homeLat: null, homeLng: null, followup: null, products: null },
    users: (profiles.data || []).map(M.profileFromRow),
    homes: (homes.data || []).map(M.homeFromRow),
    deals: (deals.data || []).map((r) => M.dealFromRow({ ...r, addr: r.homes?.addr })),
    posts: (posts.data || []).map((r) => M.postFromRow({ ...r, author_name: r.profiles?.full_name })),
    territories: (territories.data || []).map(M.territoryFromRow),
    streetRows: (street.data || []).map(M.streetRowFromRow),
    campaignsAvailable: !campaigns.absent,
    offices: (offices.data || []).map(M.officeFromRow),
    campaigns: (campaigns.data || []).map(M.campaignFromRow),
    campaignMembers: (campaignMembers.data || []).map(M.campaignMemberFromRow),
    presence: Object.fromEntries((presence.data || []).map((p) => [p.rep_id, {
      online: p.online, since: p.started_at ? Date.parse(p.started_at) : null,
      lastSeen: Date.parse(p.last_seen), lat: p.lat, lng: p.lng, consent: undefined,
    }])),
    submittedDays: Object.fromEntries((closeouts.data || []).map((r) => [r.id, {
      submittedAt: Date.parse(r.submitted_at), notes: r.notes || "",
    }])),
  };
}

export const upsertHome      = (h)      => supabase.from("homes").upsert(M.homeToRow(h, org()));
export const upsertDeal      = (d)      => supabase.from("deals").upsert(M.dealToRow(d, org()));
export const deleteDeal      = (id)     => supabase.from("deals").delete().eq("id", id);
export const upsertProfile   = (u)      => supabase.from("profiles").upsert(M.profileToRow(u, org()));
export const deleteProfile   = (id)     => supabase.from("profiles").delete().eq("id", id);
export const upsertPost      = (p)      => supabase.from("posts").upsert(M.postToRow(p, org()));
export const deletePost      = (id)     => supabase.from("posts").delete().eq("id", id);
export const upsertTerritory = (t)      => supabase.from("territories").upsert(M.territoryToRow(t, org()));
export const deleteTerritory = (id)     => supabase.from("territories").delete().eq("id", id);
// A rep's street-sheet entry is the most loss-sensitive write in the app, so
// it degrades rather than blocks: if the database predates migration 0017 it
// has no deal_id column and PostgREST rejects the whole row (PGRST204). Retry
// once without that one field so the door itself still saves -- losing the
// deal link is recoverable, losing the entry is not.
export const upsertStreetRow = async (r) => {
  let row = M.streetRowToRow(r, org());
  let res = await supabase.from("street_rows").upsert(row);
  if (res?.error && "deal_id" in row && /deal_id/.test(res.error.message || "")) {
    const { deal_id, ...withoutLink } = row;
    row = withoutLink;
    res = await supabase.from("street_rows").upsert(row);
  }
  // Concurrent edits from two devices can claim the same slot. Preserve the
  // later row's actual data in an unassigned slot rather than lose a day of
  // fieldwork to a permanent unique-constraint failure.
  if (res?.error?.code === "23505"
      && /street_rows_one_slot_per_agent_day/.test(res.error.message || "")) {
    res = await supabase.from("street_rows").upsert({ ...row, slot: null });
  }
  return res;
};
export const deleteStreetRow = (id)     => supabase.from("street_rows").delete().eq("id", id);
export const upsertDailySubmission = (r) => supabase.from("daily_submissions").upsert({
  id: r.id, org_id: org(), rep_id: r.repId, day: r.day,
  notes: r.notes || "", submitted_at: new Date(r.submittedAt).toISOString(),
}, { onConflict: "id" });
export const deleteDailySubmission = (id) => supabase.from("daily_submissions").delete().eq("id", id);
// Presence is deliberately ephemeral; offline/closed browsers expire after 90s.
// Do not feed heartbeats through the durable queue, where delayed "online" writes
// could reappear AFTER a rep signed out.
export const upsertAgentPresence = (p) => supabase.from("agent_presence").upsert({
  rep_id: p.repId, org_id: org(), online: !!p.online,
  lat: p.online ? (p.lat ?? null) : null,
  lng: p.online ? (p.lng ?? null) : null,
  started_at: p.since ? new Date(p.since).toISOString() : null,
  last_seen: new Date().toISOString(),
}, { onConflict: "rep_id" });
export const upsertReportBatch = (b)    => supabase.from("report_batches").upsert(M.reportBatchToRow(b, org()));
export const deleteReportBatch = (id)   => supabase.from("report_batches").delete().eq("id", id);
export const upsertReportRow   = (r)    => supabase.from("report_rows").upsert(M.reportRowToRow(r, org()));
export const deleteReportRow   = (id)   => supabase.from("report_rows").delete().eq("id", id);
export const bulkInsertReportRows = async (rows) => {
  const payload = rows.map((r) => M.reportRowToRow(r, org()));
  const { error } = await supabase.from("report_rows").insert(payload);
  if (error) throw error;
};
// Best-effort report load — kept OUT of loadAll's Promise.all so that if the
// report tables don't exist yet, the whole app still boots. Returns [] on
// any error.
export async function loadReports() {
  try {
    const [batches, rows] = await Promise.all([
      supabase.from("report_batches").select("*").order("created_at", { ascending: false }),
      supabase.from("report_rows").select("*"),
    ]);
    if (batches.error || rows.error) return null;
    return {
      reportBatches: (batches.data || []).map(M.reportBatchFromRow),
      reportRows: (rows.data || []).map(M.reportRowFromRow),
    };
  } catch { return null; }
}
export const upsertOffice    = (o)      => supabase.from("offices").upsert(M.officeToRow(o, org()));
export const deleteOffice    = (id)     => supabase.from("offices").delete().eq("id", id);
export const upsertCampaign  = (c)      => supabase.from("campaigns").upsert(M.campaignToRow(c, org()));
export const deleteCampaign  = (id)     => supabase.from("campaigns").delete().eq("id", id);
export const upsertCampaignMember = (m) => supabase.from("campaign_members")
  .upsert(M.campaignMemberToRow(m, org()), { onConflict: "campaign_id,rep_id" });
export const deleteCampaignMember = (id) => {
  const [campaignId, repId] = String(id).split(":");
  return supabase.from("campaign_members").delete().eq("campaign_id", campaignId).eq("rep_id", repId);
};

export const upsertOrg       = (o)      => supabase.from("organizations").update({
  name: o.name, logo_path: o.logo, followup: o.followup, products: o.products,
  home_zip: o.homeZip || null, home_lat: o.homeLat ?? null, home_lng: o.homeLng ?? null,
}).eq("id", org());

// Create a team member (owner/admin only). The browser can't create the
// auth.users row a profile must reference, so this goes through a service-
// role edge function that makes the auth user + profile atomically and
// returns a temporary password for the admin to hand off.
// Change a teammate's sign-in email or reset their password. Same
// service-role reasoning as createTeamMember: the browser cannot touch
// another user's auth record.
export const updateTeamMember = async (payload) => {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const { data } = await supabase.auth.getSession();
  const res = await fetch(`${url}/functions/v1/update-team-member`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${data?.session?.access_token ?? ""}`,
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const d = String(body.detail || body.error || "");
    if (/registered|already exists|duplicate/i.test(d)) return { error: "Another account already uses that email." };
    if (body.error === "forbidden_owner") return { error: "Only the owner can change the owner's sign-in details." };
    if (body.error === "forbidden") return { error: "Only an owner or admin can change sign-in details." };
    if (body.error === "not_found") return { error: "That person is not on your team." };
    if (body.error === "bad_email") return { error: "That doesn't look like a valid email address." };
    if (body.error === "weak_password") return { error: "Password must be at least 6 characters." };
    return { error: d || "Could not update this user." };
  }
  return body; // { id, email, tempPassword? }
};

export const createTeamMember = async (payload) => {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const { data } = await supabase.auth.getSession();
  const res = await fetch(`${url}/functions/v1/create-team-member`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${data?.session?.access_token ?? ""}`,
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const d = String(body.detail || body.error || "");
    if (/registered|already exists|duplicate/i.test(d)) return { error: "That email already has an account." };
    if (body.error === "forbidden") return { error: "Only an owner or admin can add people." };
    return { error: d || "Could not create this user." };
  }
  return body; // { id, email, tempPassword }
};

// Transactional / aggregate work via RPC.
export const recordActivity  = (homeId, type) => supabase.rpc("record_door_activity", { home_id: homeId, atype: type });
export const assignTerritory = (tid, repId)   => supabase.rpc("assign_territory", { territory_id: tid, rep_id: repId });
export const setConsentRpc   = (granted)      => supabase.rpc("set_consent", { granted });
export const leaderboard     = ()             => supabase.rpc("leaderboard", { p_org: org() });
export const accountability  = (day)          => supabase.rpc("rep_accountability", { p_org: org(), p_day: day });

// ---------- campaign documents (0021 + the private campaign-docs bucket) ----------
// Metadata lives in a table, bytes in a private bucket at
// <org_id>/<campaign_id>/<file>. The path layout is not cosmetic: the
// Storage policies read the org and campaign out of it to decide who may
// read an object, so it must stay exactly this shape.
const DOC_BUCKET = "campaign-docs";

export const listCampaignDocs = async (campaignId) => {
  const r = await supabase.from("campaign_documents").select("*")
    .eq("campaign_id", campaignId).order("created_at", { ascending: false });
  if (r.error) return { error: r.error.message, docs: [] };
  return { docs: (r.data || []).map(M.campaignDocFromRow) };
};

export const uploadCampaignDoc = async (campaignId, file) => {
  const orgId = org();
  const safe = (file.name || "file").replace(/[^\w.\-]+/g, "_").slice(0, 120);
  const path = `${orgId}/${campaignId}/${Date.now()}-${safe}`;
  const up = await supabase.storage.from(DOC_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (up.error) return { error: up.error.message };
  const ins = await supabase.from("campaign_documents").insert({
    org_id: orgId, campaign_id: campaignId, name: file.name || safe,
    storage_path: path, mime_type: file.type || null, size_bytes: file.size ?? null,
    uploaded_by: getCtx().repId || null,
  }).select("*").single();
  if (ins.error) {
    // Never leave bytes in the bucket with no row pointing at them: nothing
    // would ever list or delete them again.
    await supabase.storage.from(DOC_BUCKET).remove([path]).catch(() => {});
    return { error: ins.error.message };
  }
  return { doc: M.campaignDocFromRow(ins.data) };
};

// The bucket is private, so a download is a short-lived signed URL rather
// than a public link -- knowing a path grants nothing on its own.
export const campaignDocUrl = async (path) => {
  const r = await supabase.storage.from(DOC_BUCKET).createSignedUrl(path, 120);
  return r.error ? { error: r.error.message } : { url: r.data.signedUrl };
};

export const deleteCampaignDoc = async (doc) => {
  const d = await supabase.from("campaign_documents").delete().eq("id", doc.id);
  if (d.error) return { error: d.error.message };
  // Row first: if the object delete fails the file is orphaned but
  // unreachable, which is better than a row pointing at nothing.
  await supabase.storage.from(DOC_BUCKET).remove([doc.path]);
  return {};
};
