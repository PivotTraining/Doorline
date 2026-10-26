import test from "node:test";
import assert from "node:assert/strict";
import { agentLive, AGENT_STALE_MS } from "../src/lib/presence.js";

test("fresh on-shift real coordinates are visible, including valid zeroes", () => {
  assert.equal(agentLive({ online: true, lat: 0, lng: 0, lastSeen: 1000 }, 1001), true);
  assert.equal(agentLive({ online: true, lat: 33.75, lng: -84.38, lastSeen: 1000 }, 2000), true);
});
test("offline, missing and stale coordinates do not appear on the live map", () => {
  assert.equal(agentLive({ online: false, lat: 33, lng: -84, lastSeen: 1000 }, 2000), false);
  assert.equal(agentLive({ online: true, lastSeen: 1000 }, 2000), false);
  assert.equal(agentLive({ online: true, lat: 33, lng: -84, lastSeen: 1000 }, 1000 + AGENT_STALE_MS), false);
  assert.equal(agentLive({ online: true, lat: 33, lng: -84, lastSeen: 1000 }, 999), false);
});
test("demo positions are allowed only through explicit demo flag", () => {
  assert.equal(agentLive({ online: true, lat: 33, lng: -84 }, 1000, true), true);
  assert.equal(agentLive({ online: true, lat: 33, lng: -84 }, 1000), false);
});
