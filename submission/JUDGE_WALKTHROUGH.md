# Judge walkthrough

## Verify the Mainnet target

Open the workspace, check QIE Mainnet chain `1990` and registry `0xf99C353f1B73aA2DeCa2cb7bbe580eEAa6472e63`, then compare the creation receipt in the explorer. The workspace supports wallet-free project and passport reads. Use a confirmed lot or element ID cleared for demonstration to find its public passport. The release review did not obtain an independently verified Mainnet sample ID. [Live workspace](https://pourledger-one.vercel.app/live) · [Creation receipt](https://mainnet.qie.digital/tx/0x86f4ed6cf808c6373a742dd9589c369ac5469f2b94759bbb1e770fa59599da23)

## Reproduce local evidence

From the repository root:

```bash
/workspace/.local/bin/forge build --use /workspace/.local/bin/solc-0.8.24
cd apps/web
npm ci --cache /workspace/.cache/npm
npm run build
npm run demo:local
```

The command starts a loopback Anvil fixture and the production server, runs the browser with project-scoped test accounts, then prints the working passport URL. The services stay available while that process is running. Both services shut down on exit. The screenshots and their receipt hashes are from a completed run. [Local captures](media/finalization/README.md)

1. Open `/live`. Confirm local chain 31337, registry address, Project 1 supervisor and the verified role history. The local fixture uses five separate test accounts. The lab role was revoked after recording one local attestation.
2. Check the three lots for accepted, rejected and partially accepted states. Lot 1 was accepted for 100 kg with 60 kg assigned. Lot 3 was partially accepted for 40 kg. Supplier registration alone records zero accepted quantity.
3. Open the Column C3 passport from the printed URL. In the verified proof, the element has registry ID 1 and its code is stored as a digest. Follow its link to Lot 1 and inspect the inspector decision, engineer assignment and designated-lab attestation.
4. Verify the lab result bytes with a local file containing exactly `results bytes` with no trailing newline. Use another file with `altered bytes` to trigger the mismatch. Neither action transmits the file. The lab evidence in the walkthrough is synthetic.
5. Change the passport chain segment to `1983` or use an unrelated address. The server rejects those mismatched coordinates. The automated run also tests signature errors, an unauthorized supplier, a revoked signer, an oversized assignment and a duplicate sample.

## Evidence from the captured run

- [Local receipt and account manifest](media/local-receipts.json), with the deployed address, transaction hashes, blocks and gas.
- [Desktop project workspace](media/workspace-desktop.png), [mobile column passport](media/passport-mobile.png), and [mobile lot and evidence check](media/lot-mobile.png).
- [Local QR sample](media/local-passport-qr.png). Its encoded URL resolves only inside the captured loopback environment while its process is active. Generate a new QR using the printed URL for a new run.
- [Continuous browser recording](media/local-workflow.mp4). It shows the local production app with disposable Anvil accounts and test data.

To capture a fresh run, execute `POURLEDGER_CAPTURE=/absolute/output/directory npm run test:browser` from `apps/web` with Chromium and FFmpeg installed. The local recorder uses actual browser frames. Use `npm run demo:local` with the same variable if you also want the verified site to stay running after capture.
