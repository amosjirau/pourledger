import { keccak256 } from "viem";
import { sameHex } from "./chain.ts";

export const maxEvidenceBytes = 25 * 1024 * 1024;

export async function hashEvidence(file: Pick<File, "size" | "arrayBuffer">) {
  if (file.size > maxEvidenceBytes) throw new Error("Evidence files are limited to 25 MiB.");
  return keccak256(new Uint8Array(await file.arrayBuffer()));
}

export async function verifyEvidence(file: Pick<File, "size" | "arrayBuffer">, expectedDigest: string) {
  return sameHex(await hashEvidence(file), expectedDigest);
}
