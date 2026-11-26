"use client";

import { useState, type FormEvent } from "react";
import { keccak256, stringToHex } from "viem";
import { inspectionItems, materialInspection, nominalRebarMass, outcomes, recordBytes, references } from "../lib/construction-quality.ts";

type Lot = { id: string; declared: string; unit: string };
type Props = { chainId: number; registry: string; project: string; lots: Lot[] };

export function QualityTools({ chainId, registry, project, lots }: Props) {
  const [record, setRecord] = useState<ReturnType<typeof materialInspection>>();
  const [error, setError] = useState("");
  const [mass, setMass] = useState<ReturnType<typeof nominalRebarMass>>();
  const [massError, setMassError] = useState("");
  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRecord(undefined);
    setError("");
    try {
      const data = new FormData(event.currentTarget);
      const lot = lots.find((item) => item.id === data.get("lot"));
      if (!lot) throw new Error("Choose a lot awaiting inspection in the verified project.");
      setRecord(materialInspection(data, { chainId, registry, project, lot: lot.id, declared: lot.declared, unit: lot.unit }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Inspection preparation failed."); }
  }
  function download() {
    if (!record) return;
    const url = URL.createObjectURL(new Blob([recordBytes(record)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "pourledger-mir-project-" + project + "-lot-" + record.scope.lotId + ".json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="live-panel" aria-label="Construction quality tools">
      <h2>Construction quality tools</h2>
      <details>
        <summary>Prepare material inspection record (MIR)</summary>
        <p>Project {project}. Prepare the inspection evidence for a declared delivery. This is a local draft, not an approval or certificate.</p>
        {!lots.length ? <p>No verified lots awaiting an inspector decision in this project.</p> : (
          <form onSubmit={prepare} onChange={() => { setRecord(undefined); setError(""); }}>
            <label>Material delivery<select name="lot" required>{lots.map((lot) => <option key={lot.id} value={lot.id}>Lot {lot.id} · {lot.declared} {lot.unit}</option>)}</select></label>
            {["inspection reference", "revision", "delivery reference", "material description", "standard and edition", "clause or ITP reference", "project acceptance criteria"].map((key) => (
              <label key={key}>{key.charAt(0).toUpperCase() + key.slice(1)}<input name={key} required maxLength={key === "project acceptance criteria" ? 1000 : 256} /></label>
            ))}
            <p>Record actual observations and justify any not-applicable check. Acceptance criteria must be reviewed by the responsible engineer.</p>
            {inspectionItems.map(([key, label]) => <fieldset key={key}>
              <legend>{label}</legend>
              <label>Outcome<select name={key} required defaultValue=""><option value="" disabled>Select outcome</option>{outcomes.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
              <label>Observation / reference / justification<input name={key + "-note"} required maxLength={500} /></label>
            </fieldset>)}
            <label>Proposed accepted quantity (whole units; zero for rejection)<input name="accepted" required inputMode="numeric" pattern="[0-9]+" /></label>
            <label>Disposition / corrective action / review notes<input name="disposition" required maxLength={1000} /></label>
            <button type="submit">Prepare inspection evidence</button>
          </form>
        )}
        {error && <p role="alert">{error}</p>}
        {record && <div className="live-result">
          <strong>Prepared for review · {record.proposedDecision}</strong>
          <p>{record.quantity.accepted} of {record.quantity.declared} {record.quantity.unit}. No approval has been submitted.</p>
          <p className="live-mono">Evidence digest {keccak256(stringToHex(recordBytes(record)))}</p>
          <button type="button" onClick={download}>Download inspection evidence</button>
          <p>Retain the exact file in your project records. In Record inspector decision, select lot {record.scope.lotId}, the matching decision and quantity, and upload this file as condition evidence. The designated inspector must review and sign separately. The registry does not enforce the checklist or validate the standard.</p>
        </div>}
      </details>
      <details>
        <summary>Standards reference library</summary>
        <p>Catalogue references only. Confirm the applicable edition, clause and contractual criteria before use. These references do not certify compliance.</p>
        <ul>{references.map((entry) => <li key={entry.code}><a href={entry.url}>{entry.code}</a> — {entry.description}</li>)}</ul>
      </details>
      <details>
        <summary>Reinforcement quantity calculator</summary>
        <form onChange={() => { setMass(undefined); setMassError(""); }} onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          try { setMass(nominalRebarMass(Number(data.get("diameter")), Number(data.get("length")), Number(data.get("pieces")))); setMassError(""); }
          catch (cause) { setMass(undefined); setMassError(cause instanceof Error ? cause.message : "Invalid quantity."); }
        }}>
          <label>Nominal diameter (mm)<input name="diameter" type="number" min="0.1" step="any" required /></label>
          <label>Length per bar (m)<input name="length" type="number" min="0.001" step="any" required /></label>
          <label>Number of bars<input name="pieces" type="number" min="1" step="1" required /></label>
          <button type="submit">Calculate nominal mass</button>
        </form>
        {massError && <p role="alert">{massError}</p>}
        {mass && <p role="status">{mass.kgPerM.toFixed(3)} kg/m · Total {mass.totalKg.toFixed(2)} kg</p>}
        <p className="live-note">Theoretical circular section; assumed steel density 7,850 kg/m³. Not measured delivery weight or a conformity tolerance.</p>
      </details>
    </section>
  );
}
