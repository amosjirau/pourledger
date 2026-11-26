import { anvilChainId, qieMainnetChainId } from "../chain.ts";

export const officialQieHosts = new Set(Array.from({ length: 5 }, (_, offset) => `rpc${offset + 1}mainnet.qie.digital`));

export function indexRpcPolicy(chainId: number, mode: string | undefined, configuredUrls: string | undefined, operators?: string) {
  const local = chainId === anvilChainId;
  const verificationMode = local ? "local-fixture" : mode;
  if (!local && (verificationMode !== "official-qie" && verificationMode !== "independent-archive")) {
    throw new Error("Set the verification mode to official-qie or independent-archive.");
  }
  if (verificationMode === "official-qie" && chainId !== qieMainnetChainId) {
    throw new Error("Official QIE quorum is available only for QIE Mainnet.");
  }
  const endpoints = (configuredUrls ?? "").split(",").map((value) => value.trim()).filter(Boolean).map((value) => {
    try { return new URL(value); } catch { throw new Error("An index RPC URL is invalid."); }
  });
  if (endpoints.length < 2 || endpoints.length > 5 || new Set(endpoints.map(({ hostname }) => hostname)).size !== endpoints.length) {
    throw new Error("Supply two to five index RPC URLs with distinct hostnames.");
  }
  for (const url of endpoints) {
    const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
    if (url.username || url.password || url.hash || (local
      ? !loopback || !["http:", "https:"].includes(url.protocol) : url.protocol !== "https:")) {
      throw new Error("RPC URL transport is invalid.");
    }
  }
  const official = endpoints.filter(({ hostname }) => officialQieHosts.has(hostname));
  if (verificationMode === "official-qie" && (official.length !== endpoints.length ||
    official.some(({ port, pathname, search }) => port !== "" || pathname !== "/" || search !== ""))) {
    throw new Error("Official QIE quorum requires published QIE Mainnet RPC origins.");
  }
  if (verificationMode === "independent-archive") {
    const names = (operators ?? "").split(",").map((name) => name.trim().toLowerCase());
    if (names.length !== endpoints.length || names.some((name) => !/^[a-z0-9][a-z0-9-]{0,63}$/.test(name)) ||
      new Set(names).size !== names.length || official.length > 1) {
      throw new Error("Supply distinct, operator-reviewed archive operator IDs in URL order. At most one endpoint may be official QIE.");
    }
  }
  return { verificationMode, endpoints };
}
