# Threat and trust model

## Trust statement

A PourLedger record proves that a key holding a project-designated role signed specific typed data and that a transaction successfully recorded it on the configured chain. It does not prove the signer's civil identity, professional license, physical presence, document truth, material installation, laboratory method, GPS authenticity, code compliance, or structural safety.

## Assets and principals

Protected assets are evidence-digest integrity, project role integrity, quantity accounting, association of lots to the correct element, replay resistance, private source documents, and accurate presentation of chain state.

Principals are the project supervisor, supplier, inspector, site engineer, designated lab signer, relayer, read-model operator, object-store operator, and public viewer. Wallets and user devices may be compromised; the relayer, indexer, database, QR payload, and object store are untrusted for chain truth.

## Threats and controls

| Threat | Consequence | Control | Residual risk |
|---|---|---|---|
| Supplier impersonates inspector | False acceptance | ECDSA recovery plus current project inspector role | Authorized/compromised inspector can lie |
| Wrong-chain or wrong-contract replay | Duplicate foreign attestation | EIP-712 chain ID and verifying-contract domain | User may still misunderstand a wallet prompt |
| Same-chain replay | Duplicate action | Per-signer nonce and terminal/unique records | Concurrent signatures with same nonce race |
| Expired queued signature | Stale authorization executes | Explicit deadline | Signer chooses deadline policy |
| Role revoked after signing | Former authority acts | Role checked at execution time | Supervisor itself may be compromised |
| Cross-project ID substitution | Evidence linked to wrong project | Lot/element project equality and project-scoped role checks | Malicious authorized engineer can choose a wrong element in same project |
| Duplicate lot reference | Confusing duplicate history | Unique nonzero lot hash per project | Different hashes can describe same physical lot |
| Quantity over-allocation | More material appears installed than accepted | Checked cumulative accounting in one fixed unit | Declared/accepted physical quantities may be false |
| Unit confusion | Invalid arithmetic across kg, t, m3, bags | Immutable opaque unit code; no implicit conversions | Humans may choose the wrong code |
| Evidence document changed | Passport serves altered file | Nonzero content digest matched client-side/server-side | Hash does not establish document truth |
| Fake lab verification | Unrecognized result appears trusted | Current project lab role and typed signature | Designated lab key may not belong to a real lab |
| Rejected lot hidden | Misleading clean history | Terminal rejection event remains reconstructable | A malicious UI can omit it; independent explorer remains needed |
| Indexer invents success | False chain-confirmed UI | Validate successful receipt, chain, address, topics, and fields | RPC/indexer censorship or lag |
| Reorg/finality issue | UI shows reverted event | Configured confirmation depth and recheck before “confirmed” | QIE finality behavior needs production validation |
| QR substitution | Viewer opens another entity | QR includes chain, contract, entity type/ID; UI displays identifiers | Viewer may ignore displayed context |
| Private document leak | Site/commercial/PII exposure | Hashes only on-chain; private storage and explicit publication consent | Public hashes/project identifiers are permanent |
| Key compromise | Valid malicious attestations | Role revocation and operational wallet hygiene | No retroactive deletion; recovery is deferred |
| Denial of service / storage growth | Transactions too expensive | O(1) mappings, bounded fixed fields, event enumeration | Chain congestion and gas price remain external |

## Must-fail boundaries

The contract must reject nonexistent entities, wrong project roles, revoked roles, malformed or wrong signers, expired signatures, reused nonces, terminal decision replay, invalid decision/quantity combinations, zero hashes where evidence identity is required, project mismatches, assignments before acceptance, rejected-lot assignments, zero quantities, and cumulative over-allocation.

The application must reject failed/missing receipts, wrong chain or contract, mismatched QR entity coordinates, altered document digests, and database rows without matching validated events.

## Privacy rules

- Put only digests and opaque identifiers on-chain.
- Do not publish precise site/home location, personal data, or confidential source files without informed consent.
- Explain that hashes, wallet addresses, and project identifiers are permanent public metadata.
- Default raw evidence to private access; a public passport can disclose only expressly approved metadata.
- Never put secrets or private keys in repository files, logs, screenshots, or environment configuration.

## Operational exclusions for milestone zero

No mainnet deployment, funded wallets, payment/custody feature, private-key import, third-party outreach, professional-certification claim, or real-pilot claim is authorized.
