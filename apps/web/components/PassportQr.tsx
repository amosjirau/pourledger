"use client";

import { QRCodeSVG } from "qrcode.react";

const demoPayload = "pourledger-demo:v0:qie-testnet:undeployed:element:1";

export function PassportQr() {
  return (
    <div className="qr-frame" role="img" aria-label="Demo QR code for synthetic element B1">
      <QRCodeSVG
        value={demoPayload}
        size={156}
        bgColor="#f8faf6"
        fgColor="#10221b"
        level="M"
        marginSize={1}
        title="Synthetic PourLedger passport QR"
      />
    </div>
  );
}
