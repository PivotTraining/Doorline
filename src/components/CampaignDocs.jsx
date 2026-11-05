import { useEffect, useState, useRef } from "react";
import { DEMO } from "../supabaseClient";
import { listCampaignDocs, uploadCampaignDoc, campaignDocUrl, deleteCampaignDoc } from "../api/services.js";

// Required documents and resources for one campaign. Administrators upload
// and remove; everyone onboarded with the campaign can download.
//
// Documents are fetched per campaign on demand rather than hydrated with
// the rest of the store: most people open one campaign, and pulling every
// document row for every campaign at sign-in would cost far more than it
// saves.

const KB = 1024;
const size = (n) => {
  if (n == null) return "";
  if (n < KB) return `${n} B`;
  if (n < KB * KB) return `${Math.round(n / KB)} KB`;
  return `${(n / (KB * KB)).toFixed(1)} MB`;
};

export default function CampaignDocs({ campaignId, canManage = false }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (DEMO || !campaignId) { setLoading(false); return; }
    let live = true;
    setLoading(true);
    listCampaignDocs(campaignId).then((r) => {
      if (!live) return;
      // A missing table (before migration 0021) reads as an error here. Say
      // nothing rather than showing people a scary message about a feature
      // that simply is not switched on yet.
      if (r.error) setDocs([]);
      else setDocs(r.docs);
      setLoading(false);
    });
    return () => { live = false; };
  }, [campaignId]);

  const onPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be picked again after an error
    if (!file) return;
    setErr(""); setBusy(true);
    const r = await uploadCampaignDoc(campaignId, file);
    setBusy(false);
    if (r.error) return setErr(r.error);
    setDocs((d) => [r.doc, ...d]);
  };

  const download = async (doc) => {
    setErr("");
    const r = await campaignDocUrl(doc.path);
    if (r.error) return setErr(r.error);
    window.open(r.url, "_blank", "noopener");
  };

  const remove = async (doc) => {
    if (!confirm(`Remove "${doc.name}"? Agents on this campaign will no longer be able to download it.`)) return;
    setErr(""); setBusy(true);
    const r = await deleteCampaignDoc(doc);
    setBusy(false);
    if (r.error) return setErr(r.error);
    setDocs((d) => d.filter((x) => x.id !== doc.id));
  };

  if (DEMO) {
    return (
      <p className="muted" style={{ fontSize: 12, margin: "8px 0 0" }}>
        Campaign documents need the live database — demo mode has no file storage.
      </p>
    );
  }

  return (
    <div style={{ marginTop: 10 }}>
      <div className="row between" style={{ gap: 8, flexWrap: "wrap" }}>
        <b style={{ fontSize: 13 }}>Documents &amp; resources</b>
        {canManage && (
          <>
            <input ref={fileRef} type="file" hidden onChange={onPick} />
            <button className="btn sm" disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy ? "Working…" : "⬆ Upload document"}
            </button>
          </>
        )}
      </div>

      {err && <div className="err" style={{ marginTop: 8 }}>{err}</div>}

      {loading ? (
        <p className="muted" style={{ fontSize: 12 }}>Loading…</p>
      ) : docs.length === 0 ? (
        <p className="muted" style={{ fontSize: 12, margin: "6px 0 0" }}>
          {canManage
            ? "No documents yet. Upload contracts, rate sheets or scripts and everyone on this campaign can download them."
            : "No documents posted for this campaign yet."}
        </p>
      ) : (
        <ul className="doc-list">
          {docs.map((d) => (
            <li key={d.id}>
              <button className="linklike" onClick={() => download(d)} title="Download">{d.name}</button>
              <span className="muted" style={{ fontSize: 11 }}>
                {size(d.size)}{d.size != null && " · "}{new Date(d.ts).toLocaleDateString()}
              </span>
              {canManage && (
                <button className="btn sm danger" disabled={busy} onClick={() => remove(d)}>Remove</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
