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
    supabase.from("street_rows").select("*"),
  ]);
  return {
    org: o.data ? { name: o.data.name, logo: o.data.logo_path } : { name: "Doorline", logo: null },
    users: (profiles.data || []).map(M.profileFromRow),
    homes: (homes.data || []).map(M.homeFromRow),
    deals: (deals.data || []).map((r) => M.dealFromRow({ ...r, addr: r.homes?.addr })),
    posts: (posts.data || []).map((r) => M.postFromRow({ ...r, author_name: r.profiles?.full_name })),
    territories: (territories.data || []).map(M.territoryFromRow),
    streetRows: (street.data || []).map(M.streetRowFromRow),
  };
}

export const upsertHome      = (h)      => supabase.from("homes").upsert(M.homeToRow(h, org()));
export const insertDeal      = (d)      => supabase.from("deals").insert(M.dealToRow(d, org()));
export const upsertProfile   = (u)      => supabase.from("profiles").upsert(M.profileToRow(u, org()));
export const deleteProfile   = (id)     => supabase.from("profiles").delete().eq("id", id);
export const upsertPost      = (p)      => supabase.from("posts").upsert(M.postToRow(p, org()));
export const deletePost      = (id)     => supabase.from("posts").delete().eq("id", id);
export const upsertTerritory = (t)      => supabase.from("territories").upsert(M.territoryToRow(t, org()));
export const deleteTerritory = (id)     => supabase.from("territories").delete().eq("id", id);
export const upsertStreetRow = (r)      => supabase.from("street_rows").upsert(M.streetRowToRow(r, org()));
export const deleteStreetRow = (id)     => supabase.from("street_rows").delete().eq("id", id);
export const upsertOrg       = (o)      => supabase.from("organizations").update({ name: o.name, logo_path: o.logo }).eq("id", org());

// Transactional / aggregate work via RPC.
export const recordActivity  = (homeId, type) => supabase.rpc("record_door_activity", { home_id: homeId, atype: type });
export const assignTerritory = (tid, repId)   => supabase.rpc("assign_territory", { territory_id: tid, rep_id: repId });
export const setConsentRpc   = (granted)      => supabase.rpc("set_consent", { granted });
export const leaderboard     = ()             => supabase.rpc("leaderboard", { p_org: org() });
export const accountability  = (day)          => supabase.rpc("rep_accountability", { p_org: org(), p_day: day });
