import {
  createPublicClient, createWalletClient, custom, defineChain, encodeFunctionData, recoverTypedDataAddress,
  type Address, type EIP1193Provider, type Hex,
} from "viem";
import { address, anvilChainId, digest, integer, maxUint128, sameHex, type RegistryTarget } from "./chain.ts";
import { registryAbi, registryTypes } from "./generated/registry.ts";
import type { ExpectedEvent } from "./receipt.ts";
import { registryDomain } from "./registry-image.ts";

export function walletClients(provider: EIP1193Provider, target: RegistryTarget) {
  const chain = defineChain({
    id: target.chainId,
    name: target.chainId === anvilChainId ? "Local Anvil" : "QIE Testnet",
    nativeCurrency: { name: target.chainId === anvilChainId ? "Ether" : "QIE", symbol: target.chainId === anvilChainId ? "ETH" : "QIE", decimals: 18 },
    rpcUrls: { default: { http: [] } },
  });
  return {
    chain,
    reader: createPublicClient({ chain, transport: custom(provider, { retryCount: 0 }), cacheTime: 0 }),
    wallet: createWalletClient({ chain, transport: custom(provider, { retryCount: 0 }) }),
  };
}

export type ActionName = "project" | "role" | "element" | "register" | "decision" | "assign" | "lab";

export async function prepareAction({
  action, form, account, target, clients, checkSession, onSigned,
}: {
  action: ActionName;
  form: FormData;
  account: Address;
  target: RegistryTarget;
  clients: ReturnType<typeof walletClients>;
  checkSession: () => Promise<void>;
  onSigned: () => void;
}): Promise<{ data: Hex; expected: ExpectedEvent }> {
  const value = (name: string) => String(form.get(name) ?? "").trim();
  const id = (name: string) => integer(value(name));
  const code = (name: string, max: bigint, min = 0n) => Number(integer(value(name), max, min));
  const quantity = (minimum = 1n) => integer(value("quantity"), maxUint128, minimum);
  const { wallet, reader } = clients;
  const registry = target.registry;

  if (action === "project") {
    const projectHash = digest(value("projectHash"));
    const supervisor = address(value("supervisor"));
    return {
      data: encodeFunctionData({ abi: registryAbi, functionName: "createProject", args: [projectHash, supervisor] }),
      expected: { name: "ProjectCreated", fields: { projectHash, supervisor, creator: account }, generatedId: "projectId" },
    };
  }
  if (action === "role") {
    const projectId = id("projectId");
    const member = address(value("member"));
    const role = code("role", 3n, 1n);
    const enabled = value("enabled") === "true";
    return {
      data: encodeFunctionData({ abi: registryAbi, functionName: "setProjectRole", args: [projectId, member, role, enabled] }),
      expected: { name: "ProjectRoleUpdated", fields: { projectId, account: member, role, enabled } },
    };
  }
  if (action === "element") {
    const projectId = id("projectId");
    const elementCodeHash = digest(value("elementCodeHash"));
    const elementType = code("elementType", 255n);
    return {
      data: encodeFunctionData({ abi: registryAbi, functionName: "createElement", args: [projectId, elementCodeHash, elementType] }),
      expected: { name: "ElementCreated", fields: { projectId, elementCodeHash, elementType, creator: account }, generatedId: "elementId" },
    };
  }
  if (action === "register") {
    const projectId = id("projectId");
    const lotHash = digest(value("lotHash"));
    const supplier = address(value("supplier"));
    const materialType = code("materialType", 5n);
    const declaredQuantity = quantity();
    const unitCode = digest(value("unitCode"));
    return {
      data: encodeFunctionData({ abi: registryAbi, functionName: "registerMaterialLot", args: [projectId, lotHash, supplier, materialType, declaredQuantity, unitCode] }),
      expected: { name: "MaterialLotRegistered", fields: { projectId, lotHash, supplier, materialType, declaredQuantity, unitCode }, generatedId: "lotId" },
    };
  }

  const lotId = id("lotId");
  const [latest, nonce, [projectId]] = await Promise.all([
    reader.getBlock({ blockTag: "latest" }),
    reader.readContract({ address: registry, abi: registryAbi, functionName: "nonces", args: [account] }),
    reader.readContract({ address: registry, abi: registryAbi, functionName: "materialLots", args: [lotId] }),
  ]);
  if (!projectId) throw new Error("The lot does not exist on this registry.");
  const role = action === "decision" ? 1 : action === "assign" ? 2 : 3;
  if (!await reader.readContract({ address: registry, abi: registryAbi, functionName: "hasProjectRole", args: [projectId, account, role] })) {
    throw new Error("This wallet does not hold the required project role.");
  }
  const deadline = latest.timestamp + 600n;
  const domain = registryDomain(target);
  const shared = { lotId, nonce, deadline };

  if (action === "decision") {
    const message = { ...shared, acceptedQuantity: quantity(0n), decision: code("decision", 4n, 2n), conditionHash: digest(value("conditionHash")), inspector: account };
    const typedData = { domain, types: registryTypes, primaryType: "LotAcceptance", message } as const;
    await checkSession();
    const signature = await wallet.signTypedData({ account, ...typedData });
    if (!sameHex(await recoverTypedDataAddress({ ...typedData, signature }), account)) throw new Error("Signature was produced by a different account.");
    onSigned();
    return {
      data: encodeFunctionData({ abi: registryAbi, functionName: "acceptLot", args: [message, signature] }),
      expected: { name: "LotDecisionRecorded", fields: { lotId, projectId, inspector: account, decision: message.decision, acceptedQuantity: message.acceptedQuantity, conditionHash: message.conditionHash } },
    };
  }
  if (action === "assign") {
    const message = { ...shared, elementId: id("elementId"), usedQuantity: quantity(), evidenceHash: digest(value("evidenceHash")), engineer: account };
    const typedData = { domain, types: registryTypes, primaryType: "LotAssignment", message } as const;
    await checkSession();
    const signature = await wallet.signTypedData({ account, ...typedData });
    if (!sameHex(await recoverTypedDataAddress({ ...typedData, signature }), account)) throw new Error("Signature was produced by a different account.");
    onSigned();
    return {
      data: encodeFunctionData({ abi: registryAbi, functionName: "assignLotToElement", args: [message, signature] }),
      expected: { name: "LotAssignedToElement", fields: { lotId, elementId: message.elementId, usedQuantity: message.usedQuantity, evidenceHash: message.evidenceHash, engineer: account }, generatedId: "assignmentId" },
    };
  }
  const message = { ...shared, sampleHash: digest(value("sampleHash")), resultsHash: digest(value("resultsHash")), lab: account };
  const typedData = { domain, types: registryTypes, primaryType: "TestEvidence", message } as const;
  await checkSession();
  const signature = await wallet.signTypedData({ account, ...typedData });
  if (!sameHex(await recoverTypedDataAddress({ ...typedData, signature }), account)) throw new Error("Signature was produced by a different account.");
  onSigned();
  return {
    data: encodeFunctionData({ abi: registryAbi, functionName: "attachTestEvidence", args: [message, signature] }),
    expected: { name: "TestEvidenceAttached", fields: { lotId, sampleHash: message.sampleHash, resultsHash: message.resultsHash, lab: account }, generatedId: "testId" },
  };
}
