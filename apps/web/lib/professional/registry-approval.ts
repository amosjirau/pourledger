import type { Pool } from "pg";
import { keccak256,stringToHex,zeroAddress } from "viem";
import { address, integer, qieMainnetChainId, sameHex, unitOptions } from "../chain.ts";
import { demoMainnetRegistry } from "../demo-run.ts";
import { deployment } from "../deployment.ts";
import { registryAbi } from "../generated/registry.ts";
import { loadPassport, passportReader } from "../passport.ts";
import { downloadDocument } from "./documents.ts";
import { WorkspaceError } from "./input.ts";
import { requireProject } from "./projects.ts";
import { quantity, reconcileInspection, registryQuantity } from "./quantities.ts";
import { type Delivery, deliveryInspection, type Inspection } from "./receiving.ts";

const units:Record<string,string> = { kg:"kg",t:"t","m³":"m3",each:"piece",bags:"bag" };
const materials:Record<string,number> = { "Reinforcing steel":1,Cement:2,"Coarse aggregate":3,"Fine aggregate":4,"Ready-mixed concrete":5 };
export type LockedDecision = { lotId:string; decision:string; quantity:string; conditionHash:string };
const deliveryDigest = (deliveryId:string) => keccak256(stringToHex(`PourLedger professional delivery v1:${deliveryId}`));

export function bindRegistryApproval(delivery:Delivery, inspection:Inspection, confirmed:{
  id:bigint; lotHash:string; status:number; materialType:number; declaredQuantity:bigint; unitCode:string;
}, digest:string):LockedDecision {
  if (confirmed.status !== 1) throw new WorkspaceError("The registry lot already has a terminal decision.");
  const unit = unitOptions.find(({label}) => label === units[delivery.unit]);
  if (!unit || !sameHex(confirmed.lotHash,deliveryDigest(delivery.id)) || !sameHex(confirmed.unitCode,unit.hash) || confirmed.materialType !== (materials[delivery.material] ?? 0) ||
    registryQuantity(quantity(delivery.quantity)) !== confirmed.declaredQuantity) {
    throw new WorkspaceError("The registry lot must match the prepared delivery reference, material, unit and exact declared quantity.");
  }
  if (!inspection.accepted || !inspection.rejected || !inspection.quarantined ||
    !["accepted","partially_accepted","rejected"].includes(inspection.status)) {
    throw new WorkspaceError("A final reviewed workspace inspection is required.");
  }
  if (quantity(inspection.quarantined,true) !== 0n) throw new WorkspaceError("Resolve quarantined quantities before preparing a terminal registry decision.");
  const accepted = quantity(inspection.accepted,true);
  reconcileInspection(quantity(delivery.quantity),accepted,quantity(inspection.rejected,true),quantity(inspection.quarantined,true));
  const value = accepted === 0n ? 0n : registryQuantity(accepted);
  if (value > confirmed.declaredQuantity || !/^0x[0-9a-f]{64}$/.test(digest)) throw new WorkspaceError("The approved quantities or evidence digest are invalid.");
  const decision = value === 0n ? "4" : value === confirmed.declaredQuantity ? "2" : "3";
  const expected = { accepted:"2",partially_accepted:"3",rejected:"4" };
  if (decision !== expected[inspection.status as keyof typeof expected]) throw new WorkspaceError("The inspection status does not reconcile with its approved quantity.");
  return { lotId:String(confirmed.id),decision,quantity:String(value),conditionHash:digest };
}

export async function registryApproval(db:Pool, actor:string, organization:string, project:string, deliveryId:string, lot:string) {
  const workspace = await requireProject(db,actor,organization,project,["inspector"]);
  const { delivery,inspection } = await deliveryInspection(db,actor,organization,project,deliveryId);
  if (!workspace.chain_project_id || !inspection?.document_id || !inspection.document_revision) {
    throw new WorkspaceError("Link a registry project and file an inspected evidence revision first.");
  }
  const config = mainnet();
  const lotId = integer(lot);
  const proof = await loadPassport({ ...config.target,kind:"lot",id:lotId },config);
  if (proof?.kind !== "lot" || String(proof.projectId) !== workspace.chain_project_id) {
    throw new WorkspaceError("The confirmed lot does not belong to the workspace's registry project.");
  }
  if (proof.lot.status !== 1) throw new WorkspaceError("The registry lot already has a terminal decision.");
  const document = await downloadDocument(db,actor,organization,project,inspection.document_id,inspection.document_revision);
  const intent = bindRegistryApproval(delivery,inspection,{ id:lotId,...proof.lot },document.keccak);
  return { intent,target:config.target,reference:inspection.reference,unit:delivery.unit,
    document:inspection.document_id,documentRevision:inspection.document_revision };
}

function mainnet() {
  const config = deployment();
  if (config.target.chainId !== qieMainnetChainId || !sameHex(config.target.registry,demoMainnetRegistry)) {
    throw new WorkspaceError("Registry signing here requires the pinned Mainnet deployment.");
  }
  return config;
}

export function bindRegistryDeclaration(delivery:Delivery, projectId:string, supplier?:string) {
  const unit = unitOptions.find(({label}) => label === units[delivery.unit]);
  if (!unit) throw new WorkspaceError("This unit does not have an explicitly supported registry equivalent.");
  return {
    projectId:String(integer(projectId)), lotHash:deliveryDigest(delivery.id), supplier:supplier ? address(supplier) : "",
    materialType:String(materials[delivery.material] ?? 0),quantity:String(registryQuantity(quantity(delivery.quantity))),unitCode:unit.hash,
  };
}

export async function registryDeclaration(db:Pool, actor:string, organization:string, project:string, deliveryId:string, supplier?:string) {
  const workspace = await requireProject(db,actor,organization,project,["supplier"]);
  if (!workspace.chain_project_id) throw new WorkspaceError("Link this workspace to an existing registry project first.");
  const { delivery } = await deliveryInspection(db,actor,organization,project,deliveryId);
  const intent = bindRegistryDeclaration(delivery,workspace.chain_project_id,supplier);
  const config = mainnet();
  const snapshot = await passportReader(config);
  const [,supervisor] = await config.reader.readContract({ address:config.target.registry,abi:registryAbi,functionName:"projects",
    args:[BigInt(intent.projectId)],blockNumber:snapshot.blockNumber });
  if (sameHex(supervisor,zeroAddress)) throw new WorkspaceError("This registry project does not exist at the verified block.");
  await snapshot.verifySnapshot();
  return { intent,target:config.target,delivery };
}
