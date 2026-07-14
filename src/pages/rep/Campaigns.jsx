import { useState } from "react";
import { useStore, activeCampaigns } from "../../store";
import { repCode, personalizedEnrollUrl } from "../../lib/campaigns.js";

function Copyable({ label, value }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  };
  return (
    <button className="btn sm" onClick={copy} title={value} style={{ maxWidth: "100%" }}>
      {copied ? "✓ Copied" : label}
    </button>
  );
}

export default function Campaigns({ user }) {
  useStore();
  const code = repCode(user.id);
  const campaigns = activeCampaigns().filter((c) => c.active && c.name);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Campaigns</h1>
          <p>Everything you're selling — the details to pitch, current promos, and your own enrollment link for each one.</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div className="l" style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".05em" }}>Your rep ID</div>
          <div style={{ fontSize: 26, fontWeight: 800, fontFamily: "monospace", letterSpacing: ".08em" }}>{code}</div>
        </div>
        <div style={{ maxWidth: 340 }}>
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>This is your unique ID. Your enrollment links and reports are tagged to it — use it when a campaign asks for your agent/rep number.</p>
          <Copyable label="⧉ Copy my ID" value={code} />
        </div>
      </div>

      {campaigns.length === 0 ? (
        <div className="card"><p className="muted" style={{ margin: 0 }}>No campaigns are live yet. Your manager will add them here — check back soon.</p></div>
      ) : (
        <div className="cards grid-2">
          {campaigns.map((c) => {
            const link = personalizedEnrollUrl(c.enrollmentUrl, code);
            return (
              <div key={c.id} className="card">
                <h3 style={{ marginTop: 0, marginBottom: 6 }}>{c.name}</h3>
                {c.promo && <div className="tag" style={{ marginBottom: 10, borderColor: "var(--amber)", color: "var(--amber)", fontSize: 13 }}>🏷 {c.promo}</div>}
                {c.description
                  ? <p style={{ fontSize: 14, whiteSpace: "pre-wrap", marginTop: 0 }}>{c.description}</p>
                  : <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>No details added yet.</p>}
                {link && (
                  <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                    <a className="btn primary sm" href={link} target="_blank" rel="noreferrer">Open enrollment ↗</a>
                    <Copyable label="⧉ Copy my link" value={link} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
