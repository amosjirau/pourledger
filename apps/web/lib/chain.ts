import { getAddress, isAddress, zeroAddress, zeroHash, type Address, type Hex } from "viem";

export const anvilChainId = 31337;
export const qieTestnetChainId = 1983;
export const maxUint256 = (1n << 256n) - 1n;
export const maxUint128 = (1n << 128n) - 1n;

export type RegistryTarget = {
  chainId: typeof anvilChainId | typeof qieTestnetChainId;
  registry: Address;
  confirmations: number;
};

export function integer(value: string, max = maxUint256, minimum = 1n) {
  if (!/^(0|[1-9][0-9]{0,77})$/.test(value)) throw new Error("Enter a whole number.");
  const number = BigInt(value);
  if (number < minimum || number > max) throw new Error("Number is outside the supported range.");
  return number;
}

export function address(value: string): Address {
  if (!isAddress(value) || value.toLowerCase() === zeroAddress) throw new Error("Enter a nonzero EVM address.");
  return getAddress(value);
}

export function digest(value: string): Hex {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value) || value.toLowerCase() === zeroHash) {
    throw new Error("Enter a nonzero 32-byte hex digest.");
  }
  return value.toLowerCase() as Hex;
}

export const lotStatuses: Record<number, string> = {
  1: "Supplier declaration · awaiting inspector decision",
  2: "Accepted by designated inspector",
  3: "Partially accepted by designated inspector",
  4: "Rejected by designated inspector",
};

export type PassportKind = "element" | "lot";
export type Coordinates = Pick<RegistryTarget, "chainId" | "registry"> & {
  kind: PassportKind;
  id: bigint;
};

export function passportPath(target: Coordinates) {
  return `/passport/${target.chainId}/${target.registry.toLowerCase()}/${target.kind}/${target.id}`;
}

export function parseCoordinates({ chain, registry, kind, id }: Record<"chain" | "registry" | "kind" | "id", string>): Coordinates | undefined {
  if (kind !== "element" && kind !== "lot") return;
  if (chain !== String(anvilChainId) && chain !== String(qieTestnetChainId)) return;
  try {
    return { chainId: chain === String(anvilChainId) ? anvilChainId : qieTestnetChainId, registry: address(registry), kind, id: integer(id) };
  } catch {
    return;
  }
}

export const sameHex = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function matchesTarget(coordinates: Coordinates, target: RegistryTarget) {
  return coordinates.chainId === target.chainId && sameHex(coordinates.registry, target.registry);
}
