import { zeroAddress } from "viem";
import { sameHex } from "./chain.ts";
import type { deployment } from "./deployment.ts";
import { registryAbi } from "./generated/registry.ts";
import { passportReader, PassportUnavailable } from "./passport.ts";

export async function loadProjects(
  config: ReturnType<typeof deployment>, projectId?: bigint, before?: bigint,
) {
  const source = await passportReader(config);
  const { blockNumber } = source;
  const read = { address: config.target.registry, abi: registryAbi, blockNumber } as const;
  const count = await config.reader.readContract({ ...read, functionName: "projectCount" });
  const end = before && before < count ? before : count;
  const ids = Array.from({ length: Number(end < 8n ? end : 8n) }, (_, index) => end - BigInt(index));
  const selected = projectId ?? ids[0];
  const requestedIds = selected && selected <= count && !ids.includes(selected) ? [...ids, selected] : ids;
  const entries = requestedIds.length ? await source.projectLogs(requestedIds) : [];
  if (entries.length !== requestedIds.length || new Set(entries.map((entry) => entry.args.projectId)).size !== requestedIds.length) {
    throw new PassportUnavailable("Project creation events do not match the registry count.");
  }
  const verified = await Promise.all(entries.map(async ({ args, hash }) => {
    const [projectHash, supervisor] = await config.reader.readContract({ ...read, functionName: "projects", args: [args.projectId] });
    if (supervisor === zeroAddress || !sameHex(args.projectHash, projectHash) || !sameHex(args.supervisor, supervisor)) {
      throw new PassportUnavailable("Project creation does not match registry state.");
    }
    return { id: args.projectId, projectHash, supervisor, hash };
  }));
  const current = verified.find((entry) => entry.id === selected);
  const projects = verified.filter((entry) => ids.includes(entry.id)).sort((a, b) => a.id > b.id ? -1 : 1);
  let records: Awaited<ReturnType<typeof projectRecords>> | null = null;
  let recordsUnavailable = false;
  if (current) {
    try {
      records = await projectRecords(config, source, current.id);
    } catch (error) {
      if (!(error instanceof PassportUnavailable)) throw error;
      recordsUnavailable = true;
    }
  }
  await source.verifySnapshot();
  return { blockNumber, count, projects, current, records, recordsUnavailable, older: end > 8n ? end - 8n : undefined };
}

async function projectRecords(
  config: ReturnType<typeof deployment>, source: Awaited<ReturnType<typeof passportReader>>, id: bigint,
) {
  const [elementEvents, lotEvents, decisionEvents, roleEvents] = await Promise.all([
    source.projectElements(id), source.projectLots(id), source.projectDecisions(id), source.projectRoles(id),
  ]);
  const assertUnique = (ids: bigint[]) => {
    if (new Set(ids).size !== ids.length) throw new PassportUnavailable("Project history returned conflicting events.");
  };
  assertUnique(elementEvents.map(({ args }) => args.elementId));
  assertUnique(lotEvents.map(({ args }) => args.lotId));
  assertUnique(decisionEvents.map(({ args }) => args.lotId));
  const decisions = new Map(decisionEvents.map((entry) => [entry.args.lotId, entry]));
  const recentRoles = new Map<string, typeof roleEvents[number]>();
  const ordered = roleEvents.sort((a, b) => a.block === b.block ? a.index - b.index : a.block < b.block ? -1 : 1);
  for (const entry of ordered) recentRoles.set(`${entry.args.account.toLowerCase()}:${entry.args.role}`, entry);

  const [elements, lots, roles] = await Promise.all([
    Promise.all(elementEvents.map(async ({ args, hash }) => {
      const [projectId, digest, type] = await source.readElement(args.elementId);
      if (projectId !== id || !sameHex(digest, args.elementCodeHash) || type !== args.elementType) {
        throw new PassportUnavailable("Element history does not match registry state.");
      }
      return { id: args.elementId, type, digest, hash };
    })),
    Promise.all(lotEvents.map(async ({ args, hash }) => {
      const [projectId, digest, supplier, material, declared, accepted, assigned, unit, status] = await source.readLot(args.lotId);
      const decision = decisions.get(args.lotId);
      if (projectId !== id || !sameHex(digest, args.lotHash) || !sameHex(supplier, args.supplier) ||
          material !== args.materialType || declared !== args.declaredQuantity || !sameHex(unit, args.unitCode) ||
          ![1, 2, 3, 4].includes(status) || assigned > accepted || accepted > declared ||
          (status === 1 ? !!decision || accepted !== 0n :
            !decision || decision.args.acceptedQuantity !== accepted || decision.args.decision !== status)) {
        throw new PassportUnavailable("Lot or inspector history does not match registry state.");
      }
      return { id: args.lotId, digest, supplier, material, declared, accepted, assigned, unit, status, hash, decisionHash: decision?.hash };
    })),
    Promise.all([...recentRoles.values()].map(async ({ args, hash }) => {
      const enabled = await config.reader.readContract({
        address: config.target.registry, abi: registryAbi, blockNumber: source.blockNumber,
        functionName: "hasProjectRole", args: [id, args.account, args.role],
      });
      if (enabled !== args.enabled) throw new PassportUnavailable("Role history does not match registry state.");
      return { account: args.account, role: args.role, enabled, hash };
    })),
  ]);
  if (decisionEvents.some(({ args }) => !lots.some(({ id }) => id === args.lotId))) {
    throw new PassportUnavailable("The RPC could not match inspector decisions to their registrations.");
  }
  return { elements, lots, roles };
}

export type ProjectsView = Awaited<ReturnType<typeof loadProjects>>;
