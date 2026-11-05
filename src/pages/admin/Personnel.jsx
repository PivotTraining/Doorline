import { useState } from "react";
import { useStore, getState, addUser, updateUser, removeUser, toggleStatus, ROLE_LABEL,
  activeCampaigns, campaignsForRep, assignCampaign, unassignCampaign } from "../../store";
import { geocodeZip } from "../../lib/geocode.js";
import { US_TIMEZONES, guessTimezone } from "../../lib/date.js";
import { repCode } from "../../lib/campaigns.js";
import Modal from "../../components/Modal.jsx";
import { DEMO } from "../../supabaseClient.js";
import { issueCompanyInvite } from "../../api/auth.js";
import { updateTeamMember } from "../../api/services.js";

const ROLES = ["owner", "admin", "manager", "rep", "viewer"];
const blank = () => ({ name: "", email: "", role: "rep", territory: "—", pass: "", timezone: guessTimezone(), homeZip: "", homeLat: null, homeLng: null });

export default function Personnel() {
  useStore();
  const state = getState();
  const [form, setForm] = useState(null); // {mode:'add'|'edit', data}
  const [err, setErr] = useState("");
  const [zipBusy, setZipBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null); // {email, tempPassword} after a live add or reset
  const [campaignsFor, setCampaignsFor] = useState(null); // person whose campaigns are open
  const [enrollmentUrl, setEnrollmentUrl] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const generateLink = async () => {
    setInviteError("");
    if (DEMO) return setInviteError("Connect the Doorline production database to enable secure company enrollment links.");
    setInviteBusy(true);
    try {
      const token = await issueCompanyInvite();
      setEnrollmentUrl(`${window.location.origin}/app?invite=${encodeURIComponent(token)}`);
    } catch (e) { setInviteError(e.message || "Could not create the enrollment link."); }
    finally { setInviteBusy(false); }
  };

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
    // `plan` is deliberately absent: the form no longer collects a seat
    // price, and sending one would overwrite the stored value with a
    // default the admin never chose.
    const original = state.users.find((u) => u.id === d.id);
    const emailChanged = !DEMO && d.email.trim().toLowerCase() !== (original?.email || "").toLowerCase();
    if (emailChanged) {
      setBusy(true);
      const r = await updateTeamMember({ id: d.id, email: d.email.trim() });
      setBusy(false);
      if (r.error) return setErr(r.error);
      updateUser(d.id, { email: r.email });
    }
    updateUser(d.id, { name: d.name, role: d.role, territory: d.territory, timezone: d.timezone || null, homeZip: d.homeZip || null, homeLat: d.homeLat, homeLng: d.homeLng });
    setForm(null);
  };

  // Generates a fresh temporary password and shows it once, to hand over.
  const resetPassword = async (d) => {
    if (!confirm(`Reset ${d.name}'s password? Their current one stops working immediately.`)) return;
    setErr("");
    setBusy(true);
    const r = await updateTeamMember({ id: d.id, password: true });
    setBusy(false);
    if (r.error) return setErr(r.error);
    setForm(null);
    setCreated({ email: r.email, tempPassword: r.tempPassword, reset: true });
  };

  const activeCount = state.users.filter((u) => u.status === "active").length;
  const needsLocation = (role) => ["rep", "manager"].includes(role);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Personnel</h1>
          <p>{state.users.length} people · {activeCount} active · click a name to see their campaigns</p>
        </div>
        <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
          <button className="btn" onClick={generateLink} disabled={inviteBusy}>{inviteBusy ? "Creating link…" : "🔗 Company enrollment link"}</button>
          <button className="btn primary" onClick={() => open("add")}>+ Add person</button>
        </div>
      </div>

      {(inviteError || enrollmentUrl) && (
        <div className="card" style={{ marginBottom: 14 }}>
          {inviteError && <div className="err">{inviteError}</div>}
          {enrollmentUrl && <>
            <b>Agent enrollment link</b>
            <p className="muted" style={{ fontSize: 13 }}>Valid for 14 days or 25 agent signups, whichever comes first. Anyone with this link can enroll as a rep in your company. Share privately.</p>
            <div className="row" style={{ gap: 8 }}>
              <input className="input" readOnly value={enrollmentUrl} onFocus={(e) => e.target.select()} />
              <button className="btn primary" onClick={() => navigator.clipboard?.writeText(enrollmentUrl)}>Copy</button>
            </div>
          </>}
        </div>
      )}

      <div className="card">
        <div className="table-scroll">
          <table className="tbl">
            <thead>
              <tr><th>Name</th><th>Rep ID</th><th>Email</th><th>Role</th><th>Territory</th><th>Home ZIP</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {state.users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <button className="rep-link linklike" title={`Campaigns ${u.name} is onboarded with`}
                      onClick={() => setCampaignsFor(u)}>{u.name}</button>
                  </td>
                  <td className="muted" style={{ fontFamily: "monospace" }}>{repCode(u.id)}</td>
                  <td className="muted">{u.email}</td>
                  <td><span className="tag">{ROLE_LABEL[u.role]}</span></td>
                  <td className="muted">{u.territory}</td>
                  <td className="muted">{u.homeZip || "—"}</td>
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
            <span>Email (their username)</span>
            <input className="input" type="email" value={form.data.email} disabled={form.mode === "edit" && DEMO}
              onChange={(e) => setForm({ ...form, data: { ...form.data, email: e.target.value } })} />
            {form.mode === "edit" && (
              <small className="muted">
                {DEMO
                  ? "Changing the sign-in email needs the live database."
                  : "This is what they sign in with. Tell them before you save a change."}
              </small>
            )}
          </label>
          {form.mode === "edit" && !DEMO && (
            <div className="field">
              <span>Password</span>
              <div>
                <button className="btn sm" type="button" disabled={busy} onClick={() => resetPassword(form.data)}>
                  {busy ? "Working…" : "Reset password"}
                </button>
              </div>
              <small className="muted">Issues a new temporary password and shows it once, for you to hand over. Their current password stops working straight away.</small>
            </div>
          )}
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
          title={created.reset ? "🔑 Password reset" : "✅ Account created"}
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

      {campaignsFor && (
        <CampaignsForPerson person={campaignsFor} onClose={() => setCampaignsFor(null)} />
      )}
    </>
  );
}

// Which campaigns a person is onboarded with, and the place to change it.
function CampaignsForPerson({ person, onClose }) {
  useStore();
  const all = activeCampaigns();
  const available = getState().campaignsAvailable;
  const mine = new Set(campaignsForRep(person.id).map((c) => c.id));

  return (
    <Modal
      title={`${person.name} · campaigns`}
      onClose={onClose}
      footer={<button className="btn primary" onClick={onClose}>Done</button>}
    >
      {!available ? (
        <p className="muted" style={{ marginTop: 0 }}>
          Campaign assignment needs the campaigns update applied to the database. Until then, campaigns
          are the company-wide list under the Campaigns tab and everyone sees all of them.
        </p>
      ) : all.length === 0 ? (
        <p className="muted" style={{ marginTop: 0 }}>No campaigns yet — create one on the Campaigns tab first.</p>
      ) : (
        <>
          <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
            Tick the campaigns {person.name.split(" ")[0]} is onboarded with. This drives their campaign
            documents and the campaign filters on Team Stats and Territory.
          </p>
          {all.map((c) => (
            <label key={c.id} className="row" style={{ gap: 10, alignItems: "flex-start", padding: "8px 0", borderTop: "1px solid var(--border)" }}>
              <input type="checkbox" style={{ width: 18, height: 18, marginTop: 2, accentColor: "var(--brand)" }}
                checked={mine.has(c.id)}
                onChange={(e) => (e.target.checked ? assignCampaign(c.id, person.id) : unassignCampaign(c.id, person.id))} />
              <span style={{ minWidth: 0 }}>
                <b>{c.name}</b>{!c.active && <span className="muted"> · paused</span>}
                {c.description && <div className="muted" style={{ fontSize: 12 }}>{c.description}</div>}
              </span>
            </label>
          ))}
        </>
      )}
    </Modal>
  );
}
