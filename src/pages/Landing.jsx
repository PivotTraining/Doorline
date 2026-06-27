import { getState, useStore } from "../store";
import { useTheme, toggleTheme } from "../theme.js";
import Logo from "../components/Logo.jsx";

const FEATURES = [
  { ic: "🛰️", t: "GPS routes & accountability", d: "See where every rep actually worked — live routes on the map and hours-on vs. doors-knocked, even on doors they forgot to log." },
  { ic: "🧭", t: "Territory mapping", d: "Draw a zone on the map or drop in a ZIP code, assign it to a rep, and schedule the block. Reps see only their turf." },
  { ic: "📝", t: "Digital Street Sheet", d: "The clipboard, digitized. Reps tap NH / DM / Deal per door; it rolls up to a live office sheet for managers." },
  { ic: "🗺️", t: "Live team map", d: "Every door and rep across the org on one colorful map — dispositions, deals, and live dots in real time." },
  { ic: "📣", t: "Bulletin board", d: "Push daily targets and shout-outs to the whole team. The latest hits every rep's home screen." },
  { ic: "💰", t: "Deals & leaderboard", d: "Capture a sale at the door, track contract value, and rank the team by revenue and close rate automatically." },
];

const SHOTS = [
  { src: "/shots/street-sheet.jpg", t: "Digital Street Sheet — the clipboard, digitized" },
  { src: "/shots/leaderboard.jpg", t: "Auto-ranked team leaderboard" },
  { src: "/shots/deals.jpg", t: "Deals & pipeline by product" },
  { src: "/shots/personnel.jpg", t: "Personnel & billing in one console" },
];

const STEPS = [
  { n: 1, t: "Stage the field", d: "Add your reps, draw territories, and post the day's plan from the admin console." },
  { n: 2, t: "Knock & log", d: "Reps work doors on the map or the Street Sheet — outcomes, deals, and routes sync instantly." },
  { n: 3, t: "Coach with data", d: "Managers see live activity, routes, and the office rollup to coach in real time." },
];

const PLANS = [
  { name: "Starter", price: 39, desc: "For new crews getting off paper.", pop: false,
    feats: ["Map & door logging", "Dispositions + Street Sheet", "Follow-ups & reminders", "Leaderboard", "1 territory per rep", "Email support"] },
  { name: "Growth", price: 59, desc: "For growing door-to-door teams.", pop: true,
    feats: ["Everything in Starter", "GPS route tracking & accountability", "Territory mapping (draw / ZIP)", "Live team map", "Bulletin board", "Deals pipeline + admin console"] },
  { name: "Scale", price: 89, desc: "For multi-office operations.", pop: false,
    feats: ["Everything in Growth", "Advanced analytics & exports", "API access", "Custom branding & SSO", "Priority support"] },
  { name: "Enterprise", price: null, desc: "For franchises & large orgs.", pop: false,
    feats: ["Everything in Scale", "Dedicated onboarding", "Data-warehouse export", "Security review & SLA", "Named success manager"] },
];

export default function Landing({ onEnter }) {
  useStore();
  useTheme();
  const org = getState().org;

  return (
    <div>
      <nav className="lp-nav">
        <div className="in">
          <div className="lp-brand">
            {org.logo ? <div className="logo" style={{ width: 28, height: 28 }}><img src={org.logo} alt="" /></div> : <Logo size={28} />}
            {org.name || "Doorline"}
          </div>
          <div className="links">
            <a onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}>Features</a>
            <a onClick={() => document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" })}>Pricing</a>
            <a onClick={onEnter}>Sign in</a>
            <button className="icon-btn" onClick={toggleTheme} title="Toggle theme">🌗</button>
            <a className="btn primary sm" onClick={onEnter}>Start free</a>
          </div>
        </div>
      </nav>

      <div className="lp">
        {/* hero */}
        <section className="lp-hero">
          <div>
            <span className="lp-eyebrow">📍 Field sales, finally organized</span>
            <h1>Know where your reps are. Close more doors.</h1>
            <p className="sub">Doorline is the door-to-door sales platform — live GPS routes, territory mapping, a digital street sheet, and a real-time office dashboard, all in one.</p>
            <div className="cta-row">
              <button className="btn primary" onClick={onEnter}>Start free</button>
              <button className="btn" onClick={onEnter}>See the live demo →</button>
            </div>
            <div className="lp-note">No credit card to try the demo · Works on any phone or laptop</div>
          </div>

          {/* real product screenshot */}
          <div className="hero-shot">
            <img src="/shots/office-sheet.jpg" alt="Doorline office dashboard — live rollup of every rep's street sheet" width="1280" height="820" />
          </div>
        </section>

        {/* features */}
        <section className="lp-section" id="features">
          <h2>Everything a canvassing team needs</h2>
          <p className="lead">From the first knock to the signed deal — and every step in between.</p>
          <div className="lp-grid">
            {FEATURES.map((f) => (
              <div className="lp-feature" key={f.t}>
                <div className="ic">{f.ic}</div>
                <h3>{f.t}</h3>
                <p>{f.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* screenshots */}
        <section className="lp-section" style={{ paddingTop: 0 }}>
          <h2>See it in action</h2>
          <p className="lead">Real screens from the field and the office.</p>
          <div className="lp-shots">
            {SHOTS.map((s) => (
              <figure className="shot" key={s.src}>
                <img src={s.src} alt={s.t} loading="lazy" width="1280" height="820" />
                <figcaption>{s.t}</figcaption>
              </figure>
            ))}
          </div>
        </section>

        {/* how it works */}
        <section className="lp-section" style={{ paddingTop: 0 }}>
          <h2>Up and running in a day</h2>
          <div className="lp-steps">
            {STEPS.map((s) => (
              <div className="lp-step" key={s.n}>
                <div className="num">{s.n}</div>
                <h3 style={{ margin: "0 0 4px" }}>{s.t}</h3>
                <p className="muted" style={{ margin: 0, fontSize: 14 }}>{s.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* pricing */}
        <section className="lp-section" id="pricing">
          <h2>Simple, per-rep pricing</h2>
          <p className="lead">Billed per active rep. Admins, managers, and viewers are always free. Save ~17% billed annually (2 months free).</p>
          <div className="lp-pricing">
            {PLANS.map((p) => (
              <div className={"lp-price" + (p.pop ? " pop" : "")} key={p.name}>
                {p.pop && <span className="pop-tag">Most popular</span>}
                <h3>{p.name}</h3>
                <div className="price">
                  {p.price != null ? <>${p.price}<small> /rep/mo</small></> : <>Custom</>}
                </div>
                <div className="desc">{p.desc}</div>
                <ul>{p.feats.map((f) => <li key={f}>{f}</li>)}</ul>
                <button className={"btn" + (p.pop ? " primary" : "")} onClick={onEnter}>
                  {p.price != null ? "Start free" : "Contact sales"}
                </button>
              </div>
            ))}
          </div>
          <p className="muted" style={{ textAlign: "center", fontSize: 12, marginTop: 16 }}>
            Free seats: owners, admins, managers, and investor/viewer logins are never billed — you only pay for reps in the field.
          </p>
        </section>

        {/* closing CTA */}
        <section className="lp-cta">
          <h2>Get your team off the clipboard</h2>
          <p>Spin up the live demo in seconds — admin and rep logins included.</p>
          <button className="btn" onClick={onEnter}>Launch the demo</button>
        </section>

        <footer className="lp-footer">
          <span>© {new Date().getFullYear()} {org.name || "Doorline"} · Built for door-to-door teams.</span>
          <span className="row" style={{ gap: 16 }}>
            <a onClick={onEnter} style={{ cursor: "pointer" }}>Sign in</a>
            <a onClick={() => document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" })} style={{ cursor: "pointer" }}>Pricing</a>
          </span>
        </footer>
      </div>
    </div>
  );
}
