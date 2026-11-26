"use client";

import { useEffect, useRef, useState } from "react";
import { hashEvidence, verifyEvidence } from "../lib/evidence.ts";

export function EvidenceFile({ expected, onHash }: { expected?: string; onHash?: (hash: string) => void }) {
  const [status, setStatus] = useState("");
  const [ready, setReady] = useState(false);
  const selection = useRef(0);
  useEffect(() => { setReady(true); }, []);
  return (
    <div className="live-file">
      <label>
        {expected ? "Verify a file by its digest" : "Compute a digest from a local file"}
        <input type="file" disabled={!ready} onChange={async (event) => {
          const current = ++selection.current;
          const file = event.currentTarget.files?.[0];
          setStatus(file ? "Checking file bytes…" : "");
          if (!file) return;
          try {
            if (expected) {
              const matches = await verifyEvidence(file, expected);
              if (current === selection.current) setStatus(matches ? "Digest matches the recorded bytes." : "Digest mismatch. These bytes differ from the recorded evidence.");
            } else {
              const hash = await hashEvidence(file);
              if (current !== selection.current) return;
              onHash?.(hash);
              setStatus("Digest calculated.");
            }
          } catch (error) {
            if (current === selection.current) setStatus(error instanceof Error ? error.message : "The file could not be read.");
          }
        }} />
      </label>
      <small>File bytes stay in this browser. Only the digest is used on-chain.</small>
      <p role="status">{status}</p>
    </div>
  );
}
