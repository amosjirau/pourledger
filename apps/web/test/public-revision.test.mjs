import assert from "node:assert/strict";
import test from "node:test";
import { demoProductionOrigin } from "../lib/demo-run.ts";
import { productionRevision } from "../lib/release-revision.ts";
import { verifyPublicRevision } from "../scripts/public-revision.mjs";

const commit = "a".repeat(40);
const env = {
  VERCEL: "1", VERCEL_ENV: "production", VERCEL_GIT_PROVIDER: "github",
  VERCEL_GIT_REPO_OWNER: "amosjirau", VERCEL_GIT_REPO_SLUG: "pourledger",
  VERCEL_GIT_COMMIT_REF: "main", VERCEL_GIT_COMMIT_SHA: commit,
};
const marker = { version: 1, repository: "amosjirau/pourledger", ref: "main", commit };
const releaseUrl = `${demoProductionOrigin}/release.json`;

test("the release marker exposes only the public SHA from the expected production deployment", () => {
  assert.deepEqual(productionRevision({ ...env, VERCEL_TOKEN: "fixture-only" }), marker);
  for (const changed of [
    { VERCEL: undefined }, { VERCEL_ENV: "preview" }, { VERCEL_GIT_PROVIDER: "gitlab" },
    { VERCEL_GIT_COMMIT_REF: "preview" }, { VERCEL_GIT_COMMIT_SHA: "abbreviated" }, { VERCEL_GIT_REPO_OWNER: "another-owner" },
  ]) assert.equal(productionRevision({ ...env, ...changed }), undefined);
});

test("public revision verification rejects stale, cached, redirected and unavailable release markers", async () => {
  const fetchRevision = (changes) => async (url, options) => {
    assert.equal(url, releaseUrl);
    assert.equal(options.redirect, "error");
    assert.equal(options.cache, "no-store");
    return { ok: true, status: 200, url, headers: new Headers({ "Cache-Control": "no-store" }), json: async () => marker, ...changes };
  };
  assert.deepEqual(await verifyPublicRevision(commit, fetchRevision()), {
    status: "verified", method: "public-release-marker", publicOrigin: demoProductionOrigin, sourceCommit: commit, gitRef: "main",
  });
  await assert.rejects(verifyPublicRevision(commit, fetchRevision({ url: "https://unrelated.example/release.json" })), /could not be verified/);
  await assert.rejects(verifyPublicRevision(commit, fetchRevision({ ok: false, status: 404 })), /HTTP 404/);
  await assert.rejects(verifyPublicRevision(commit, fetchRevision({ headers: new Headers({ "Cache-Control": "max-age=60" }) })), /could not be verified/);
  await assert.rejects(verifyPublicRevision(commit, fetchRevision({ json: async () => ({ ...marker, commit: "b".repeat(40) }) })), /did not report the reviewed/);
});
