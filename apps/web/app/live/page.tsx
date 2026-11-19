import { LiveWallet } from "../../components/LiveWallet";
import { deployment } from "../../lib/deployment.ts";
import { anvilChainId } from "../../lib/chain.ts";

export const dynamic = "force-dynamic";

export default function LivePage() {
  let target;
  try {
    target = deployment().target;
  } catch {
    return (
      <main className="live-shell">
        <a href="/">Synthetic demo</a>
        <h1>Live registry</h1>
        <p role="status">Live verification is unavailable until an operator configures a supported registry deployment and RPC.</p>
      </main>
    );
  }
  return (
    <main className="live-shell">
      <a href="/">Synthetic demo</a>
      <h1>Live registry</h1>
      <p>{target.chainId === anvilChainId ? "Local Anvil" : "QIE Testnet"} · chain {target.chainId}</p>
      <p className="live-mono">{target.registry}</p>
      <form className="live-panel" action="/passport">
        <h2>Find a public passport</h2>
        <input type="hidden" name="chain" value={target.chainId} />
        <input type="hidden" name="registry" value={target.registry} />
        <label>Passport type
          <select name="kind"><option value="element">Structural element</option><option value="lot">Material lot</option></select>
        </label>
        <label>Record ID<input name="id" required pattern="[1-9][0-9]*" inputMode="numeric" /></label>
        <button type="submit">Find passport</button>
      </form>
      <LiveWallet target={target} />
    </main>
  );
}
