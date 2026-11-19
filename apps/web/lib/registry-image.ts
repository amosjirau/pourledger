import { bytesToHex, hashDomain, hexToBytes, keccak256, size, type Hex } from "viem";
import { sameHex, type RegistryTarget } from "./chain.ts";
import { registryImage } from "./generated/registry.ts";

export function registryDomain(target: RegistryTarget) {
  return { name: "PourLedgerRegistry", version: "1", chainId: target.chainId, verifyingContract: target.registry };
}

export function matchesRegistryImage(code: Hex | undefined) {
  if (!code || size(code) !== registryImage.byteLength) return false;
  const bytes = hexToBytes(code);
  for (const { start, length } of registryImage.immutableRanges) bytes.fill(0, start, start + length);
  return sameHex(keccak256(bytesToHex(bytes)), registryImage.normalizedHash);
}

export function matchesRegistryDomain(separator: Hex, target: RegistryTarget) {
  return sameHex(separator, hashDomain({
    domain: { ...registryDomain(target), chainId: BigInt(target.chainId) },
    types: { EIP712Domain: [
      { name: "name", type: "string" },
      { name: "version", type: "string" },
      { name: "chainId", type: "uint256" },
      { name: "verifyingContract", type: "address" },
    ] },
  }));
}
