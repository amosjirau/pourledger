# PourLedger Mainnet demonstration operator guide

This workflow creates labelled synthetic construction records on the existing QIE Mainnet registry. A separate local Anvil rehearsal uses disposable accounts and proves the software workflow. The Mainnet recording requires its own verified receipts and public passport captures.

| Coordinate | Value |
| --- | --- |
| Registry | `0xf99C353f1B73aA2DeCa2cb7bbe580eEAa6472e63` |
| Network | QIE Mainnet, chain `1990` (`0x7c6`) |
| Existing deployment block | `12148098` |
| Existing creation receipt | [QIE Mainnet explorer](https://mainnet.qie.digital/tx/0x86f4ed6cf808c6373a742dd9589c369ac5469f2b94759bbb1e770fa59599da23) |
| Local operator | [http://127.0.0.1:7341/operator/demo](http://127.0.0.1:7341/operator/demo) |
| Public verification | [Public workspace](https://pourledger-one.vercel.app/live) |

## Start the local operator

Use the reviewed checkout, Node.js 24, and a dedicated desktop browser profile with a trusted Rabby extension. In WSL, use its localhost forwarding to open the exact loopback URL in the Windows browser. The server binds to `127.0.0.1` and the operator route requires an explicit local opt-in. Keep the environment variables server-side and the operator origin private.

If transferring the reviewed commits with the supplied Git bundle, start from the existing GitHub checkout containing `698a3a3`. Fetch the bundle into a review branch and switch to it.

```bash
git fetch /path/to/pourledger-demo-operator.bundle main:refs/heads/demo-operator-review
git switch demo-operator-review
```

```bash
cd /workspace/pourledger/apps/web
npm ci
npm run build

export POURLEDGER_DEMO_OPERATOR=mainnet
export POURLEDGER_CHAIN_ID=1990
export POURLEDGER_REGISTRY=0xf99C353f1B73aA2DeCa2cb7bbe580eEAa6472e63
export POURLEDGER_DEPLOYMENT_BLOCK=12148098
export POURLEDGER_PUBLIC_ORIGIN=https://pourledger-one.vercel.app
export POURLEDGER_MAINNET_EXPLORER_ORIGIN=https://mainnet.qie.digital
read -rsp 'Approved QIE Mainnet HTTPS read RPC: ' POURLEDGER_RPC_URL
printf '\n'
read -rp 'Reviewed QIE confirmation depth: ' POURLEDGER_CONFIRMATIONS
export POURLEDGER_RPC_URL POURLEDGER_CONFIRMATIONS
POURLEDGER_MAINNET_READ_RPC="$POURLEDGER_RPC_URL" npm run --silent release:mainnet -- --verify
npm run demo:operator
```

Proceed after the read-only verifier confirms chain 1990, the pinned creation receipt, runtime and domain. Open the public workspace from a clean browser and confirm its registry and current verification status before spending gas. The runner pauses wallet actions if the deployment exceeds the 50,000-block direct passport verification limit. A verification-unavailable message or missing approved RPC access blocks the funded demo and submission capture. Choose the confirmation depth with the operator's QIE policy. The runner checks that depth and the canonical block identifiers.

## Review and approve each step in Rabby

Start one journal. Enter four different public addresses for the supervisor, supplier, inspector and engineer. Add a fifth designated lab address only if you intend to include the lab grant and attestation. The supervisor sends the project creation and the permissions transactions. Select the listed account and chain in Rabby at each step. The runner fills each action with IDs from verified receipts and derives hashes from run-specific synthetic references.

| Order | Sender | Action |
| --- | --- | --- |
| 1 | Supervisor | Create the synthetic project |
| 2 | Supervisor | Grant inspector and engineer in separate transactions |
| 3 | Supervisor | Grant the designated lab if selected |
| 4 | Supervisor | Create Column C3 |
| 5 | Supplier | Register 100 kg of rebar |
| 6 | Inspector | Sign full acceptance of 100 kg and separately approve the transaction |
| 7 | Engineer | Sign allocation of 60 kg to Column C3 and separately approve the transaction |
| 8 | Designated lab | Optionally sign a synthetic sample digest and separately approve the transaction |

Open the planned fields, review and prepare each action. The three attestation actions open an EIP-712 signature prompt first, using the current registry nonce and deadline. Review that prompt. When preparing a transaction, compare the chain, sender, pinned registry, zero transfer value, nonce, and exact calldata. The fee displayed by the runner is an estimate. Review Rabby's actual fee and confirm the transaction manually only within your approved budget. Select the review checkbox and use **Open transaction approval in Rabby** for each send. The application checks the wallet and re-estimates before opening Rabby. The runner checks receipts separately using the configured read RPC.

## Resume and recover

Keep the same origin and browser profile. The journal records the expected sender's transaction nonce and calldata digest before the wallet request, and the returned hash as soon as available. Reopen the page to continue polling. A second tab cannot reserve or send concurrently. Keep the browser profile and its site storage intact through the run. Use the downloaded journal for read-only evidence collection.

- **Pending.** Wait for the configured depth or click **Refresh verification**. A pending step blocks every dependent action.
- **Submission reserved.** Look up the attempt in Rabby activity. Enter the exact matching transaction hash under **Recovery transaction hash** after confirmation. The runner checks the canonical receipt, sender, destination, nonce, calldata, event, and fields. A same-nonce speed-up can be attached after its matching receipt confirms. An unknown, cancelled, or altered replacement stays blocked. Preserve the journal and reconcile wallet activity before further spending.
- **Confirmed revert.** Review the failed attempt, then clear the proven revert in the operator to prepare a fresh attempt. A wallet rejection also permits a fresh preparation. A provider error with uncertain outcome retains the reservation.

The duplicate guard covers its journal in the same browser profile and origin. Use one operator profile and journal per demonstration. The registry allows repeat project references and does not enforce uniqueness for all actions across unrelated clients.

## Collect verified submission evidence

Download the journal after **Verified synthetic workflow complete**. In a terminal with the same approved environment, install a compatible Playwright Chromium if necessary and collect into a new directory. The collector re-verifies the receipts and registry state before and after capture. It opens both public passport URLs on desktop and mobile, checks their coordinates and receipt hashes, decodes the rendered QR, compares the exact synthetic evidence bytes and writes SHA-256 file hashes to the manifest. Browser capture runs without a wallet and permits only same-origin reads.

```bash
cd /workspace/pourledger/apps/web
npx playwright install chromium
npm run demo:collect -- /path/to/downloaded-journal.json /path/to/new-evidence-directory
```

If using an approved system Chromium installation, export `PLAYWRIGHT_CHROMIUM_PATH` with its executable path. `manifest.json` contains confirmed transactions, finality snapshot, generated IDs, public passport check results, and evidence file digests. The collector exits nonzero for an incomplete public capture and leaves `submissionReady` false. Only claim a verified Mainnet demonstration when `scope` is `synthetic-qie-mainnet` and `submissionReady` is `true`. The mainnet submission should link the exact generated passports and confirmed transactions, use the collector's verified screenshots, and disclose that the records, including the optional lab evidence, are synthetic. The blockchain establishes signed statements, bounded allocation, and byte integrity. Physical installation, laboratory validity and signer identity require independent verification.

For a free local check, build the existing Foundry artifact and production frontend, then run `npm run test:browser:operator` from `apps/web`. Add `-- --skip-lab` to exercise the seven-step path without the lab. Set `POURLEDGER_CAPTURE` to a new directory to retain a journal, operator screenshot and verified local passport captures. The Anvil runtime is loaded as a fixture and uses a test adapter. Its receipts are labelled local and its manifest remains ineligible as Mainnet proof.

Use the [submission copy](../submission/SUBMISSION.md) and [judge walkthrough](../submission/JUDGE_WALKTHROUGH.md). Review the actual developer contribution and AI assistance before sending through the team portal. [QIE Hackathon](https://hackathon.qie.digital/)
