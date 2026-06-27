import { useState } from "react";
import { useStore, getState, setOrg } from "../../store";
import { useTheme, setTheme } from "../../theme.js";

export default function Settings() {
  useStore();
  const theme = useTheme();
  const org = getState().org;
  const [name, setName] = useState(org.name);
  const [saved, setSaved] = useState(false);

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
          <h3>Appearance</h3>
          <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>Default theme for this device. Everyone can toggle from the top bar.</p>
          <div className="row">
            <button className={"btn" + (theme === "light" ? " primary" : "")} onClick={() => setTheme("light")}>☀️ Light</button>
            <button className={"btn" + (theme === "dark" ? " primary" : "")} onClick={() => setTheme("dark")}>🌙 Dark</button>
          </div>
        </div>
      </div>
    </>
  );
}
