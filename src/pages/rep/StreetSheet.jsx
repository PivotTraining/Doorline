import { useState, useCallback, useEffect, useRef, memo } from "react";
import { useStore, getState, SHEET_COLS, addStreetRow, updateStreetRow, removeStreetRow, sheetTotals, submitDay, reopenDay, isDaySubmitted, activeProducts, updateDeal } from "../../store";
import { localDay } from "../../lib/date.js";

const SLOTS = 100;
const today = () => localDay();
const cellStyle = { padding: "4px 6px", textAlign: "center" };
const pad = { padding: "6px 8px" };
const BLANK = { street: "", customer: "", phone: "", comments: "", cb: "" };

// One row component for EVERY slot, blank or worked — keyed by the stable
// slot number so React never tears the DOM node down when a blank slot
// gets its first character or checkbox. (Previously a blank slot and a
// worked slot were different component types/keys; the first tap on a
// fresh slot swapped in a whole new DOM node mid-interaction, which on a
// touchscreen ate the tap and dropped keyboard focus — you'd type an
// address and have it "pop back out" instead of sticking.)
// On phones, the on-screen keyboard shrinks the visible viewport; a focused
// input near the right/bottom edge of the sheet's own scroll container can
// end up hidden behind that keyboard even though it's still accepting
// keystrokes — it just looks like typing "does nothing" because you can't
// see it happen. Nudge the field into view whenever it gains focus.
const keepVisible = (e) => { e.target.scrollIntoView({ block: "nearest", inline: "nearest" }); };

const Row = memo(function Row({ slot, id, street, nh, rl, dm, bid, d, ni, nq, customer, phone, comments, cb, dealId, product, products, onSet, onCreate, onRemove, onSetProduct }) {
  const [draft, setDraft] = useState(BLANK);
  const isReal = !!id;
  const cur = isReal ? { street, customer, phone, comments, cb, nh, rl, dm, bid, d, ni, nq } : draft;

  const setText = (key) => (e) => {
    const value = e.target.value;
    if (isReal) { onSet(id, { [key]: value }); return; }
    const merged = { ...draft, [key]: value };
    setDraft(merged);
    if (Object.values(merged).some((x) => x.trim())) onCreate(slot, merged);
  };
  const setFlag = (key) => (e) => {
    const value = e.target.checked;
    if (isReal) { onSet(id, { [key]: value }); return; }
    if (!value) return; // unchecking a slot that was never created is a no-op
    const merged = { ...draft, [key]: true };
    setDraft(merged);
    onCreate(slot, merged);
  };

  return (
    <tr className={isReal ? undefined : "sheet-row-blank"}>
      <td className="muted" style={{ textAlign: "center" }}>{slot}</td>
      <td><input className="input" style={pad} value={cur.street} placeholder="Street address" autoComplete="off" onFocus={keepVisible} onChange={setText("street")} /></td>
      {SHEET_COLS.map((c) => (
        <td key={c.key} style={cellStyle}>
          <input type="checkbox" checked={!!cur[c.key]} onChange={setFlag(c.key)} style={{ width: 18, height: 18, accentColor: "var(--brand)" }} />
          {c.key === "d" && cur.d && dealId && (
            <select
              className="select"
              value={product || products[0]}
              onChange={(e) => onSetProduct(dealId, e.target.value)}
              title="What did you sell?"
              style={{ display: "block", marginTop: 4, fontSize: 10, padding: "2px 3px", width: 62 }}
            >
              {products.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
        </td>
      ))}
      <td><input className="input" style={pad} value={cur.customer} autoComplete="off" onFocus={keepVisible} onChange={setText("customer")} /></td>
      <td><input className="input" style={pad} type="tel" value={cur.phone} placeholder="phone → nudge" autoComplete="off" onFocus={keepVisible} onChange={setText("phone")} /></td>
      <td><input className="input" style={pad} value={cur.comments} autoComplete="off" onFocus={keepVisible} onChange={setText("comments")} /></td>
      <td><input className="input" style={pad} value={cur.cb} placeholder="5:30" autoComplete="off" onFocus={keepVisible} onChange={setText("cb")} /></td>
      <td style={{ paddingLeft: 10 }}>
        {isReal && (
          <button className="x" title="Clear" onClick={() => {
            // The delete button sits right next to the CB field — on a phone
            // a slightly-off tap while reaching for CB can land here instead
            // and instantly wipe everything logged for the door. Anything
            // with real content on it needs a confirm; a truly blank/never-
            // touched row can still be cleared with one tap.
            const hasContent = Object.values(cur).some((v) => (typeof v === "string" ? v.trim() : v));
            if (hasContent && !confirm("Clear this door? This removes everything logged for it, including any callback time.")) return;
            onRemove(id); setDraft(BLANK);
          }}>×</button>
        )}
      </td>
    </tr>
  );
});

export default function StreetSheet({ user }) {
  useStore();
  const state = getState();
  const [date, setDate] = useState(today());
  const [extraSlots, setExtraSlots] = useState(0);
  useEffect(() => { setExtraSlots(0); }, [date]);
  const autoToday = useRef(true); // false once the rep explicitly picks a different date

  // Keep the sheet pinned to the real current day even if the tab is left
  // open across midnight -- otherwise every door logged after midnight
  // keeps silently landing on yesterday's date instead of today's.
  useEffect(() => {
    const check = () => { if (autoToday.current) setDate((d) => (d === today() ? d : today())); };
    const id = setInterval(check, 60000);
    document.addEventListener("visibilitychange", check);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", check); };
  }, []);

  const rows = state.streetRows.filter((r) => r.repId === user.id && r.date === date);
  const t = sheetTotals(rows);
  const submitted = isDaySubmitted(user.id, date);
  const products = activeProducts();
  const dealsById = Object.fromEntries(state.deals.map((d) => [d.id, d]));

  const onSet = useCallback((id, patch) => updateStreetRow(id, patch), []);
  const onRemove = useCallback((id) => removeStreetRow(id), []);
  const onCreate = useCallback((slot, patch) => addStreetRow({ repId: user.id, date, slot, ...patch }), [user.id, date]);
  const onSetProduct = useCallback((dealId, product) => updateDeal(dealId, { product }), []);

  // Place worked rows by their slot; lay everything else out across the grid.
  const bySlot = {};
  const noSlot = [];
  rows.forEach((r) => (r.slot ? (bySlot[r.slot] = r) : noSlot.push(r)));
  let n = 1; noSlot.forEach((r) => { while (bySlot[n]) n++; bySlot[n] = r; n++; });
  const touchedMax = Object.keys(bySlot).reduce((m, k) => Math.max(m, Number(k)), 0);
  const maxSlot = Math.max(SLOTS + extraSlots, touchedMax);

  const complete = () => {
    if (confirm(`Complete ${date}'s sheet? You can reopen it if needed. Tomorrow starts a fresh sheet.`)) submitDay(user.id, date);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Street Sheet</h1>
          <p>Work top-to-bottom. Mark a disposition on a slot and it counts as knocked — totals roll up to your manager.</p>
        </div>
        <div className="row">
          <label className="field" style={{ margin: 0 }}>
            <input className="input" type="date" value={date} onChange={(e) => { autoToday.current = false; setDate(e.target.value); }} style={{ width: "auto" }} />
          </label>
          {submitted
            ? <><span className="pill"><span className="dot" style={{ background: "var(--green)" }} /> Submitted</span><button className="btn" onClick={() => reopenDay(user.id, date)}>Reopen</button></>
            : <button className="btn primary" onClick={complete} disabled={t.doors === 0}>✓ Complete day</button>}
        </div>
      </div>

      <div className="cards grid-4" style={{ marginBottom: 14 }}>
        <div className="card stat"><div className="n">{t.doors}</div><div className="l">Doors knocked</div></div>
        <div className="card stat"><div className="n">{t.dm}</div><div className="l">Decision makers</div></div>
        <div className="card stat"><div className="n" style={{ color: "var(--green)" }}>{t.d}</div><div className="l">Deals</div></div>
        <div className="card stat"><div className="n">{t.ni}</div><div className="l">Not interested</div></div>
      </div>

      <p className="sheet-swipe-hint">↔ Swipe sideways to see Customer, Phone, Comments, and Call Back</p>
      <div className="card sheet-scroll" style={{ opacity: submitted ? 0.85 : 1, padding: 0 }}>
        <table className="tbl sheet-tbl" style={{ minWidth: 820 }}>
          <thead>
            <tr>
              <th style={{ width: 38 }}>#</th>
              <th style={{ minWidth: 130 }}>Street / #</th>
              {SHEET_COLS.map((c) => <th key={c.key} title={c.title} style={{ textAlign: "center", width: 46 }}>{c.lab}</th>)}
              <th style={{ minWidth: 120 }}>Customer</th>
              <th style={{ minWidth: 130 }}>Phone</th>
              <th style={{ minWidth: 150 }}>Comments</th>
              <th style={{ width: 70 }}>CB</th>
              <th style={{ width: 28 }}></th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: maxSlot }).map((_, i) => {
              const slot = i + 1;
              const r = bySlot[slot];
              return (
                <Row key={slot} slot={slot}
                  id={r?.id} street={r?.street} nh={r?.nh} rl={r?.rl} dm={r?.dm} bid={r?.bid} d={r?.d} ni={r?.ni} nq={r?.nq}
                  customer={r?.customer} phone={r?.phone} comments={r?.comments} cb={r?.cb}
                  dealId={r?.dealId} product={r?.dealId ? dealsById[r.dealId]?.product : undefined} products={products}
                  onSet={onSet} onCreate={onCreate} onRemove={onRemove} onSetProduct={onSetProduct} />
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="row between" style={{ marginTop: 10, flexWrap: "wrap", gap: 10 }}>
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>
          <b>Key:</b> NH Not Home · RL Reloop · DM Decision Maker · B/ID Bill or ID · D Deal (→ My Deals) · NI Not Interested · NQ Not Qualified · CB Call Back
        </p>
        <button className="btn sm" onClick={() => setExtraSlots((x) => x + 50)}>+ 50 more slots</button>
      </div>
    </>
  );
}
