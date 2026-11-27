CREATE TABLE construction.specifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  project_id uuid NOT NULL,
  reference text NOT NULL,
  edition text NOT NULL,
  project_revision text NOT NULL,
  title text NOT NULL,
  classification text NOT NULL CHECK(classification IN ('standard','contract specification','regulatory requirement')),
  publisher_url text NOT NULL,
  criteria jsonb NOT NULL,
  state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','approved','withdrawn')),
  author uuid NOT NULL,
  reviewer uuid,
  CHECK(reviewer IS NULL OR reviewer<>author),
  UNIQUE (organization_id,project_id,reference,edition,project_revision),
  UNIQUE (organization_id,project_id,id),
  FOREIGN KEY (organization_id,project_id) REFERENCES construction.projects(organization_id,id),
  FOREIGN KEY (organization_id,author) REFERENCES construction.members(organization_id,account_id),
  FOREIGN KEY (organization_id,reviewer) REFERENCES construction.members(organization_id,account_id)
);
CREATE INDEX ON construction.specifications(organization_id,project_id,id);
CREATE TABLE construction.elements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  project_id uuid NOT NULL,
  reference text NOT NULL,
  kind text NOT NULL,
  metadata jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  chain_element_id numeric(78,0) CHECK(chain_element_id>0),
  UNIQUE(organization_id,project_id,reference),
  UNIQUE(organization_id,project_id,chain_element_id),
  UNIQUE(organization_id,project_id,id),
  FOREIGN KEY(organization_id,project_id) REFERENCES construction.projects(organization_id,id)
);
CREATE INDEX ON construction.elements(organization_id,project_id,id);
