import { useState, useEffect } from "react";
import { useStore, dueNudges, resolveNudge, snoozeNudge } from "../store";

const tel = (p) => "tel:" + String(p).replace(/[^0-9+]/g, "");

// Rep-facing follow-up nudges: counts who's due to call back (driven by the
// manager's follow-up rules) and offers tap-to-call / snooze / done.
export default function NudgeBell({ user }) {
  useStore();
  const [open, setOpen] = useState(false);
  const [, tick] = useState(0);
  // refresh as time passes so nudges appear when they come due
  useEffect(() => { const id = setInterval(() => tick((t) => t + 1), 60000); return () => clearInterval(id); }, []);

  const nudges = dueNudges(user.id);

  return (
    <div className="bell-wrap">
      <button className="icon-btn" onClick={() => setOpen((o) => !o)} title="Follow-up nudges" aria-label="Follow-up nudges">
        🔔{nudges.length > 0 && <span className="bell-badge">{nudges.length}</span>}
      </button>
      {open && (
        <>
          <div className="bell-backdrop" onClick={() => setOpen(false)} />
          <div className="bell-panel">
            <div className="bell-head">Follow-ups due {nudges.length > 0 && `· ${nudges.length}`}</div>
            {nudges.length === 0 ? (
              <div className="bell-empty">You're all caught up 🎉</div>
            ) : (
              nudges.map((n) => (
                <div className="bell-item" key={n.source + n.id}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="nm">{n.label}</div>
                    <small className="muted">{n.sub}{n.sub ? " · " : ""}{n.phone}</small>
                  </div>
                  <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                    <a className="btn sm primary" href={tel(n.phone)}>📞 Call</a>
                    {n.source === "street" && <button className="btn sm" onClick={() => snoozeNudge(n.id, 3600e3)}>Snooze</button>}
                    {n.source === "street" && <button className="btn sm" onClick={() => resolveNudge(n.id)}>Done</button>}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
