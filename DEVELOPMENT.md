# Development workflow

The project is intentionally split into an on-chain registry and a synthetic UI. No wallet, RPC, or deployment step is required for milestone-zero development.

## Pinned toolchain

- Foundry `v1.10.0`
- Solidity `0.8.24` (`solc-linux-amd64-v0.8.24+commit.e11b9ed9`)
- OpenZeppelin Contracts `v5.0.2`
- forge-std `v1.17.0`
- Node.js `>=20.9` (validated with `v24.22.1`)
- Next.js `16.4.6` and the exact npm dependency graph in `apps/web/package-lock.json`

The Solidity binary must retain its official SHA-256 check:

```text
fb03a29a517452b9f12bcf459ef37d0a543765bb3bbc911e70a87d6a37c30d5f
```

The checksum comes from the matching build in the official `ethereum/solc-bin` `linux-amd64/list.json`. Do not disable checksum, TLS, or package signature verification.

The official Foundry `v1.10.0` Linux AMD64 archive SHA-256 is:

```text
90729233bd9a683b872783ae2e3217fb56876fa2a3c37185f13e39dca8525041
```

Verify it against the release's `foundry_v1.10.0_linux_amd64.sha256` asset before extraction.

## Install

With `forge` and `solc-0.8.24` available under `/workspace/.local/bin`:

```bash
cd /workspace/pourledger
/workspace/.local/bin/forge install --no-git --shallow \
  openzeppelin-contracts=OpenZeppelin/openzeppelin-contracts@v5.0.2 \
  forge-std=foundry-rs/forge-std@v1.17.0
cd apps/web
npm ci --cache /workspace/.cache/npm
```

The dependency install is needed only when `lib/` is absent. Do not run it over an existing `lib/` directory; the command intentionally refuses to overwrite dependencies.

## Required checks

```bash
cd /workspace/pourledger
/workspace/.local/bin/forge fmt --check
/workspace/.local/bin/forge lint --use /workspace/.local/bin/solc-0.8.24
/workspace/.local/bin/forge test --use /workspace/.local/bin/solc-0.8.24 -vv

cd apps/web
npm run typecheck
npm run build
```

For the visual smoke test, start the web app on port 3000 and run the browser check in another shell:

```bash
cd /workspace/pourledger/apps/web
npm run dev -- --port 3000
npm run smoke:visual
```

`smoke:visual` uses `/usr/bin/chromium` by default. Set `PLAYWRIGHT_CHROMIUM_PATH` to another trusted Chromium binary when needed. It writes disposable screenshots to `/tmp`.

## Safety boundary

- The UI is fixture-only and must retain its synthetic/not-connected labels until receipt validation exists.
- Do not add private keys, seed phrases, funded-wallet automation, or secrets to the repository.
- Do not deploy to QIE Mainnet or use a funded wallet without explicit owner approval.
- A read-only QIE Testnet `eth_chainId` check is safe; deploying even to testnet is a separate reviewed milestone.
- Use existing checkouts in cloud tasks. Do not create a Git worktree unless the user explicitly requests one.
