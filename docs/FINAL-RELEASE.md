# Mainnet release and submission handoff

Release review on 24 November 2026.

| Coordinate | Pinned value |
| --- | --- |
| Source | [amosjirau/pourledger](https://github.com/amosjirau/pourledger) on `main` |
| Website | [Production home](https://pourledger-one.vercel.app) and [live workspace](https://pourledger-one.vercel.app/live) |
| Registry | `0xf99C353f1B73aA2DeCa2cb7bbe580eEAa6472e63` on QIE Mainnet, chain `1990` (`0x7c6`) |
| Creation block | `12148098` |
| Creation transaction | [QIE Mainnet explorer](https://mainnet.qie.digital/tx/0x86f4ed6cf808c6373a742dd9589c369ac5469f2b94759bbb1e770fa59599da23) |

The operator supplied the deployment record and reported successful checks of the creation transaction, creation and runtime bytecode, address, and EIP-712 domain. In this review the Cloud proxy returned CONNECT HTTP 403 before requests reached the Vercel site, the Mainnet explorer, or the Mainnet RPC. No independent Mainnet state, receipt, production route status or deployed frontend revision was obtained from those requests. Anvil evidence and production hosting status have separate provenance.

## Release checklist

| Order | Gate | Result or handoff |
| --- | --- | --- |
| 1 | Preserve the deployed registry and source provenance | Base `ffe145e` fetched from GitHub. Solidity and compiled bindings are unchanged. |
| 2 | Correct wallet form defaults and make references and units usable | Production build and local Chromium workflow passed. |
| 3 | Release the reviewed web revision | Git transport can access the source repository. The GitHub API returned Forbidden, so check the Vercel project's production source SHA in its dashboard. |
| 4 | Independently verify Mainnet and public passports | Allow approved read-only access to the RPC, site and explorer. Run the verifier and clean desktop/mobile smoke checks below. |
| 5 | Record judge evidence and submit | Reuse suitable verified public coordinates if available. If none exist, review the unsigned synthetic demonstration and authorize the necessary writes before capturing Mainnet footage. |

## Existing Vercel project

Use the repository `amosjirau/pourledger` and production branch `main` in the project serving `pourledger-one.vercel.app`. Check its current deployment first. The Next.js app root is `apps/web`, Node.js major is 24, the install command is `npm ci`, and the build command is `npm run build`. The frontend builds from the pinned generated ABI without Foundry on Vercel.

| Production server variable | Value |
| --- | --- |
| `POURLEDGER_CHAIN_ID` | `1990` |
| `POURLEDGER_REGISTRY` | `0xf99C353f1B73aA2DeCa2cb7bbe580eEAa6472e63` |
| `POURLEDGER_DEPLOYMENT_BLOCK` | `12148098` |
| `POURLEDGER_PUBLIC_ORIGIN` | `https://pourledger-one.vercel.app` |
| `POURLEDGER_RPC_URL` | Approved server-side HTTPS RPC for chain 1990 |
| `POURLEDGER_CONFIRMATIONS` | Operator-reviewed confirmation depth for QIE |
| `POURLEDGER_MAINNET_EXPLORER_ORIGIN` | `https://mainnet.qie.digital` after checking its receipt URLs |

Store any RPC credentials in Vercel's server environment. Check Vercel reports a successful production deployment for the intended GitHub SHA before announcing the revision. If production checks fail, restore the previous working web revision in Vercel and keep the registry coordinates pinned.

## Reproduce and independently verify

Generate a manifest from a clean reviewed checkout with Node.js 24 and the locked dependencies installed in `apps/web`.

```bash
cd apps/web
npm run --silent release:mainnet > /tmp/pourledger-release.json
```

With approved HTTPS access, set `POURLEDGER_MAINNET_READ_RPC` and `POURLEDGER_CONFIRMATIONS` in the shell and run:

```bash
npm run --silent release:mainnet -- --verify > /tmp/pourledger-mainnet-verified.json
```

The command checks chain ID, creation calldata hash, receipt status/address/block, canonical block hashes, confirmed runtime and signing domain. It reads five registry counters at the confirmed snapshot. Supply `POURLEDGER_APPROVED_LOT_ID` and `POURLEDGER_APPROVED_ELEMENT_ID` only for records cleared for demonstration to verify their state and receipts with the same reader as the web app. The command exits nonzero for a failed requested check. The manifest records the checkout SHA and omits the RPC URL.

Open the production homepage and `/live` in clean desktop and mobile browsers. Confirm the synthetic label on the home route and the chain and registry on the workspace. Open the verified lot and element links, compare their receipt links with the explorer, and scan the HTTPS QR with a second device. The canonical paths are `/passport/1990/<lowercase-registry>/lot/<id>` and `/passport/1990/<lowercase-registry>/element/<id>`. An altered chain, registry or ID must fail. Check an approved file's matching bytes and an altered copy. A wallet is only needed for writes.

## Local release evidence

| Check | Result |
| --- | --- |
| Foundry formatting, lint, tests and fuzz | Passed. 24 tests passed with 1,024 runs of the quantity fuzz property. |
| Frontend ABI, lint, typecheck, test, build | Passed. The generated bindings match the compiled artifact. Seven frontend unit tests passed. |
| Dependency audit | npm reported zero known vulnerabilities. |
| Production-build Chromium workflow | Passed. Fourteen confirmed actions and one deliberate revert on chain 31337. The runtime fixture was loaded into loopback Anvil without a creation transaction. |
| Browser receipt and privacy checks | Wrong-chain, wallet-switch default, signing rejection, malformed/wrong signer, missing receipt, revoked signer, excess assignment, duplicate lab sample, malformed lookup, mismatched coordinates, QR decode, matching and altered bytes, and zero upload requests were checked. |
| Visual smoke and manifest | Synthetic home passed desktop and 390-pixel mobile smoke. The manifest's unsigned calldata decoded to the pinned ABI, and a non-HTTPS RPC was rejected. |

Desktop and mobile captures, transaction hashes and fixture provenance are in the [capture index](../submission/media/finalization/README.md).

## Unsigned demonstration proposal

If independent reads show there is no suitable public project, the first proposed write is `createProject` at the existing registry. Set `POURLEDGER_REVIEWED_SUPERVISOR` to the proposed public address when generating the manifest. It includes the exact chain, sender, destination, zero value, and ABI-encoded calldata for the reference `POURLEDGER HACKATHON SYNTHETIC DEMONSTRATION V1`. Review that sender and supervisor, and separately review the wallet's current nonce, estimated fee and balance. The proposal contains no signature.

Later requests depend on the confirmed project, element and lot IDs and approved role addresses. In order, review three role grants, a column creation, a supplier's 100 kg rebar declaration, an inspector acceptance for 100 kg, an engineer allocation for 60 kg, and an optional, openly synthetic lab-file digest. Confirm each resulting ID from its receipt before preparing dependent requests. Typed data binds each role signer and its current registry nonce and deadline. Use a labelled synthetic reference and file throughout. Allocate gas and authorize each sender before any signing or broadcast. Reuse existing examples if available.

## Trust and capacity

Project supervision is permanent in this registry. A lost supervisor key can strand project administration, and compromised authorized signers can make false statements before revocation. Decide how human identities, independent roles and recovery policy will be managed. Existing ECDSA attestations use role EOAs. A reviewed multisig can administer a project as supervisor.

The server trusts its configured RPC for history completeness, canonical blocks and an operator-selected depth. No fixed QIE finality claim follows from the test suite. Direct verification caps the scan at 50,000 blocks and limits each event query to 40 matching records. It fails closed at either limit. Check the actual deployment age and record density before release, and use a verified indexer if either cap is reached. Raw files remain local to the browser. Digests, addresses and events are public, and a low-entropy reference can be guessed. Physical placement, engineering safety, lab accuracy and legal identity require independent evidence. The release review is internal.
