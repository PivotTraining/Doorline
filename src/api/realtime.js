// Per-org Realtime subscriptions → store. RLS still decides what each
// client is allowed to receive, so this is safe to wire broadly.
import { supabase } from "../supabaseClient";

const TABLES = ["homes", "deals", "posts", "location_tracks", "street_rows", "territories",
  "profiles", "report_batches", "report_rows"];

// `extraTables` carries tables that only exist after a later migration. They
// are passed in rather than hardcoded because a postgres_changes binding for
// a table the database doesn't have can fault the WHOLE channel -- which
// would cost this org live updates on homes, deals and street rows too, a
// far worse outcome than simply not having live routes. The caller adds
// them only once it has confirmed the tables read successfully.
export function subscribeOrg(orgId, onChange, extraTables = []) {
  const ch = supabase.channel(`org:${orgId}`);
  [...TABLES, ...extraTables].forEach((table) =>
    ch.on("postgres_changes",
      { event: "*", schema: "public", table, filter: `org_id=eq.${orgId}` },
      (payload) => onChange(table, payload))
  );
  ch.subscribe();
  return () => supabase.removeChannel(ch);
}
