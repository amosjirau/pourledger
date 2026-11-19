# Solidity contract specification

## Contract

`PourLedgerRegistry` is a single EIP-712 registry compiled with Solidity 0.8.24. OpenZeppelin supplies audited EIP-712 and ECDSA primitives; project state-transition logic is original to this repository.

## Types

- `Role`: `NONE`, `INSPECTOR`, `ENGINEER`, `LAB`
- `MaterialType`: `OTHER`, `REBAR`, `CEMENT`, `COARSE_AGGREGATE`, `FINE_AGGREGATE`, `READY_MIX`
- `LotStatus`: `NONE`, `REGISTERED`, `ACCEPTED`, `PARTIALLY_ACCEPTED`, `REJECTED`
- `Project`: content hash, supervisor
- `Element`: project ID, element-code hash, element type
- `MaterialLot`: project ID, lot hash, supplier, material type, declared/accepted/assigned quantity, unit code, status
- `Assignment`: lot ID, element ID, used quantity, evidence hash, engineer
- `TestRecord`: lot ID, sample hash, result hash, lab

IDs are monotonically increasing positive integers. Zero is the nonexistent sentinel.

## Administration

### `createProject(bytes32 projectHash, address supervisor) -> uint256 projectId`

Anyone may create a project. Both values must be nonzero. Emits `ProjectCreated` with creator and supervisor.

### `setProjectRole(uint256 projectId, address account, Role role, bool enabled)`

Only the project's supervisor may call. `NONE`, the zero account, and a nonexistent project are invalid. Emits `ProjectRoleUpdated`. Role state is a `(projectId, account, role)` boolean, allowing a wallet to hold multiple bounded roles.

## Entities

### `createElement(uint256 projectId, bytes32 elementCodeHash, uint8 elementType) -> uint256 elementId`

Only the supervisor or a current engineer may call. The hash must be nonzero and unique in the project. Emits `ElementCreated`.

### `registerMaterialLot(uint256 projectId, bytes32 lotHash, address supplier, MaterialType materialType, uint128 quantity, bytes32 unitCode) -> uint256 lotId`

Only the supervisor or the named supplier may call. Hash, supplier, quantity, and unit code must be nonzero. The lot hash is unique within the project. The lot begins `REGISTERED`. Emits `MaterialLotRegistered`.

## Signed transitions

All three signed methods are relayer-friendly: any caller may submit a valid signature. The recovered signer must equal the explicit signer field, hold the required project role at execution time, use exactly `nonces[signer]`, and provide `deadline >= block.timestamp`. On success the nonce increases by one.

### `acceptLot(LotAcceptance acceptance, bytes signature)`

The lot must be `REGISTERED`. `conditionHash` is nonzero. Decision and accepted quantity must be exactly one of:

- `ACCEPTED`: declared quantity
- `PARTIALLY_ACCEPTED`: greater than zero and less than declared
- `REJECTED`: zero

Emits `LotDecisionRecorded`. The lot's decision is terminal.

### `assignLotToElement(LotAssignment assignment, bytes signature) -> uint256 assignmentId`

Lot and element must exist and belong to one project. Lot status must be `ACCEPTED` or `PARTIALLY_ACCEPTED`. Quantity and evidence hash must be nonzero. The new cumulative assigned quantity must not exceed accepted quantity. Emits `LotAssignedToElement` and stores an immutable assignment record.

### `attachTestEvidence(TestEvidence evidence, bytes signature) -> uint256 testId`

The lot must exist. Sample and results hashes must be nonzero. A sample hash may be attached only once per lot. Emits `TestEvidenceAttached` and stores an immutable test record. This event means designated-lab attestation, not scientific validation.

## Read surface

Public mappings expose projects, elements, material lots, assignments, test records, nonces, role state, hash-to-ID uniqueness indices, and sample uniqueness. Counter getter methods expose the last allocated ID. `domainSeparatorV4()` is exposed for independent typed-data verification.

## Errors and events

The implementation uses specific custom errors for authorization, nonexistent entities, invalid fields, duplicate hashes, state/decision mismatch, expired signatures, nonce mismatch, signer mismatch, and quantity overflow. Every successful state change emits an event with indexed entity IDs and signer/role identity needed by an independent indexer.

## Invariants

1. `assignedQuantity <= acceptedQuantity <= declaredQuantity` for every lot.
2. A lot leaves `REGISTERED` at most once.
3. A lot and an element in an assignment always share a project.
4. Each successful signed action consumes exactly one nonce of its signer.
5. Each project lot hash and element-code hash resolves to at most one ID.
6. Each `(lotId, sampleHash)` resolves to at most one test record.
7. Stored assignments and test records are immutable and append-only.
8. No operation performs a loop over user-created records.
