export const AGENT_STALE_MS = 90_000;

// Pure freshness check shared by map and accountability views.
// A disconnected device is not "online" forever and a status without real
// coordinates is not a location marker. 0,0 is a valid coordinate pair.
export function agentLive(p, now = Date.now(), demo = false) {
  return !!p?.online && Number.isFinite(p.lat) && Number.isFinite(p.lng)
    && (demo || (Number.isFinite(p.lastSeen) && now - p.lastSeen >= 0
      && now - p.lastSeen < AGENT_STALE_MS));
}
