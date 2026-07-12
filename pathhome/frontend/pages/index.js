import { useState } from "react";
import Head from "next/head";
import { isConnected, requestAccess, signTransaction } from "@stellar/freighter-api";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

const ASSET_OPTIONS = [
  { code: "XLM", issuer: null, label: "XLM" },
  { code: "USDC", issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN", label: "USDC" },
];

const CODE_SNIPPET = `curl -X POST https://api.pathhome.app/route \\
  -H "Content-Type: application/json" \\
  -d '{
    "source_asset_code": "USDC",
    "source_asset_issuer": "GA5Z...KZVN",
    "dest_asset_code": "XLM",
    "send_amount": "100"
  }'

# → 200 OK
# {
#   "recommended": {
#     "dest_amount": "225.70",
#     "settlement_seconds": 5
#   },
#   "estimated_savings_percent": 6.0
# }`;

const FEE_ROWS = [
  { name: "PathHome (Stellar path payment)", fee: "Under 1%*", time: "~5 seconds", custody: "Non-custodial", highlight: true },
  { name: "Traditional money transfer operator", fee: "5–7%", time: "2–5 days", custody: "Custodial" },
  { name: "Bank wire transfer", fee: "Flat fee + FX margin", time: "1–3 days", custody: "Custodial" },
];

const TRUST_ITEMS = [
  {
    title: "Non-custodial by design",
    body: "PathHome never holds recipient funds in a company-controlled account. Transfers settle directly between Stellar accounts.",
  },
  {
    title: "Verifiable on a public ledger",
    body: "Every settled transfer can be independently checked on Stellar Expert — there's no private ledger to take our word for.",
  },
  {
    title: "Open source",
    body: "The routing logic and API are on GitHub. Nothing about how a route is picked is hidden from the people using it.",
  },
  {
    title: "Stellar Consensus Protocol",
    body: "Settlement finality comes from Stellar's federated byzantine agreement, not from a centralized clearing process.",
  },
];

export default function Home() {
  const [sourceAsset, setSourceAsset] = useState(ASSET_OPTIONS[1]);
  const [destAsset, setDestAsset] = useState(ASSET_OPTIONS[0]);
  const [amount, setAmount] = useState("100");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const [walletAddress, setWalletAddress] = useState(null);
  const [walletError, setWalletError] = useState(null);
  const [recipientKey, setRecipientKey] = useState("");
  const [txStatus, setTxStatus] = useState("idle"); // idle | preparing | signing | submitting | done | error
  const [txResult, setTxResult] = useState(null);
  const [txError, setTxError] = useState(null);

  async function connectWallet() {
    setWalletError(null);
    try {
      const conn = await isConnected();
      if (conn.error) throw new Error(conn.error);
      if (!conn.isConnected) {
        throw new Error("Freighter extension not detected. Install it from freighter.app to send a real transaction.");
      }
      const access = await requestAccess();
      if (access.error) throw new Error(access.error);
      setWalletAddress(access.address);
    } catch (err) {
      setWalletError(err.message || "Could not connect to Freighter.");
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    setTxStatus("idle");
    setTxResult(null);
    setTxError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/route`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_asset_code: sourceAsset.code,
          source_asset_issuer: sourceAsset.issuer,
          dest_asset_code: destAsset.code,
          dest_asset_issuer: destAsset.issuer,
          send_amount: amount,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "No route available for this pair right now.");
      }

      setResult(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function sendRealPayment() {
    if (!walletAddress || !result || !recipientKey) return;
    setTxError(null);
    setTxResult(null);

    try {
      setTxStatus("preparing");
      // Allow 1% slippage below the quoted destination amount.
      const destMin = (parseFloat(result.recommended.dest_amount) * 0.99).toFixed(7);

      const prepRes = await fetch(`${API_BASE_URL}/prepare-transaction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sender_public_key: walletAddress,
          recipient_public_key: recipientKey,
          source_asset_code: sourceAsset.code,
          source_asset_issuer: sourceAsset.issuer,
          dest_asset_code: destAsset.code,
          dest_asset_issuer: destAsset.issuer,
          send_amount: amount,
          dest_min: destMin,
        }),
      });
      if (!prepRes.ok) {
        const body = await prepRes.json().catch(() => ({}));
        throw new Error(body.detail || "Could not prepare the transaction.");
      }
      const { xdr, network_passphrase } = await prepRes.json();

      setTxStatus("signing");
      const signed = await signTransaction(xdr, {
        networkPassphrase: network_passphrase,
        address: walletAddress,
      });
      if (signed.error) throw new Error(signed.error);

      setTxStatus("submitting");
      const submitRes = await fetch(`${API_BASE_URL}/submit-transaction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signed_xdr: signed.signedTxXdr }),
      });
      if (!submitRes.ok) {
        const body = await submitRes.json().catch(() => ({}));
        throw new Error(body.detail || "Horizon rejected the transaction.");
      }
      const submitted = await submitRes.json();
      setTxResult(submitted);
      setTxStatus("done");
    } catch (err) {
      setTxError(err.message || "The transaction could not be completed.");
      setTxStatus("error");
    }
  }

  return (
    <>
      <Head>
        <title>PathHome — Remittance built on Stellar</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </Head>

      {/* ---------- NAV ---------- */}
      <nav className="nav">
        <div className="wrap navRow">
          <div className="brand">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <circle cx="4" cy="18" r="2.4" fill="#C6A15B" />
              <circle cx="11" cy="8" r="2.4" fill="#C6A15B" />
              <circle cx="18" cy="14" r="2.4" fill="#1F8A83" />
              <path d="M4 18 L11 8 L18 14" stroke="#C6A15B" strokeWidth="1.4" strokeDasharray="2 2" />
            </svg>
            <span>PathHome</span>
          </div>
          <div className="navLinks">
            <a href="#demo">Live demo</a>
            <a href="#fees">Fees</a>
            <a href="#trust">Trust</a>
            <a href={`${API_BASE_URL}/docs`} target="_blank" rel="noreferrer">
              API docs
            </a>
          </div>
          <a className="navCta" href="https://github.com/livai12/pathhome" target="_blank" rel="noreferrer">
            View source
          </a>
          <button className="walletBtn" onClick={connectWallet} type="button">
            {walletAddress
              ? `${walletAddress.slice(0, 4)}…${walletAddress.slice(-4)}`
              : "Connect wallet"}
          </button>
        </div>
      </nav>
      {walletError && (
        <div className="wrap">
          <p className="walletErrorBanner">{walletError}</p>
        </div>
      )}

      {/* ---------- HERO ---------- */}
      <header className="hero">
        <div className="routeField" aria-hidden="true" />
        <div className="wrap heroInner">
          <p className="eyebrow eyebrowLight">Built on Stellar · Public testnet MVP</p>
          <h1 className="h1">
            Send money home in
            <br />
            five seconds, <em>not five days.</em>
          </h1>
          <p className="heroSub">
            PathHome finds the cheapest way across Stellar's payment rails for every transfer,
            so migrant workers across Indonesia, the Philippines, and Vietnam keep more of what
            they earn.
          </p>
          <div className="heroCtas">
            <a className="btnPrimary" href="#demo">
              Try the live demo
            </a>
            <a className="btnGhost" href="#fees">
              See fee comparison
            </a>
          </div>
          <div className="heroStats">
            <div>
              <span className="statNum">~5 sec</span>
              <span className="statLabel">Stellar settlement</span>
            </div>
            <div className="statDivider" />
            <div>
              <span className="statNum">6%</span>
              <span className="statLabel">avg. traditional MTO fee</span>
            </div>
            <div className="statDivider" />
            <div>
              <span className="statNum">Non-custodial</span>
              <span className="statLabel">funds never touch our accounts</span>
            </div>
          </div>
        </div>
      </header>

      {/* ---------- TRUST STRIP ---------- */}
      <section className="trustStrip">
        <div className="wrap trustStripRow">
          {["Non-custodial", "Open source", "Public testnet", "Soroban-ready architecture"].map((t) => (
            <span key={t} className="chip">
              {t}
            </span>
          ))}
        </div>
      </section>

      {/* ---------- LIVE DEMO ---------- */}
      <section id="demo" className="section">
        <div className="wrap">
          <p className="eyebrow">Live demo</p>
          <h2 className="h2">Try a real route on Stellar testnet</h2>
          <p className="sectionSub">
            This calls the actual PathHome API, which queries Stellar Horizon for every route
            the DEX can currently fill.
          </p>

          <div className="demoGrid">
            <form onSubmit={handleSubmit} className="demoCard">
              <label className="field">
                <span>You send</span>
                <div className="row">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="input"
                  />
                  <select
                    value={sourceAsset.code}
                    onChange={(e) => setSourceAsset(ASSET_OPTIONS.find((a) => a.code === e.target.value))}
                    className="select"
                  >
                    {ASSET_OPTIONS.map((a) => (
                      <option key={a.code} value={a.code}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </div>
              </label>

              <label className="field">
                <span>Recipient receives</span>
                <select
                  value={destAsset.code}
                  onChange={(e) => setDestAsset(ASSET_OPTIONS.find((a) => a.code === e.target.value))}
                  className="select selectFull"
                >
                  {ASSET_OPTIONS.map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Recipient Stellar address (optional — needed to send a real transaction)</span>
                <input
                  type="text"
                  placeholder="G..."
                  value={recipientKey}
                  onChange={(e) => setRecipientKey(e.target.value)}
                  className="input inputMono"
                />
              </label>

              <button type="submit" disabled={loading} className="btnPrimary btnFull">
                {loading ? "Finding best route…" : "Find best route"}
              </button>

              {error && <p className="errorText">{error}</p>}
            </form>

            <div className="resultCard">
              {!result && !error && (
                <div className="resultEmpty">
                  <p>Run a quote to see the recommended route, settlement time, and savings here.</p>
                </div>
              )}
              {result && (
                <>
                  <p className="eyebrow eyebrowDark">Recommended route</p>
                  <div className="routeViz">
                    {result.recommended.path.map((hop, i) => (
                      <div key={i} className="routeHop">
                        <span className="routeDot" />
                        <span className="routeLabel">{hop}</span>
                        {i < result.recommended.path.length - 1 && <span className="routeLine" />}
                      </div>
                    ))}
                  </div>
                  <p className="resultAmount">
                    {result.recommended.dest_amount}{" "}
                    <span className="resultAmountUnit">{destAsset.label}</span>
                  </p>
                  <p className="resultMeta">Settles in ~{result.recommended.settlement_seconds} seconds</p>
                  <p className="resultExplain">{result.explanation}</p>
                  <div className="savingsBadge">
                    Estimated savings vs. traditional MTO: {result.estimated_savings_percent}%
                  </div>

                  <div className="sendPanel">
                    {!walletAddress && (
                      <p className="sendHint">Connect a wallet above to send this as a real testnet transaction.</p>
                    )}
                    {walletAddress && !recipientKey && (
                      <p className="sendHint">Enter a recipient Stellar address to enable sending.</p>
                    )}
                    {walletAddress && recipientKey && (
                      <button
                        type="button"
                        className="btnPrimary btnFull"
                        onClick={sendRealPayment}
                        disabled={["preparing", "signing", "submitting"].includes(txStatus)}
                      >
                        {txStatus === "preparing" && "Preparing transaction…"}
                        {txStatus === "signing" && "Confirm in Freighter…"}
                        {txStatus === "submitting" && "Submitting to Stellar…"}
                        {["idle", "done", "error"].includes(txStatus) && "Send real payment on testnet"}
                      </button>
                    )}

                    {txStatus === "done" && txResult && (
                      <div className="txSuccess">
                        <p>
                          Settled — hash <span className="mono">{txResult.hash.slice(0, 10)}…</span>
                        </p>
                        <a href={txResult.explorer_url} target="_blank" rel="noreferrer">
                          View on Stellar Expert →
                        </a>
                      </div>
                    )}
                    {txStatus === "error" && txError && <p className="errorText">{txError}</p>}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ---------- HOW IT WORKS + CODE PREVIEW ---------- */}
      <section className="section sectionDark">
        <div className="wrap howGrid">
          <div>
            <p className="eyebrow eyebrowLight">How it works</p>
            <h2 className="h2 h2Light">Four calls, one settlement</h2>
            <ol className="stepList">
              <li>
                <span className="stepTag">Step 01</span>
                <p>Worker enters a send amount and picks source / destination assets.</p>
              </li>
              <li>
                <span className="stepTag">Step 02</span>
                <p>PathHome queries Stellar Horizon's strict-send path-finding endpoint.</p>
              </li>
              <li>
                <span className="stepTag">Step 03</span>
                <p>Routes are ranked by amount received and explained in plain language.</p>
              </li>
              <li>
                <span className="stepTag">Step 04</span>
                <p>The chosen route settles on Stellar in about five seconds.</p>
              </li>
            </ol>
          </div>
          <div>
            <p className="eyebrow eyebrowLight">Integration preview</p>
            <div className="codeCard">
              <div className="codeCardHead">
                <span className="dot dotRed" />
                <span className="dot dotYellow" />
                <span className="dot dotGreen" />
                <span className="codeCardTitle">quote.sh</span>
              </div>
              <pre className="codeBlock">{CODE_SNIPPET}</pre>
            </div>
            <a className="docsLink" href={`${API_BASE_URL}/docs`} target="_blank" rel="noreferrer">
              Full API reference (Swagger) →
            </a>
          </div>
        </div>
      </section>

      {/* ---------- FEE COMPARISON ---------- */}
      <section id="fees" className="section">
        <div className="wrap">
          <p className="eyebrow">Fees</p>
          <h2 className="h2">How the cost compares</h2>
          <p className="sectionSub">
            *PathHome's fee is the implied DEX spread on the route found at quote time — it
            varies with liquidity and isn't a fixed rate. Traditional figures are commonly
            cited industry averages for Southeast Asia remittance corridors.
          </p>

          <div className="feeTable">
            <div className="feeRow feeRowHead">
              <span>Service</span>
              <span>Typical fee</span>
              <span>Settlement</span>
              <span>Custody model</span>
            </div>
            {FEE_ROWS.map((row) => (
              <div key={row.name} className={`feeRow ${row.highlight ? "feeRowHighlight" : ""}`}>
                <span className="feeName">{row.name}</span>
                <span>{row.fee}</span>
                <span>{row.time}</span>
                <span>{row.custody}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- TRUST / SECURITY ---------- */}
      <section id="trust" className="section sectionDark">
        <div className="wrap">
          <p className="eyebrow eyebrowLight">Trust</p>
          <h2 className="h2 h2Light">Built to be checked, not just trusted</h2>
          <p className="sectionSub sectionSubLight">
            This is a hackathon MVP on Stellar's public testnet — not a licensed money
            transmitter. Here's what's actually true about how it's built, without borrowed
            security badges.
          </p>
          <div className="trustGrid">
            {TRUST_ITEMS.map((item) => (
              <div key={item.title} className="trustCard">
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- DOCS CTA ---------- */}
      <section className="section">
        <div className="wrap ctaBand">
          <div>
            <h2 className="h2">Building on this?</h2>
            <p className="sectionSub">
              The backend is a small FastAPI service; the routing logic is one file. Clone it,
              run it, or read the docs.
            </p>
          </div>
          <div className="ctaButtons">
            <a className="btnPrimary" href="https://github.com/livai12/pathhome" target="_blank" rel="noreferrer">
              GitHub repository
            </a>
            <a className="btnGhost" href={`${API_BASE_URL}/docs`} target="_blank" rel="noreferrer">
              API reference
            </a>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="wrap footerRow">
          <span>PathHome — APAC Stellar Hackathon 2026</span>
          <span>Track: Local Finance &amp; Real-World Access</span>
        </div>
      </footer>

      <style jsx global>{`
        :root {
          --ink: #0a1220;
          --ink-raised: #131f35;
          --paper: #f7f8fa;
          --surface: #ffffff;
          --text: #0f172a;
          --muted: #5b6472;
          --muted-light: #9aa7bd;
          --brass: #c6a15b;
          --brass-deep: #9c7c34;
          --teal: #1f8a83;
          --line: #e2e5ea;
          --line-dark: #24304a;
        }
        * {
          box-sizing: border-box;
        }
        html,
        body {
          margin: 0;
          padding: 0;
          background: var(--paper);
          color: var(--text);
          font-family: "Inter", system-ui, sans-serif;
          -webkit-font-smoothing: antialiased;
        }
        .wrap {
          max-width: 1080px;
          margin: 0 auto;
          padding: 0 24px;
        }
        .eyebrow {
          font-family: "IBM Plex Mono", monospace;
          font-size: 12px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--brass-deep);
          margin: 0 0 12px;
        }
        .eyebrowLight {
          color: var(--brass);
        }
        .eyebrowDark {
          color: var(--brass-deep);
        }
        .h1 {
          font-family: "Fraunces", serif;
          font-weight: 600;
          font-size: 52px;
          line-height: 1.08;
          color: #ffffff;
          margin: 0 0 20px;
        }
        .h1 em {
          font-style: italic;
          color: var(--brass);
        }
        .h2 {
          font-family: "Fraunces", serif;
          font-weight: 600;
          font-size: 34px;
          line-height: 1.15;
          margin: 0 0 12px;
          color: var(--text);
        }
        .h2Light {
          color: #ffffff;
        }
        .sectionSub {
          font-size: 15px;
          color: var(--muted);
          max-width: 620px;
          line-height: 1.6;
          margin: 0 0 36px;
        }
        .sectionSubLight {
          color: var(--muted-light);
        }

        /* NAV */
        .nav {
          background: var(--ink);
          border-bottom: 1px solid var(--line-dark);
        }
        .navRow {
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 64px;
        }
        .brand {
          display: flex;
          align-items: center;
          gap: 8px;
          font-family: "Fraunces", serif;
          font-weight: 600;
          font-size: 18px;
          color: #ffffff;
        }
        .navLinks {
          display: flex;
          gap: 28px;
        }
        .navLinks a {
          color: var(--muted-light);
          text-decoration: none;
          font-size: 14px;
        }
        .navLinks a:hover {
          color: #ffffff;
        }
        .navCta {
          color: #ffffff;
          text-decoration: none;
          font-size: 14px;
          border: 1px solid var(--line-dark);
          padding: 8px 16px;
          border-radius: 6px;
        }
        .navCta:hover {
          border-color: var(--brass);
        }
        .walletBtn {
          background: var(--brass);
          color: #1a1200;
          border: none;
          font-family: "IBM Plex Mono", monospace;
          font-weight: 600;
          font-size: 13px;
          padding: 9px 16px;
          border-radius: 6px;
          cursor: pointer;
        }
        .walletBtn:hover {
          background: #d6b06b;
        }
        .walletErrorBanner {
          background: rgba(179, 38, 30, 0.08);
          color: #b3261e;
          font-size: 13px;
          padding: 10px 16px;
          border-radius: 8px;
          margin: 12px 0 0;
        }

        /* HERO */
        .hero {
          background: var(--ink);
          position: relative;
          overflow: hidden;
          padding: 88px 0 64px;
        }
        .routeField {
          position: absolute;
          inset: 0;
          background-image: radial-gradient(circle, rgba(198, 161, 91, 0.35) 1.4px, transparent 1.4px);
          background-size: 34px 34px;
          mask-image: linear-gradient(to bottom, black, transparent 85%);
          opacity: 0.5;
        }
        .heroInner {
          position: relative;
        }
        .heroSub {
          font-size: 17px;
          color: var(--muted-light);
          max-width: 560px;
          line-height: 1.65;
          margin: 0 0 32px;
        }
        .heroCtas {
          display: flex;
          gap: 14px;
          margin-bottom: 56px;
        }
        .btnPrimary {
          display: inline-block;
          background: var(--brass);
          color: #1a1200;
          font-weight: 600;
          font-size: 14px;
          text-decoration: none;
          padding: 13px 24px;
          border-radius: 6px;
          border: none;
          cursor: pointer;
          transition: background 0.15s ease;
        }
        .btnPrimary:hover {
          background: #d6b06b;
        }
        .btnGhost {
          display: inline-block;
          color: #ffffff;
          font-weight: 600;
          font-size: 14px;
          text-decoration: none;
          padding: 13px 24px;
          border-radius: 6px;
          border: 1px solid var(--line-dark);
        }
        .btnGhost:hover {
          border-color: var(--brass);
        }
        .btnFull {
          width: 100%;
          text-align: center;
        }
        .heroStats {
          display: flex;
          align-items: center;
          gap: 28px;
          border-top: 1px solid var(--line-dark);
          padding-top: 28px;
        }
        .heroStats > div {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .statDivider {
          width: 1px;
          height: 32px;
          background: var(--line-dark);
        }
        .statNum {
          font-family: "IBM Plex Mono", monospace;
          font-size: 20px;
          color: #ffffff;
          font-weight: 500;
        }
        .statLabel {
          font-size: 12px;
          color: var(--muted-light);
        }

        /* TRUST STRIP */
        .trustStrip {
          background: var(--surface);
          border-bottom: 1px solid var(--line);
        }
        .trustStripRow {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          padding: 18px 24px;
        }
        .chip {
          font-family: "IBM Plex Mono", monospace;
          font-size: 12px;
          color: var(--muted);
          border: 1px solid var(--line);
          padding: 6px 12px;
          border-radius: 20px;
        }

        /* SECTIONS */
        .section {
          padding: 84px 0;
        }
        .sectionDark {
          background: var(--ink);
        }

        /* DEMO */
        .demoGrid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
        }
        .demoCard {
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: 12px;
          padding: 28px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .field {
          display: flex;
          flex-direction: column;
          gap: 8px;
          font-size: 13px;
          font-weight: 600;
          color: var(--text);
        }
        .row {
          display: flex;
          gap: 8px;
        }
        .input,
        .select {
          padding: 12px;
          font-size: 15px;
          font-family: "IBM Plex Mono", monospace;
          border-radius: 8px;
          border: 1px solid var(--line);
          background: var(--paper);
          color: var(--text);
        }
        .input {
          flex: 1;
        }
        .inputMono {
          width: 100%;
          font-size: 13px;
        }
        .selectFull {
          width: 100%;
        }
        .errorText {
          font-size: 13px;
          color: #b3261e;
          margin: 0;
        }
        .resultCard {
          background: var(--ink);
          border-radius: 12px;
          padding: 28px;
          color: #ffffff;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        .resultEmpty p {
          color: var(--muted-light);
          font-size: 14px;
          line-height: 1.6;
          margin: 0;
        }
        .routeViz {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 0;
          margin-bottom: 20px;
        }
        .routeHop {
          display: flex;
          align-items: center;
        }
        .routeDot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--brass);
          display: inline-block;
        }
        .routeLabel {
          font-family: "IBM Plex Mono", monospace;
          font-size: 12px;
          color: var(--muted-light);
          margin: 0 8px;
        }
        .routeLine {
          width: 24px;
          height: 1px;
          background: var(--line-dark);
          border-top: 1px dashed var(--brass-deep);
        }
        .resultAmount {
          font-family: "Fraunces", serif;
          font-size: 40px;
          font-weight: 600;
          margin: 0;
        }
        .resultAmountUnit {
          font-size: 18px;
          color: var(--muted-light);
        }
        .resultMeta {
          font-size: 13px;
          color: var(--muted-light);
          margin: 6px 0 16px;
        }
        .resultExplain {
          font-size: 13px;
          color: var(--muted-light);
          line-height: 1.6;
          margin: 0 0 20px;
        }
        .savingsBadge {
          display: inline-block;
          background: rgba(31, 138, 131, 0.18);
          color: #4fd1c5;
          font-size: 13px;
          font-weight: 600;
          padding: 8px 14px;
          border-radius: 8px;
          width: fit-content;
        }
        .sendPanel {
          margin-top: 22px;
          padding-top: 20px;
          border-top: 1px solid var(--line-dark);
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .sendHint {
          font-size: 12.5px;
          color: var(--muted-light);
          margin: 0;
        }
        .txSuccess {
          background: rgba(31, 138, 131, 0.12);
          border-radius: 8px;
          padding: 12px 14px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .txSuccess p {
          margin: 0;
          font-size: 13px;
          color: #ffffff;
        }
        .txSuccess a {
          font-size: 13px;
          color: #4fd1c5;
        }
        .mono {
          font-family: "IBM Plex Mono", monospace;
        }

        /* HOW + CODE */
        .howGrid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 56px;
        }
        .stepList {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 22px;
        }
        .stepList li {
          border-left: 2px solid var(--line-dark);
          padding-left: 18px;
        }
        .stepTag {
          font-family: "IBM Plex Mono", monospace;
          font-size: 11px;
          color: var(--brass);
          display: block;
          margin-bottom: 4px;
        }
        .stepList p {
          margin: 0;
          color: var(--muted-light);
          font-size: 14px;
          line-height: 1.55;
        }
        .codeCard {
          background: var(--ink-raised);
          border-radius: 10px;
          overflow: hidden;
          border: 1px solid var(--line-dark);
        }
        .codeCardHead {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 10px 14px;
          border-bottom: 1px solid var(--line-dark);
        }
        .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }
        .dotRed {
          background: #e5534b;
        }
        .dotYellow {
          background: #c6a15b;
        }
        .dotGreen {
          background: #1f8a83;
        }
        .codeCardTitle {
          margin-left: 8px;
          font-family: "IBM Plex Mono", monospace;
          font-size: 12px;
          color: var(--muted-light);
        }
        .codeBlock {
          margin: 0;
          padding: 18px;
          font-family: "IBM Plex Mono", monospace;
          font-size: 12.5px;
          line-height: 1.6;
          color: #d7dee8;
          overflow-x: auto;
          white-space: pre;
        }
        .docsLink {
          display: inline-block;
          margin-top: 16px;
          color: var(--brass);
          font-size: 13px;
          text-decoration: none;
        }
        .docsLink:hover {
          text-decoration: underline;
        }

        /* FEES */
        .feeTable {
          border: 1px solid var(--line);
          border-radius: 12px;
          overflow: hidden;
        }
        .feeRow {
          display: grid;
          grid-template-columns: 2fr 1fr 1fr 1fr;
          padding: 16px 20px;
          font-size: 13.5px;
          border-bottom: 1px solid var(--line);
          align-items: center;
        }
        .feeRow:last-child {
          border-bottom: none;
        }
        .feeRowHead {
          background: var(--paper);
          font-family: "IBM Plex Mono", monospace;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--muted);
        }
        .feeRowHighlight {
          background: rgba(198, 161, 91, 0.08);
        }
        .feeName {
          font-weight: 600;
          color: var(--text);
        }

        /* TRUST GRID */
        .trustGrid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
        }
        .trustCard {
          border: 1px solid var(--line-dark);
          border-radius: 10px;
          padding: 22px;
        }
        .trustCard h3 {
          font-family: "Fraunces", serif;
          font-size: 17px;
          font-weight: 600;
          color: #ffffff;
          margin: 0 0 8px;
        }
        .trustCard p {
          font-size: 13.5px;
          color: var(--muted-light);
          line-height: 1.6;
          margin: 0;
        }

        /* CTA BAND */
        .ctaBand {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 32px;
          flex-wrap: wrap;
        }
        .ctaButtons {
          display: flex;
          gap: 12px;
        }

        /* FOOTER */
        .footer {
          background: var(--ink);
          border-top: 1px solid var(--line-dark);
        }
        .footerRow {
          display: flex;
          justify-content: space-between;
          padding: 24px;
          font-size: 12.5px;
          color: var(--muted-light);
          font-family: "IBM Plex Mono", monospace;
        }

        @media (max-width: 820px) {
          .h1 {
            font-size: 36px;
          }
          .demoGrid,
          .howGrid,
          .trustGrid {
            grid-template-columns: 1fr;
          }
          .heroStats {
            flex-wrap: wrap;
          }
          .feeRow {
            grid-template-columns: 1fr 1fr;
            row-gap: 6px;
          }
        }
      `}</style>
    </>
  );
}
