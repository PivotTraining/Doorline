import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, Polygon, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { useStore, getState, DISPOS, addHome, setDoor } from "../store";
import DoorEditor from "./DoorEditor.jsx";
import { repZones, pointInPolygon } from "../lib/geo.js";

// fetch JSON with a hard timeout so the UI never hangs on a slow/offline network
async function fetchJSON(url, ms = 6000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { headers: { Accept: "application/json" }, signal: ctl.signal });
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

const TILES = {
  // Colorful, Waze-like vector basemap (CARTO Voyager — free, no key).
  vivid: {
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
    attr: '&copy; OpenStreetMap &copy; CARTO',
    subdomains: "abcd",
  },
  streets: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attr: '&copy; OpenStreetMap contributors',
    subdomains: "abc",
  },
};

const ATLANTA = [33.749, -84.388];

const doorIcon = (hex) =>
  L.divIcon({
    className: "door-icon",
    html: `<div class="door-pin" style="width:16px;height:16px;background:${hex}"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 16],
    popupAnchor: [0, -16],
  });

const repIcon = (color) =>
  L.divIcon({
    className: "rep-icon",
    html: `<div class="rep-dot" style="width:14px;height:14px;background:${color}"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });

// Exposes the Leaflet map instance to the parent via a ref.
function MapBinder({ mapRef }) {
  const map = useMap();
  useEffect(() => { mapRef.current = map; }, [map, mapRef]);
  return null;
}

// Drops a door where the rep taps (edit mode only).
function ClickToDrop({ onDrop }) {
  useMapEvents({ click: (e) => onDrop?.(e.latlng) });
  return null;
}

/**
 * FieldMap
 *  - repId    : when set, doors are filtered to this rep and the map is editable.
 *  - admin    : read-only org-wide view with simulated live rep dots.
 */
export default function FieldMap({ repId = null, admin = false, height = 540 }) {
  useStore();
  const state = getState();
  const mapRef = useRef(null);

  const [layer, setLayer] = useState("vivid");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null); // door being dispositioned
  const [locating, setLocating] = useState(false);
  const [warn, setWarn] = useState("");
  const [showPaths, setShowPaths] = useState(true);
  const [showZones, setShowZones] = useState(true);

  const homes = admin ? state.homes : state.homes.filter((h) => h.repId === repId);
  const reps = state.users.filter((u) => u.role === "rep" && u.status === "active");
  // Territory zones: admins see all; a rep sees the zone(s) assigned to them.
  const zones = (admin ? state.territories : state.territories.filter((t) => t.assignedTo === repId))
    .filter((t) => t.boundary && t.boundary.length >= 3);

  // ---- simulated live rep dots (admin only) ----
  const [repPos, setRepPos] = useState({});
  useEffect(() => {
    if (!admin) return;
    // seed each rep near the centroid of their doors
    const seedPos = {};
    reps.forEach((r) => {
      const hs = state.homes.filter((h) => h.repId === r.id);
      if (hs.length) {
        const lat = hs.reduce((a, h) => a + h.lat, 0) / hs.length;
        const lng = hs.reduce((a, h) => a + h.lng, 0) / hs.length;
        seedPos[r.id] = [lat, lng];
      }
    });
    setRepPos(seedPos);
    const t = setInterval(() => {
      setRepPos((prev) => {
        const next = {};
        for (const id in prev) {
          next[id] = [prev[id][0] + (Math.random() - 0.5) * 0.0008, prev[id][1] + (Math.random() - 0.5) * 0.0008];
        }
        return next;
      });
    }, 2000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin]);

  // ---- actions ----
  const flyTo = (lat, lng, z = 17) => mapRef.current?.flyTo([lat, lng], z, { duration: 0.8 });

  const myLocation = () => {
    if (!navigator.geolocation) return alert("Geolocation isn't available in this browser.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLocating(false); flyTo(pos.coords.latitude, pos.coords.longitude, 18); },
      () => { setLocating(false); alert("Couldn't get your location. Check permissions."); },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const geocode = async (e) => {
    e?.preventDefault?.();
    if (!q.trim()) return;
    setBusy(true);
    try {
      const data = await fetchJSON(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`
      );
      if (data[0]) flyTo(+data[0].lat, +data[0].lon, 18);
      else alert("No match for that address.");
    } catch {
      alert("Address search needs an internet connection.");
    } finally {
      setBusy(false);
    }
  };

  const dropDoor = (latlng) => {
    if (!repId) return; // only droppable in rep edit mode
    // Non-blocking accountability nudge if the door lands outside the rep's zone.
    const myZones = repZones(state, repId);
    if (myZones.length && !myZones.some((z) => pointInPolygon([latlng.lat, latlng.lng], z.boundary))) {
      setWarn(`⚠ Outside your assigned zone (${myZones[0].name})`);
      setTimeout(() => setWarn(""), 4000);
    }
    // Create the door and open the editor immediately — never block on the network.
    const home = addHome({ repId, lat: +latlng.lat.toFixed(6), lng: +latlng.lng.toFixed(6), addr: "" });
    setEditing(home);
    // Best-effort reverse geocode in the background; fill in the address when it returns.
    fetchJSON(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latlng.lat}&lon=${latlng.lng}`)
      .then((d) => {
        const a = d?.address;
        if (!a) return;
        const addr = [a.house_number, a.road].filter(Boolean).join(" ") || d.display_name?.split(",")[0];
        if (addr) setDoor(home.id, { addr });
      })
      .catch(() => { /* offline — keep the coordinate label */ });
  };

  const t = TILES[layer];

  return (
    <div className="map-wrap" style={{ height }}>
      <MapContainer center={ATLANTA} zoom={13} style={{ height: "100%", width: "100%" }} zoomControl={false}>
        <MapBinder mapRef={mapRef} />
        <TileLayer key={layer} url={t.url} attribution={t.attr} subdomains={t.subdomains} maxZoom={20} />
        {repId && <ClickToDrop onDrop={dropDoor} />}

        {showZones && zones.map((z) => (
          <Polygon key={"zone" + z.id} positions={z.boundary} pathOptions={{ color: z.color, weight: 2, fillOpacity: 0.1 }}>
            <Popup><strong>{z.name}</strong><br /><small>{repName(state, z.assignedTo)}</small></Popup>
          </Polygon>
        ))}

        {homes.map((h) => (
          <Marker
            key={h.id}
            position={[h.lat, h.lng]}
            icon={doorIcon(DISPOS[h.status].hex)}
            eventHandlers={repId ? { click: () => setEditing(h) } : undefined}
          >
            {admin && (
              <Popup>
                <strong>{h.addr}</strong>
                <br />
                <span style={{ color: DISPOS[h.status].hex }}>● {DISPOS[h.status].lab}</span>
                <br />
                <small>{repName(state, h.repId)}</small>
                {h.notes && <><br /><small>{h.notes}</small></>}
              </Popup>
            )}
          </Marker>
        ))}

        {admin && showPaths &&
          reps.map((r, i) => {
            const pts = (state.tracks[r.id] || []).map((p) => [p.lat, p.lng]);
            return pts.length > 1 ? (
              <Polyline key={"path" + r.id} positions={pts} pathOptions={{ color: REP_COLORS[i % REP_COLORS.length], weight: 3, opacity: 0.65 }} />
            ) : null;
          })}

        {admin &&
          reps.map((r, i) =>
            repPos[r.id] ? (
              <Marker key={r.id} position={repPos[r.id]} icon={repIcon(REP_COLORS[i % REP_COLORS.length])}>
                <Popup><strong>{r.name}</strong><br /><small>Live · {r.territory}</small></Popup>
              </Marker>
            ) : null
          )}
      </MapContainer>

      <div className="map-controls">
        <div className="seg">
          <button className={layer === "vivid" ? "on" : ""} onClick={() => setLayer("vivid")}>Vivid</button>
          <button className={layer === "streets" ? "on" : ""} onClick={() => setLayer("streets")}>Streets</button>
        </div>
        <form className="map-search" onSubmit={geocode}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search address…" />
          <button className="btn sm primary" type="submit" disabled={busy}>{busy ? "…" : "Go"}</button>
        </form>
        <button className="btn sm" onClick={myLocation} disabled={locating}>{locating ? "Locating…" : "📍 My location"}</button>
        {admin && (
          <label className="map-toggle">
            <input type="checkbox" checked={showPaths} onChange={(e) => setShowPaths(e.target.checked)} /> Routes
          </label>
        )}
        {zones.length > 0 && (
          <label className="map-toggle">
            <input type="checkbox" checked={showZones} onChange={(e) => setShowZones(e.target.checked)} /> Zones
          </label>
        )}
      </div>

      <div className="map-legend">
        {Object.entries(DISPOS).map(([k, v]) => (
          <div key={k} className="row" style={{ gap: 6 }}>
            <span className="dot" style={{ background: v.hex }} /> {v.lab}
          </div>
        ))}
      </div>

      {warn && (
        <div style={{ position: "absolute", zIndex: 600, top: 12, left: "50%", transform: "translateX(-50%)",
          background: "var(--pill-amber-bg)", color: "var(--amber)", border: "1px solid var(--pill-amber-border)",
          padding: "8px 14px", borderRadius: 999, fontSize: 13, fontWeight: 600, boxShadow: "var(--shadow)" }}>
          {warn}
        </div>
      )}

      {editing && repId && <DoorEditor door={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

const REP_COLORS = ["#4f7cff", "#22c55e", "#f59e0b", "#a855f7", "#ef4444", "#14b8a6"];
function repName(state, id) {
  return state.users.find((u) => u.id === id)?.name || "Unassigned";
}
