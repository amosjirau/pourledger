"use client";

import { useActionState, type ReactNode } from "react";
import { submitWorkspace } from "./actions.ts";

export function WorkspaceForm({ task, organization, project, submit, children }: {
  task: string; organization?: string; project?: string; submit: string; children?: ReactNode;
}) {
  const [result, action, pending] = useActionState(submitWorkspace, {});
  return <form action={action}>
    <input type="hidden" name="task" value={task} />
    {organization && <input type="hidden" name="organization" value={organization} />}
    {project && <input type="hidden" name="project" value={project} />}
    {children}
    <button disabled={pending}>{pending ? "Saving…" : submit}</button>
    {result.error && <p role="alert">{result.error}</p>}
    {result.notice && <p role="status">{result.notice}</p>}
    {result.invitation && <p><output className="live-mono">{result.invitation}</output></p>}
  </form>;
}
