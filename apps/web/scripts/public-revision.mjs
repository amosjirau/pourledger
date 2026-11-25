import { demoProductionOrigin } from "../lib/demo-run.ts";
import { releaseRef, releaseRepository, revisionPattern } from "../lib/release-revision.ts";

export async function verifyPublicRevision(sourceCommit, fetchRevision = fetch) {
  if (!revisionPattern.test(sourceCommit)) throw new Error("Supply the full reviewed Git SHA.");
  const url = `${demoProductionOrigin}/release.json`;
  let response;
  try {
    response = await fetchRevision(url, {
      redirect: "error", cache: "no-store", headers: { accept: "application/json" }, signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error("The production release marker is unreachable through the configured connection.");
  }
  if (!response.ok || response.url !== url || !response.headers.get("cache-control")?.includes("no-store")) {
    throw new Error(`Production release marker could not be verified (HTTP ${response.status}).`);
  }
  const marker = await response.json();
  if (marker.version !== 1 || marker.repository !== releaseRepository || marker.ref !== releaseRef || marker.commit !== sourceCommit) {
    throw new Error("The production site did not report the reviewed GitHub revision.");
  }
  return { status: "verified", method: "public-release-marker", publicOrigin: demoProductionOrigin, sourceCommit, gitRef: releaseRef };
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  try {
    console.log(JSON.stringify(await verifyPublicRevision(process.argv[2]), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Public revision verification failed.");
    process.exitCode = 1;
  }
}
