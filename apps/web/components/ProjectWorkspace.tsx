import Link from "next/link";
import {
  elementTypes, lotStatuses, materialTypes, passportPath, unitLabel, type RegistryTarget,
} from "../lib/chain.ts";
import type { ProjectsView } from "../lib/projects.ts";
import { TransactionLink } from "./TransactionLink";

const roleNames = ["Unknown role", "Inspector", "Engineer", "Lab"];

export function ProjectWorkspace({ target, view }: { target: RegistryTarget; view: ProjectsView }) {
  const { current, records, blockNumber } = view;
  const pending = records?.lots.filter((lot) => lot.status === 1) ?? [];
  const assignable = records?.lots.filter((lot) => lot.accepted > lot.assigned) ?? [];
  return (
    <section className="project-workspace" aria-label="Verified project workspace">
      <div className="project-heading">
        <div>
          <h2>Projects</h2>
          <p>Verified through block {blockNumber.toString()}</p>
        </div>
        {view.count > 0n && <form action="/live" className="project-jump">
          <label htmlFor="project-jump">Project ID</label>
          <input id="project-jump" name="project" required pattern="[1-9][0-9]*" inputMode="numeric" />
          <button type="submit">Open</button>
        </form>}
      </div>
      {view.count === 0n ? <p className="workspace-empty">No projects at this confirmation depth. Connect a wallet to create one.</p> : (
        <nav className="project-nav" aria-label="Project directory">
          {view.projects.map(({ id }) => (
            <Link key={id.toString()} href={`/live?project=${id}`} aria-current={id === current?.id ? "page" : undefined}>Project {id.toString()}</Link>
          ))}
          {view.older && <Link href={`/live?before=${view.older}`}>Older projects</Link>}
        </nav>
      )}
      {!current && view.count > 0n && <p role="status">Project unavailable at the verified block.</p>}
      {current && (
        <>
          <div className="workspace-identity">
            <h3>Project {current.id.toString()}</h3>
            <dl>
              <div><dt>Supervisor</dt><dd className="live-mono">{current.supervisor}</dd></div>
              <div><dt>Project digest</dt><dd className="live-mono">{current.projectHash}</dd></div>
            </dl>
            <TransactionLink target={target} hash={current.hash} label="Project receipt" />
          </div>
          {view.recordsUnavailable && <p role="status">Project history could not be fully verified within the direct read limit. Individual passports remain available by ID.</p>}
          {records && (
            <>
              <div className="workspace-columns">
                <section>
                  <h3>Inspector queue</h3>
                  {pending.length ? <ul>{pending.map((lot) => <li key={lot.id.toString()}>
                    <a href={passportPath({ ...target, kind: "lot", id: lot.id })}>Lot {lot.id.toString()}</a>
                    <span>{lot.declared.toString()} {unitLabel(lot.unit)} declared</span>
                  </li>)}</ul> : <p>No lots awaiting an inspector.</p>}
                </section>
                <section>
                  <h3>Engineer queue</h3>
                  {assignable.length ? <ul>{assignable.map((lot) => <li key={lot.id.toString()}>
                    <a href={passportPath({ ...target, kind: "lot", id: lot.id })}>Lot {lot.id.toString()}</a>
                    <span>{(lot.accepted - lot.assigned).toString()} {unitLabel(lot.unit)} available</span>
                  </li>)}</ul> : <p>No accepted quantity to assign.</p>}
                </section>
              </div>
              <details open>
                <summary>Material lots <span>({records.lots.length})</span></summary>
                {records.lots.length ? <ul>{records.lots.map((lot) => <li key={lot.id.toString()}>
                  <a href={passportPath({ ...target, kind: "lot", id: lot.id })}>Lot {lot.id.toString()} · {materialTypes[lot.material]}</a>
                  <span>{lotStatuses[lot.status]}</span>
                  <span>{(lot.accepted - lot.assigned).toString()} {unitLabel(lot.unit)} available · {lot.assigned.toString()} assigned</span>
                </li>)}</ul> : <p>No supplier declarations yet.</p>}
              </details>
              <details open>
                <summary>Elements <span>({records.elements.length})</span></summary>
                {records.elements.length ? <ul>{records.elements.map((element) => <li key={element.id.toString()}>
                  <a href={passportPath({ ...target, kind: "element", id: element.id })}>{elementTypes[element.type] ?? "Element"} {element.id.toString()} passport</a>
                  <span className="live-mono">{element.digest}</span>
                </li>)}</ul> : <p>No structural elements yet.</p>}
              </details>
              <details open>
                <summary>Project roles <span>({records.roles.length})</span></summary>
                {records.roles.length ? <ul>{records.roles.map((entry) => <li key={`${entry.account}:${entry.role}`}>
                  <strong>{roleNames[entry.role]} · {entry.enabled ? "Granted" : "Revoked"}</strong>
                  <span className="live-mono">{entry.account}</span>
                  <TransactionLink target={target} hash={entry.hash} label="Role receipt" />
                </li>)}</ul> : <p>No role grants yet. The supervisor can grant project-scoped roles.</p>}
              </details>
            </>
          )}
        </>
      )}
    </section>
  );
}
