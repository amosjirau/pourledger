CREATE TABLE construction.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  project_id uuid NOT NULL,
  reference text NOT NULL CHECK(char_length(reference) BETWEEN 1 AND 60),
  kind text NOT NULL CHECK(kind IN ('delivery-note','inspection-report','mill-certificate','lab-report','drawing','specification','photograph','pour-card','ncr-evidence','corrective-action','supporting-file')),
  title text NOT NULL CHECK(char_length(title) BETWEEN 1 AND 160),
  revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
  archived_at timestamptz,
  UNIQUE(organization_id,project_id,reference),
  UNIQUE(organization_id,project_id,id),
  FOREIGN KEY(organization_id,project_id) REFERENCES construction.projects(organization_id,id)
);
CREATE TABLE construction.document_revisions (
  organization_id uuid NOT NULL,
  project_id uuid NOT NULL,
  document_id uuid NOT NULL,
  revision integer NOT NULL CHECK(revision > 0),
  file_name text NOT NULL CHECK(char_length(file_name) BETWEEN 1 AND 160),
  media_type text NOT NULL CHECK(media_type IN ('application/pdf','image/jpeg','image/png')),
  bytes bytea NOT NULL CHECK(octet_length(bytes) BETWEEN 1 AND 3145728),
  size_bytes integer GENERATED ALWAYS AS (octet_length(bytes)) STORED,
  sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'),
  keccak text NOT NULL CHECK(keccak ~ '^0x[0-9a-f]{64}$'),
  author uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(organization_id,project_id,document_id,revision),
  UNIQUE(document_id,sha256),
  FOREIGN KEY(organization_id,project_id,document_id) REFERENCES construction.documents(organization_id,project_id,id),
  FOREIGN KEY(organization_id,author) REFERENCES construction.members(organization_id,account_id)
);
CREATE INDEX ON construction.document_revisions(organization_id);
