import { useState } from "react";
import { useStore, getState, sheetTotals, repAccountability, activeCampaigns, ROLE_LABEL, SHEET_COLS } from "../../store";
import { localDay } from "../../lib/date.js";
import Modal from "../../components/Modal.jsx";

// Production totals for a campaign and a group, for one day, plus the
// agents behind them. The map that used to live here now belongs to
// Territory.

const dur = (m) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);

// "Presentations" has no column of its own on the Street Sheet. B/ID --
// getting the bill or the ID in hand -- is the step reps already log at
// that point in the pitch, so it is what the tile counts. Picked over DM,
// which would have made Presentations and Decision Makers the same number.
const PRESENTATION_KEY = "bid";

export default function TeamStats() {
  useStore();
  const state = getState();
  const [date, setDate] = useState(() => localDay());
  const [campaign, setCampaign] = useState("all");
  const [group, setGroup] = useState("all");
  const [openAgent, setOpenAgent] = useState(null);

  const campaigns = activeCampaigns();
  const campaignsAvailable = state.campaignsAvailable;
  const offices = state.offices || [];
  // Anyone who can be a manager of someone else.
  const managers = state.users.filter((u) => ["owner", "admin", "manager"].includes(u.role));

  // Everyone who works doors.
  let agents = state.users.filter((u) => u.role === "rep" || u.role === "manager");

  if (campaign !== "all") {
    const ids = new Set((state.campaignMembers || [])
      .filter((m) => m.campaignId === campaign).map((m) => m.repId));
    agents = agents.filter((u) => ids.has(u.id));
  }
  if (group !== "all") {
    const [kind, id] = group.split(":");
    agents = kind === "office"
      ? agents.filter((u) => u.officeId === id)
      : agents.filter((u) => u.managerId === id || u.id === id);
  }

  const rowsFor = (repId) => state.streetRows.filter((r) => r.repId === repId && r.date === date);

  const perAgent = agents.map((u) => {
    const rows = rowsFor(u.id);
    return { user: u, rows, t: sheetTotals(rows), acc: repAccountability(u.id) };
  });

  const totals = perAgent.reduce((a, x) => {
    a.sold += x.t.d; a.doors += x.t.doors; a.dm += x.t.dm;
    a.pres += x.t[PRESENTATION_KEY]; a.ni += x.t.ni;
    return a;
  }, { sold: 0, doors: 0, dm: 0, pres: 0, ni: 0 });

  // Busiest first, so the people carrying the number are at the top.
  const ranked = [...perAgent].sort((a, b) => (b.t.d - a.t.d) || (b.t.doors - a.t.doors));
  const contributing = ranked.filter((x) => x.t.doors > 0);

  const groupLabel = group === "all"
    ? "the whole campaign"
    : (() => {
        const [kind, id] = group.split(":");
        return kind === "office"
          ? offices.find((o) => o.id === id)?.name || "that office"
          : state.users.find((u) => u.id === id)?.name || "that manager";
      })();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Team Stats</h1>
          <p>Production for {groupLabel} on the selected day. Click an agent to see their day door by door.</p>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: "auto" }} />
          {date !== localDay() && <button className="btn sm" onClick={() => setDate(localDay())}>Today</button>}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
          <label className="field" style={{ margin: 0, flex: "1 1 220px" }}>
            <span>Campaign</span>
            <select className="select" value={campaign} disabled={!campaignsAvailable}
              onChange={(e) => setCampaign(e.target.value)}>
              <option value="all">All campaigns</option>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {!campaignsAvailable && (
              <small className="muted">Filtering by campaign needs the campaigns update applied to the database.</small>
            )}
          </label>
          <label className="field" style={{ margin: 0, flex: "1 1 220px" }}>
            <span>Team / Office / Manager</span>
            <select className="select" value={group} onChange={(e) => setGroup(e.target.value)}>
              <option value="all">All — the whole campaign</option>
              {offices.length > 0 && (
                <optgroup label="Office">
                  {offices.map((o) => <option key={o.id} value={`office:${o.id}`}>{o.name}</option>)}
                </optgroup>
              )}
              {managers.length > 0 && (
                <optgroup label="Manager">
                  {managers.map((m) => <option key={m.id} value={`mgr:${m.id}`}>{m.name}</option>)}
                </optgroup>
              )}
            </select>
            {offices.length === 0 && (
              <small className="muted">No offices set up yet — grouping by manager until there are.</small>
            )}
          </label>
        </div>
      </div>

      <div className="cards grid-5" style={{ marginBottom: 14 }}>
        <div className="card stat"><div className="n" style={{ color: "var(--green)" }}>{totals.sold}</div><div className="l">Total sold</div></div>
        <div className="card stat"><div className="n">{totals.doors}</div><div className="l">Total doors</div></div>
        <div className="card stat"><div className="n">{totals.dm}</div><div className="l">Decision makers</div></div>
        <div className="card stat"><div className="n">{totals.pres}</div><div className="l">Presentations</div></div>
        <div className="card stat"><div className="n">{totals.ni}</div><div className="l">Not interested</div></div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>
          Agents behind these numbers
          <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>
            {" "}· {contributing.length} of {agents.length} worked doors
          </span>
        </h3>
        {agents.length === 0 ? (
          <div className="empty">No agents match these filters.</div>
        ) : (
          <div className="table-scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Agent</th><th>Status</th>
                  <th style={{ textAlign: "right" }}>Doors</th>
                  <th style={{ textAlign: "right" }}>DM</th>
                  <th style={{ textAlign: "right" }}>Presentations</th>
                  <th style={{ textAlign: "right" }}>Sold</th>
                  <th style={{ textAlign: "right" }}>Not interested</th>
                  <th style={{ textAlign: "right" }}>Time on</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map(({ user, t, acc }) => (
                  <tr key={user.id} className={t.doors ? "rep-row" : undefined}>
                    <td>
                      <button className="linklike" onClick={() => setOpenAgent(user)}
                        title={`${user.name}'s day`}>{user.name}</button>
                      <div className="muted" style={{ fontSize: 11 }}>{ROLE_LABEL[user.role]}</div>
                    </td>
                    <td>
                      <span className="pill">
                        <span className="dot" style={{ background: acc.online ? "var(--green)" : "var(--muted)" }} />
                        {acc.online ? "online" : "offline"}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>{t.doors}</td>
                    <td style={{ textAlign: "right" }}>{t.dm}</td>
                    <td style={{ textAlign: "right" }}>{t[PRESENTATION_KEY]}</td>
                    <td style={{ textAlign: "right", color: t.d ? "var(--green)" : undefined, fontWeight: t.d ? 700 : 400 }}>{t.d}</td>
                    <td style={{ textAlign: "right" }}>{t.ni}</td>
                    <td style={{ textAlign: "right" }} className="muted">{acc.mins ? dur(acc.mins) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {openAgent && (
        <AgentDay
          user={openAgent}
          date={date}
          rows={rowsFor(openAgent.id)}
          onClose={() => setOpenAgent(null)}
        />
      )}
    </>
  );
}

// One agent's day, door by door.
function AgentDay({ user, date, rows, onClose }) {
  const t = sheetTotals(rows);
  const worked = [...rows].sort((a, b) => (a.slot || 0) - (b.slot || 0));
  const marks = (r) => SHEET_COLS.filter((c) => r[c.key]).map((c) => c.lab).join(" · ");

  return (
    <Modal
      title={`${user.name} · ${date}`}
      onClose={onClose}
      footer={<button className="btn primary" onClick={onClose}>Close</button>}
    >
      <div className="cards grid-5" style={{ marginBottom: 14 }}>
        <div className="card stat"><div className="n">{t.doors}</div><div className="l">Doors</div></div>
        <div className="card stat"><div className="n">{t.dm}</div><div className="l">DM</div></div>
        <div className="card stat"><div className="n">{t.bid}</div><div className="l">Presentations</div></div>
        <div className="card stat"><div className="n" style={{ color: "var(--green)" }}>{t.d}</div><div className="l">Sold</div></div>
        <div className="card stat"><div className="n">{t.ni}</div><div className="l">Not interested</div></div>
      </div>

      {worked.length === 0 ? (
        <div className="empty">Nothing logged for this day.</div>
      ) : (
        <div className="table-scroll">
          <table className="tbl">
            <thead>
              <tr><th>#</th><th>Address</th><th>Marked</th><th>Customer</th><th>Phone</th><th>Comments</th><th>CB</th></tr>
            </thead>
            <tbody>
              {worked.map((r) => (
                <tr key={r.id}>
                  <td className="muted">{r.slot || "—"}</td>
                  <td>{r.street || <span className="muted">—</span>}</td>
                  <td className="muted" style={{ whiteSpace: "nowrap" }}>{marks(r) || "—"}</td>
                  <td className="muted">{r.customer || "—"}</td>
                  <td className="muted">{r.phone || "—"}</td>
                  <td className="muted">{r.comments || "—"}</td>
                  <td className="muted">{r.cb || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
