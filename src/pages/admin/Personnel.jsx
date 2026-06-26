import { useState } from "react";
import { useStore, getState, addUser, updateUser, removeUser, toggleStatus, ROLE_LABEL, PLAN_NAME } from "../../store";
import Modal from "../../components/Modal.jsx";

const ROLES = ["owner", "admin", "manager", "rep", "viewer"];
const PLANS = [3900, 5900, 8900];
const blank = { name: "", email: "", role: "rep", plan: 5900, territory: "—", pass: "" };

export default function Personnel() {
  useStore();
  const state = getState();
  const [form, setForm] = useState(null); // {mode:'add'|'edit', data}
  const [err, setErr] = useState("");

  const open = (mode, data) => { setErr(""); setForm({ mode, data: data ? { ...data } : { ...blank } }); };

  const submit = () => {
    const d = form.data;
    if (!d.name.trim() || !d.email.trim()) return setErr("Name and email are required.");
    if (form.mode === "add") {
      const r = addUser(d);
      if (r.error) return setErr(r.error);
    } else {
      updateUser(d.id, { name: d.name, role: d.role, plan: Number(d.plan), territory: d.territory });
    }
    setForm(null);
  };

  const billed = state.users.filter((u) => u.plan > 0 && u.status === "active");
  const monthly = billed.reduce((a, u) => a + u.plan, 0);

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
        <table className="tbl">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Role</th><th>Territory</th><th>Plan</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {state.users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td className="muted">{u.email}</td>
                <td><span className="tag">{ROLE_LABEL[u.role]}</span></td>
                <td className="muted">{u.territory}</td>
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

      {form && (
        <Modal
          title={form.mode === "add" ? "Add person" : `Edit ${form.data.name}`}
          onClose={() => setForm(null)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setForm(null)}>Cancel</button>
              <button className="btn primary" onClick={submit}>{form.mode === "add" ? "Add" : "Save"}</button>
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
              <input className="input" value={form.data.pass} placeholder="defaults to “rep”"
                onChange={(e) => setForm({ ...form, data: { ...form.data, pass: e.target.value } })} />
            </label>
          )}
        </Modal>
      )}
    </>
  );
}
