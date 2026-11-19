import { PassportQr } from "../components/PassportQr";

const Fingerprint = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none">
    <path
      d="M5.7 8.5A7 7 0 0 1 19 11m-14 1.5A7 7 0 0 0 8.1 18m.1-8.8a4.5 4.5 0 0 1 7.8 3M10 12a2 2 0 0 1 4 0c0 3.4-1 6-2.2 8m-4.4-6.5c.3 2.8 1.4 5 2.7 6.5m6.7-4.8c.4-1 .7-2.1.7-3.2"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
    />
  </svg>
);

const Arrow = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true" className="size-4" fill="none">
    <path d="m7 4 6 6-6 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);

const evidence = [
  {
    number: "01",
    title: "Rebar lot declared",
    detail: "LOT-001 · 100 kg",
    meta: "Supplier · 0x7A2E…19C4",
    tone: "neutral",
  },
  {
    number: "02",
    title: "Delivery accepted",
    detail: "100 kg accepted",
    meta: "Designated inspector · 0xE05F…CF7",
    tone: "verified",
  },
  {
    number: "03",
    title: "Assigned to Beam B1",
    detail: "60 kg recorded as used",
    meta: "Site engineer · 0x256E…97C",
    tone: "verified",
  },
  {
    number: "04",
    title: "Laboratory evidence",
    detail: "No test supplied",
    meta: "No lab attestation is recorded",
    tone: "pending",
  },
] as const;

export default function PassportPage() {
  return (
    <main className="min-h-screen overflow-hidden">
      <div className="demo-ribbon">
        <span>Milestone zero</span>
        <span className="ribbon-dot" />
        <strong>Synthetic demo data</strong>
        <span className="ribbon-dot" />
        <span>Not connected to a chain</span>
      </div>

      <nav className="shell flex flex-wrap items-center justify-between gap-3 py-6" aria-label="Primary">
        <a href="#passport" className="wordmark" aria-label="PourLedger home">
          <span className="mark" aria-hidden="true">
            PL
          </span>
          <span>PourLedger</span>
        </a>
        <div className="network-pill">
          <span className="status-dot" />
          QIE Testnet · demo
        </div>
        <a className="live-navigation" href="/live">Live registry</a>
      </nav>

      <section className="shell hero-grid pb-12 pt-5 lg:pb-20 lg:pt-12" id="passport">
        <div className="max-w-2xl self-center">
          <div className="eyebrow">
            <Fingerprint /> Structural element passport
          </div>
          <h1 className="mt-6 text-balance text-5xl font-semibold leading-[0.96] tracking-[-0.055em] sm:text-6xl lg:text-7xl">
            Follow the evidence,
            <span className="block text-lime">from lot to beam.</span>
          </h1>
          <p className="mt-7 max-w-xl text-pretty text-base leading-7 text-mist sm:text-lg">
            PourLedger links declared construction material lots to the structural elements where
            authorized people say they were received and placed. It records attestations—not
            physical truth or structural safety.
          </p>

          <div className="mt-9 flex flex-wrap gap-3">
            <a className="primary-button" href="#evidence">
              Inspect demo evidence <Arrow />
            </a>
            <span className="quiet-label">Registry: not deployed</span>
          </div>
        </div>

        <aside className="passport-card" aria-label="Synthetic passport summary for Beam B1">
          <div className="flex items-start justify-between gap-5">
            <div>
              <p className="card-kicker">Element passport</p>
              <h2 className="mt-2 text-4xl font-semibold tracking-[-0.04em] text-ink">Beam B1</h2>
              <p className="mt-2 text-sm text-slate">Demo Project · Frame level 01</p>
            </div>
            <span className="demo-stamp">Demo</span>
          </div>

          <div className="mt-8 grid grid-cols-[1fr_auto] items-end gap-5 border-y border-line py-6">
            <div className="space-y-5">
              <div>
                <p className="field-label">Relationship</p>
                <p className="mt-1 font-medium text-ink">1 accepted lot · 60 kg assigned</p>
              </div>
              <div>
                <p className="field-label">Evidence state</p>
                <p className="mt-1 flex items-center gap-2 font-medium text-ink">
                  <span className="size-2 rounded-full bg-amber-500" /> Test not supplied
                </p>
              </div>
            </div>
            <PassportQr />
          </div>

          <div className="mt-5 flex items-center justify-between gap-4 text-xs text-slate">
            <span>Demo payload · no transaction receipt</span>
            <span className="font-mono">element:1</span>
          </div>
        </aside>
      </section>

      <section className="evidence-section" id="evidence">
        <div className="shell py-16 lg:py-24">
          <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
            <div>
              <p className="section-index">01 / Evidence trail</p>
              <h2 className="mt-5 max-w-md text-4xl font-semibold tracking-[-0.045em] text-ink sm:text-5xl">
                Four states, no hidden leap of trust.
              </h2>
              <p className="mt-5 max-w-md leading-7 text-slate">
                Every step names who made the claim and what remains unknown. An on-chain signature
                would make the claim tamper-evident; it would not make the claim scientifically true.
              </p>
            </div>

            <ol className="evidence-list">
              {evidence.map((item) => (
                <li key={item.number} className="evidence-row">
                  <span className="step-number">{item.number}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-lg font-semibold text-ink">{item.title}</h3>
                      <span className={`state-tag ${item.tone}`}>
                        {item.tone === "verified"
                          ? "role-signed demo"
                          : item.tone === "pending"
                            ? "not supplied"
                            : "declared"}
                      </span>
                    </div>
                    <p className="mt-2 font-medium text-ink">{item.detail}</p>
                    <p className="mt-1 text-sm text-slate">{item.meta}</p>
                  </div>
                  <span className="row-arrow" aria-hidden="true">
                    <Arrow />
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="shell py-16 lg:py-24">
        <div className="trust-card">
          <div>
            <p className="section-index text-lime">02 / Trust boundary</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
              Read the signature precisely.
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="trust-item">
              <span className="trust-symbol">✓</span>
              <strong>It can show</strong>
              <p>A designated wallet signed exact evidence metadata.</p>
            </div>
            <div className="trust-item">
              <span className="trust-symbol">≠</span>
              <strong>It cannot show</strong>
              <p>That material was physically installed or a document is scientifically valid.</p>
            </div>
            <div className="trust-item">
              <span className="trust-symbol">!</span>
              <strong>It never certifies</strong>
              <p>Professional licensing, code compliance, or structural safety.</p>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10">
        <div className="shell flex flex-col gap-4 py-8 text-sm text-mist sm:flex-row sm:items-center sm:justify-between">
          <p>PourLedger milestone zero · original hackathon work in progress</p>
          <p>No mainnet deployment · no funded wallet used</p>
        </div>
      </footer>
    </main>
  );
}
