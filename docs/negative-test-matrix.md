# Negative-test matrix

The following matrix is a release gate, not a claim that a row passes before its named test runs.

| ID | Boundary | Attempt | Expected result / test |
|---|---|---|---|
| A01 | Project | Zero project hash or supervisor | Revert `InvalidField` |
| A02 | Role | Non-supervisor grants/revokes | Revert `Unauthorized` |
| A03 | Role | Zero account or `NONE` role | Revert `InvalidField` |
| E01 | Element | Nonexistent project | Revert `ProjectNotFound` |
| E02 | Element | Unauthorized creator | Revert `Unauthorized` |
| E03 | Element | Duplicate code hash in project | Revert `DuplicateHash` |
| L01 | Lot | Unauthorized caller registers for supplier | Revert `Unauthorized` |
| L02 | Lot | Zero hash/supplier/quantity/unit | Revert `InvalidField` |
| L03 | Lot | Duplicate lot hash in project | Revert `DuplicateHash` |
| L04 | Lot | Supplier self-registers and attempts approval without inspector role | Remains `REGISTERED`, zero accepted and assigned quantity. Self-approval reverts. |
| D01 | Decision | Nonexistent lot | Revert `LotNotFound` |
| D02 | Decision | Wrong-chain/domain signature | Revert `SignerMismatch` |
| D03 | Decision | Unauthorized inspector | Revert `Unauthorized` |
| D04 | Decision | Revoked inspector signed earlier | Revert `Unauthorized` |
| D05 | Decision | Expired signature | Revert `SignatureExpired` |
| D06 | Decision | Reused/wrong nonce | Revert `InvalidNonce` or `InvalidLotStatus` |
| D07 | Decision | Duplicate terminal decision | Revert `InvalidLotStatus` |
| D08 | Decision | Accepted quantity differs from declared | Revert `InvalidDecisionQuantity` |
| D09 | Decision | Partial is zero or full | Revert `InvalidDecisionQuantity` |
| D10 | Decision | Rejection has nonzero quantity | Revert `InvalidDecisionQuantity` |
| D11 | Decision | Zero condition digest | Revert `InvalidField` |
| D12 | Decision | Malformed signature or evidence digest changed after signing | Revert with nonce and lot state unchanged |
| D13 | Signing | Same signer signs different action types at one nonce | First valid submission consumes the shared nonce |
| I01 | Assignment | Nonexistent lot or element | Revert entity-specific not-found error |
| I02 | Assignment | Lot and element from different projects | Revert `ProjectMismatch` |
| I03 | Assignment | Registered or rejected lot | Revert `InvalidLotStatus` |
| I04 | Assignment | Zero used quantity/evidence digest | Revert `InvalidField` |
| I05 | Assignment | Cumulative quantity exceeds accepted | Revert `QuantityExceeded` |
| I06 | Assignment | Unauthorized/revoked engineer | Revert `Unauthorized` |
| I07 | Assignment | Expired/replayed/wrong signer | Revert signature/nonce error |
| I08 | Assignment | Many prior records | Still O(1), below documented gas ceiling |
| T01 | Test | Nonexistent lot | Revert `LotNotFound` |
| T02 | Test | Zero sample/results digest | Revert `InvalidField` |
| T03 | Test | Unrecognized or revoked lab | Revert `Unauthorized` |
| T04 | Test | Duplicate sample for same lot | Revert `DuplicateHash` |
| T05 | Test | Expired/replayed/wrong signer | Revert signature/nonce error |
| P01 | Proof UI | Missing/failed transaction receipt | Do not label confirmed |
| P02 | Proof UI | Wrong chain/contract/event fields | Reject proof |
| P03 | Proof UI | Altered evidence bytes | Digest mismatch warning |
| P04 | Proof UI | QR coordinates mismatch loaded entity | Reject route |
| P05 | Proof UI | Missing lab event, designated-lab event, or user-held file | Show absence or a designated-lab attestation. A matching local file digest remains a separate byte check. User-submitted reports without designated signatures are unsupported. |
| P06 | Privacy | Private raw evidence lacks publication consent | Do not expose document URL |
| P07 | Proof UI | Wallet chain differs from registry chain | Disable actions until the wallet returns to the configured chain |
| P08 | Proof UI | Render a live QR | Decode the QR and compare its URL to the exact verified passport coordinates |

## Positive and invariant companions

- Full acceptance followed by multiple assignments up to exactly the accepted quantity succeeds.
- Partial acceptance caps assignments at the partial amount.
- Rejection remains visible but cannot be assigned.
- The same hash may be used in a different project without collision.
- One wallet can hold multiple roles; each action checks only the relevant role.
- Successful actions increment only the recovered signer's nonce.
- Event fields reconstruct the same relationships as stored records.
