import { useEffect, useRef, useState } from "react";
import { useStore, getState, setConsent, startSession, endSession, heartbeatSession, addBreadcrumb, logout, mapDefaultCenter, US_CENTER } from "../store";
import { DEMO } from "../supabaseClient";
import Modal from "./Modal.jsx";

// Live shifts share *actual device GPS* with the agent's company only.
// No simulated GPS in production. A missing permission/location means no live map dot.
export default function RepTracker({ user }) {
  useStore();
  const repId = user.id;
  const presence = getState().presence[repId] || {};
  const granted = presence.consent === "granted";
  const [error, setError] = useState("");
  const [requesting, setRequesting] = useState(false);
  const lastRef = useRef(0);

  useEffect(() => {
    if (!granted) return;
    startSession(repId).catch(() => {});
    let watch = null;
    let sim = null;
    const record = (lat, lng) => {
      const now = Date.now();
      if (now - lastRef.current < 8000) return;
      lastRef.current = now;
      addBreadcrumb(repId, { lat, lng });
    };
    if (navigator.geolocation) {
      watch = navigator.geolocation.watchPosition(
        (pos) => record(pos.coords.latitude, pos.coords.longitude),
        (err) => {
          if (!DEMO && err.code === 1) {
            setConsent(repId, "denied");
            endSession(repId).catch(() => {});
            setError("Location permission was revoked. Enable location access to restart the shift.");
          }
        },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 12000 }
      );
    }
    // Demonstration only; company dashboards must never confuse fake locations for GPS.
    if (DEMO) {
      const start = mapDefaultCenter(repId) || US_CENTER;
      let [lat, lng] = start;
      sim = setInterval(() => {
        lat += (Math.random() - 0.5) * 0.0014;
        lng += (Math.random() - 0.5) * 0.0014;
        record(lat, lng);
      }, 10000);
    }
    const heartbeat = setInterval(() => heartbeatSession(repId), 25000);
    return () => {
      if (watch != null) navigator.geolocation.clearWatch(watch);
      clearInterval(heartbeat);
      if (sim) clearInterval(sim);
      // On account sign-out, logout() has already written the final offline
      // presence update. A second unmount write could race it or outlive Auth.
      if (getState().sessionId === repId) endSession(repId).catch(() => {});
    };
  }, [granted, repId]);

  const allow = () => {
    if (requesting) return;
    if (!navigator.geolocation && !DEMO) return setError("This device does not support location services.");
    setRequesting(true); setError("");
    if (DEMO && !navigator.geolocation) {
      setConsent(repId, "granted"); setRequesting(false); return;
    }
    navigator.geolocation.getCurrentPosition(
      () => { setConsent(repId, "granted"); setRequesting(false); },
      (err) => {
        setRequesting(false);
        if (DEMO) { setConsent(repId, "granted"); return; }
        setError(err.code === 1
          ? "Location access was denied. Allow location access for Doorline in your device settings."
          : "A GPS position was not available. Move outdoors or check your connection, then try again.");
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  };

  if (granted) return null;
  return (
    <Modal title="📍 Start a location-enabled shift" onClose={() => {}}
      footer={<>
        <button className="btn ghost" onClick={logout}>Sign out</button>
        <button className="btn primary" onClick={allow} disabled={requesting}>{requesting ? "Checking GPS…" : "Allow location and start shift"}</button>
      </>}>
      <p style={{ marginTop: 0 }}>
        Your company can see your current location while your Doorline shift is active.
        Your location marker disappears after you sign out, and becomes stale if the device stops sending updates.
        Doorline cannot track your location when the browser is closed.
      </p>
      <p className="muted" style={{ fontSize: 13 }}>Your device will request its location permission. You can sign out instead of sharing.</p>
      {error && <div className="err">{error}</div>}
    </Modal>
  );
}
