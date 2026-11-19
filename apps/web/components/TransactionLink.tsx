import { explorerTransaction, type RegistryTarget } from "../lib/chain.ts";

export function TransactionLink({ target, hash, label }: {
  target: Pick<RegistryTarget, "chainId" | "explorerOrigin">; hash: string; label: string;
}) {
  const href = explorerTransaction(target, hash);
  return (
    <div className="tx-reference">
      {href ? <a href={href} target="_blank" rel="noopener noreferrer">{label} on explorer</a> : <span>{label}</span>}
      <code>{hash}</code>
    </div>
  );
}
