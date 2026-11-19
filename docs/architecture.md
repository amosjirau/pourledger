# Architecture and state machine

## Decision

Milestone zero uses a single `PourLedgerRegistry` contract, an untrusted read model, private-by-default object storage, and a stateless public passport UI. This is smaller and easier to audit than separate contracts for projects, lots, roles, and tests. It also avoids unbounded on-chain arrays: events are the enumeration layer, while mappings provide constant-time validation.

The chain is the source of truth for identities, state transitions, hashes, quantities, and role-bound attestations. The off-chain index and files improve discoverability but are never accepted as chain-confirmed without matching the chain ID, contract address, block/transaction receipt, event signature, and event fields.

```text
QIE Wallet / EVM wallet
        | EIP-712 signature or direct project administration
        v
PourLedgerRegistry on QIE (state + events + immutable digests)
        |
        +---- receipt-validated indexer ----> public read model
        |                                      |
        |                                      v
        +---- digest match <---- private object store ---- passport UI / QR
```

## On-chain boundaries

The registry owns:

- project-scoped supervisor and roles;
- unique element-code and lot-reference hashes within a project;
- delivery decisions and accepted quantities;
- cumulative installed quantity accounting;
- immutable assignment and lab-evidence records;
- EIP-712 nonce consumption and signature expiry;
- events sufficient to independently reconstruct a passport.

The registry does not own raw documents, personal details, exact site locations, professional-license validation, engineering calculations, conversions between units, wallet custody, payments, or an assertion that physical material was installed.

## Project-specific roles

Each project has one supervisor. The supervisor grants and revokes three bounded roles for that project:

- `INSPECTOR_ROLE`: signs the one terminal acceptance/rejection decision for a lot.
- `ENGINEER_ROLE`: creates elements and signs lot-to-element assignments.
- `LAB_ROLE`: signs test-evidence metadata.

Revocation takes effect at execution time. A signature produced before revocation fails if submitted after revocation. Suppliers are explicit lot identities, not a privileged project role.

## Minimal state machine

### Project

```text
nonexistent --createProject--> active
```

Milestone zero has no deletion or ownership transfer. Avoiding transfer removes an emergency-governance surface until its recovery and audit requirements are understood.

### Material lot

```text
nonexistent --registerMaterialLot--> REGISTERED
REGISTERED --acceptLot(ACCEPTED)----------> ACCEPTED
REGISTERED --acceptLot(PARTIALLY_ACCEPTED)-> PARTIALLY_ACCEPTED
REGISTERED --acceptLot(REJECTED)----------> REJECTED
```

The decision is terminal and remains historical. `ACCEPTED` requires accepted quantity equal to the declared quantity. `PARTIALLY_ACCEPTED` requires a positive quantity below the declared quantity. `REJECTED` requires zero accepted quantity. An accepted or partially accepted lot can be assigned; registered or rejected lots cannot.

### Assignment

```text
nonexistent --assignLotToElement--> immutable assignment record
```

An assignment is permitted only when lot and element belong to the same project, the lot has usable accepted quantity, the unit stays the lot's declared unit, and `assigned + used <= accepted`. Every assignment has a unique sequence ID and evidence hash. There is no update or delete operation.

### Test evidence

```text
nonexistent --attachTestEvidence--> immutable test record
```

Only a currently designated lab signer can authorize an on-chain test record. The UI must still label this as “verified by designated lab signer,” never as scientific validation or structural certification.

## EIP-712 actions

The registry is the verifying contract and obtains chain ID through EIP-712 domain separation. Each typed action includes all decision fields, the claimed signer address, that signer's current global nonce, and a deadline:

- `LotAcceptance(lotId, acceptedQuantity, decision, conditionHash, inspector, nonce, deadline)`
- `LotAssignment(lotId, elementId, usedQuantity, evidenceHash, engineer, nonce, deadline)`
- `TestEvidence(lotId, sampleHash, resultsHash, lab, nonce, deadline)`

Including the signer in typed data prevents a caller from selecting a different recovered role identity. Global per-signer nonces keep the replay rule simple across all action types. Successful execution increments the nonce atomically; reverts do not consume it.

## Off-chain components

- The indexer accepts only finalized successful receipts for the configured chain and contract.
- Object storage is private by default. Public access is an explicit metadata choice and uses short-lived URLs where possible.
- The passport route encodes a chain ID, registry address, entity type, and numeric entity ID. It rejects mismatched routes instead of silently showing database content.
- The milestone-zero UI uses conspicuously labelled synthetic fixture data. It makes no RPC request and no live or deployment claim.

## Quantity and gas bounds

Every lot has exactly one `bytes32 unitCode`; no on-chain unit conversion exists. Quantities are positive `uint128` integers. Assignment validation and storage are O(1). Enumeration happens via indexed events, so adding an assignment never loops over prior assignments. Tests include cumulative over-allocation and a gas ceiling for an assignment after many previous assignments.

## Deferred decisions

- Supervisor transfer/recovery and emergency pause policy
- Multi-signature project administration
- User-submitted, unverified test metadata as a separate on-chain class
- Finality depth and reorg handling for QIE production indexing
- QIE ID integration, only after an official SDK/API is verified
- QUSDC/payment features
- Mainnet deployment and funded-wallet handling
