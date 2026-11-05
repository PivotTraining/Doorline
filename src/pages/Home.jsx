import { useState } from "react";
import { useStore, getState, addPost, removePost, togglePin, dayStats, isAgentLive, ROLE_LABEL } from "../store";
import Logo from "../components/Logo.jsx";

// The first thing anyone sees after signing in: the company's own wall.
// Announcements, who is working right now, and how the day is going --
// rather than dropping a rep straight into a spreadsheet.

const ago = (ts) => {
  const secs = Math.max(0, (Date.now() - ts) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
};

const initials = (name) =>
  (name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "?";

// Stable per-person avatar colour derived from the id, so the same
// teammate is always the same colour without storing anything.
const hueOf = (id) => {
  let h = 0;
  for (const ch of String(id || "")) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
};

function Avatar({ name, id, size = 40 }) {
  const h = hueOf(id);
  return (
    <div
      className="feed-avatar"
      aria-hidden="true"
      style={{
        width: size, height: size, fontSize: Math.round(size * 0.36),
        background: `linear-gradient(135deg, hsl(${h} 70% 52%), hsl(${(h + 40) % 360} 70% 62%))`,
      }}
    >
      {initials(name)}
    </div>
  );
}

export default function Home({ user }) {
  useStore();
  const state = getState();
  const org = state.org;
  const canPost = ["owner", "admin", "manager"].includes(user.role);
  const isAdminish = ["owner", "admin"].includes(user.role);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [open, setOpen] = useState(false);

  const posts = [...state.posts].sort((a, b) => (b.pinned - a.pinned) || (b.ts - a.ts));

  // Company pulse for today. dayStats() resolves each person's own local
  // day, so a team spread across timezones still rolls up correctly.
  const field = state.users.filter((u) => u.role === "rep" || u.role === "manager");
  const pulse = field.reduce(
    (acc, u) => {
      const s = dayStats(u.id);
      acc.doors += s.doors; acc.deals += s.d; acc.dm += s.dm;
      return acc;
    },
    { doors: 0, deals: 0, dm: 0 }
  );
  const onNow = field.filter((u) => isAgentLive(state.presence[u.id]));

  const submit = () => {
    if (!title.trim() && !body.trim()) return;
    addPost({ authorId: user.id, authorName: user.name, title: title.trim() || "Update", body: body.trim() });
    setTitle(""); setBody(""); setOpen(false);
  };

  const firstName = (user.name || "").trim().split(/\s+/)[0] || "there";

  return (
    <div className="home">
      {/* ---------- company banner ---------- */}
      <div className="home-hero">
        <div className="home-hero-mark">
          {org.logo ? <img src={org.logo} alt={`${org.name || "Company"} logo`} /> : <Logo size={64} />}
        </div>
        <div className="home-hero-text">
          <h1>{org.name || "Doorline"}</h1>
          <p>Welcome back, {firstName} · {ROLE_LABEL[user.role]}</p>
        </div>
        <div className="home-hero-live">
          {onNow.length > 0 ? (
            <span className="pill">
              <span className="dot pulse-dot" style={{ background: "var(--green)" }} />
              {onNow.length} on the clock
            </span>
          ) : (
            <span className="pill muted-pill">
              <span className="dot" style={{ background: "var(--muted)" }} /> nobody on the clock
            </span>
          )}
        </div>
      </div>

      {/* ---------- today's pulse ---------- */}
      <div className="home-pulse">
        <div className="home-pulse-item"><b>{pulse.doors}</b><span>Doors today</span></div>
        <div className="home-pulse-item"><b style={{ color: "var(--green)" }}>{pulse.deals}</b><span>Deals today</span></div>
        <div className="home-pulse-item"><b>{pulse.dm}</b><span>Decision makers</span></div>
        <div className="home-pulse-item"><b>{field.length}</b><span>On the team</span></div>
      </div>

      {onNow.length > 0 && (
        <div className="home-who">
          <span className="muted" style={{ fontSize: 12 }}>Working now:</span>
          {onNow.slice(0, 12).map((u) => (
            <span key={u.id} className="home-who-chip" title={`${u.name} — ${ROLE_LABEL[u.role]}`}>
              <Avatar name={u.name} id={u.id} size={22} />
              {u.name}
            </span>
          ))}
          {onNow.length > 12 && <span className="muted" style={{ fontSize: 12 }}>+{onNow.length - 12} more</span>}
        </div>
      )}

      {/* ---------- composer ---------- */}
      {canPost && (
        <div className="composer">
          <div className="row" style={{ gap: 10, alignItems: "center" }}>
            <Avatar name={user.name} id={user.id} />
            {open ? (
              <b style={{ fontSize: 14 }}>New announcement</b>
            ) : (
              <button className="composer-prompt" onClick={() => setOpen(true)}>
                Share an announcement with the team…
              </button>
            )}
          </div>
          {open && (
            <>
              <label className="field" style={{ marginTop: 10 }}>
                <span>Title</span>
                <input className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Today's push: hit 40 doors" />
              </label>
              <label className="field">
                <span>Message</span>
                <textarea className="input" rows={3} value={body} onChange={(e) => setBody(e.target.value)}
                  placeholder="Write to the whole team…" />
              </label>
              <div className="row between">
                <small className="muted">Everyone on the team sees this on their homepage.</small>
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn ghost sm" onClick={() => { setOpen(false); setTitle(""); setBody(""); }}>Cancel</button>
                  <button className="btn primary" onClick={submit}>Post to team</button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ---------- the wall ---------- */}
      {posts.length === 0 ? (
        <div className="card empty">
          {canPost
            ? "No announcements yet — post the first one above."
            : "No announcements yet. Updates from your team leads will show up here."}
        </div>
      ) : (
        posts.map((p) => (
          <article key={p.id} className={"feed-post" + (p.pinned ? " pinned" : "")}>
            <header>
              <Avatar name={p.authorName} id={p.authorId} />
              <div className="feed-post-who">
                <b>{p.authorName || "Someone"}</b>
                <small className="muted">{ago(p.ts)}</small>
              </div>
              {p.pinned && <span className="feed-pin" title="Pinned by an admin">📌 Pinned</span>}
              {(isAdminish || p.authorId === user.id) && (
                <div className="row feed-post-actions" style={{ gap: 6 }}>
                  {isAdminish && (
                    <button className="btn sm ghost" onClick={() => togglePin(p.id)}>
                      {p.pinned ? "Unpin" : "Pin"}
                    </button>
                  )}
                  <button className="btn sm danger" onClick={() => { if (confirm("Delete this announcement?")) removePost(p.id); }}>
                    Delete
                  </button>
                </div>
              )}
            </header>
            {p.title && <h3>{p.title}</h3>}
            {p.body && <p className="feed-post-body">{p.body}</p>}
          </article>
        ))
      )}
    </div>
  );
}
