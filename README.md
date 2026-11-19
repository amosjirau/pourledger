# PourLedger

PourLedger is an original, milestone-zero implementation of a QR-verifiable evidence trail from construction material lots to installed structural elements.

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

`/` remains the labelled synthetic demonstration. `/live` supports injected EVM wallets and the existing registry's administrative and typed-data actions. Public lot and structural-element passports verify registry receipts against a configured chain RPC. The browser workflow deploys only to an ephemeral local Anvil process.

See [development checks](DEVELOPMENT.md) and the [Milestone 1 review and Testnet runbook](docs/milestone-1.md) for configuration, deployment gates, and trust limits.

## Repository layout

- `docs/architecture.md` — system boundaries, state machine, and decisions
- `docs/threat-model.md` — assets, trust claims, threats, and mitigations
- `docs/contract-spec.md` — externally observable Solidity behavior
- `docs/negative-test-matrix.md` — required failure cases
- `contracts/` — Foundry contract implementation
- `test/` — Foundry tests
- `apps/web/` — non-live milestone-zero UI

## Attribution and originality

All project-specific design and application code must be reviewed and understood by the developer submitting it. Third-party dependencies remain under their own licenses and are dependencies, not claimed project authorship. Keep commits small and meaningful, record human review decisions, and never describe synthetic demo data as pilot evidence.
