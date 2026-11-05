// Per-org Realtime subscriptions → store. RLS still decides what each
// client is allowed to receive, so this is safe to wire broadly.
import { supabase } from "../supabaseClient";

const CORE_TABLES = ["homes", "deals", "posts", "location_tracks", "street_rows", "territories",
  "profiles", "report_batches", "report_rows", "agent_presence", "daily_submissions"];

// Tables added by migration 0021. This client is deployable against a
// database on either side of that migration, so these are subscribed only
// once a hydrate has confirmed they exist -- and on their OWN channel.
// Every binding on a channel is validated together: one binding naming a
// table that isn't there fails the whole channel, which on a single shared
// channel would silently kill live updates for doors, deals and street
// rows too.
const OPTIONAL_TABLES = ["campaigns", "campaign_members"];

function bind(name, orgId, tables, onChange) {
  const ch = supabase.channel(name);
  tables.forEach((table) =>
    ch.on("postgres_changes",
      { event: "*", schema: "public", table, filter: `org_id=eq.${orgId}` },
      (payload) => onChange(table, payload))
  );
  ch.subscribe();
  return ch;
}

export function subscribeOrg(orgId, onChange, { campaigns = false } = {}) {
  const channels = [bind(`org:${orgId}`, orgId, CORE_TABLES, onChange)];
  if (campaigns) channels.push(bind(`org-campaigns:${orgId}`, orgId, OPTIONAL_TABLES, onChange));
  return () => channels.forEach((ch) => supabase.removeChannel(ch));
}
