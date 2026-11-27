# PourLedger execution ledger

## Preservation and verified index

- Original remote heads inspected. `main` and `hackathon-frozen` were both `ac83ba64c5dad8fa903da503e2e731fca814ae64`. `construction-quality` was `56b00c0634a9cd210076523a0881b2c237001d24`. `fix/verified-indexer` was `687a188f2beaa086957f0dbefbeb5bddb5a55a36`. Existing production, registry and passport addresses were preserved.
- `7e9b435` reconciles construction-quality branch history with the indexer on the isolated integration branch. The construction-quality source matched the indexer's earlier construction commit exactly.
- `6496ee4` keeps the last eligible checkpoint readable during ordinary forward verification. A generation change or known reorganization still fails closed. The PostgreSQL regression held a forward scan open and confirmed the previous verified snapshot remained usable. It also exercised a 50,130-block simulated span, failover, reorganization, stale reads and pagination.
- The Oracle worker runs in `official-qie` mode with RPC hosts 1 and 5, two confirmations, and the historical start at block 12,148,098. The official endpoints agreed, and operator independence has not been established. Independent archive mode remains available with reviewed operator identifiers.
- A private pre-change index dump was restored to a scratch database and all three index tables were recovered. The worker and PostgreSQL ports remain loopback-only. SSH forwarding is scoped to PostgreSQL on loopback and the app separately checks the pinned PostgreSQL TLS certificate. SSH and database keys are branch-scoped Vercel secrets.
- The supplied synthetic run ID regenerated the original inspection and assignment byte sequences and the Column C3 reference, matching their on-chain digests. The Windows/WSL submission archive and journal were not accessed or changed.

## Professional integration

- `46be6ef` introduced private invitation-based accounts and roles, project membership and metadata, versioned documents, a delivery register and a reviewed MIR workflow.
- The isolated PostgreSQL scenario passed using the limited application role. It covered invitation replay, project revisions, cross-tenant isolation, private file integrity, invalid/duplicate delivery input, unauthorized review, exact decimal reconciliation and concurrent decisions.
- The follow-up adds project specification and structural element registers and a spreadsheet-safe delivery export. Project applicability criteria remain user-provided and reviewed. No standards text is redistributed.

## Open release gates

- Prove both protected Mainnet passports in desktop and mobile browsers after block 12,198,098. Block 12,198,097 is the last block inside the 50,000-block direct span. The smoke script defaults to the first block outside that span.
- Intermittent database connection failures were observed in the first Vercel preview. `9922168` bounds handshake and read recovery and logs a sanitized failure category. Confirm it against the protected preview before any stable rollout.
- Verify the professional preview browser workflow and run fresh backup and restore checks for populated data.
- Remaining product scope includes ITP and WIR, NCRs, concrete and laboratory workflows, stock movements and allocations, expanded reporting and notifications, account recovery, retention-policy deletion, approved public disclosure, signing abstraction and the complete synthetic project scenario. Extend the implemented workflows with meaningful integration and browser checks before enabling more production surfaces.
