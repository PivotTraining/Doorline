// Per-org Realtime subscriptions → store. RLS still decides what each
// client is allowed to receive, so this is safe to wire broadly.
import { supabase } from "../supabaseClient";

const TABLES = ["homes", "deals", "posts", "location_tracks"];

export function subscribeOrg(orgId, onChange) {
  const ch = supabase.channel(`org:${orgId}`);
  TABLES.forEach((table) =>
    ch.on("postgres_changes",
      { event: "*", schema: "public", table, filter: `org_id=eq.${orgId}` },
      (payload) => onChange(table, payload))
  );
  ch.subscribe();
  return () => supabase.removeChannel(ch);
}
