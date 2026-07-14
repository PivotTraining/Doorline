// ============================================================
// Typed-ish CRUD per resource over Supabase (PostgREST + RPC).
// Used only in live mode (keys present). Mappers keep the
// component/store layer in camelCase.
// ============================================================
import { supabase } from "../supabaseClient";
import * as M from "./mappers";
import { getCtx } from "./context";

const org = () => getCtx().orgId;

// Initial hydrate: one round of reads → a store-shaped snapshot.
export async function loadAll() {
  const [o, profiles, homes, deals, posts, territories, street] = await Promise.all([
    supabase.from("organizations").select("*").limit(1).single(),
    supabase.from("profiles").select("*"),
    supabase.from("homes").select("*"),
    supabase.from("deals").select("*, homes(addr)"),
    supabase.from("posts").select("*, profiles(full_name)"),
    supabase.from("territories").select("*"),
    supabase.from("street_rows").select("*").order("slot", { nullsFirst: false }).order("created_at"),
  ]);
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
export const upsertStreetRow = (r)      => supabase.from("street_rows").upsert(M.streetRowToRow(r, org()));
export const deleteStreetRow = (id)     => supabase.from("street_rows").delete().eq("id", id);
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
export const upsertOrg       = (o)      => supabase.from("organizations").update({
  name: o.name, logo_path: o.logo, followup: o.followup, products: o.products,
  home_zip: o.homeZip || null, home_lat: o.homeLat ?? null, home_lng: o.homeLng ?? null,
}).eq("id", org());

// Create a team member (owner/admin only). The browser can't create the
// auth.users row a profile must reference, so this goes through a service-
// role edge function that makes the auth user + profile atomically and
// returns a temporary password for the admin to hand off.
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
