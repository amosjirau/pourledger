import { readFile, writeFile } from "node:fs/promises";
import { keccak256, size } from "viem";

const artifact = new URL("../../../out/PourLedgerRegistry.sol/PourLedgerRegistry.json", import.meta.url);
const output = new URL("../lib/generated/registry.ts", import.meta.url);
const { abi, bytecode, deployedBytecode } = JSON.parse(await readFile(artifact, "utf8"));
const runtimeBytes = size(deployedBytecode.object);
const immutableRanges = Object.values(deployedBytecode.immutableReferences).flat();
if (Object.keys(deployedBytecode.linkReferences).length) throw new Error("Linked runtime bytecode is unsupported.");
for (const { start, length } of immutableRanges) {
  if (start + length > runtimeBytes || !/^0+$/.test(deployedBytecode.object.slice(2 + 2 * start, 2 + 2 * (start + length)))) {
    throw new Error("Unexpected immutable placeholder in the Foundry artifact.");
  }
}

const signedActions = {
  LotAcceptance: "acceptLot",
  LotAssignment: "assignLotToElement",
  TestEvidence: "attachTestEvidence",
};
const types = Object.fromEntries(
  Object.entries(signedActions).map(([name, functionName]) => {
    const input = abi.find((item) => item.type === "function" && item.name === functionName)?.inputs[0];
    if (!input?.components || !input.internalType.endsWith("." + name)) {
      throw new Error("Unexpected signed tuple for " + functionName);
    }
    return [name, input.components.map(({ name, type }) => ({ name, type }))];
  }),
);
const source = [
  "// Generated from the Foundry artifact by scripts/generate-registry.mjs.",
  "export const registryAbi = " + JSON.stringify(abi, null, 2) + " as const;",
  "export const registryTypes = " + JSON.stringify(types, null, 2) + " as const;",
  "export const registryImage = " + JSON.stringify({
    byteLength: runtimeBytes, creationHash: keccak256(bytecode.object),
    normalizedHash: keccak256(deployedBytecode.object), immutableRanges,
  }, null, 2) + " as const;",
  "",
].join("\n");

if (process.argv.includes("--check")) {
  if (await readFile(output, "utf8") !== source) throw new Error("Registry ABI is stale. Regenerate it after forge build.");
} else {
  await writeFile(output, source);
}
