# PourLedger

**Primary track:** Commerce & Real World

**Release status** — Existing Mainnet registry reported and independently checked by the operator. The latest full workflow passed locally. Public web revision and Mainnet passport smoke checks are pending access. [Production site](https://pourledger-one.vercel.app) · [Source code](https://github.com/amosjirau/pourledger) · [Release evidence](../docs/FINAL-RELEASE.md)

## Ready-to-paste description

Material delivery notes, test reports and as-built records are often kept separately. After a defect or investigation, a reviewer may know which steel a column was designed to contain without being able to find the actual supplier lot.

PourLedger ties the supplier's declaration to the designated inspector's accepted quantity and the engineer's assignment to a specific structural element. A QR passport reconstructs that chain for a reviewer from the registry's confirmed events and receipts. The original contract enforces project roles, immutable units, an allocation ceiling and replay protection. A designated lab can attach an evidence digest when an actual report is available. The reviewer can compare separately obtained file bytes with the digest without uploading the file.

The application uses Solidity 0.8.24, Foundry, OpenZeppelin EIP-712/ECDSA, Next.js, TypeScript, viem and QR rendering. EIP-6963 and injected EIP-1193 wallet providers can connect to the configured EVM chain. The release targets QIE Mainnet chain `1990` and registry `0xf99C353f1B73aA2DeCa2cb7bbe580eEAa6472e63`, with the operator's recorded creation at block `12148098`. The browser rehearsal uses Anvil chain `31337` and synthetic construction data. [Mainnet creation transaction](https://mainnet.qie.digital/tx/0x86f4ed6cf808c6373a742dd9589c369ac5469f2b94759bbb1e770fa59599da23)

PourLedger records precisely what designated wallets attested. Material placement, a signer's legal identity, laboratory accuracy and structural safety require separate verification.

## Original contribution

PourLedger started from its project brief in a fresh repository and uses project-specific code for element-linked attestations, project roles, allocation limits and QR receipt verification. AI assistance was used for implementation, testing, documentation and release work. OpenZeppelin, Next.js, viem and other pinned packages are third-party dependencies. Before submission, the developer must document their own actual contributions and review, and be prepared to demonstrate the role and nonce checks, quantity limits, receipt validation and privacy boundaries. The official rules disqualify entries with minimal developer contribution and require a working Mainnet demonstration. [QIE Hackathon rules](https://hackathon.qie.digital/)

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
| Consented construction sites or field pilots | 0 recorded | Local software rehearsal |
| Real construction lots recorded | 0 recorded | Three synthetic local lots tested |
| QIE Mainnet construction activity | Unverified | Only the operator-supplied creation transaction is listed |
| Reproducible local workflow | Passed | One local project, separate role accounts, actual Anvil receipts |

## Next 90 days

- **Days 1–30.** Validate public Mainnet access and the confirmed receipt workflow. Interview a supervisor, a supplier and an inspector with consent. Agree on data minimization and a private evidence-handling process.
- **Days 31–60.** Seek one consenting site to trial a small set of non-sensitive lot-to-element records. Measure time to locate a receipt, QR arrival and completion, and discrepancies in entered units. These are targets.
- **Days 61–90.** Review findings with participants. Decide whether project invitation, recovery, independent indexing or private access controls are needed before widening adoption. Report observed results and unresolved risks separately.

Use cases include construction QA handoff, procurement evidence review and investigation traceability. See the [reviewed release checklist](RELEASE_CHECKLIST.md) before publishing these materials.
