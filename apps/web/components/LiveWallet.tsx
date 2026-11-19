"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { BaseError, TransactionReceiptNotFoundError, type Address, type EIP1193Provider, type Hash } from "viem";
import { prepareAction, walletClients, type ActionName } from "../lib/actions.ts";
import { address, anvilChainId, passportPath, sameHex, type PassportKind, type RegistryTarget } from "../lib/chain.ts";
import { ReceiptError, validateReceipt, type ExpectedEvent } from "../lib/receipt.ts";
import { EvidenceFile } from "./EvidenceFile";

type WalletChoice = { id: string; name: string; provider: EIP1193Provider };
type Session = { choice: WalletChoice; account: Address; chainId: number };
type Pending = { hash: Hash; expected: ExpectedEvent };
type Progress = { label: string; detail?: string; hash?: Hash; link?: string };
type Field = { name: string; label: string; options?: [string, string][]; hash?: boolean };

const projectId = { name: "projectId", label: "Project ID" };
const lotId = { name: "lotId", label: "Lot ID" };
const quantity = { name: "quantity", label: "Quantity in the lot’s declared unit" };
const choices: Record<ActionName, { label: string; fields: Field[] }> = {
  project: { label: "Create project", fields: [{ name: "projectHash", label: "Project digest", hash: true }, { name: "supervisor", label: "Supervisor address" }] },
  role: { label: "Manage project role", fields: [projectId, { name: "member", label: "Member address" }, { name: "role", label: "Role", options: [["1", "Inspector"], ["2", "Engineer"], ["3", "Laboratory"]] }, { name: "enabled", label: "Permission", options: [["true", "Grant"], ["false", "Revoke"]] }] },
  element: { label: "Create structural element", fields: [projectId, { name: "elementCodeHash", label: "Element code digest", hash: true }, { name: "elementType", label: "Element type code (0–255)" }] },
  register: { label: "Register supplier lot", fields: [projectId, { name: "lotHash", label: "Lot digest", hash: true }, { name: "supplier", label: "Supplier address" }, { name: "materialType", label: "Material", options: [["0", "Other"], ["1", "Rebar"], ["2", "Cement"], ["3", "Coarse aggregate"], ["4", "Fine aggregate"], ["5", "Ready mix"]] }, quantity, { name: "unitCode", label: "Unit digest" }] },
  decision: { label: "Record inspector decision", fields: [lotId, { name: "decision", label: "Decision", options: [["2", "Accept in full"], ["3", "Partially accept"], ["4", "Reject"]] }, { ...quantity, label: "Accepted quantity (0 for rejection)" }, { name: "conditionHash", label: "Condition evidence digest", hash: true }] },
  assign: { label: "Assign lot to element", fields: [lotId, { name: "elementId", label: "Element ID" }, quantity, { name: "evidenceHash", label: "Assignment evidence digest", hash: true }] },
  lab: { label: "Attach designated-lab evidence", fields: [lotId, { name: "sampleHash", label: "Sample digest", hash: true }, { name: "resultsHash", label: "Results evidence digest", hash: true }] },
};

function chainId(value: unknown) {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value)) throw new Error("The wallet returned an invalid chain ID.");
  const parsed = Number(BigInt(value));
  if (!Number.isSafeInteger(parsed)) throw new Error("The wallet returned an unsupported chain ID.");
  return parsed;
}

function errorText(error: unknown) {
  return error instanceof BaseError ? error.shortMessage : error instanceof Error ? error.message : "The wallet request failed.";
}

export function LiveWallet({ target }: { target: RegistryTarget }) {
  const [wallets, setWallets] = useState<WalletChoice[]>([]);
  const [chosen, setChosen] = useState("");
  const [session, setSession] = useState<Session>();
  const [action, setAction] = useState<ActionName>("project");
  const [progress, setProgress] = useState<Progress>();
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending>();
  const revision = useRef(0);
  const active = useRef(false);
  const currentSession = useRef<Session | undefined>(undefined);
  const waitForReceipt = useRef<AbortController | undefined>(undefined);

  useEffect(() => {
    const browser = window as Window & { ethereum?: EIP1193Provider; qie?: EIP1193Provider };
    const add = (choice: WalletChoice) => {
      if (!choice.provider?.request) return;
      setWallets((list) => list.some((wallet) => wallet.provider === choice.provider || wallet.id === choice.id) ? list : [...list, choice]);
    };
    const announce = (event: Event) => {
      const detail = (event as CustomEvent<{ info?: { uuid?: string; name?: string }; provider?: EIP1193Provider }>).detail;
      if (detail?.info?.uuid && detail.info.name && detail.provider) {
        add({ id: detail.info.uuid, name: detail.info.name, provider: detail.provider });
      }
    };
    window.addEventListener("eip6963:announceProvider", announce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    if (browser.qie) add({ id: "qie", name: "QIE Wallet", provider: browser.qie });
    if (browser.ethereum) add({ id: "injected", name: "Browser EVM wallet", provider: browser.ethereum });
    return () => {
      window.removeEventListener("eip6963:announceProvider", announce);
      ++revision.current;
      waitForReceipt.current?.abort();
    };
  }, []);

  const provider = session?.choice.provider;
  useEffect(() => {
    if (!provider) return;
    const update = (next: Session | undefined) => {
      ++revision.current;
      waitForReceipt.current?.abort();
      currentSession.current = next;
      setSession(next);
    };
    const accountsChanged = (accounts: string[]) => {
      const previous = currentSession.current;
      if (!previous) return;
      try {
        update(accounts[0] ? { ...previous, account: address(accounts[0]) } : undefined);
      } catch {
        update(undefined);
      }
    };
    const chainChanged = (chain: string) => {
      const previous = currentSession.current;
      if (!previous) return;
      try {
        update({ ...previous, chainId: chainId(chain) });
      } catch {
        update(undefined);
      }
    };
    const disconnected = () => update(undefined);
    provider.on?.("accountsChanged", accountsChanged);
    provider.on?.("chainChanged", chainChanged);
    provider.on?.("disconnect", disconnected);
    return () => {
      provider.removeListener?.("accountsChanged", accountsChanged);
      provider.removeListener?.("chainChanged", chainChanged);
      provider.removeListener?.("disconnect", disconnected);
    };
  }, [provider]);

  async function connect() {
    const choice = wallets.find((entry) => entry.id === chosen) ?? wallets[0];
    if (!choice || active.current) return;
    active.current = true;
    setBusy(true);
    try {
      const accounts = await choice.provider.request({ method: "eth_requestAccounts" });
      const chain = await choice.provider.request({ method: "eth_chainId" });
      const next = { choice, account: address(accounts[0] ?? ""), chainId: chainId(chain) };
      ++revision.current;
      currentSession.current = next;
      setSession(next);
    } catch (error) {
      setProgress({ label: "Connection failed", detail: errorText(error) });
    } finally {
      active.current = false;
      setBusy(false);
    }
  }

  function disconnect() {
    ++revision.current;
    waitForReceipt.current?.abort();
    currentSession.current = undefined;
    setSession(undefined);
  }

  async function run(form?: FormData) {
    if (!session || session.chainId !== target.chainId || active.current || (!form && !pending)) return;
    active.current = true;
    setBusy(true);
    const started = revision.current;
    const { account, choice } = session;
    const clients = walletClients(choice.provider, target);
    const { reader, wallet, chain } = clients;
    let transaction = form ? undefined : pending;
    let signed = false;
    const controller = new AbortController();
    waitForReceipt.current = controller;

    async function checkSession() {
      const [chain, accounts] = await Promise.all([
        choice.provider.request({ method: "eth_chainId" }),
        choice.provider.request({ method: "eth_accounts" }),
      ]);
      if (revision.current !== started || chainId(chain) !== target.chainId || !accounts[0] || !sameHex(accounts[0], account)) {
        throw new Error("Wallet account or network changed. Review the wallet and try again.");
      }
    }

    try {
      await checkSession();
      if (form) {
        setProgress({ label: "Preparing transaction" });
        const code = await reader.getCode({ address: target.registry });
        if (!code || code === "0x") throw new Error("The configured registry has no code on this chain.");
        const prepared = await prepareAction({
          action, form, account, target, clients, checkSession,
          onSigned() {
            signed = true;
            setProgress({ label: "Signed", detail: "Review and send the transaction in your wallet." });
          },
        });
        await checkSession();
        await reader.call({ account, to: target.registry, data: prepared.data });
        await checkSession();
        const hash = await wallet.sendTransaction({ account, chain, to: target.registry, data: prepared.data });
        transaction = { hash, expected: prepared.expected };
        setPending(transaction);
        setProgress({ label: "Submitted", hash });
      }
      if (!transaction) return;
      const { hash, expected } = transaction;
      for (let attempt = 0; attempt < 12 && !controller.signal.aborted; attempt++) {
        await checkSession();
        const receipt = await reader.getTransactionReceipt({ hash }).catch((error) => {
          if (error instanceof TransactionReceiptNotFoundError) return null;
          throw error;
        });
        if (receipt) {
          const [block, head] = await Promise.all([
            reader.getBlock({ blockNumber: receipt.blockNumber }),
            reader.getBlockNumber(),
          ]);
          if (block.hash === receipt.blockHash && head - receipt.blockNumber + 1n >= BigInt(target.confirmations)) {
            await checkSession();
            const result = validateReceipt({ actualChainId: await reader.getChainId(), target, hash, receipt, expected });
            const kind: PassportKind | undefined = expected.name === "ElementCreated" ? "element"
              : expected.name === "MaterialLotRegistered" || expected.name === "LotDecisionRecorded" || expected.name === "TestEvidenceAttached" ? "lot"
              : expected.name === "LotAssignedToElement" ? "element" : undefined;
            const lookupId = expected.name === "LotAssignedToElement" ? expected.fields.elementId as bigint : result.id ?? expected.fields.lotId as bigint | undefined;
            const link = kind && lookupId ? passportPath({ ...target, kind, id: lookupId }) : undefined;
            setProgress({ label: "Confirmed", hash, link, detail: result.id ? `Record ID ${result.id}` : undefined });
            setPending(undefined);
            return;
          }
        }
        setProgress({ label: "Pending", hash, detail: "Waiting for a canonical receipt and the configured confirmation depth." });
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      setProgress({ label: "Pending", hash, detail: "Refresh the receipt when the wallet is on the registry chain." });
    } catch (error) {
      const receiptError = error instanceof ReceiptError ? error : undefined;
      if (receiptError?.reason === "reverted") setPending(undefined);
      setProgress({
        label: receiptError?.reason === "reverted" ? "Reverted" : transaction ? "Receipt unverified" : signed ? "Signed · submission unverified" : "Submission unverified",
        hash: transaction?.hash,
        detail: errorText(error),
      });
    } finally {
      waitForReceipt.current = undefined;
      active.current = false;
      setBusy(false);
    }
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run(new FormData(event.currentTarget));
  };
  const mismatch = session && session.chainId !== target.chainId;
  return (
    <section className="live-panel" aria-label="Wallet and registry transactions">
      <h2>Wallet and registry transactions</h2>
      {session ? (
        <>
          <p className="live-mono">{session.account}</p>
          <p>Wallet chain {session.chainId}</p>
          {mismatch && <p role="alert">Network mismatch. Switch your wallet to chain {target.chainId} to continue.</p>}
          <button type="button" onClick={disconnect}>Disconnect from PourLedger</button>
        </>
      ) : (
        <>
          {wallets.length ? <label>Wallet
            <select value={chosen || wallets[0]?.id || ""} onChange={(event) => setChosen(event.target.value)}>
              {wallets.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
            </select>
          </label> : <p>No compatible browser wallet detected.</p>}
          <button type="button" disabled={!wallets.length || busy} onClick={connect}>Connect wallet</button>
        </>
      )}
      {session && !mismatch && (
        <>
          <label>Registry action
            <select value={action} onChange={(event) => setAction(event.target.value as ActionName)} disabled={busy}>
              {Object.entries(choices).map(([key, item]) => <option value={key} key={key}>{item.label}</option>)}
            </select>
          </label>
          {action === "register" && <p>Registration records a supplier declaration. A designated inspector must decide whether the lot is accepted.</p>}
          <form key={action} onSubmit={submit}>
            {choices[action].fields.map((field) => <ActionField key={field.name} field={field} account={session.account} />)}
            <button type="submit" disabled={busy || !!pending}>{choices[action].label}</button>
          </form>
          {pending && <button type="button" disabled={busy} onClick={() => void run()}>Refresh receipt</button>}
          {pending && <button type="button" disabled={busy} onClick={() => {
            setPending(undefined);
            setProgress({ label: "Receipt tracking stopped", hash: pending.hash });
          }}>Stop tracking receipt</button>}
        </>
      )}
      {progress && <div role="status" className="live-result">
        <strong>{progress.label}</strong>
        {progress.detail && <p>{progress.detail}</p>}
        {progress.hash && <p className="live-mono">{progress.hash}</p>}
        {progress.link && <a href={progress.link}>Open public passport</a>}
      </div>}
      <p className="live-note">{target.chainId === anvilChainId ? "Local Anvil. Use disposable local test accounts." : "QIE Testnet. Use a separately approved testnet wallet."}</p>
    </section>
  );
}

function ActionField({ field, account }: { field: Field; account: Address }) {
  const [hash, setHash] = useState("");
  return (
    <div className="live-field">
      <label>{field.label}
        {field.options ? (
          <select required name={field.name}>{field.options.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
        ) : field.hash ? (
          <input required name={field.name} value={hash} onChange={(event) => setHash(event.target.value)} autoComplete="off" />
        ) : (
          <input required name={field.name} autoComplete="off" defaultValue={["supervisor", "supplier"].includes(field.name) ? account : undefined} />
        )}
      </label>
      {field.hash && <EvidenceFile onHash={setHash} />}
    </div>
  );
}
