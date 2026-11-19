# Milestone 1 review and Testnet runbook

## What runs

`/` serves the original labelled fixture. `/live` discovers EIP-6963 providers plus QIE and general injected EIP-1193 fallbacks. It shows the connected wallet and chain, gates writes on the configured chain and active account, and clears the local session on disconnect. Disconnect the site separately in the wallet to revoke its own permission.

The project, role, element, and lot forms send direct transactions. Decisions, assignments, and lab submissions first sign the contract's generated EIP-712 tuples. The active wallet submits the transaction after a preflight call. Transaction tracking distinguishes signing, submission, pending, reverted, and receipt-confirmed states. An unverified receipt can be checked again in that session. Save an important transaction hash before reloading, since pending state is held in memory.

Public routes use `/passport/{chainId}/{registry}/{element|lot}/{id}`. The server selects its RPC from operator configuration. A route cannot select an RPC destination. It checks the compiled registry image with compiler-declared immutable words normalized and checks the EIP-712 domain separator separately. Each displayed record is derived from a successful receipt with the expected chain, address, event signature, and fields, cross-checked against the registry at a pinned block. The lot page links to element assignments and the element page links to the corresponding lot passports. QR URLs use the operator's configured public origin.

File checks compute Keccak-256 over the exact bytes in the browser. Clearing or replacing a file never modifies the on-chain digest. Persistent document storage and an independent indexer are outside this milestone. Direct verification scans up to 50,000 blocks from deployment, in 2,000-block requests, with up to 40 matching events per query. An unavailable or over-limit history produces an unavailable state.

## Trust and security decisions

- A supplier declaration is intentionally permissionless for the named supplier. It creates a `REGISTERED` lot with zero accepted and assigned quantity. A project-designated inspector must accept all or part of the lot before an engineer can assign it. The current workflow needs no separate supervisor approval state because acceptance and role delegation already have distinct gates. Introduce invitation or approval only if field trials require a separate purchasing or intake authorization. Public declarations can add noise or occupy a predictable lot digest. Use unique high-entropy identifiers and separate supplier and inspector accounts. The registry allows the same address to hold multiple roles when the supervisor grants them.
- The supervisor address is fixed. Losing its key can prevent role administration. Compromise can permit unauthorized role grants, and later revocation cannot erase a recorded claim. Review an owner-controlled multisig as the supervisor before project creation, including recovery signers, quorum, and chain support. There is no supervisor transfer or emergency pause. For EIP-712 actions the existing registry supports ECDSA signers. EIP-1271 contract-wallet attestations need a separate review and contract change.
- Signatures bind the action type, signer, record identifiers, amounts, digests, chain ID, verifying contract, nonce, and deadline. The UI uses a 600-second deadline from the latest reported block. The signer nonce is shared across its actions and projects in one registry, so concurrently signed actions can contend. A relayer holding the signature can submit the same authorized payload while the nonce and deadline are valid. Revocation is checked at execution time. Regranting the role can make an otherwise still-valid signature usable again. A reorg can restore a nonce, and chains that reuse both chain ID and contract address can share a replay domain.
- The configured block depth is an operational threshold. QIE Testnet finality and wallet behavior remain unverified in this environment. The server rechecks block hashes and its chain ID. It still depends on an honest, available RPC for canonical history and log completeness. A single RPC can omit logs or misreport state. The browser's transaction panel also depends on the connected provider. Before external use, validate QIE RPC history, observed reorg/finality behavior, and wallet typed-data prompts. Add independent RPC or indexer checks if the deployment requires stronger assurance.
- A receipt records that the registry applied its role and quantity rules. Independent evidence is required to establish material placement, a signer's identity, lab accuracy, and structural safety. Public wallet addresses and digests are permanent and linkable. Hashes of predictable data can be guessed. Keep raw evidence private and obtain consent before publishing identifiable metadata.

## Local validation

The browser test uses a real, ephemeral Anvil chain with an injected test wallet adapter. It creates a project and element, grants and revokes roles, self-registers lots, accepts and rejects deliveries, assigns a lot, and submits designated-lab evidence. An independent browser tab verifies both passport types and compares file bytes against the on-chain digest. The test decodes the rendered QR to check the actual URL. See [development commands](../DEVELOPMENT.md).

- Foundry formatting, lint and build passed. All 24 tests passed with zero failures or skips. The fuzz test ran 1,024 cases. Assignment after 32 prior links measured 178,019 gas against the existing 200,000-gas ceiling.
- The lockfile install, generated binding check, six frontend tests, TypeScript check and production build passed.
- The production-browser Anvil workflow and the original desktop and 390 px demo smoke passed. Anvil ran with chain ID 31337. Exercising the installed QIE Wallet and validating QIE Testnet finality remain part of deployment review.

## Persist the checkout and enable Testnet reads

1. Create an empty GitHub repository in the organization or account approved for PourLedger. Open the current checkout, run `git status --short --branch` and confirm `git remote -v` is empty. Attach and push only after approving the exact new repository URL.

   ```bash
   cd /workspace/pourledger
   git remote add origin "$POURLEDGER_APPROVED_REMOTE"
   git ls-remote origin
   git push -u origin main
   ```

2. In Codex environment settings add that repository at mount path `pourledger`, with its reviewed branch or commit. The current draft still lists the original `amosjirau/amosjirau-` checkout. Preserve that checkout separately if it is still needed. Review the restricted network rules already saved in the draft. Include the exact `rpc1testnet.qie.digital` host, retain package-manager access, save, and use **Publish**. Confirm the applied host in a fresh or updated task.
3. Recheck the documented Testnet endpoint using the managed proxy and TLS trust. HTTP success and result `0x7bf` are required. The request observed on 19 November 2026 received Envoy HTTP 403 during CONNECT, so the endpoint's actual chain ID could not be observed.

   ```bash
   curl --fail-with-body --show-error --silent --max-time 15 \
     -H 'content-type: application/json' \
     --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' \
     https://rpc1testnet.qie.digital/
   ```

## Review and authorize a Testnet deployment

1. Have the project owner review and approve the exact source commit, pinned compiler build, generated ABI and normalized runtime hash, role separation, multisig/recovery plan, test dataset, and expected deployment cost. Record that review under the project's contribution rules.
2. Approve the specific chain ID `1983`, deployer address, separate supervisor wallet or multisig, and scope for Testnet funds. Use a hardware wallet or supported secure wallet flow. Keep credentials outside Git and application environment files.
3. With explicit authorization, deploy the exact reviewed artifact and record the receipt hash, contract address, deployment block, and explorer verification. Cross-check the artifact against the deployed runtime and chain before enabling the app.
4. Configure the server with the reviewed settings below. Set an HTTPS public origin before sharing QR codes. The deployment block is decimal, and the confirmation threshold requires a documented QIE review. Use Node's inherited proxy support where the environment requires it and preserve the supplied proxy and CA configuration.

   | Variable | Value for reviewed QIE Testnet |
   | --- | --- |
   | `POURLEDGER_CHAIN_ID` | `1983` |
   | `POURLEDGER_REGISTRY` | Verified deployed address |
   | `POURLEDGER_RPC_URL` | `https://rpc1testnet.qie.digital/` or an approved HTTPS RPC |
   | `POURLEDGER_DEPLOYMENT_BLOCK` | Deployment receipt block number |
   | `POURLEDGER_CONFIRMATIONS` | Reviewed positive confirmation depth |
   | `POURLEDGER_PUBLIC_ORIGIN` | Reviewed HTTPS app origin |

5. Run the approved Testnet workflow with test data and role-specific accounts. Inspect wallet chain detection and typed-data prompts, compare receipts and passport fields, scan both QR types, and record failed and successful operations. Testnet approval covers this sequence only. Mainnet requires a separate review and approval.
