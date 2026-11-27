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
- `9776a35` adds project specification and structural element registers and a spreadsheet-safe delivery export. Its Vercel preview completed a desktop workflow with invitation acceptance, a private verified document, and material receiving, plus mobile sign-in, access denial and layout checks.
- The next increment adds ITP/WIR/NCR, pours, reinforcement and laboratory records, a due queue, a stock ledger, exact stock checks and calculation utilities. The combined PostgreSQL scenario exercises reviewed ITPs, concrete specimen results, authorization and evidence-gated stock movements.

## Open release gates

- The hardened index preview passed beyond the limit at blocks 12,198,102–12,198,108. The exact stable-only `release/stable-indexer` candidate `cf3c7b7f0ec9ce82553e68414639d727d5232919` passed at blocks 12,198,113–12,198,119. Both element and lot passed on desktop and mobile, including canonical QR targets and exact synthetic file digests. [Protected stable release candidate](https://pourledger-lifmeu58v-amosjiraus-projects.vercel.app)
- Intermittent database connection failures were observed in the first Vercel preview. `9922168` bounds handshake and read recovery and logs a sanitized failure category. Both protected builds passed with the fix. The index uses the last eligible checkpoint during normal forward verification and rejects stale or reorganized history.
- The live public alias still served `ac83ba64c5dad8fa903da503e2e731fca814ae64` at deployment `dpl_4FWY3Q6xxsKrtfteZfBEgXUNBeyC` after the boundary. Both public passports showed the old direct-history limit. Automatic review blocked adding production-only tunnel credentials. Obtain explicit approval before creating a production key, configuring the read-only DSN, staging without assigning the alias, rechecking both passports, and promoting.
- The populated index backup restored nine events and a ready checkpoint to a private recovery database. The professional database also has a private custom-format backup.
- The professional branch includes project-scoped PDF reports and dossier generation, membership revocation, and locked wallet preparations for supplier declarations and matching MIR decisions. These preparations recheck the current actor, exact whole units, the delivery's registry digest and the reviewed evidence. Wallet signatures and transactions require authorized users. No Mainnet writes were made.
- Solidity suite passed 24 tests, including 1,024 fuzz runs. Indexed Anvil operator passed with nine local receipts, reload/resume, duplicate protection and four passport captures. Contract ABI matches the checksummed compiler build.
- Remaining product scope includes fuller notification delivery, account recovery, retention-policy deletion, approved public disclosure, automated reconciliation to later registry receipts, and a browser acceptance run across every quality register.
