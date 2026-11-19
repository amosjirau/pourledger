# Development workflow

The synthetic demonstration and live registry use separate routes. The live workflow can be exercised with disposable Anvil accounts entirely on loopback.

## Pinned toolchain

- Foundry `v1.10.0`
- Solidity `0.8.24` (`solc-linux-amd64-v0.8.24+commit.e11b9ed9`)
- OpenZeppelin Contracts `v5.0.2`
- forge-std `v1.17.0`
- Node.js `24` for the full test workflow (validated with `v24.22.1`)
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
/workspace/.local/bin/forge build --use /workspace/.local/bin/solc-0.8.24
/workspace/.local/bin/forge test --use /workspace/.local/bin/solc-0.8.24 --fuzz-runs 1024 -vv

cd apps/web
npm run abi:check
npm run lint
npm test
npm run typecheck
npm run build
npm run test:browser
```

Run `npm run abi:generate` after intentionally rebuilding a changed contract. Commit the generated binding with the source change.

`test:browser` starts its own loopback Anvil and production Next.js processes on temporary ports. It deploys the Foundry artifact and uses unlocked disposable Anvil accounts with an injected EIP-1193 adapter. Override `POURLEDGER_ANVIL_BIN` if Anvil is installed elsewhere. See the [Milestone 1 runbook](docs/milestone-1.md) for application settings.

Use `npm run demo:local` to keep the verified loopback passport available after the browser test. Set `POURLEDGER_CAPTURE` to an absolute directory to save actual screenshots, the QR, an MP4 and local receipts. Recording uses Chromium and FFmpeg. For verified release settings use the [shipping runbook](docs/DEPLOYMENT.md) and [.env.example](apps/web/.env.example).

For the original fixture visual smoke, start the web app on port 3000 and run the browser check in another shell:

```bash
cd /workspace/pourledger/apps/web
npm run dev -- --port 3000
# In a second shell, from the same directory:
npm run smoke:visual
```

`smoke:visual` uses `/usr/bin/chromium` by default. Set `PLAYWRIGHT_CHROMIUM_PATH` to another trusted Chromium binary when needed. It writes disposable screenshots to `/tmp`.

## Safety boundary

- Keep the demo at `/` explicitly synthetic. Use `/live` and `/passport` for the configured registry.
- Do not add private keys, seed phrases, funded-wallet automation, or secrets to the repository.
- Get explicit owner approval before deploying to QIE Testnet or Mainnet, connecting a funded wallet, or spending assets.
- A read-only QIE Testnet `eth_chainId` check is safe; deploying even to testnet is a separate reviewed milestone.
- Use existing checkouts in cloud tasks. Do not create a Git worktree unless the user explicitly requests one.
