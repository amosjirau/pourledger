import assert from "node:assert/strict";
import test from "node:test";
import { indexRpcPolicy } from "../lib/indexer/rpc-policy.ts";

const official = "https://rpc1mainnet.qie.digital,https://rpc5mainnet.qie.digital";

test("official QIE mode accepts only separately named published archival RPC endpoints", () => {
  assert.equal(indexRpcPolicy(1990, "official-qie", official).endpoints.length, 2);
  assert.throws(() => indexRpcPolicy(1990, undefined, official), /Set the verification mode/);
  assert.throws(() => indexRpcPolicy(1990, "official-qie", official.replace("rpc5mainnet.qie.digital", "archive.example")), /published/);
  assert.throws(() => indexRpcPolicy(1990, "official-qie", official.replace("rpc5mainnet", "rpc1mainnet")), /distinct hostnames/);
});

test("independent archive mode requires separate reviewed operators in endpoint order", () => {
  const custom = "https://one.example/rpc,https://two.example/rpc";
  assert.equal(indexRpcPolicy(1990, "independent-archive", custom, "one,two").verificationMode, "independent-archive");
  assert.throws(() => indexRpcPolicy(1990, "independent-archive", custom), /operator-reviewed/);
  assert.throws(() => indexRpcPolicy(1990, "independent-archive", custom, "one,one"), /operator-reviewed/);
  assert.throws(() => indexRpcPolicy(1990, "independent-archive", official, "one,two"), /At most one/);
});
