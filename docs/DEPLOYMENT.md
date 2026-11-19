# Reviewed release procedure

Status on 19 November 2026: **MAINNET PENDING · TESTNET PENDING · PUBLIC HOSTING PENDING**. Local Anvil is the verified release rehearsal.

## Pin the source and runtime

Use the exact reviewed Git commit and the compiler from [Development](../DEVELOPMENT.md). Solidity 0.8.24+commit.e11b9ed9, Paris EVM, 200 optimizer runs, no appended CBOR metadata, OpenZeppelin Contracts v5.0.2. There are no constructor arguments or linked external libraries.

```bash
cd /workspace/pourledger
/workspace/.local/bin/forge build --use /workspace/.local/bin/solc-0.8.24
cd apps/web
npm ci --cache /workspace/.cache/npm
npm run abi:check
npm run lint
npm test
npm run build
npm run test:browser
```

The [generated bindings](../apps/web/lib/generated/registry.ts) contain the creation-code Keccak-256 and immutable-normalized runtime hash. The app checks the runtime image and separately checks the configured EIP-712 domain. Review the compiled artifact and compare both hashes to [the Anvil capture](../submission/media/local-receipts.json).

## Read-only RPC preflight

The brief specifies these network coordinates. The managed egress denied access to both RPC hosts and to official documentation in this run. Confirm the current coordinates and explorer API with the official QIE developer documentation before signing.

| Network | Chain ID | Proposed RPC | Proposed explorer |
| --- | --- | --- | --- |
| QIE Testnet | 1983 (`0x7bf`) | https://rpc1testnet.qie.digital/ | https://testnet.qie.digital/ |
| QIE Mainnet | 1990 (`0x7c6`) | https://rpc1mainnet.qie.digital/ | https://mainnet.qie.digital/ |

Enable the exact required RPC and documentation hosts in the environment's approved network settings, then use ordinary proxy and TLS settings. Confirm `eth_chainId`, `eth_blockNumber`, and `eth_gasPrice` through the approved endpoint.

```bash
curl --fail-with-body --show-error --silent --max-time 15 \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' \
  "$APPROVED_RPC_URL"
```

Set the review chain explicitly, `1983` for Testnet and `1990` for Mainnet. Supply the public sender address. The script calls only read and estimation RPC methods and produces an unsigned creation envelope. It checks the chain before and after the RPC calls and rejects a sender with outstanding pending transactions.

```bash
cd /workspace/pourledger/apps/web
POURLEDGER_CHAIN_ID="$APPROVED_CHAIN_ID" \
POURLEDGER_RPC_URL="$APPROVED_RPC_URL" \
POURLEDGER_DEPLOYER="$APPROVED_SENDER" \
node scripts/deployment-preflight.mjs > /tmp/pourledger-unsigned.json
```

Review observed chain, commit, code hashes, sender, nonce, proposed CREATE address, gas, native wei fee estimate, and block. Compare again just before signing. The address changes if the sender deploys at a different nonce. The gas estimate can drift with network conditions. The captured Anvil deployment used 2,049,862 gas. QIE gas and fee remain unknown.

## Owner approval and signing

1. For Testnet, approve the reviewed commit, sender, official faucet/gas budget, and role accounts. Run the preflight against 1983. Repeat the full local demo with the approved wallet and synthetic data, keeping the real Testnet receipts.
2. For Mainnet, separately approve deployment and subsequent smoke-transaction budgets against 1990. Select an owner-controlled supervisor, preferably a reviewed multisig that can send ordinary registry transactions. Use separate approved inspector, engineer, and lab EOA keys for the contract's current ECDSA attestation path.
3. In an owner-controlled hardware/browser wallet, sign the reviewed contract-creation transaction with the approved sender, nonce, exact creation data, zero value, and reviewed gas policy. Wallet secrets stay within the signer. Reconcile the signed prompt against the unsigned manifest before broadcast. Target RPC chain and wallet chain must both match the approved chain.
4. Wait for the reviewed confirmation threshold. Record actual status, transaction hash, contract address, deployment block, and canonical block hash. Compare deployed runtime and domain to the artifact, then verify source on the correct explorer. If the explorer supports standard JSON input, export it from the pinned Foundry artifact and submit it through the owner-approved verifier. The helper checks the hash of every source against the compiled metadata.

```bash
cd /workspace/pourledger/apps/web
npm run --silent release:verification-input > /tmp/pourledger-verification-input.json
```

Confirm the explorer's actual supported API and verification result. A guessed verifier URL cannot establish source verification. The [QA evidence](TEST_EVIDENCE.md) covers the unsigned tool on Anvil.

## Publish and smoke test the app

1. Create the owner-approved empty GitHub repo. Connect the checkout and push `main` after checking the URL and remote refs. Set branch review/protection in GitHub according to the team's policy, then verify the published SHA.

   ```bash
   cd /workspace/pourledger
   git remote -v
   git remote add origin "$APPROVED_EMPTY_GITHUB_URL"
   git ls-remote origin
   git push -u origin main
   ```

2. Use the owner-approved hosting account and import that repository. For Vercel select Next.js, set root `apps/web`, Node.js 24, install `npm ci`, and build `npm run build`. No Foundry binary is needed on the host. Configure the values in [.env.example](../apps/web/.env.example) as server environment settings. Use the actual registry address, confirmed deployment block, reviewed depth, approved HTTPS RPC and exact HTTPS public origin. Enable explorer links only by setting the reviewed HTTPS explorer origin for that chain.
3. Before announcement, open the public HTTPS site without a wallet at desktop and mobile widths. Confirm the homepage, `/live`, and both passport kinds. Scan a generated QR from a second device and compare the chain, address, record ID, and transaction links with the external explorer. For approved smoke writes, record project creation, role grants, column creation, lot registration, inspector decision, and engineer assignment. Attach lab evidence only with appropriate consent and a valid designated signer.
4. Stop publication if RPC history, receipts, addresses, or confirmation data disagree. Keep zero writes available during an incident by removing the deployment settings or rolling back the web release. The immutable registry remains publicly readable. A compromised role can be revoked by its supervisor. Supervisor compromise or loss can require a reviewed new registry and migration notice. Preserve old passport coordinates and tell users which registry to trust.
