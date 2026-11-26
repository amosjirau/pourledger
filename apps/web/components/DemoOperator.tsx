"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { BaseError, formatEther, keccak256, toHex, type Address, type EIP1193Provider, type Hex } from "viem";
import { prepareAction, walletClients } from "../lib/actions.ts";
import { address, digest, networks, passportPath, sameHex, type RegistryTarget } from "../lib/chain.ts";
import { demoRoles, demoStep, demoSteps, parseDemoRun, stepLabels, type DemoProgress, type DemoRun, type StepKey } from "../lib/demo-run.ts";
import { registryAbi } from "../lib/generated/registry.ts";
import { matchesRegistryDomain, matchesRegistryImage } from "../lib/registry-image.ts";
import { TransactionLink } from "./TransactionLink";

type Draft = { runId: string; key: StepKey; account: Address; data: Hex; nonce: number; gas: bigint; estimatedFee: bigint };

async function check(run: DemoRun): Promise<DemoProgress> {
  const response = await fetch("/operator/demo/check", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(run),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Read-only verification failed.");
  return data;
}

function downloadJournal(run: DemoRun) {
  const url = URL.createObjectURL(new Blob([`${JSON.stringify(run, null, 2)}\n`], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `pourledger-synthetic-${run.runId}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function DemoOperator({ target }: { target: RegistryTarget }) {
  const storageKey = `pourledger:operator:v1:${target.chainId}:${target.registry.toLowerCase()}`;
  const [run, setRun] = useState<DemoRun>();
  const [loaded, setLoaded] = useState(false);
  const [progress, setProgress] = useState<DemoProgress>();
  const [provider, setProvider] = useState<EIP1193Provider>();
  const [wallet, setWallet] = useState<{ account: Address; chainId: number }>();
  const [draft, setDraft] = useState<Draft>();
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const running = useRef(false);
  const walletRevision = useRef(0);
  const prefix = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const found = new Set<EIP1193Provider>();
    const announce = (event: Event) => {
      const detail = (event as CustomEvent<{ info?: { rdns?: string }; provider?: EIP1193Provider }>).detail;
      if (detail?.info?.rdns === "io.rabby" && typeof detail.provider?.request === "function") {
        found.add(detail.provider);
        setProvider(found.size === 1 ? detail.provider : undefined);
        if (found.size > 1) setError("More than one provider claimed to be Rabby. Use a profile with a single trusted Rabby extension.");
      }
    };
    window.addEventListener("eip6963:announceProvider", announce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    const browser = window as Window & { ethereum?: EIP1193Provider & { isRabby?: boolean } };
    if (!found.size && browser.ethereum?.isRabby === true && typeof browser.ethereum.request === "function") {
      setProvider(browser.ethereum);
    }
    return () => window.removeEventListener("eip6963:announceProvider", announce);
  }, []);

  useEffect(() => {
    const load = () => {
      try {
        const raw = localStorage.getItem(storageKey);
        setRun(raw ? parseDemoRun(JSON.parse(raw), target) : undefined);
        setProgress(undefined);
        setDraft(undefined);
        setApproved(false);
        setLoaded(true);
      } catch {
        setLoaded(false);
        setError("The saved journal could not be read. Preserve the browser profile and recover it before continuing.");
      }
    };
    const change = (event: StorageEvent) => { if (event.key === storageKey || event.key === null) load(); };
    load();
    window.addEventListener("storage", change);
    return () => window.removeEventListener("storage", change);
  }, [storageKey, target]);

  useEffect(() => {
    ++walletRevision.current;
    setWallet(undefined);
    setDraft(undefined);
    setApproved(false);
    if (!provider) return;
    const update = async () => {
      const revision = ++walletRevision.current;
      setDraft(undefined);
      setApproved(false);
      try {
        const current = await walletIdentity(provider);
        if (revision === walletRevision.current) setWallet(current);
      } catch {
        if (revision === walletRevision.current) setWallet(undefined);
      }
    };
    const disconnect = () => {
      ++walletRevision.current;
      setWallet(undefined);
      setDraft(undefined);
      setApproved(false);
    };
    provider.on?.("accountsChanged", update);
    provider.on?.("chainChanged", update);
    provider.on?.("disconnect", disconnect);
    void update();
    return () => {
      ++walletRevision.current;
      provider.removeListener?.("accountsChanged", update);
      provider.removeListener?.("chainChanged", update);
      provider.removeListener?.("disconnect", disconnect);
    };
  }, [provider]);

  useEffect(() => {
    if (!run) return;
    let active = true;
    let checking = false;
    let settled = false;
    const poll = async () => {
      if (checking || settled || running.current) return;
      checking = true;
      try {
        const report = await check(run);
        if (active && !running.current) {
          setProgress(report);
          settled = report.state !== "pending";
        }
      } catch {
        if (active && !running.current) setProgress(undefined);
      } finally {
        checking = false;
      }
    };
    void poll();
    const timer = window.setInterval(poll, 5_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [run]);

  function save(next: DemoRun) {
    const raw = JSON.stringify(next);
    localStorage.setItem(storageKey, raw);
    if (localStorage.getItem(storageKey) !== raw) throw new Error("The journal could not be persisted. Keep Rabby closed and retry.");
    setRun(next);
  }

  function read() {
    const raw = localStorage.getItem(storageKey);
    if (!raw) throw new Error("The journal is missing. Preserve the profile and check Rabby activity.");
    return parseDemoRun(JSON.parse(raw), target);
  }

  async function exclusive(task: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (!navigator.locks) throw new Error("Use a browser with Web Locks on this loopback origin.");
      await navigator.locks.request(storageKey, { ifAvailable: true }, async (lock) => {
        if (!lock) throw new Error("This journal is busy in another tab.");
        await task();
      });
    } catch (error) {
      setError(error instanceof BaseError ? error.shortMessage : error instanceof Error ? error.message : "The action could not be completed.");
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  function begin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void exclusive(async () => {
      if (localStorage.getItem(storageKey) !== null) throw new Error("This browser already has a journal for the registry.");
      const accounts = Object.fromEntries(demoRoles.map((role) => [role, String(form.get(role) ?? "").trim()]).filter(([, value]) => value));
      const next = parseDemoRun({ version: 1, runId: crypto.randomUUID(), chainId: target.chainId, registry: target.registry, accounts, attempts: {} }, target);
      const report = await check(next);
      save(next);
      setProgress(report);
    });
  }

  async function session(expected: Address) {
    if (!provider) throw new Error("Connect Rabby first.");
    const revision = walletRevision.current;
    const checkSession = async () => {
      const identity = await walletIdentity(provider);
      if (!identity || revision !== walletRevision.current || identity.chainId !== target.chainId || !sameHex(identity.account, expected)) {
        throw new Error("Select the listed account and chain in Rabby, then prepare the step again.");
      }
    };
    await checkSession();
    const clients = walletClients(provider, target);
    const { reader } = clients;
    const [code, domain] = await Promise.all([
      reader.getCode({ address: target.registry }),
      reader.readContract({ address: target.registry, abi: registryAbi, functionName: "domainSeparatorV4" }),
    ]);
    if (!matchesRegistryImage(code) || !matchesRegistryDomain(domain, target)) throw new Error("Rabby returned an unexpected registry bytecode or signing domain.");
    return { clients, checkSession, provider };
  }

  async function estimate({ reader }: ReturnType<typeof walletClients>, account: Address, data: Hex) {
    const tx = { account, to: target.registry, data, value: 0n } as const;
    const [gas, gasPrice, latest, pending, balance] = await Promise.all([
      reader.estimateGas(tx), reader.getGasPrice(), reader.getTransactionCount({ address: account, blockTag: "latest" }),
      reader.getTransactionCount({ address: account, blockTag: "pending" }), reader.getBalance({ address: account }),
    ]);
    if (latest !== pending) throw new Error("The sender has pending transactions. Wait for them before preparing this action.");
    if (balance < gas * gasPrice) throw new Error("The sender balance is below the indicative gas cost.");
    return { nonce: pending, gas, estimatedFee: gas * gasPrice };
  }

  async function prepare() {
    const current = read();
    setDraft(undefined);
    setApproved(false);
    const report = await check(current);
    setProgress(report);
    if (report.state !== "ready" || !report.next) throw new Error("Resolve the saved attempt before preparing the next step.");
    if (!report.passportHistoryAvailable) throw new Error("Verified public passport history is unavailable.");
    const step = demoStep(current, report.next, report.verified);
    const { clients, checkSession } = await session(step.account);
    const { data } = await prepareAction({ ...step, target, clients, checkSession, onSigned: () => setNotice("Typed data signed. Review the separate registry transaction below.") });
    const fees = await estimate(clients, step.account, data);
    await checkSession();
    setDraft({ runId: current.runId, key: step.key, account: step.account, data, ...fees });
  }

  async function send() {
    if (!draft || !approved) throw new Error("Review the prepared transaction before opening Rabby.");
    const current = read();
    const report = await check(current);
    setProgress(report);
    if (current.runId !== draft.runId || report.state !== "ready" || report.next !== draft.key || !report.passportHistoryAvailable) {
      throw new Error("The journal changed. Prepare the current step again.");
    }
    const { clients, checkSession, provider } = await session(draft.account);
    const fees = await estimate(clients, draft.account, draft.data);
    if (fees.nonce !== draft.nonce || fees.gas > draft.gas || fees.estimatedFee > draft.estimatedFee) {
      setDraft(undefined);
      setApproved(false);
      throw new Error("The nonce or indicative fee changed. Prepare a fresh transaction.");
    }
    await checkSession();
    const attempt = { nonce: draft.nonce, calldataHash: keccak256(draft.data) };
    const reserve = { ...current, attempts: { ...current.attempts, [draft.key]: attempt } };
    save(reserve);
    setDraft(undefined);
    setApproved(false);
    setProgress({ ...report, state: "recover" });
    let hash: Hex;
    try {
      hash = digest(await provider.request({ method: "eth_sendTransaction", params: [{
        from: draft.account, to: target.registry, chainId: toHex(target.chainId), data: draft.data, value: "0x0", nonce: toHex(draft.nonce),
      }] }));
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === 4001) {
        save(current);
        setProgress(report);
        setNotice("Rabby declined the transaction. Prepare it again when ready.");
        return;
      }
      throw new Error("The transaction outcome is unknown. Find its hash in Rabby activity before continuing.");
    }
    save({ ...reserve, attempts: { ...reserve.attempts, [draft.key]: { ...attempt, hash } } });
    setProgress({ ...report, state: "pending" });
    setNotice("Transaction hash saved. Waiting for independent receipt verification.");
  }

  async function recover() {
    const current = read();
    const key = demoSteps(current).filter((step) => current.attempts[step]).at(-1);
    const attempt = key && current.attempts[key];
    if (!key || !attempt) throw new Error("There is no attempt to recover.");
    const hash = digest(prefix.current?.value.trim() ?? "");
    const candidate = { ...current, attempts: { ...current.attempts, [key]: { ...attempt, hash } } };
    const result = await check(candidate);
    if (!result.verified.some((step) => step.key === key) && !(result.next === key && result.state === "reverted")) {
      throw new Error("That transaction has no matching confirmed receipt yet.");
    }
    save(candidate);
    setProgress(result);
    if (prefix.current) prefix.current.value = "";
  }

  async function retryRevert() {
    const current = read();
    const result = await check(current);
    if (result.state !== "reverted" || !result.next) throw new Error("No matching confirmed revert was found.");
    const attempts = { ...current.attempts };
    delete attempts[result.next];
    const next = { ...current, attempts };
    save(next);
    setProgress(await check(next));
  }

  const next = run && progress?.next ? demoStep(run, progress.next, progress.verified) : undefined;
  const rightWallet = wallet && next && wallet.chainId === target.chainId && sameHex(wallet.account, next.account);
  const typeSigning = next && ["decision", "assign", "lab"].includes(next.action);
  const latest = run && demoSteps(run).filter((key) => run.attempts[key]).at(-1);

  return (
    <main className="live-shell workspace-shell">
      <header className="workspace-header"><div>
        <p className="workspace-chain">{networks[target.chainId].name} · chain {target.chainId}</p>
        <h1>Synthetic demonstration operator</h1>
        <p>Column C3 · 100 kg rebar declared and accepted · 60 kg assigned</p>
        <p>Simulated construction activity. Mainnet approvals spend gas and create public records.</p>
      </div><div className="workspace-registry"><span>Existing registry</span><code>{target.registry}</code></div></header>
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
      {loaded && !run && <form className="live-panel" onSubmit={begin}>
        <h2>Start a journal</h2>
        {demoRoles.map((role) => <label key={role}>{role === "lab" ? "Lab address (optional)" : `${role[0].toUpperCase()}${role.slice(1)} address`}
          <input name={role} required={role !== "lab"} autoComplete="off" spellCheck={false} />
        </label>)}
        <p>Use a separate wallet for each role. Leave the lab address blank to omit its grant and attestation.</p>
        <button disabled={busy} type="submit">Save synthetic journal</button>
      </form>}
      {run && <div className="workspace-layout">
        <section className="live-panel">
          <h2>Run progress</h2>
          <p className="live-mono">{run.runId}</p>
          <ol>{demoSteps(run).map((key) => {
            const proof = progress?.verified.find((step) => step.key === key);
            const hash = proof?.hash ?? run.attempts[key]?.hash;
            return <li key={key}><strong>{stepLabels[key]}</strong> · {proof ? `Confirmed${proof.id ? ` · ID ${proof.id}` : ""}` : run.attempts[key] ? "Saved attempt" : "Awaiting its turn"}
              {hash && <TransactionLink target={target} hash={hash} label={proof ? `${stepLabels[key]} receipt` : "Submitted transaction"} />}
            </li>;
          })}</ol>
          <button type="button" disabled={busy} onClick={() => downloadJournal(run)}>Download journal</button>
          {progress?.state === "complete" && <p role="status">Verified synthetic workflow complete. Collect the submission evidence using the operator guide.</p>}
          {progress?.state === "complete" && progress.verified.flatMap(({ key, id }) => {
            if (!id || (key !== "register" && key !== "element")) return [];
            return [<p key={key}><a href={passportPath({ ...target, kind: key === "register" ? "lot" : "element", id: BigInt(id) })}>
              {key === "register" ? "Open material passport" : "Open Column C3 passport"}
            </a></p>];
          })}
        </section>
        <section className="live-panel">
          <h2>Next action</h2>
          <button type="button" disabled={busy || !provider} onClick={() => void exclusive(async () => {
            if (!provider) return;
            await provider.request({ method: "eth_requestAccounts" });
            setWallet(await walletIdentity(provider));
          })}>{wallet ? "Refresh Rabby account" : "Connect Rabby"}</button>
          {wallet && <p className="live-mono">Rabby chain {wallet.chainId} · {wallet.account}</p>}
          {!provider && <p>Open this loopback page in the browser profile with Rabby installed.</p>}
          {wallet && wallet.chainId !== target.chainId && <p role="alert">Network mismatch. Switch Rabby to chain {target.chainId}.</p>}
          {!progress && <p role="status">Waiting for independent verification. Automated polling continues every five seconds.</p>}
          {progress?.passportHistoryAvailable === false && <p role="alert">Verified passport history is unavailable. Wallet actions are paused.</p>}
          <button type="button" disabled={busy} onClick={() => void exclusive(async () => { setProgress(await check(read())); })}>Refresh verification</button>
          {next && <><h3>{stepLabels[next.key]}</h3><p className="live-mono">Required sender {next.account}</p></>}
          {progress?.state === "ready" && next && <>
            <details><summary>Review planned fields</summary><dl>{Object.entries(next.expected.fields).map(([field, value]) =>
              <div key={field}><dt>{field}</dt><dd className="live-mono">{String(value)}</dd></div>)}</dl></details>
            <button type="button" disabled={busy || !rightWallet || !progress.passportHistoryAvailable} onClick={() => void exclusive(prepare)}>
              {typeSigning ? "Review and sign typed data in Rabby" : "Prepare transaction"}
            </button>
          </>}
          {draft && progress?.state === "ready" && progress.passportHistoryAvailable && rightWallet && <section className="operator-review" aria-label="Prepared transaction">
            <p>Nonce {draft.nonce} · Est. gas {draft.gas.toString()} · Indicative gas cost {formatEther(draft.estimatedFee)} {target.chainId === 31337 ? "ETH" : "QIE"} · Zero transfer value</p>
            <details><summary>Review exact calldata</summary><code className="live-mono">{draft.data}</code></details>
            <label className="operator-confirm"><input type="checkbox" checked={approved} onChange={(event) => setApproved(event.target.checked)} />I reviewed the sender, registry, nonce, calldata and indicative fee.</label>
            <button type="button" disabled={busy || !approved} onClick={() => void exclusive(send)}>Open transaction approval in Rabby</button>
          </section>}
          {progress?.state === "pending" && <p role="status">Waiting for a canonical receipt and the configured confirmation depth.</p>}
          {progress?.state === "recover" && <p role="status">Submission reserved. Recover the matching hash from Rabby activity before proceeding.</p>}
          {latest && progress?.state !== "ready" && progress?.state !== "complete" && <form onSubmit={(event) => { event.preventDefault(); void exclusive(recover); }}>
            <label>Recovery transaction hash<input ref={prefix} required autoComplete="off" spellCheck={false} /></label>
            <button type="submit" disabled={busy}>Verify recovery hash</button>
          </form>}
          {progress?.state === "reverted" && <button type="button" disabled={busy} onClick={() => void exclusive(retryRevert)}>Clear confirmed revert for a manual retry</button>}
        </section>
      </div>}
    </main>
  );
}

async function walletIdentity(provider: EIP1193Provider) {
  const [accounts, id] = await Promise.all([provider.request({ method: "eth_accounts" }), provider.request({ method: "eth_chainId" })]);
  if (!accounts[0] || typeof id !== "string" || !/^0x[0-9a-f]+$/i.test(id)) return undefined;
  const chainId = Number(BigInt(id));
  if (!Number.isSafeInteger(chainId)) return undefined;
  return { account: address(accounts[0]), chainId };
}
