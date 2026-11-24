# PourLedger

PourLedger gives construction lots and structural elements a QR-verifiable evidence trail. A supplier declares a lot, a designated inspector records the accepted quantity, and an engineer assigns only accepted quantity to an element. The public passport verifies the specific claims recorded by those wallets. Physical delivery, installation and scientific validity require independent evidence.

This repository starts from the 17 November 2026 `pourledger-qie-hackathon-plan.md` brief. It was created fresh for the QIE Hackathon 3.0 and does not reuse application code from another project.

## Milestone zero

- Architecture and minimal state machine
- Explicit trust and threat model
- Solidity contract specification
- Negative-test matrix
- Foundry registry contract and tests
- Mobile-first mock passport UI with synthetic data and no live-chain claims

Deployment testing uses disposable local Anvil accounts. QIE deployment and funded-wallet use require the repository owner's explicit approval.

## Milestone 1

`/` remains the labelled synthetic demonstration. `/live` supports injected EVM wallets and the existing registry's administrative and typed-data actions. Public lot and structural-element passports verify registry receipts against a configured chain RPC. The browser workflow uses an ephemeral local Anvil fixture with synthetic construction inputs.

See [development checks](DEVELOPMENT.md) and the [Milestone 1 review and Testnet runbook](docs/milestone-1.md) for configuration, deployment gates, and trust limits.

## QIE Mainnet release

The operator supplied the QIE Mainnet registry at `0xf99C353f1B73aA2DeCa2cb7bbe580eEAa6472e63` on chain 1990. The production URL was supplied by the operator. The current release review passed on Anvil and independent public smoke checks were blocked by the Cloud proxy. [Live workspace](https://pourledger-one.vercel.app/live) · [Release handoff](docs/FINAL-RELEASE.md) · [Submission kit](submission/SUBMISSION.md)

For a reproducible local run, compile the contract, install the web lockfile, build the app, and run the demo:

```bash
/workspace/.local/bin/forge build --use /workspace/.local/bin/solc-0.8.24
cd apps/web
npm ci --cache /workspace/.cache/npm
npm run build
npm run demo:local
```

The demo prints the verified passport URL after the production-browser Anvil workflow. Keep the process running while using that loopback URL. At `/live`, an EIP-6963 or injected EIP-1193 wallet can connect to the configured deployment.

The single registry exposes `createProject`, `setProjectRole`, `createElement`, `registerMaterialLot`, `acceptLot`, `assignLotToElement` and `attachTestEvidence`. The project workspace verifies event receipts and state at a configured confirmation depth. The signer submits a transaction after the typed-data and simulation checks. Passports link receipt-backed events and verify evidence digests in-browser. Read-only RPC access, QIE-specific thresholds, and current explorer origins require review before launch. [Deployment procedure](docs/DEPLOYMENT.md) · [Security review](docs/SECURITY_REVIEW.md)

## Repository layout

- `docs/architecture.md` — system boundaries, state machine, and decisions
- `docs/threat-model.md` — assets, trust claims, threats, and mitigations
- `docs/contract-spec.md` — externally observable Solidity behavior
- `docs/negative-test-matrix.md` — required failure cases
- `contracts/` — Foundry contract implementation
- `test/` — Foundry tests
- `apps/web/` — wallet workspace, receipt-backed passports and separate synthetic demo
- `submission/` — pitch, walkthrough, release checklist, captures and local receipts

## Attribution and originality

All project-specific design and application code must be reviewed and understood by the developer submitting it. Third-party dependencies remain under their own licenses and are dependencies, not claimed project authorship. Keep commits small and meaningful, record human review decisions, and never describe synthetic demo data as pilot evidence.
