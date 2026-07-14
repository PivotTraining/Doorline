import { useState } from "react";
import { useStore, getState, repStats, updateUser, setConsent, ROLE_LABEL, PLAN_NAME } from "../../store";
import { repCode } from "../../lib/campaigns.js";

export default function Profile({ user }) {
  useStore();
  const [name, setName] = useState(user.name);
  const [saved, setSaved] = useState(false);
  const s = repStats(user.id);
  const presence = getState().presence[user.id] || {};
  const tracking = presence.consent === "granted";

  const save = () => {
    updateUser(user.id, { name: name.trim() || user.name });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Profile</h1>
          <p>Your account and lifetime stats.</p>
        </div>
      </div>

      <div className="cards grid-2">
        <div className="card">
          <h3>Account</h3>
          <label className="field">
            <span>Display name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span>Email</span>
            <input className="input" value={user.email} disabled />
          </label>
          <div className="row" style={{ gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            <span className="tag">{ROLE_LABEL[user.role]}</span>
            <span className="tag">Territory: {user.territory}</span>
            <span className="tag">Plan: {PLAN_NAME[user.plan] || "—"}</span>
            <span className="tag" style={{ fontFamily: "monospace" }} title="Your unique rep ID — used on enrollment links and reports">ID: {repCode(user.id)}</span>
          </div>
          <div className="row">
            <button className="btn primary" onClick={save}>Save</button>
            {saved && <span className="muted">Saved ✓</span>}
          </div>
        </div>

        <div className="card">
          <h3>Lifetime</h3>
          <div className="cards grid-2">
            <div className="stat"><div className="n">{s.knocks}</div><div className="l">Doors worked</div></div>
            <div className="stat"><div className="n">{s.contacts}</div><div className="l">Conversations</div></div>
            <div className="stat"><div className="n">{s.appts}</div><div className="l">Appointments</div></div>
            <div className="stat"><div className="n">{s.closes}</div><div className="l">Sales</div></div>
          </div>
          <div className="stat" style={{ marginTop: 12 }}>
            <div className="n" style={{ color: "var(--green)" }}>{s.rate}%</div>
            <div className="l">Close rate</div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3>📍 Location sharing</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          Required to use the field app — your employer uses this to credit your effort and confirm
          you're in your assigned territory. It only runs while you're signed in and stops the
          instant you sign out.
        </p>
        <div className="row between">
          <span className="pill"><span className="dot" style={{ background: tracking ? "var(--green)" : "var(--red)" }} /> {tracking ? "Sharing on (required)" : "Not sharing — sign in again to continue"}</span>
          {!tracking && <button className="btn primary" onClick={() => setConsent(user.id, "granted")}>Allow now</button>}
        </div>
      </div>
    </>
  );
}
