import { notFound } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { EvidenceFile } from "../../../../../../components/EvidenceFile";
import {
  anvilChainId, lotStatuses, matchesTarget, parseCoordinates, passportPath,
} from "../../../../../../lib/chain.ts";
import { deployment } from "../../../../../../lib/deployment.ts";
import { loadPassport, PassportUnavailable } from "../../../../../../lib/passport.ts";

export const dynamic = "force-dynamic";

function Unavailable({ reason }: { reason: string }) {
  return (
    <main className="live-shell">
      <a href="/live">Live registry</a>
      <h1>Passport verification unavailable</h1>
      <p role="status">{reason}</p>
    </main>
  );
}

export default async function PassportPage({ params }: { params: Promise<Record<"chain" | "registry" | "kind" | "id", string>> }) {
  const coordinates = parseCoordinates(await params);
  if (!coordinates) notFound();
  let config;
  try {
    config = deployment();
  } catch {
    return <Unavailable reason="No supported live deployment is configured." />;
  }
  if (!matchesTarget(coordinates, config.target)) notFound();
  let record;
  try {
    record = await loadPassport(coordinates, config);
  } catch (error) {
    return <Unavailable reason={error instanceof PassportUnavailable ? error.message : "Required registry data or transaction receipts could not be verified. Retry after the RPC is available."} />;
  }
  if (!record) notFound();
  const qrUrl = config.origin && new URL(passportPath(coordinates), config.origin).toString();
  const lot = record.kind === "lot" && record.lot;
  return (
    <main className="live-shell">
      <a href="/live">Live registry</a>
      <h1>{record.kind === "lot" ? "Material lot" : "Structural element"} {coordinates.id.toString()}</h1>
      <p>{coordinates.chainId === anvilChainId ? "Local Anvil" : "QIE Testnet"} · chain {coordinates.chainId}</p>
      <p className="live-mono">{coordinates.registry}</p>
      <p>Receipt-validated through block {record.blockNumber.toString()} · {config.target.confirmations} confirmation(s) required</p>
      <p>Project {record.projectId.toString()}</p>
      <p className="live-note">The registry records role-bound statements. Physical installation, laboratory accuracy, identity, and structural safety require independent verification.</p>
      {qrUrl ? (
        <figure className="live-qr">
          <QRCodeSVG value={qrUrl} size={150} marginSize={4} title="QR for this verified passport" />
          <figcaption><a href={qrUrl}>Share this passport</a></figcaption>
        </figure>
      ) : <p>Sharing QR unavailable until the operator configures a public origin.</p>}
      {record.kind === "element" && (
        <section className="live-panel">
          <h2>Element registration</h2>
          <p>Type code {record.elementType}</p>
          <p className="live-mono">Element digest {record.elementCodeHash}</p>
          <p className="live-mono">Registration transaction {record.creationHash}</p>
        </section>
      )}
      {lot && (
        <>
          <section className="live-panel">
            <h2>Delivery decision</h2>
            <p>{lotStatuses[lot.status]}</p>
            <p>Declared {lot.declaredQuantity.toString()} · Accepted {lot.acceptedQuantity.toString()} · Assigned {lot.assignedQuantity.toString()}</p>
            <p>Material code {lot.materialType}</p>
            <p className="live-mono">Unit digest {lot.unitCode}</p>
            <p className="live-mono">Supplier {lot.supplier}</p>
            <p className="live-mono">Lot digest {lot.lotHash}</p>
            <p className="live-mono">Registration transaction {lot.registrationHash}</p>
            {lot.decision && (
              <div>
                <p className="live-mono">Inspector {lot.decision.inspector}</p>
                <p className="live-mono">Decision transaction {lot.decision.hash}</p>
                <p className="live-mono">Condition digest {lot.decision.conditionHash}</p>
                <EvidenceFile expected={lot.decision.conditionHash} />
              </div>
            )}
          </section>
          <section className="live-panel">
            <h2>Designated-lab attestations</h2>
            {lot.labEvidence.length === 0 && <p>No lab attestation found through the verified block.</p>}
            {lot.labEvidence.map((entry) => (
              <article key={entry.testId.toString()}>
                <h3>Lab attestation {entry.testId.toString()}</h3>
                <p className="live-mono">Signer {entry.lab}</p>
                <p className="live-mono">Transaction {entry.hash}</p>
                <p className="live-mono">Sample digest {entry.sampleHash}</p>
                <p className="live-mono">Results digest {entry.resultsHash}</p>
                <EvidenceFile expected={entry.resultsHash} />
              </article>
            ))}
          </section>
        </>
      )}
      <section className="live-panel">
        <h2>Engineer-attested assignments</h2>
        {record.assignments.length === 0 && <p>No assignments found through the verified block.</p>}
        {record.assignments.map((entry) => (
          <article key={entry.assignmentId.toString()}>
            <h3>Assignment {entry.assignmentId.toString()}</h3>
            {record.kind === "element" ? (
              <a href={passportPath({ ...coordinates, kind: "lot", id: entry.lotId })}>Material lot {entry.lotId.toString()}</a>
            ) : (
              <a href={passportPath({ ...coordinates, kind: "element", id: entry.elementId })}>Structural element {entry.elementId.toString()}</a>
            )}
            <p>Quantity {entry.usedQuantity.toString()}</p>
            {record.kind === "element" && <p>{lotStatuses[entry.lotStatus]}</p>}
            <p className="live-mono">Unit digest {entry.unitCode}</p>
            <p className="live-mono">Engineer {entry.engineer}</p>
            <p className="live-mono">Transaction {entry.hash}</p>
            <p className="live-mono">Evidence digest {entry.evidenceHash}</p>
            <EvidenceFile expected={entry.evidenceHash} />
          </article>
        ))}
      </section>
      <p>Document storage is unavailable in this milestone. You can verify files obtained separately.</p>
    </main>
  );
}
