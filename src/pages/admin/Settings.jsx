import { useState } from "react";
import { useStore, getState, setOrg, setFollowupSettings } from "../../store";
import { useTheme, setTheme } from "../../theme.js";
import { geocodeZip } from "../../lib/geocode.js";

export default function Settings() {
  useStore();
  const theme = useTheme();
  const org = getState().org;
  const fu = org.followup || {};
  const [name, setName] = useState(org.name);
  const [saved, setSaved] = useState(false);
  const [zip, setZip] = useState(org.homeZip || "");
  const [zipBusy, setZipBusy] = useState(false);
  const [zipSaved, setZipSaved] = useState(false);

  const saveZip = async () => {
    if (!zip.trim()) return;
    setZipBusy(true);
    try {
      const hit = await geocodeZip(zip);
      if (!hit) return alert("No match for that ZIP code.");
      setOrg({ homeZip: zip.trim(), homeLat: hit.lat, homeLng: hit.lng });
      setZipSaved(true); setTimeout(() => setZipSaved(false), 1500);
    } catch {
      alert("ZIP lookup needs an internet connection.");
    } finally {
      setZipBusy(false);
    }
  };

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 1.5e6) return alert("Please pick an image under ~1.5 MB.");
    const r = new FileReader();
    r.onload = () => setOrg({ logo: r.result });
    r.readAsDataURL(f);
  };
  const saveName = () => { setOrg({ name: name.trim() || "Doorline" }); setSaved(true); setTimeout(() => setSaved(false), 1500); };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>Brand the app for your company and set the default appearance.</p>
        </div>
      </div>

      <div className="cards grid-2">
        <div className="card">
          <h3>Company branding</h3>
          <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>Your logo and name appear across the app and on the sign-in screen — keeping the team connected to one brand.</p>
          <div className="row" style={{ alignItems: "flex-start", gap: 16 }}>
            <label className="logo-drop" title="Upload logo">
              {org.logo ? <img src={org.logo} alt="logo" /> : <span className="muted" style={{ fontSize: 12, textAlign: "center" }}>Upload<br />logo</span>}
              <input type="file" accept="image/*" hidden onChange={onFile} />
            </label>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label className="field">
                <span>Company name</span>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <div className="row">
                <button className="btn primary" onClick={saveName}>Save name</button>
                {org.logo && <button className="btn ghost" onClick={() => setOrg({ logo: null })}>Remove logo</button>}
                {saved && <span className="muted">Saved ✓</span>}
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <h3>📍 Company location</h3>
          <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
            Sets where your team's maps center by default (new reps without their own home ZIP use
            this too) — instead of defaulting to any particular city.
          </p>
          <label className="field">
            <span>Home ZIP code</span>
            <input className="input" value={zip} onChange={(e) => setZip(e.target.value)} placeholder="e.g. 30301" inputMode="numeric" />
          </label>
          <div className="row">
            <button className="btn primary" onClick={saveZip} disabled={zipBusy}>{zipBusy ? "Looking up…" : "Save location"}</button>
            {zipSaved && <span className="muted">Saved ✓</span>}
          </div>
          {org.homeZip && <p className="muted" style={{ fontSize: 12, marginTop: 10, marginBottom: 0 }}>Current default: {org.homeZip}</p>}
        </div>

        <div className="card">
          <h3>Appearance</h3>
          <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>Default theme for this device. Everyone can toggle from the top bar.</p>
          <div className="row">
            <button className={"btn" + (theme === "light" ? " primary" : "")} onClick={() => setTheme("light")}>☀️ Light</button>
            <button className={"btn" + (theme === "dark" ? " primary" : "")} onClick={() => setTheme("dark")}>🌙 Dark</button>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3>🔔 Follow-up nudges</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          Set how your reps get reminded to follow up. When a rep captures a <b>phone number</b> on the
          Street Sheet, Doorline nudges them to call back. These rules apply to your whole team.
        </p>

        <label className="row" style={{ gap: 8, marginBottom: 14, cursor: "pointer" }}>
          <input type="checkbox" checked={fu.enabled !== false} onChange={(e) => setFollowupSettings({ enabled: e.target.checked })} />
          <span>Follow-up nudges enabled</span>
        </label>

        <div className="grid-3 cards" style={{ gap: 12 }}>
          <label className="field" style={{ margin: 0 }}>
            <span>Nudge after (hours)</span>
            <input className="input" type="number" min="1" max="336" value={fu.hours ?? 24}
              disabled={fu.enabled === false}
              onChange={(e) => setFollowupSettings({ hours: Math.max(1, Number(e.target.value) || 24) })} />
          </label>
          <label className="field" style={{ margin: 0 }}>
            <span>Quiet hours start</span>
            <input className="input" type="time" value={fu.quietStart || "21:00"} disabled={fu.enabled === false}
              onChange={(e) => setFollowupSettings({ quietStart: e.target.value })} />
          </label>
          <label className="field" style={{ margin: 0 }}>
            <span>Quiet hours end</span>
            <input className="input" type="time" value={fu.quietEnd || "08:00"} disabled={fu.enabled === false}
              onChange={(e) => setFollowupSettings({ quietEnd: e.target.value })} />
          </label>
        </div>

        <div className="row" style={{ gap: 16, marginTop: 12 }}>
          <label className="row" style={{ gap: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={fu.onPhone !== false} disabled={fu.enabled === false} onChange={(e) => setFollowupSettings({ onPhone: e.target.checked })} />
            <span>When a phone number is added</span>
          </label>
          <label className="row" style={{ gap: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={fu.onCB !== false} disabled={fu.enabled === false} onChange={(e) => setFollowupSettings({ onCB: e.target.checked })} />
            <span>At the rep's call-back time</span>
          </label>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 12, marginBottom: 0 }}>
          Reps see a 🔔 with the count in their top bar and a list of who to call. (In-app now; SMS/push to reps comes with the mobile app.)
        </p>
      </div>
    </>
  );
}
