import { useStore, getState, repStats, DISPOS } from "../../store";

export default function MyDay({ user }) {
  useStore();
  const state = getState();
  const s = repStats(user.id);
  const mine = state.homes.filter((h) => h.repId === user.id);
  const today = new Date().toISOString().slice(0, 10);
  const dueToday = mine.filter((h) => h.due && h.due <= today && ["callback", "appt"].includes(h.status));
  const recent = mine.filter((h) => h.status !== "untouched").slice(-6).reverse();
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{greet}, {user.name.split(" ")[0]} 👋</h1>
          <p>Territory: {user.territory} · Here's where today stands.</p>
        </div>
      </div>

      <div className="cards grid-4" style={{ marginBottom: 18 }}>
        <Stat n={s.knocks} l="Doors worked" />
        <Stat n={s.contacts} l="Conversations" />
        <Stat n={s.appts} l="Appointments" />
        <Stat n={s.closes} l="Sales" sub={`${s.rate}% close rate`} />
      </div>

      <div className="cards grid-2">
        <div className="card">
          <h3>🔁 Follow-ups due</h3>
          {dueToday.length === 0 ? (
            <p className="muted">Nothing due today. Go knock some doors.</p>
          ) : (
            dueToday.map((h) => (
              <div key={h.id} className="row between" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                <div>
                  <div>{h.addr}</div>
                  <small className="muted">{h.contact || "—"} · due {h.due}</small>
                </div>
                <span className="pill"><span className="dot" style={{ background: DISPOS[h.status].hex }} /> {DISPOS[h.status].lab}</span>
              </div>
            ))
          )}
        </div>

        <div className="card">
          <h3>🕑 Recent activity</h3>
          {recent.length === 0 ? (
            <p className="muted">No doors logged yet. Open Map / Doors to start.</p>
          ) : (
            recent.map((h) => (
              <div key={h.id} className="row between" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                <span>{h.addr}</span>
                <span className="pill"><span className="dot" style={{ background: DISPOS[h.status].hex }} /> {DISPOS[h.status].lab}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

function Stat({ n, l, sub }) {
  return (
    <div className="card stat">
      <div className="n">{n}</div>
      <div className="l">{l}</div>
      {sub && <small style={{ color: "var(--green)" }}>{sub}</small>}
    </div>
  );
}
