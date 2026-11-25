export const releaseRepository = "amosjirau/pourledger";
export const releaseRef = "main";
export const revisionPattern = /^[0-9a-f]{40}$/;

export function productionRevision(env: NodeJS.ProcessEnv) {
  const commit = env.VERCEL_GIT_COMMIT_SHA;
  const repository = `${env.VERCEL_GIT_REPO_OWNER}/${env.VERCEL_GIT_REPO_SLUG}`;
  if (env.VERCEL !== "1" || env.VERCEL_ENV !== "production" || env.VERCEL_GIT_PROVIDER !== "github" ||
      repository.toLowerCase() !== releaseRepository || env.VERCEL_GIT_COMMIT_REF !== releaseRef || !commit || !revisionPattern.test(commit)) return;
  return { version: 1, repository: releaseRepository, ref: releaseRef, commit };
}
