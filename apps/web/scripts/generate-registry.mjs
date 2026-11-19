import { readFile, writeFile } from "node:fs/promises";

const artifact = new URL("../../../out/PourLedgerRegistry.sol/PourLedgerRegistry.json", import.meta.url);
const output = new URL("../lib/generated/registry.ts", import.meta.url);
const { abi } = JSON.parse(await readFile(artifact, "utf8"));

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
  "",
].join("\n");

if (process.argv.includes("--check")) {
  if (await readFile(output, "utf8") !== source) throw new Error("Registry ABI is stale. Regenerate it after forge build.");
} else {
  await writeFile(output, source);
}
