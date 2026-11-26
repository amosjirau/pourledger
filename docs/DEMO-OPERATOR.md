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

## Start the WSL release handoff

Use Node.js 24 and a dedicated Windows browser profile with a trusted Rabby extension. Open the exact loopback URL through WSL localhost forwarding. The handoff checks out the reviewed GitHub revision in a dedicated WSL working directory and binds the operator to `127.0.0.1`.

```bash
bash /path/to/release-wsl.sh FULL_REVIEWED_GITHUB_MAIN_SHA --publish
```

Provide the approved QIE Mainnet read RPC and reviewed confirmation depth when prompted. The read-only default verifies the exact revision through the live site’s `/release.json` marker. The marker publishes only GitHub release metadata, so it can be checked directly from Cloud using `npm run release:public -- FULL_REVIEWED_GITHUB_MAIN_SHA` in `apps/web`. If a manual Vercel release is needed, `--publish` uses the authorized token and team scope to verify the GitHub-linked `apps/web` project and request the reviewed production deployment if a matching one is absent. The loopback operator starts after Vercel serves the exact revision, the public desktop and mobile routes pass, and QIE read-only checks confirm the creation receipt, runtime and domain. Wallet actions pause beyond the 50,000-block direct passport verification limit.

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

Download the journal after **Verified synthetic workflow complete**. Paste its WSL path into the waiting handoff. The script verifies the receipts and state again, then checks both public passports on desktop and mobile, decodes their QRs, and hashes the screenshots and evidence files. It verifies the Vercel revision again before assembling `submission.tar.gz`. If resuming collection later, run the same executable with the journal path.

```bash
bash /path/to/release-wsl.sh FULL_REVIEWED_GITHUB_MAIN_SHA --journal /path/to/completed-journal.json
```

If using an approved system Chromium installation, export `PLAYWRIGHT_CHROMIUM_PATH` with its executable path. `manifest.json` contains confirmed transactions, finality snapshot, generated IDs, public passport check results, and evidence file digests. The collector exits nonzero for an incomplete public capture and leaves `submissionReady` false. Only claim a verified Mainnet demonstration when `scope` is `synthetic-qie-mainnet` and `submissionReady` is `true`. The mainnet submission should link the exact generated passports and confirmed transactions, use the collector's verified screenshots, and disclose that the records, including the optional lab evidence, are synthetic. The blockchain establishes signed statements, bounded allocation, and byte integrity. Physical installation, laboratory validity and signer identity require independent verification.

For a free local check, build the existing Foundry artifact and production frontend, then run `npm run test:browser:operator` from `apps/web`. Add `-- --skip-lab` to exercise the seven-step path without the lab. Set `POURLEDGER_CAPTURE` to a new directory to retain a journal, operator screenshot and verified local passport captures. The Anvil runtime is loaded as a fixture and uses a test adapter. Its receipts are labelled local and its manifest remains ineligible as Mainnet proof.

Use the [submission copy](../submission/SUBMISSION.md) and [judge walkthrough](../submission/JUDGE_WALKTHROUGH.md). Review the actual developer contribution and AI assistance before sending through the team portal. [QIE Hackathon](https://hackathon.qie.digital/)

## Recovering from release verification failures

The WSL release prints named stages and retains fresh evidence in each release directory. It reuses a matching dependency installation and verifies the production revision again before collecting a saved journal. If the selected RPC fails full verification, it tries the other official Mainnet endpoints twice each; no transaction is retried or submitted by this helper. Failed JSON proofs remain in the evidence directory. Local failover does not change the Vercel production RPC. Review the exact confirmed history count and remaining 50,000-block capacity; do not bypass this limit. Public smoke checks have bounded navigation timeouts and read-only retries. Rerun the same release with the same browser profile, or pass `--journal PATH` to collect a completed journal. Run `bash scripts/release-common.test.sh` from the repository root for the dependency-free retry/fail-closed fixture.
