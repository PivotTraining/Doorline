import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Polygon, Polyline, CircleMarker, useMap, useMapEvents } from "react-leaflet";

// Colorful Waze-like basemap (same as the field map).
const VIVID = {
  url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
  attr: "&copy; OpenStreetMap &copy; CARTO",
  subdomains: "abcd",
};
const ATLANTA = [33.749, -84.388];

function Clicker({ onAdd }) {
  useMapEvents({ click: (e) => onAdd([+e.latlng.lat.toFixed(6), +e.latlng.lng.toFixed(6)]) });
  return null;
}

// Fit the map to the drawn polygon whenever `token` changes (e.g. after a ZIP load).
function Fitter({ pts, token }) {
  const map = useMap();
  useEffect(() => { if (pts.length >= 2) map.fitBounds(pts, { padding: [20, 20] }); }, [token]); // eslint-disable-line
  return null;
}

// Draw / edit a territory's boundary — by tapping vertices, or by loading a ZIP's outline.
export default function TerritoryMap({ territories, editId, onSave, onCancel, height = 460 }) {
  const editing = territories.find((t) => t.id === editId) || null;
  const [pts, setPts] = useState([]);
  const [zip, setZip] = useState("");
  const [busy, setBusy] = useState(false);
  const [fit, setFit] = useState(0);

  useEffect(() => { setPts(editing?.boundary ? [...editing.boundary] : []); }, [editId]); // eslint-disable-line

  const add = (p) => editId && setPts((a) => [...a, p]);
  const undo = () => setPts((a) => a.slice(0, -1));
  const clear = () => setPts([]);
  const color = editing?.color || "#2e90fa";

  const loadZip = async () => {
    if (!zip.trim()) return;
    setBusy(true);
    try {
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&polygon_geojson=1&countrycodes=us&postalcode=${encodeURIComponent(zip.trim())}`,
        { headers: { Accept: "application/json" }, signal: ctl.signal }
      );
      clearTimeout(to);
      const hit = (await r.json())[0];
      if (!hit) { alert("No match for that ZIP code."); return; }
      const g = hit.geojson;
      let ring = g?.type === "Polygon" ? g.coordinates[0] : g?.type === "MultiPolygon" ? g.coordinates[0][0] : null;
      let poly;
      if (ring) {
        poly = ring.map(([lng, lat]) => [+lat.toFixed(6), +lng.toFixed(6)]);
      } else {
        const bb = hit.boundingbox.map(Number); // [south, north, west, east]
        poly = [[bb[0], bb[2]], [bb[1], bb[2]], [bb[1], bb[3]], [bb[0], bb[3]]];
      }
      if (poly.length > 120) { const step = Math.ceil(poly.length / 120); poly = poly.filter((_, i) => i % step === 0); }
      setPts(poly);
      setFit((n) => n + 1);
    } catch {
      alert("ZIP lookup needs an internet connection.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="map-wrap" style={{ height }}>
      <MapContainer center={ATLANTA} zoom={12} style={{ height: "100%", width: "100%" }} zoomControl={false}>
        <TileLayer url={VIVID.url} attribution={VIVID.attr} subdomains={VIVID.subdomains} maxZoom={20} />
        {editId && <Clicker onAdd={add} />}
        <Fitter pts={pts} token={fit} />

        {territories.map((t) =>
          t.id !== editId && t.boundary && t.boundary.length >= 3 ? (
            <Polygon key={t.id} positions={t.boundary} pathOptions={{ color: t.color, weight: 2, fillOpacity: 0.1 }} />
          ) : null
        )}

        {pts.length >= 3 && <Polygon positions={pts} pathOptions={{ color, weight: 2, dashArray: "5", fillOpacity: 0.18 }} />}
        {pts.length === 2 && <Polyline positions={pts} pathOptions={{ color, weight: 2, dashArray: "5" }} />}
        {pts.map((p, i) => (
          <CircleMarker key={i} center={p} radius={5} pathOptions={{ color: "#fff", weight: 2, fillColor: color, fillOpacity: 1 }} />
        ))}
      </MapContainer>

      <div className="map-controls">
        {editId ? (
          <>
            <div className="map-search" style={{ gap: 8, padding: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 13 }}>Outline <b>{editing?.name}</b> · {pts.length} pts</span>
              <button className="btn sm" onClick={undo} disabled={!pts.length}>Undo</button>
              <button className="btn sm" onClick={clear} disabled={!pts.length}>Clear</button>
              <button className="btn sm primary" onClick={() => onSave(pts)} disabled={pts.length < 3}>Save zone</button>
              <button className="btn sm ghost" onClick={onCancel}>Done</button>
            </div>
            <form className="map-search" onSubmit={(e) => { e.preventDefault(); loadZip(); }}>
              <input value={zip} onChange={(e) => setZip(e.target.value)} placeholder="ZIP code…" inputMode="numeric" />
              <button className="btn sm" type="submit" disabled={busy}>{busy ? "…" : "Use ZIP"}</button>
            </form>
          </>
        ) : (
          <div className="map-search" style={{ padding: "8px 12px", fontSize: 13 }}>Tap “Boundary” on a territory below — then draw, or load a ZIP.</div>
        )}
      </div>
    </div>
  );
}
