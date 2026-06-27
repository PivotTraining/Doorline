import { useEffect, useRef, useState } from "react";
import { useStore, getState, setConsent, startSession, endSession, addBreadcrumb } from "../store";
import Modal from "./Modal.jsx";

// Records a rep's route while they're signed in. Asks consent once.
// Uses real device GPS when granted/available, and falls back to a simulated
// walk so the path is visible in the browser demo. Stops on sign-out.
export default function RepTracker({ user }) {
  useStore();
  const repId = user.id;
  const presence = getState().presence[repId] || {};
  const [ask, setAsk] = useState(presence.consent === undefined);
  const granted = presence.consent === "granted";
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
    let [la, ln] = t.length ? [t[t.length - 1].lat, t[t.length - 1].lng] : [33.749, -84.388];
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

  if (!ask) return null;
  return (
    <Modal
      title="📍 Share your route while you work?"
      onClose={() => { setConsent(repId, "denied"); setAsk(false); }}
      footer={
        <>
          <button className="btn ghost" onClick={() => { setConsent(repId, "denied"); setAsk(false); }}>Not now</button>
          <button className="btn primary" onClick={() => { setConsent(repId, "granted"); setAsk(false); }}>Allow tracking</button>
        </>
      }
    >
      <p style={{ marginTop: 0 }}>
        While you're signed in, Doorline records the route you cover so your manager can credit your
        effort and see the ground you worked — even on doors you didn't get to log.
      </p>
      <ul className="muted" style={{ fontSize: 13, paddingLeft: 18, marginBottom: 0 }}>
        <li>Runs only while you're signed in.</li>
        <li>Stops the moment you sign out.</li>
        <li>You can turn it off anytime in your Profile.</li>
      </ul>
    </Modal>
  );
}
