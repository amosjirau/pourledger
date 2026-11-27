import type { Pool } from "pg";
import { requireProject } from "./projects.ts";

export type Notice = { source:string; reference:string; detail:string; target:string; target_kind:string|null; due:string|null };

export async function projectInbox(db:Pool, actor:string, organization:string, project:string) {
  await requireProject(db,actor,organization,project);
  const { rows } = await db.query<Notice>(`WITH notices AS (
      SELECT 'inspection' AS source,i.reference,
        replace(i.status::text,'_',' ') AS detail,i.delivery_id::text AS target,NULL::text AS target_kind,i.inspection_date AS due
      FROM construction.inspection_requests i
      WHERE i.organization_id=$1 AND i.project_id=$2 AND i.status IN ('submitted','under_review','revision_required')
      UNION ALL
      SELECT 'quality',q.reference,
        CASE WHEN q.kind='ncr' THEN 'Open nonconformance'
          WHEN q.due_on<CURRENT_DATE THEN 'Overdue'
          WHEN q.state='submitted' THEN 'Pending review' ELSE 'Due soon' END,
        q.id::text,q.kind,q.due_on
      FROM construction.quality_records q WHERE q.organization_id=$1 AND q.project_id=$2
      AND q.state NOT IN ('reviewed','closed') AND (q.kind='ncr' OR q.state='submitted' OR q.due_on<=CURRENT_DATE+7)
      UNION ALL
      SELECT 'document',d.reference,'Current document revision '||d.revision,d.id::text,NULL,NULL
      FROM construction.documents d WHERE d.organization_id=$1 AND d.project_id=$2 AND d.archived_at IS NULL AND d.revision>1
      UNION ALL
      SELECT 'integrity',d.reference,'File revision failed verification',d.id::text,NULL,NULL
      FROM construction.audit e JOIN construction.documents d
        ON (d.organization_id,d.project_id,d.id,d.revision)=(e.organization_id,e.project_id,e.entity_id,e.revision)
      WHERE e.organization_id=$1 AND e.project_id=$2 AND e.action='document.integrity_failed'
      GROUP BY d.id
    )
    SELECT source,reference,detail,target,target_kind,due::text FROM notices
    ORDER BY CASE source WHEN 'integrity' THEN 0 WHEN 'quality' THEN 1 WHEN 'inspection' THEN 2 ELSE 3 END,due NULLS LAST,reference,target
    LIMIT 30`,[organization,project]);
  return rows;
}
