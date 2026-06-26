import { useState } from "react";
import { login } from "../store";
import { DEMO } from "../supabaseClient";

const QUICK = [
  { label: "Admin / Owner", email: "admin@doorline.app", pass: "admin" },
  { label: "Field Rep", email: "jordan@doorline.app", pass: "rep" },
];

export default function Login() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");

  const submit = (e) => {
    e?.preventDefault?.();
    const r = login(email.trim(), pass);
    if (r.error) setErr(r.error);
  };
  const quick = (q) => {
    setEmail(q.email); setPass(q.pass); setErr("");
    const r = login(q.email, q.pass);
    if (r.error) setErr(r.error);
  };

  return (
    <div className="login-wrap">
      <div className="login-card card">
        <div className="logo-lg">D</div>
        <h1 style={{ fontSize: 24 }}>Doorline</h1>
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
