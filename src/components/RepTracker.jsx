import { useEffect, useRef } from "react";
import { useStore, getState, setConsent, startSession, endSession, addBreadcrumb, logout, mapDefaultCenter, US_CENTER } from "../store";
import Modal from "./Modal.jsx";

// Records a rep's route while they're signed in. Location sharing is a
// REQUIRED condition of using the field app (every worker must allow it),
// not an optional toggle — so this re-prompts whenever consent isn't
// currently granted, and the only ways forward are "Allow tracking" or
// signing out. Uses real device GPS when granted/available, and falls
// back to a simulated walk so the path is visible in the browser demo.
// Stops the moment the rep signs out.
export default function RepTracker({ user }) {
  useStore();
  const repId = user.id;
  const presence = getState().presence[repId] || {};
  const granted = presence.consent === "granted";
  const mustAsk = !granted; // covers never-asked AND previously-declined
  const watchRef = useRef(null);
  const simRef = useRef(null);
  const lastRef = useRef(0);

  useEffect(() => {
    if (!granted) return;
    startSession(repId);

    const record = (lat, lng) => {
      const now = Date.now();
      if (now - lastRef.current < 8000) return; // throttle
      lastRef.current = now;
      addBreadcrumb(repId, { lat, lng });
    };

    let gotReal = false;
    if (navigator.geolocation) {
      watchRef.current = navigator.geolocation.watchPosition(
        (pos) => { gotReal = true; record(pos.coords.latitude, pos.coords.longitude); },
        () => { /* denied / unavailable — simulation keeps the demo alive */ },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 12000 }
      );
    }

    // Simulated movement fallback (only while real GPS isn't flowing).
    const t = getState().tracks[repId] || [];
    const start = mapDefaultCenter(repId) || US_CENTER;
    let [la, ln] = t.length ? [t[t.length - 1].lat, t[t.length - 1].lng] : start;
    simRef.current = setInterval(() => {
      if (gotReal) return;
      la += (Math.random() - 0.5) * 0.0014;
      ln += (Math.random() - 0.5) * 0.0014;
      record(la, ln);
    }, 10000);

    return () => {
      if (watchRef.current != null && navigator.geolocation) navigator.geolocation.clearWatch(watchRef.current);
      if (simRef.current) clearInterval(simRef.current);
      endSession(repId);
    };
  }, [granted, repId]);

  if (!mustAsk) return null;
  return (
    <Modal
      title="📍 Location sharing required"
      onClose={() => {}} // not dismissible — allow or sign out, no silent skip
      footer={
        <>
          <button className="btn ghost" onClick={logout}>Sign out instead</button>
          <button className="btn primary" onClick={() => setConsent(repId, "granted")}>Allow tracking</button>
        </>
      }
    >
      <p style={{ marginTop: 0 }}>
        Your employer requires location sharing to use the field app. While you're signed in,
        Doorline records the route you cover — so your manager can credit your effort, see the
        ground you worked (even on doors you didn't log), and confirm you're in your assigned
        territory.
      </p>
      <ul className="muted" style={{ fontSize: 13, paddingLeft: 18, marginBottom: 0 }}>
        <li>Runs only while you're signed in — stops the instant you sign out.</li>
        <li>Required to continue as a field rep; you can sign out instead if you'd rather not.</li>
      </ul>
    </Modal>
  );
}
