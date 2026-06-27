import { useState } from "react";
import { useStore, getState, login } from "../store";
import { DEMO } from "../supabaseClient";
import { signIn as authSignIn } from "../api/auth";
import { initLive } from "../api/bootstrap";
import { useTheme, toggleTheme } from "../theme.js";
import Logo from "../components/Logo.jsx";

const QUICK = [
  { label: "Admin / Owner", email: "admin@doorline.app", pass: "admin" },
  { label: "Field Rep", email: "jordan@doorline.app", pass: "rep" },
];

export default function Login({ onBack }) {
  useStore();
  useTheme();
  const org = getState().org;
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");

  // One auth path for both the form and the quick-login buttons.
  const attempt = async (em, pw) => {
    if (!DEMO) {
      // Live mode: real Supabase Auth, then hydrate + subscribe.
      const { error } = await authSignIn(em.trim(), pw);
      if (error) return setErr(error.message);
      await initLive();
      return;
    }
    const r = login(em.trim(), pw);
    if (r.error) setErr(r.error);
  };
  const submit = (e) => { e?.preventDefault?.(); attempt(email, pass); };
  const quick = (q) => { setEmail(q.email); setPass(q.pass); setErr(""); attempt(q.email, q.pass); };

  return (
    <div className="login-wrap">
      <button className="icon-btn" onClick={toggleTheme} title="Toggle theme" style={{ position: "fixed", top: 16, right: 16 }}>🌗</button>
      {onBack && <a onClick={onBack} style={{ position: "fixed", top: 20, left: 20, cursor: "pointer", fontSize: 14, color: "var(--muted)" }}>← Back to site</a>}
      <div className="login-card card">
        <div style={{ marginBottom: 14 }}>{org.logo ? <div className="logo-lg" style={{ marginBottom: 0 }}><img src={org.logo} alt="" /></div> : <Logo size={46} />}</div>
        <h1 style={{ fontSize: 24 }}>{org.name || "Doorline"}</h1>
        <p className="muted" style={{ marginTop: 0 }}>Door-to-door sales — field & admin in one.</p>

        {err && <div className="err">{err}</div>}

        <form onSubmit={submit}>
          <label className="field">
            <span>Email</span>
            <input className="input" type="email" value={email} autoComplete="username"
              onChange={(e) => setEmail(e.target.value)} placeholder="you@doorline.app" />
          </label>
          <label className="field">
            <span>Password</span>
            <input className="input" type="password" value={pass} autoComplete="current-password"
              onChange={(e) => setPass(e.target.value)} placeholder="••••" />
          </label>
          <button className="btn primary" type="submit" style={{ width: "100%" }}>Sign in</button>
        </form>

        <div className="divider">quick login</div>
        <div className="quick">
          {QUICK.map((q) => (
            <button key={q.email} className="btn" onClick={() => quick(q)}>{q.label}</button>
          ))}
        </div>

        <p className="muted" style={{ fontSize: 12, marginTop: 16, marginBottom: 0 }}>
          {DEMO
            ? "Demo mode — data is saved to this browser. Add Supabase keys in .env to sync across devices."
            : "Connected to Supabase."}
        </p>
      </div>
    </div>
  );
}
