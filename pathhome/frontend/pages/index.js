import { useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

const ASSET_OPTIONS = [
  { code: "XLM", issuer: null, label: "XLM (native)" },
  { code: "USDC", issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN", label: "USDC (testnet)" },
];

export default function Home() {
  const [sourceAsset, setSourceAsset] = useState(ASSET_OPTIONS[1]);
  const [destAsset, setDestAsset] = useState(ASSET_OPTIONS[0]);
  const [amount, setAmount] = useState("100");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

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
        throw new Error(body.detail || "Could not find a route for this pair.");
      }

      setResult(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={styles.main}>
      <h1 style={styles.h1}>PathHome</h1>
      <p style={styles.subtitle}>
        Send money home across Southeast Asia at Stellar speed and cost.
      </p>

      <form onSubmit={handleSubmit} style={styles.form}>
        <label style={styles.label}>
          You send
          <div style={styles.row}>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={styles.input}
            />
            <select
              value={sourceAsset.code}
              onChange={(e) =>
                setSourceAsset(ASSET_OPTIONS.find((a) => a.code === e.target.value))
              }
              style={styles.select}
            >
              {ASSET_OPTIONS.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
        </label>

        <label style={styles.label}>
          Recipient receives
          <select
            value={destAsset.code}
            onChange={(e) =>
              setDestAsset(ASSET_OPTIONS.find((a) => a.code === e.target.value))
            }
            style={styles.select}
          >
            {ASSET_OPTIONS.map((a) => (
              <option key={a.code} value={a.code}>
                {a.label}
              </option>
            ))}
          </select>
        </label>

        <button type="submit" disabled={loading} style={styles.button}>
          {loading ? "Finding best route..." : "Find best route"}
        </button>
      </form>

      {error && <p style={styles.error}>{error}</p>}

      {result && (
        <section style={styles.result}>
          <h2 style={styles.h2}>Recommended route</h2>
          <p>{result.recommended.path.join(" → ")}</p>
          <p>
            Recipient gets <strong>{result.recommended.dest_amount}</strong> in ~
            {result.recommended.settlement_seconds} seconds
          </p>
          <p style={styles.explanation}>{result.explanation}</p>
          <p style={styles.savings}>
            Estimated savings vs. traditional remittance (
            {result.baseline_traditional_fee_percent}% avg. fee):{" "}
            <strong>{result.estimated_savings_percent}%</strong>
          </p>

          {result.alternatives.length > 0 && (
            <>
              <h3 style={styles.h3}>Other routes</h3>
              <ul>
                {result.alternatives.map((alt, i) => (
                  <li key={i}>
                    {alt.path.join(" → ")} — {alt.dest_amount} ({alt.label})
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </main>
  );
}

const styles = {
  main: { maxWidth: 480, margin: "60px auto", fontFamily: "system-ui, sans-serif", padding: "0 16px" },
  h1: { fontSize: 32, marginBottom: 4 },
  subtitle: { color: "#555", marginBottom: 32 },
  form: { display: "flex", flexDirection: "column", gap: 20 },
  label: { display: "flex", flexDirection: "column", gap: 6, fontWeight: 600 },
  row: { display: "flex", gap: 8 },
  input: { flex: 1, padding: 10, fontSize: 16, borderRadius: 8, border: "1px solid #ccc" },
  select: { padding: 10, fontSize: 16, borderRadius: 8, border: "1px solid #ccc" },
  button: {
    padding: 12,
    fontSize: 16,
    borderRadius: 8,
    border: "none",
    background: "#0b6efd",
    color: "white",
    cursor: "pointer",
  },
  error: { color: "#b00020", marginTop: 16 },
  result: { marginTop: 32, padding: 20, borderRadius: 12, background: "#f5f7fa" },
  h2: { fontSize: 20, marginBottom: 8 },
  h3: { fontSize: 16, marginTop: 16 },
  explanation: { color: "#444", fontSize: 14 },
  savings: { marginTop: 8, color: "#0a7a2f" },
};
