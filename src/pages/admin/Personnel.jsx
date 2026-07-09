import { useState } from "react";
import { useStore, getState, addUser, updateUser, removeUser, toggleStatus, ROLE_LABEL, PLAN_NAME } from "../../store";
import { geocodeZip } from "../../lib/geocode.js";
import { US_TIMEZONES, guessTimezone } from "../../lib/date.js";
import Modal from "../../components/Modal.jsx";

const ROLES = ["owner", "admin", "manager", "rep", "viewer"];
const PLANS = [3900, 5900, 8900];
const blank = () => ({ name: "", email: "", role: "rep", plan: 5900, territory: "—", pass: "", timezone: guessTimezone(), homeZip: "", homeLat: null, homeLng: null });

export default function Personnel() {
  useStore();
  const state = getState();
  const [form, setForm] = useState(null); // {mode:'add'|'edit', data}
  const [err, setErr] = useState("");
  const [zipBusy, setZipBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null); // {email, tempPassword} after a live add

  const open = (mode, data) => { setErr(""); setForm({ mode, data: data ? { timezone: "", homeZip: "", homeLat: null, homeLng: null, ...data } : blank() }); };

  const lookupZip = async () => {
    const zip = form.data.homeZip;
    if (!zip?.trim()) return;
    setZipBusy(true);
    try {
      const hit = await geocodeZip(zip);
      if (!hit) return alert("No match for that ZIP code.");
      setForm((f) => ({ ...f, data: { ...f.data, homeLat: hit.lat, homeLng: hit.lng } }));
    } catch {
      alert("ZIP lookup needs an internet connection.");
    } finally {
      setZipBusy(false);
    }
  };

  const submit = async () => {
    const d = form.data;
    if (!d.name.trim() || !d.email.trim()) return setErr("Name and email are required.");
    if (form.mode === "add") {
      setBusy(true);
      const r = await addUser(d);
      setBusy(false);
      if (r.error) return setErr(r.error);
      setForm(null);
      // Live mode returns a temp password to hand to the new hire.
      if (r.tempPassword) setCreated({ email: d.email, tempPassword: r.tempPassword });
      return;
    }
    updateUser(d.id, { name: d.name, role: d.role, plan: Number(d.plan), territory: d.territory, timezone: d.timezone || null, homeZip: d.homeZip || null, homeLat: d.homeLat, homeLng: d.homeLng });
    setForm(null);
  };

  const billed = state.users.filter((u) => u.plan > 0 && u.status === "active");
  const monthly = billed.reduce((a, u) => a + u.plan, 0);
  const needsLocation = (role) => ["rep", "manager"].includes(role);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Personnel</h1>
          <p>{state.users.length} people · {billed.length} billable seats · ${(monthly / 100).toFixed(0)}/mo</p>
        </div>
        <button className="btn primary" onClick={() => open("add")}>+ Add person</button>
      </div>

      <div className="card">
        <div className="table-scroll">
          <table className="tbl">
            <thead>
              <tr><th>Name</th><th>Email</th><th>Role</th><th>Territory</th><th>Home ZIP</th><th>Plan</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {state.users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td className="muted">{u.email}</td>
                  <td><span className="tag">{ROLE_LABEL[u.role]}</span></td>
                  <td className="muted">{u.territory}</td>
                  <td className="muted">{u.homeZip || "—"}</td>
                  <td className="muted">{PLAN_NAME[u.plan] || "—"}{u.plan > 0 ? ` · $${(u.plan / 100).toFixed(0)}` : ""}</td>
                  <td>
                    <span className="pill">
                      <span className="dot" style={{ background: u.status === "active" ? "var(--green)" : "var(--muted)" }} />
                      {u.status}
                    </span>
                  </td>
                  <td>
                    <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                      <button className="btn sm" onClick={() => open("edit", u)}>Edit</button>
                      <button className="btn sm" onClick={() => toggleStatus(u.id)}>{u.status === "active" ? "Deactivate" : "Activate"}</button>
                      <button className="btn sm danger" onClick={() => { if (confirm(`Remove ${u.name}?`)) removeUser(u.id); }}>Remove</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {form && (
        <Modal
          title={form.mode === "add" ? "Add person" : `Edit ${form.data.name}`}
          onClose={() => setForm(null)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setForm(null)} disabled={busy}>Cancel</button>
              <button className="btn primary" onClick={submit} disabled={busy}>{busy ? "Adding…" : form.mode === "add" ? "Add" : "Save"}</button>
            </>
          }
        >
          {err && <div className="err">{err}</div>}
          <label className="field">
            <span>Full name</span>
            <input className="input" value={form.data.name} onChange={(e) => setForm({ ...form, data: { ...form.data, name: e.target.value } })} />
          </label>
          <label className="field">
            <span>Email</span>
            <input className="input" type="email" value={form.data.email} disabled={form.mode === "edit"}
              onChange={(e) => setForm({ ...form, data: { ...form.data, email: e.target.value } })} />
          </label>
          <div className="row" style={{ gap: 10 }}>
            <label className="field" style={{ flex: 1 }}>
              <span>Role</span>
              <select className="select" value={form.data.role} onChange={(e) => setForm({ ...form, data: { ...form.data, role: e.target.value } })}>
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </label>
            <label className="field" style={{ flex: 1 }}>
              <span>Territory</span>
              <input className="input" value={form.data.territory} onChange={(e) => setForm({ ...form, data: { ...form.data, territory: e.target.value } })} />
            </label>
          </div>
          {needsLocation(form.data.role) && (
            <>
              <label className="field">
                <span>Home ZIP code</span>
                <div className="row" style={{ gap: 8 }}>
                  <input className="input" style={{ flex: 1 }} value={form.data.homeZip} placeholder="e.g. 30301" inputMode="numeric"
                    onChange={(e) => setForm({ ...form, data: { ...form.data, homeZip: e.target.value, homeLat: null, homeLng: null } })} />
                  <button className="btn sm" type="button" onClick={lookupZip} disabled={zipBusy || !form.data.homeZip?.trim()}>{zipBusy ? "…" : "Look up"}</button>
                </div>
                {form.data.homeZip && (form.data.homeLat != null
                  ? <small style={{ color: "var(--green)" }}>✓ Location set — their map centers here instead of the company default.</small>
                  : <small className="muted">Not looked up yet — falls back to the company default location until you do.</small>)}
              </label>
              <label className="field">
                <span>Timezone</span>
                <select className="select" value={form.data.timezone || ""} onChange={(e) => setForm({ ...form, data: { ...form.data, timezone: e.target.value } })}>
                  <option value="">— Use device default —</option>
                  {US_TIMEZONES.map((z) => <option key={z.tz} value={z.tz}>{z.lab}</option>)}
                </select>
                <small className="muted">Their Street Sheet resets to zero at midnight in this timezone.</small>
              </label>
            </>
          )}
          {["rep", "manager"].includes(form.data.role) && (
            <label className="field">
              <span>Plan (billable seat)</span>
              <select className="select" value={form.data.plan} onChange={(e) => setForm({ ...form, data: { ...form.data, plan: Number(e.target.value) } })}>
                {PLANS.map((p) => <option key={p} value={p}>{PLAN_NAME[p]} · ${(p / 100).toFixed(0)}/mo</option>)}
              </select>
            </label>
          )}
          {form.mode === "add" && (
            <label className="field" style={{ marginBottom: 0 }}>
              <span>Temporary password</span>
              <input className="input" value={form.data.pass} placeholder="Leave blank to generate one"
                onChange={(e) => setForm({ ...form, data: { ...form.data, pass: e.target.value } })} />
              <small className="muted">They sign in with this and their email. Leave blank and we'll generate a secure one to hand off.</small>
            </label>
          )}
        </Modal>
      )}

      {created && (
        <Modal
          title="✅ Account created"
          onClose={() => setCreated(null)}
          footer={<button className="btn primary" onClick={() => setCreated(null)}>Done</button>}
        >
          <p style={{ marginTop: 0 }}>Share these sign-in details with them — this is the only time the password is shown.</p>
          <label className="field">
            <span>Email</span>
            <input className="input" readOnly value={created.email} onFocus={(e) => e.target.select()} />
          </label>
          <label className="field" style={{ marginBottom: 8 }}>
            <span>Temporary password</span>
            <input className="input" readOnly value={created.tempPassword} onFocus={(e) => e.target.select()} style={{ fontFamily: "monospace" }} />
          </label>
          <button className="btn sm" onClick={() => { navigator.clipboard?.writeText(`Email: ${created.email}\nPassword: ${created.tempPassword}`); }}>
            ⧉ Copy both
          </button>
          <p className="muted" style={{ fontSize: 12, marginTop: 12, marginBottom: 0 }}>
            They can sign in on any device at this site. Ask them to change the password from their profile after first sign-in.
          </p>
        </Modal>
      )}
    </>
  );
}
