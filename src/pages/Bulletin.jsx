import { useState } from "react";
import { useStore, getState, addPost, removePost, togglePin } from "../store";

const fmt = (ts) => new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default function Bulletin({ user }) {
  useStore();
  const state = getState();
  const canPost = ["owner", "admin", "manager"].includes(user.role);
  const isAdminish = ["owner", "admin"].includes(user.role);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const posts = [...state.posts].sort((a, b) => (b.pinned - a.pinned) || (b.ts - a.ts));

  const submit = () => {
    if (!title.trim() && !body.trim()) return;
    addPost({ authorId: user.id, authorName: user.name, title: title.trim() || "Update", body: body.trim() });
    setTitle(""); setBody("");
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Bulletin board</h1>
          <p>{canPost ? "Post announcements that reach every team member." : "Announcements from your team leads."}</p>
        </div>
      </div>

      {canPost && (
        <div className="card" style={{ marginBottom: 18 }}>
          <h3>📣 New announcement</h3>
          <label className="field">
            <span>Title</span>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Today's push: hit 40 doors" />
          </label>
          <label className="field">
            <span>Message</span>
            <textarea className="input" rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write to the whole team…" />
          </label>
          <div className="row between">
            <small className="muted">Visible to everyone on the team.</small>
            <button className="btn primary" onClick={submit}>Post to team</button>
          </div>
        </div>
      )}

      {posts.length === 0 ? (
        <div className="card empty">No announcements yet.</div>
      ) : (
        posts.map((p) => (
          <div key={p.id} className={"post" + (p.pinned ? " pinned" : "")}>
            <div className="row between">
              <h4>{p.pinned && "📌 "}{p.title}</h4>
              {(isAdminish || p.authorId === user.id) && (
                <div className="row" style={{ gap: 6 }}>
                  {isAdminish && <button className="btn sm ghost" onClick={() => togglePin(p.id)}>{p.pinned ? "Unpin" : "Pin"}</button>}
                  <button className="btn sm danger" onClick={() => { if (confirm("Delete this post?")) removePost(p.id); }}>Delete</button>
                </div>
              )}
            </div>
            <div className="meta">{p.authorName} · {fmt(p.ts)}</div>
            {p.body && <div className="body">{p.body}</div>}
          </div>
        ))
      )}
    </>
  );
}
