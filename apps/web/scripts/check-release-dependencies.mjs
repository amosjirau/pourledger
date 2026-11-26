import { accessSync, constants, readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";

const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const supports = (values, current) => !values ||
  (!values.includes(`!${current}`) && (values.includes(current) || values.every((value) => value.startsWith("!"))));

try {
  const npmPackage = json("package.json");
  const locked = json("package-lock.json").packages;
  const installed = json("node_modules/.package-lock.json").packages;
  for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
    if (!isDeepStrictEqual(npmPackage[field], locked[""][field])) throw new Error();
  }
  for (const [path, expected] of Object.entries(locked)) {
    if (!path) continue;
    const actual = installed[path];
    if (!actual && expected.optional && (!supports(expected.os, process.platform) || !supports(expected.cpu, process.arch))) continue;
    if (!actual || actual.version !== expected.version || actual.integrity !== expected.integrity || actual.resolved !== expected.resolved ||
        json(`${path}/package.json`).version !== expected.version) throw new Error();
  }
  if (Object.keys(installed).some((path) => !Object.hasOwn(locked, path))) throw new Error();
  accessSync("node_modules/.bin/next", constants.X_OK);
} catch {
  process.exitCode = 1;
}
