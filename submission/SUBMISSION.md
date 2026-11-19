# PourLedger

**Primary track:** Commerce & Real World

**Release status:** LOCAL MVP COMPLETE after the documented local gates. Mainnet, Testnet, public web, and GitHub publication are pending.

## Ready-to-paste description

Material delivery notes, test reports and as-built records are often kept separately. After a defect or investigation, a reviewer may know which steel a column was designed to contain without being able to find the actual supplier lot.

PourLedger ties the supplier's declaration to the designated inspector's accepted quantity and the engineer's assignment to a specific structural element. A QR passport reconstructs that chain for a reviewer from the registry's confirmed events and receipts. The original contract enforces project roles, immutable units, an allocation ceiling and replay protection. A designated lab can attach an evidence digest when an actual report is available. The reviewer can compare separately obtained file bytes with the digest without uploading the file.

The application uses Solidity 0.8.24, Foundry, OpenZeppelin EIP-712/ECDSA, Next.js, TypeScript, viem and QR rendering. The UI supports EIP-6963 and injected EIP-1193 wallet providers. The tested deployment is a local Anvil registry. QIE chain, wallet, explorer and hosting checks remain pending. Public release proof belongs in the release checklist once it exists.

PourLedger records precisely what designated wallets attested. Material placement, a signer's legal identity, laboratory accuracy and structural safety require separate verification.

## Original contribution

The original work is the structural-element-centered evidence model, project-bound signing flow, bounded assignment arithmetic and receipt-backed QR reconstruction. The sprint continued the original PourLedger repository. It used AI assistance for implementation, tests and documentation, with pinned third-party libraries for cryptography and platform plumbing. The submitting developer should verify and explain the actual contributions and record their own review before submitting.

## 30-second pitch

When you scan a column on a construction site, can you see which material lot went into it and who accepted that lot? PourLedger gives an element a QR passport. A supplier declares a lot, an inspector signs an acceptance, and an engineer allocates only accepted quantity. The passport checks chain receipts and lets a reviewer compare evidence bytes with a recorded digest. It preserves the evidence trail and leaves engineering judgment to qualified people.

## 90-second narrative

1. **0–15 seconds.** Introduce the problem with Column C3. A drawing identifies the element, but delivery, inspection and placement records may sit in different systems.
2. **15–35 seconds.** Identify the configured chain and registry. The supervisor grants roles. The supplier records 100 kg and the lot remains a declaration awaiting the inspector.
3. **35–55 seconds.** The inspector signs the delivery decision. Once confirmed, the engineer assigns 60 kg to the column. Forty kilograms remain available in that lot's fixed unit.
4. **55–78 seconds.** Scan the column QR from a separate browser. Show the registry and element coordinates, the assignment receipt and its link to the accepted lot. Compare a separately obtained evidence file, then change its bytes and show the mismatch.
5. **78–90 seconds.** Explain that receipts verify the recorded wallet statements. A local lab attestation demonstrates the method using test bytes. A real scientific result requires a genuine designated signer and report. State the current deployment status accurately.

## Verified usage and adoption

| Measure | Observed | Scope |
| --- | --- | --- |
| Consented production users or organizations | 0 recorded | No field pilot conducted |
| Approved production sites or deployments | 0 recorded | Local software rehearsal only |
| Real construction lots recorded | 0 recorded | Three synthetic local lots tested |
| QIE Testnet or Mainnet transactions | 0 in this sprint | RPC blocked and transactions approval-gated |
| Reproducible local workflow | Passed | One local project, separate role accounts, actual Anvil receipts |

## Next 90 days

- **Days 1–30.** Validate the testnet and owner-reviewed deployment process. Interview a supervisor, a supplier and an inspector with consent. Agree on data minimization and a private evidence-handling process.
- **Days 31–60.** Seek one consenting site to trial a small set of non-sensitive lot-to-element records. Measure time to locate a receipt, QR arrival and completion, and discrepancies in entered units. These are targets.
- **Days 61–90.** Review findings with participants. Decide whether project invitation, recovery, independent indexing or private access controls are needed before widening adoption. Report observed results and unresolved risks separately.

Use cases include construction QA handoff, procurement evidence review and investigation traceability. See the [reviewed release checklist](RELEASE_CHECKLIST.md) before publishing these materials.
