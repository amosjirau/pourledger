import { decodeEventLog, toEventSelector, type Hash, type TransactionReceipt } from "viem";
import { registryAbi } from "./generated/registry.ts";
import { sameHex, type RegistryTarget } from "./chain.ts";

type Event = Extract<(typeof registryAbi)[number], { type: "event" }>;
type EventName = Event["name"];
type Field = string | number | bigint | boolean;
type EventFields = Record<string, Field>;
export type ExpectedEvent = { name: EventName; fields: EventFields; generatedId?: string };

export class ReceiptError extends Error {
  readonly reason: "missing" | "reverted" | "mismatch";

  constructor(reason: ReceiptError["reason"], message: string) {
    super(message);
    this.reason = reason;
  }
}

function fieldsMatch(expected: EventFields, actual: EventFields) {
  return Object.entries(expected).every(([key, value]) => {
    const found = actual[key];
    if (typeof value === "string" && typeof found === "string") return sameHex(value, found);
    return value === found;
  });
}

export function validateReceipt({
  actualChainId, target, hash, receipt, expected, logIndex,
}: {
  actualChainId: number;
  target: RegistryTarget;
  hash: Hash;
  receipt: TransactionReceipt | null;
  expected: ExpectedEvent;
  logIndex?: number;
}) {
  if (actualChainId !== target.chainId) throw new ReceiptError("mismatch", "Receipt RPC is on the wrong chain.");
  if (!receipt) throw new ReceiptError("missing", "No transaction receipt is available yet.");
  if (!sameHex(receipt.transactionHash, hash)) throw new ReceiptError("mismatch", "Receipt hash does not match.");
  if (receipt.status === "reverted") throw new ReceiptError("reverted", "Transaction reverted on-chain.");
  if (receipt.status !== "success") throw new ReceiptError("mismatch", "Receipt status is unsupported.");

  const event = registryAbi.find((item): item is Event => item.type === "event" && item.name === expected.name);
  if (!event) throw new ReceiptError("mismatch", "Registry event is unknown.");
  const signature = toEventSelector(event);
  const matches = receipt.logs.flatMap((log) => {
    if (log.removed || !sameHex(log.address, target.registry) || log.topics[0] !== signature) return [];
    if (logIndex !== undefined && log.logIndex !== logIndex) return [];
    if (log.transactionHash !== receipt.transactionHash || log.blockHash !== receipt.blockHash || log.blockNumber !== receipt.blockNumber) return [];
    try {
      const decoded = decodeEventLog({ abi: [event], topics: log.topics, data: log.data, strict: true });
      const fields = decoded.args as EventFields;
      if (!fieldsMatch(expected.fields, fields)) return [];
      const id = expected.generatedId && fields[expected.generatedId];
      if (expected.generatedId && (typeof id !== "bigint" || id <= 0n)) return [];
      return [{ fields, id: typeof id === "bigint" ? id : undefined }];
    } catch {
      return [];
    }
  });
  if (matches.length !== 1) throw new ReceiptError("mismatch", "Receipt lacks one unambiguous registry event with the expected fields.");
  return matches[0];
}
