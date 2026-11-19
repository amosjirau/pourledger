import { readFile } from "node:fs/promises";
import { keccak256, stringToHex } from "viem";

const root = new URL("../../../", import.meta.url);
const artifact = JSON.parse(await readFile(new URL("out/PourLedgerRegistry.sol/PourLedgerRegistry.json", root), "utf8"));
const { compilationTarget, ...compilerSettings } = artifact.metadata.settings;
const sources = Object.fromEntries(await Promise.all(
  Object.entries(artifact.metadata.sources).map(async ([path, metadata]) => {
    if (!/^(contracts|lib)\/[A-Za-z0-9_/.-]+\.sol$/.test(path) || path.split("/").includes("..")) {
      throw new Error("Unexpected Solidity source path in the artifact.");
    }
    const content = await readFile(new URL(path, root), "utf8");
    if (keccak256(stringToHex(content)) !== metadata.keccak256) {
      throw new Error(`Source hash differs from the compiled artifact: ${path}`);
    }
    return [path, { content }];
  }),
));
const outputSelection = Object.fromEntries(Object.entries(compilationTarget).map(([path, name]) => [
  path, { [name]: ["abi", "evm.bytecode.object", "evm.deployedBytecode.object", "metadata"] },
]));
console.log(JSON.stringify({ language: "Solidity", sources, settings: { ...compilerSettings, outputSelection } }, null, 2));
