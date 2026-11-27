import { QualityTools } from "../../components/QualityTools";
import { LiveWallet } from "../../components/LiveWallet";
import { ProjectWorkspace } from "../../components/ProjectWorkspace";
import { deployment } from "../../lib/deployment.ts";
import { integer, networks, unitLabel } from "../../lib/chain.ts";
import { parseEventCursor } from "../../lib/indexer/events.ts";
import { loadProjects, type ProjectsView } from "../../lib/projects.ts";
import { PassportUnavailable } from "../../lib/passport.ts";
import { constructionEnabled } from "../../lib/professional/database.ts";

export const dynamic = "force-dynamic";

export default async function LivePage({ searchParams }: {
  searchParams: Promise<{ project?: string; before?: string; elements?: string; lots?: string; roles?: string }>;
}) {
  let config: ReturnType<typeof deployment>;
  try {
    config = deployment();
  } catch {
    return (
      <main className="live-shell">
        <a href="/">PourLedger · Synthetic demo</a>
        <h1>Live registry</h1>
        <p role="status">Live verification is unavailable until an operator configures a supported registry deployment and RPC.</p>
      </main>
    );
  }
  const { target } = config;
  const params = await searchParams;
  let view: ProjectsView | undefined;
  let readError: string | undefined;
  try {
    const project = params.project === undefined ? undefined : integer(params.project);
    const before = params.before === undefined ? undefined : integer(params.before);
    view = await loadProjects(config, project, before, {
      elements: parseEventCursor(params.elements), lots: parseEventCursor(params.lots), roles: parseEventCursor(params.roles),
    });
  } catch (error) {
    readError = error instanceof PassportUnavailable ? error.message : "Check the project ID or retry when the configured verification RPC is available.";
  }
  const context = view?.current ? {
    project: view.current.id.toString(),
    elements: view.records?.elements.map((element) => element.id.toString()) ?? [],
    lots: view.records?.lots.map((lot) => ({
      id: lot.id.toString(), status: lot.status, unit: unitLabel(lot.unit), declared: lot.declared.toString(),
      available: (lot.accepted - lot.assigned).toString(),
    })) ?? [],
  } : undefined;
  return (
    <main className="live-shell workspace-shell">
      <nav className="workspace-nav" aria-label="PourLedger">
        <a href="/">PourLedger</a>
        <a href="/">Synthetic demo</a>
        {constructionEnabled() && <a href="/construction">Construction workspace</a>}
      </nav>
      <header className="workspace-header">
        <div>
          <p className="workspace-chain">{networks[target.chainId].name} · chain {target.chainId}</p>
          <h1>Live registry</h1>
          <p>Manage material attestations and verify the evidence behind a structural element.</p>
        </div>
        <div className="workspace-registry"><span>Registry address</span><code>{target.registry}</code></div>
      </header>
      <div className="workspace-layout">
        <div className="workspace-read">
          {view ? <ProjectWorkspace target={target} view={view} pages={params} /> : (
            <section className="live-panel"><h2>Projects unavailable</h2><p role="status">{readError}</p><a href="/live">Retry projects</a></section>
          )}
          {context && <QualityTools key={context.project} chainId={target.chainId} registry={target.registry} project={context.project} lots={context.lots.filter((lot) => lot.status === 1)} />}
          <form className="live-panel passport-lookup" action="/passport">
        <h2>Find a public passport</h2>
        <input type="hidden" name="chain" value={target.chainId} />
        <input type="hidden" name="registry" value={target.registry} />
        <label>Passport type
          <select name="kind"><option value="element">Structural element</option><option value="lot">Material lot</option></select>
        </label>
        <label>Record ID<input name="id" required pattern="[1-9][0-9]*" inputMode="numeric" /></label>
        <button type="submit">Find passport</button>
          </form>
        </div>
        <LiveWallet target={target} context={context} />
      </div>
    </main>
  );
}
