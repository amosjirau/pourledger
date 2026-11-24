# Shipping sprint test evidence archive

The [finalization evidence](FINAL-RELEASE.md) and [latest browser captures](../submission/media/finalization/README.md) cover the Mainnet release review.

Run on 19 November 2026 on the existing PourLedger checkout. The sprint application changes are in `1e80c13`. Solidity application source is identical to `581a81c`.

| Check | Command | Result |
| --- | --- | --- |
| Foundry formatting | `forge fmt --check` | Passed |
| Solidity lint and build | `forge lint --use /workspace/.local/bin/solc-0.8.24` and `forge build --use /workspace/.local/bin/solc-0.8.24` | Passed |
| Foundry test and fuzz | `forge test --use /workspace/.local/bin/solc-0.8.24 --fuzz-runs 1024 -vv` | 24 passed, 0 failed, 0 skipped. The quantity fuzz property ran 1,024 cases. The gas bound test measured 178,019 gas after 32 prior links, under the 200,000-gas test ceiling. |
| Locked install and generated bindings | `npm ci --cache /workspace/.cache/npm` and `npm run abi:check` | Passed with Node 24.22.1 and npm 11.9.0 |
| Web lint and types | `npm run lint -- --diagnostic-level=warn` and `npm run typecheck` | Passed |
| Frontend unit tests | `npm test` | 7 passed, 0 failed, 0 skipped |
| Production build | `npm run build` | Passed. Synthetic home is static. Workspace and passport routes render on demand. |
| Production dependency advisory check | `npm audit --omit=dev --audit-level=high` | Registry reported zero vulnerabilities at the time checked |
| Actual local workflow | `npm run test:browser` and `POURLEDGER_CAPTURE=… npm run demo:local` | Passed with the compiled registry on Anvil 31337 and real locally signed EVM transactions through an injected test adapter |
| Synthetic demo visual smoke | `POURLEDGER_BASE_URL=… npm run smoke:visual` | Passed in Chromium at desktop and 390 px |
| Unsigned preflight | `npm run release:preflight` via browser harness | Predicted local CREATE address and gas matched the actual deployment. Non-loopback Anvil RPC rejected. |
| Source verification export | `npm run --silent release:verification-input` and `solc --standard-json` | The exported input reproduced identical creation and normalized runtime bytecode. Foundry's direct verification-input command hit a read-only filesystem in this environment, so the verified export uses compiled metadata and source hashes. No explorer submission occurred. |

## Local receipt evidence

The [capture manifest](../submission/media/local-receipts.json) contains the deployment and action receipts. The local registry at `0x5fbdb2315678afecb367f032d93f642f64180aa3` was created by `0x1696b69e33ef37b3a1666525dc94fe25435e05a0ed98c8af3e555826e86a974c` at block 1 and used 2,049,862 gas. The capture contains 14 confirmed workflow transactions and one intentionally reverted local transaction, excluding deployment.

The browser exercised wallet discovery, wrong-chain gating, page refresh, rejected signature, malformed and wrong signer, an unauthorized supplier, role revocation, a missing receipt followed by confirmation, a real mined revert, a duplicate sample, full/partial/rejected lots, quantity overuse, an independent browser context, decoded QR coordinates, digest mismatch, and zero evidence-upload requests. Solidity tests cover wrong EIP-712 domain, expired and replayed signatures, duplicate lots/samples, cross-project assignments, compromised/revoked roles, and the assignment quantity bounds. Data and disposable wallets are local test inputs.

Captured evidence: [desktop workspace](../submission/media/workspace-desktop.png), [mobile passport](../submission/media/passport-mobile.png), [mobile lot](../submission/media/lot-mobile.png), [QR](../submission/media/local-passport-qr.png), [recording](../submission/media/local-workflow.mp4). FFprobe reported 93.25 seconds of H.264 at 1240 × 880. FFmpeg decoded the entire recording successfully.

## QIE and hosting checks

`eth_chainId`, `eth_blockNumber`, and `eth_gasPrice` against both `https://rpc1testnet.qie.digital/` and `https://rpc1mainnet.qie.digital/` stopped at Envoy HTTP 403 during CONNECT (`curl` exit 56). No JSON-RPC chain result or gas price was received. QIE official developer documentation was also blocked. Local HTTP verified the synthetic homepage, workspace and confirmed passport. GitHub remote, public HTTPS hosting, QIE live wallets and Testnet/Mainnet receipts remain pending.
