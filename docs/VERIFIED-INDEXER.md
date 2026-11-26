# Verified registry index

The index starts at QIE Mainnet block `12148098` for registry `0xf99C353f1B73aA2DeCa2cb7bbe580eEAa6472e63` on chain `1990`. It serves the existing passport routes. The app uses a bounded direct RPC reader when no index database is configured. An unhealthy configured index causes the affected view to report verification unavailable.

## Deploy on Ubuntu with Docker Compose

Use Docker Engine with the Compose plugin. Copy `apps/web/indexer/deploy.env.example` to a location outside the checkout with mode `0600`. Fill it with the operator-reviewed confirmation depth, RPCs and database credentials. Compose binds the worker health and optional frontend ports to loopback. The database has a private Compose network and a persistent volume. For frontend hosting on the VPS, point the existing HTTPS hostname to the frontend through TLS termination. Leave the canonical public origin set to the origin already used by the QR codes.

| Setting | Used by | Value |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | PostgreSQL | Database administrator password |
| `POURLEDGER_INDEX_ADMIN_DATABASE_URL` | Migration command | Administrator or schema owner DSN |
| `POURLEDGER_INDEX_DATABASE_URL` | Worker and backfill | DSN for an index writer with `SELECT`, `INSERT`, `UPDATE`, `DELETE` on the index schema |
| `POURLEDGER_INDEX_READ_DATABASE_URL` | Web and optional WSL proof runner | Read-only DSN with schema `USAGE` and table `SELECT` |
| `POURLEDGER_INDEX_VERIFICATION_MODE` | Worker | `official-qie` for the published QIE Mainnet archive endpoints or `independent-archive` for operator-reviewed independent infrastructure. |
| `POURLEDGER_INDEX_RPC_URLS` | Worker | Comma-separated list of two to five approved archival HTTPS URLs with distinct hostnames. |
| `POURLEDGER_INDEX_RPC_OPERATORS` | Worker | Required in independent archive mode. Distinct reviewed operator IDs, in the same order as the URLs. |
| `POURLEDGER_RPC_URL` | Web | Approved HTTPS verification RPC with archive receipts, code, and state reads |
| `POURLEDGER_CONFIRMATIONS` | Worker and web | Same reviewed confirmation depth on both processes |
| `POURLEDGER_PUBLIC_ORIGIN` | Web | Existing HTTPS QR origin |
| `POURLEDGER_CHAIN_ID`, `POURLEDGER_REGISTRY`, `POURLEDGER_DEPLOYMENT_BLOCK` | Both | Pinned by Compose to the deployed Mainnet coordinates |

Use `?sslmode=verify-full` and a trusted CA for database connections across hosts. Keep the database and worker health endpoint private. Use a private network or access-controlled tunnel for a separately hosted web process.

The following commands assume the env file is `/srv/pourledger/index.env` and are run from the repository root. Start the database and apply the migration:

```bash
docker compose --env-file /srv/pourledger/index.env -f compose.indexer.yml up -d db
docker compose --env-file /srv/pourledger/index.env -f compose.indexer.yml --profile admin run --rm migrate
```

Open an administrator session with `docker compose --env-file /srv/pourledger/index.env -f compose.indexer.yml exec db psql -U postgres -d pourledger` and provision the writer and reader roles. Set passwords through `\password`, then use those credentials in the appropriate DSNs. Both roles need `CONNECT` to `pourledger`. These grants cover the current migration.

```sql
CREATE ROLE index_writer LOGIN;
CREATE ROLE index_reader LOGIN;
GRANT USAGE ON SCHEMA registry_index TO index_writer, index_reader;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA registry_index TO index_writer;
GRANT SELECT ON ALL TABLES IN SCHEMA registry_index TO index_reader;
```

Backfill and start continuous indexing:

```bash
docker compose --env-file /srv/pourledger/index.env -f compose.indexer.yml run --rm indexer npm run index:backfill
docker compose --env-file /srv/pourledger/index.env -f compose.indexer.yml up -d indexer
curl --fail-with-body http://127.0.0.1:7350/healthz
```

Backfill exits after it catches the confirmed head or reaches an error. Starting the worker directly also backfills. The worker holds a per-registry PostgreSQL advisory lock for the lifetime of its writer session. Interrupting either command preserves the last committed batch. If hosting the frontend on the VPS, run `docker compose --env-file /srv/pourledger/index.env -f compose.indexer.yml --profile web up -d web`. Separately hosted builds require the same registry and read-only settings. The WSL release runner uses the verified index when a read DSN is configured and retains the direct-read guard otherwise.

## Verification and completeness

- The worker groups matching RPC responses by canonical range hash and exact registry log set. Two distinct origins must match, and competing quorums fail closed. Matching providers also reconcile the compiled runtime, EIP-712 domain and historical counters at each range endpoint. A canonical receipt from an agreeing endpoint must contain each event. The worker checks for omitted registry logs in every transaction it reads.
- Project, structural element, lot, assignment, and test evidence IDs must advance in order and agree with the five on-chain counters at the range endpoint. Batches commit atomically with their checkpoints. Database constraints reject duplicate receipt coordinates, generated IDs, and repeat terminal lot decisions. Committed counters and canonical block hashes are checked again by the web reader.
- The reader checks every displayed event against its canonical receipt and validates it against contract state at the selected block. A paged lot’s full indexed assignment sum must equal its on-chain assigned quantity. Positive assignment amounts, project identity and inspector decisions remain checked. Pages contain at most 16 rows per event query. The event and receipt limits still apply to bounded direct RPC mode.
- Roles and decisions have no enumerable global counter. Two-source agreement detects disagreements, including a provider omitting role history. Known role pairs are checked with `hasProjectRole` at the displayed block. The registry cannot prove the absence of an undiscovered role pair, and agreement between providers that share failures or an upstream is insufficient to prove completeness for uncounted events. For decisions, known lots also reconcile status and accepted quantity directly.
- Official QIE mode requires agreement across the published endpoints. Their infrastructure independence has not been established. Independent archive mode requires an operator to confirm that the endpoints are separately operated without a shared upstream before configuring the operator IDs. Both modes perform the same range, receipt, runtime, domain and counter checks. Neither mode provides cryptographic proof of log non-inclusion.
- The index assumes trusted database administration and an authentic archive RPC for receipt and state verification. The worker is the sole writer. A confirmed checkpoint can still be reorganized. Views identify their verified block and lag. A checkpoint from a different chain, registry, deployment block or confirmation depth is ineligible. A checkpoint older than 120 seconds, more than 12 confirmed blocks behind, or in `syncing` or `error` status is unavailable.
- During normal forward indexing, readers can use the last committed, eligible checkpoint while the worker verifies a new range. The replacement checkpoint, event rows, counters and status commit together. A known reorganization withdraws readiness before rollback. Readers recheck the generation and readiness before returning the page.
- The worker scans 512–2,000 blocks when possible, halves its range on limits or disagreement, caps a range at 1,024 logs and checks receipts in waves of eight. An unservable single block stops progress. SQL statements and connections have timeouts and cursor pages are bounded. Database storage grows with verified events and checkpoints.

## Recover and check a release

1. Read the worker JSON at `http://127.0.0.1:7350/healthz` and inspect `docker compose --env-file /srv/pourledger/index.env -f compose.indexer.yml logs indexer`. Health is `200` only when the worker has reached its last observed confirmed target. `503` includes progress or an error where available. The frontend independently verifies the live head and checkpoint before displaying pages.
2. On an RPC failure, verify the configured endpoints still serve historical receipts and state. Replace the endpoint with one compatible with the configured verification mode and restart the worker. Health includes the active verification mode. The release runner and worker perform read-only RPC calls.
3. The worker verifies its latest checkpoint against RPC agreement. On a reorganization, it walks back up to 32 checkpoints, deletes losing batches and their events atomically, and resumes on the canonical branch. Missing quorum stops progress. A deeper reorganization stops automatic recovery. Keep the frontend unavailable, retain the old database for analysis, provision a fresh index database and backfill from deployment before switching the frontend read DSN.
4. For a damaged or internally inconsistent index, retain a database backup and rebuild in a fresh database. Promote only after both passport types, expected assignment quantities, and desktop and mobile evidence verification pass against the new indexed deployment. The on-chain registry and passport URLs remain the existing ones.

The PostgreSQL regression suite uses an isolated local database and mock QIE archives for long histories and fault injection. Build the Foundry artifact, apply the migration to the disposable database, and run `POURLEDGER_INDEX_TEST_DATABASE_URL=<disposable-loopback-dsn> npm run test:index` in `apps/web`. The standard Anvil browser rehearsals verify direct mode and the evidence collector. Run `npm run test:browser:operator -- --indexed` with the disposable loopback test DSN to run the worker, health endpoint, and desktop/mobile passport capture against Anvil and PostgreSQL. [Registry specification](contract-spec.md)
