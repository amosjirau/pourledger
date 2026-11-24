import { execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { demoProductionOrigin } from "../lib/demo-run.ts";

const hostname = new URL(demoProductionOrigin).hostname;
const shaPattern = /^[0-9a-f]{40}$/;

function commit(deployment) {
  const hashes = [deployment.gitSource?.sha, deployment.meta?.githubCommitSha].filter(Boolean);
  if (!hashes.length || hashes.some((sha) => !shaPattern.test(sha) || sha !== hashes[0])) return undefined;
  return hashes[0];
}

export async function verifyVercel({ request, sourceCommit, publish = false, wait = delay, assertRemote }) {
  if (!shaPattern.test(sourceCommit)) throw new Error("Supply the full reviewed Git SHA.");
  async function alias() {
    const value = await request(`/v4/aliases/${hostname}`);
    if (value.alias !== hostname || (value.projectId !== undefined && !String(value.projectId).startsWith("prj_"))) {
      throw new Error("The production alias did not resolve to the expected Vercel project.");
    }
    const deploymentId = value.deploymentId ?? value.deployment?.id;
    if (typeof deploymentId !== "string" || !deploymentId.startsWith("dpl_")) throw new Error("The production alias has no deployment ID.");
    const deployment = await request(`/v13/deployments/${encodeURIComponent(deploymentId)}`);
    if (!deployment.projectId?.startsWith("prj_") || (deployment.id ?? deployment.uid) !== deploymentId ||
        (value.projectId && value.projectId !== deployment.projectId)) {
      throw new Error("Vercel returned inconsistent deployment coordinates.");
    }
    return { deployment, projectId: deployment.projectId, deploymentId };
  }

  const original = await alias();
  const project = await request(`/v9/projects/${encodeURIComponent(original.projectId)}`);
  const link = project.link;
  const repoId = Number(link?.repoId);
  if (project.id !== original.projectId || project.rootDirectory !== "apps/web" || link?.type !== "github" ||
      link.org?.toLowerCase() !== "amosjirau" || link.repo?.toLowerCase() !== "pourledger" || link.productionBranch !== "main" ||
      !Number.isSafeInteger(repoId) || repoId <= 0) {
    throw new Error("Vercel project must be linked to amosjirau/pourledger, production branch main and root apps/web.");
  }

  async function proof() {
    const current = await alias();
    if (current.projectId !== project.id) throw new Error("The production alias changed projects.");
    const { deployment } = current;
    if (commit(deployment) !== sourceCommit || deployment.target !== "production" || deployment.readyState !== "READY") return undefined;
    return { status: "verified", publicOrigin: demoProductionOrigin, sourceCommit, gitRef: "main", projectId: project.id, deploymentId: current.deploymentId };
  }

  let ready = await proof();
  if (ready) return ready;
  if (publish) {
    const query = new URLSearchParams({ projectId: project.id, target: "production", limit: "20", "meta-githubCommitSha": sourceCommit });
    const history = await request(`/v6/deployments?${query}`);
    if (!Array.isArray(history.deployments)) throw new Error("Vercel deployment history was unavailable.");
    const candidate = history.deployments.find((entry) => commit(entry) === sourceCommit && entry.target === "production" &&
      ["READY", "QUEUED", "BUILDING", "INITIALIZING"].includes(entry.readyState ?? entry.state));
    if (!candidate) {
      await assertRemote();
      await request("/v13/deployments", {
        name: project.name, project: project.id, target: "production", gitSource: { type: "github", repoId, ref: "main", sha: sourceCommit },
      });
    }
  }
  for (let attempt = 0; attempt < 18; attempt++) {
    await wait(5_000);
    ready = await proof();
    if (ready) return ready;
  }
  throw new Error("The production alias has not served the reviewed READY revision. Check the existing Vercel project's deployment status and rerun.");
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  try {
    const [sourceCommit, option] = process.argv.slice(2);
    const token = process.env.VERCEL_TOKEN;
    const team = process.env.POURLEDGER_VERCEL_TEAM;
    if (!token) throw new Error("Vercel project access requires the owner's authorized VERCEL_TOKEN.");
    const request = async (path, body) => {
      const url = new URL(path, "https://api.vercel.com");
      if (team) url.searchParams.set(team.startsWith("team_") ? "teamId" : "slug", team);
      let response;
      try {
        response = await fetch(url, {
          method: body ? "POST" : "GET", redirect: "error",
          headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
          ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15_000),
        });
      } catch {
        throw new Error("Vercel API is unreachable through this machine's configured connection.");
      }
      if (!response.ok) throw new Error(`Vercel API responded with HTTP ${response.status}. Check project access and team scope.`);
      return response.json();
    };
    const assertRemote = () => {
      const remote = execFileSync("git", ["ls-remote", "--exit-code", "https://github.com/amosjirau/pourledger.git", "refs/heads/main"], {
        cwd: new URL("../../../", import.meta.url), encoding: "utf8", timeout: 20_000,
      }).trim().split(/\s+/)[0];
      if (remote !== sourceCommit) throw new Error("GitHub main moved. Review the new revision before publishing.");
    };
    const proof = await verifyVercel({ sourceCommit, publish: option === "--publish", request, assertRemote });
    console.log(JSON.stringify(proof, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Vercel release verification failed.");
    process.exitCode = 1;
  }
}
