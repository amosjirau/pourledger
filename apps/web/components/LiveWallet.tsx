"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { BaseError, keccak256, stringToHex, TransactionReceiptNotFoundError, UserRejectedRequestError, type Address, type EIP1193Provider, type Hash } from "viem";
import { prepareAction, walletClients, type ActionName } from "../lib/actions.ts";
import { address, anvilChainId, elementTypes, networks, passportPath, sameHex, unitOptions, type PassportKind, type RegistryTarget } from "../lib/chain.ts";
import { registryAbi } from "../lib/generated/registry.ts";
import { ReceiptError, validateReceipt, type ExpectedEvent } from "../lib/receipt.ts";
import { matchesRegistryDomain, matchesRegistryImage } from "../lib/registry-image.ts";
import { EvidenceFile } from "./EvidenceFile";
import { TransactionLink } from "./TransactionLink";

type WalletChoice = { id: string; name: string; provider: EIP1193Provider };
type Session = { choice: WalletChoice; account: Address; chainId: number };
type Pending = { hash: Hash; expected: ExpectedEvent };
type Progress = { label: string; detail?: string; hash?: Hash; link?: string };
type Field = { name: string; label: string; options?: [string, string][]; hash?: boolean; reference?: string };
type Context = { project: string; elements: string[]; lots: { id: string; status: number; unit: string; declared: string; available: string }[] };

const projectId = { name: "projectId", label: "Project ID" };
const lotId = { name: "lotId", label: "Lot ID" };
const quantity = { name: "quantity", label: "Quantity in the lot’s declared unit" };
const choices: Record<ActionName, { label: string; fields: Field[] }> = {
  project: { label: "Create project", fields: [{ name: "projectHash", label: "Project digest", hash: true, reference: "Project reference" }, { name: "supervisor", label: "Supervisor address" }] },
  role: { label: "Manage project role", fields: [projectId, { name: "member", label: "Member address" }, { name: "role", label: "Role", options: [["1", "Inspector"], ["2", "Engineer"], ["3", "Laboratory"]] }, { name: "enabled", label: "Permission", options: [["true", "Grant"], ["false", "Revoke"]] }] },
  element: { label: "Create structural element", fields: [projectId, { name: "elementCodeHash", label: "Element code digest", hash: true, reference: "Element reference" }, { name: "elementType", label: "Element type", options: elementTypes.map((name, index) => [String(index), name]) }] },
  register: { label: "Register supplier lot", fields: [projectId, { name: "lotHash", label: "Lot digest", hash: true, reference: "Lot reference" }, { name: "supplier", label: "Supplier address" }, { name: "materialType", label: "Material", options: [["0", "Other"], ["1", "Rebar"], ["2", "Cement"], ["3", "Coarse aggregate"], ["4", "Fine aggregate"], ["5", "Ready mix"]] }, quantity, { name: "unitCode", label: "Unit digest" }] },
  decision: { label: "Record inspector decision", fields: [lotId, { name: "decision", label: "Decision", options: [["2", "Accept in full"], ["3", "Partially accept"], ["4", "Reject"]] }, { ...quantity, label: "Accepted quantity (0 for rejection)" }, { name: "conditionHash", label: "Condition evidence digest", hash: true }] },
  assign: { label: "Assign lot to element", fields: [lotId, { name: "elementId", label: "Element ID" }, quantity, { name: "evidenceHash", label: "Assignment evidence digest", hash: true }] },
  lab: { label: "Attach designated-lab evidence", fields: [lotId, { name: "sampleHash", label: "Sample digest", hash: true, reference: "Sample reference" }, { name: "resultsHash", label: "Results evidence digest", hash: true }] },
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

function rememberWallet(value?: string) {
  try {
    if (value) sessionStorage.setItem("pourledger:wallet", value);
    else sessionStorage.removeItem("pourledger:wallet");
  } catch {
    // Wallet use remains available when browser storage is unavailable.
  }
}

export function LiveWallet({ target, context }: { target: RegistryTarget; context?: Context }) {
  const router = useRouter();
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

  useEffect(() => {
    if (currentSession.current || active.current) return;
    let stored: string | null;
    try { stored = sessionStorage.getItem("pourledger:wallet"); } catch { return; }
    if (!stored) return;
    const choice = wallets.find((wallet) => wallet.id === stored);
    if (!choice) return;
    const started = revision.current;
    let cancelled = false;
    void Promise.all([
      choice.provider.request({ method: "eth_accounts" }),
      choice.provider.request({ method: "eth_chainId" }),
    ]).then(([accounts, chain]) => {
      if (cancelled || revision.current !== started || active.current || !accounts[0]) return;
      const next = { choice, account: address(accounts[0]), chainId: chainId(chain) };
      ++revision.current;
      currentSession.current = next;
      setSession(next);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [wallets]);

  const provider = session?.choice.provider;
  useEffect(() => {
    if (!provider) return;
    const update = (next: Session | undefined) => {
      ++revision.current;
      waitForReceipt.current?.abort();
      currentSession.current = next;
      setSession(next);
      if (!next) rememberWallet();
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
      rememberWallet(choice.id);
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
    rememberWallet();
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
    setProgress(form ? { label: "Preparing transaction" } : { label: "Checking receipt", hash: transaction?.hash });

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
        const code = await reader.getCode({ address: target.registry });
        if (!matchesRegistryImage(code)) throw new Error("The configured address does not match the compiled registry.");
        const separator = await reader.readContract({ address: target.registry, abi: registryAbi, functionName: "domainSeparatorV4" });
        if (!matchesRegistryDomain(separator, target)) throw new Error("The configured registry returned a different signing domain.");
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
      let mined = false;
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
          if (block.hash === receipt.blockHash) {
            await checkSession();
            const depth = head - receipt.blockNumber + 1n;
            if (depth < 1n) throw new Error("Receipt block is ahead of the reported chain tip.");
            const actualChainId = await reader.getChainId();
            if (actualChainId !== target.chainId) throw new Error("Receipt RPC changed chains.");
            if (depth < BigInt(target.confirmations)) {
              if (receipt.status !== "reverted") validateReceipt({ actualChainId, target, hash, receipt, expected });
              mined = true;
              setProgress({ label: "Mined", hash, detail: `${depth} of ${target.confirmations} required confirmations.` });
              await new Promise((resolve) => setTimeout(resolve, 1000));
              continue;
            }
            const result = validateReceipt({ actualChainId, target, hash, receipt, expected });
            const kind: PassportKind | undefined = expected.name === "ElementCreated" ? "element"
              : expected.name === "MaterialLotRegistered" || expected.name === "LotDecisionRecorded" || expected.name === "TestEvidenceAttached" ? "lot"
              : expected.name === "LotAssignedToElement" ? "element" : undefined;
            const lookupId = expected.name === "LotAssignedToElement" ? expected.fields.elementId as bigint : result.id ?? expected.fields.lotId as bigint | undefined;
            const link = kind && lookupId ? passportPath({ ...target, kind, id: lookupId }) : undefined;
            setProgress({ label: "Confirmed", hash, link, detail: result.id ? `Record ID ${result.id}` : undefined });
            setPending(undefined);
            router.refresh();
            return;
          }
        }
        mined = false;
        setProgress({ label: "Pending", hash, detail: "Waiting for a canonical receipt and the configured confirmation depth." });
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      setProgress({ label: mined ? "Mined" : "Pending", hash, detail: "Refresh the receipt when the wallet is on the registry chain." });
    } catch (error) {
      const receiptError = error instanceof ReceiptError ? error : undefined;
      const rejected = error instanceof BaseError && error.walk((cause) => cause instanceof UserRejectedRequestError) instanceof UserRejectedRequestError;
      if (receiptError?.reason === "reverted") setPending(undefined);
      setProgress({
        label: receiptError?.reason === "reverted" ? "Reverted" : transaction ? "Receipt unverified"
          : rejected ? "Rejected in wallet" : signed ? "Signed · submission unverified" : "Submission unverified",
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
  const queuedLots = context?.lots.filter((lot) => action === "decision" ? lot.status === 1 : action === "assign" ? lot.available !== "0" : true) ?? [];
  return (
    <section className="live-panel" aria-label="Wallet and registry transactions">
      <h2>Wallet and registry transactions</h2>
      {session ? (
        <>
          <div className="workspace-registry"><span>Wallet chain {session.chainId}</span><code>{session.account}</code></div>
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
          {(action === "decision" || action === "assign" || action === "lab") && context && (
            <div className="wallet-queue">
              <strong>{action === "decision" ? "Lots awaiting an inspector" : action === "assign" ? "Assignable lots" : "Lots for lab attestations"}</strong>
              <p>{queuedLots.length ? queuedLots.map((lot) => action === "assign"
                ? `#${lot.id}: ${lot.available} ${lot.unit} available`
                : `#${lot.id}: ${lot.declared} ${lot.unit} declared`).join(" · ") : "No matching records in the verified project snapshot."}</p>
            </div>
          )}
          <form key={`${action}:${context?.project ?? ""}:${session.account}`} onSubmit={submit}>
            {choices[action].fields.map((field) => <ActionField key={field.name} field={field} account={session.account} context={context} lotIds={queuedLots.map((lot) => lot.id)} />)}
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
        {progress.hash && <TransactionLink target={target} hash={progress.hash} label="Transaction" />}
        {progress.link && <a href={progress.link}>Open public passport</a>}
      </div>}
      <p className="live-note">{target.chainId === anvilChainId ? "Local Anvil uses disposable test accounts." : `${networks[target.chainId].name} transactions require wallet approval.`}</p>
    </section>
  );
}

function ActionField({ field, account, context, lotIds }: { field: Field; account: Address; context?: Context; lotIds: string[] }) {
  const [hash, setHash] = useState("");
  const [reference, setReference] = useState("");
  const isUnit = field.name === "unitCode";
  const options = field.name === "lotId" ? lotIds.map((id) => [id, `Lot ${id}`])
    : field.name === "elementId" ? context?.elements.map((id) => [id, `Element ${id}`]) : undefined;
  const defaultValue = field.name === "projectId" ? context?.project
    : ["supervisor", "supplier"].includes(field.name) ? account : undefined;
  const numeric = ["projectId", "lotId", "elementId", "quantity"].includes(field.name);
  const inputId = `field-${field.name}`;
  return (
    <div className="live-field">
      <label htmlFor={inputId}>{field.label}
        {field.options ? (
          <select id={inputId} required name={field.name}>{field.options.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
        ) : field.hash || isUnit ? (
          <input id={inputId} required name={field.name} value={hash} onChange={(event) => setHash(event.target.value)} autoComplete="off" />
        ) : (
          <input id={inputId} required name={field.name} autoComplete="off" defaultValue={defaultValue}
            list={options?.length ? `options-${field.name}` : undefined}
            inputMode={numeric ? "numeric" : undefined} pattern={numeric ? "[0-9]+" : undefined} />
        )}
      </label>
      {!!options?.length && <datalist id={`options-${field.name}`}>{options.map(([value, label]) => <option value={value} label={label} key={value} />)}</datalist>}
      {isUnit && <label>Common unit
        <select value={unitOptions.some((unit) => unit.hash === hash) ? hash : ""} onChange={(event) => setHash(event.target.value)}>
          <option value="" disabled>Choose a unit or paste a custom digest</option>
          {unitOptions.map((unit) => <option value={unit.hash} key={unit.hash}>{unit.label}</option>)}
        </select>
      </label>}
      {field.reference && <details className="live-file">
        <summary>Hash a reference</summary>
        <label>{field.reference}
          <input value={reference} onChange={(event) => setReference(event.target.value)} autoComplete="off" maxLength={256} />
        </label>
        <small>Use a non-sensitive reference. The browser hashes it locally and the digest is public on-chain.</small>
        <button type="button" disabled={!reference.trim()} onClick={() => setHash(keccak256(stringToHex(reference.trim())))}>Use reference digest</button>
      </details>}
      {field.hash && <EvidenceFile onHash={setHash} />}
    </div>
  );
}
