CREATE SCHEMA IF NOT EXISTS construction;
CREATE TABLE construction.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE construction.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE CHECK (email=lower(email) AND char_length(email) <= 254),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TYPE construction.organization_role AS ENUM (
  'administrator','project_manager','site_engineer','structural_engineer','consultant','inspector',
  'supplier','laboratory','storekeeper','quantity_surveyor','client_representative','auditor'
);
CREATE TABLE construction.members (
  organization_id uuid NOT NULL REFERENCES construction.organizations(id),
  account_id uuid NOT NULL REFERENCES construction.accounts(id),
  role construction.organization_role NOT NULL,
  PRIMARY KEY(organization_id,account_id)
);
CREATE TABLE construction.invites (
  token_hash text PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES construction.organizations(id),
  email text NOT NULL CHECK (email=lower(email) AND char_length(email) <= 254),
  role construction.organization_role NOT NULL,
  created_by uuid,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  FOREIGN KEY (organization_id,created_by) REFERENCES construction.members(organization_id,account_id)
);
CREATE TABLE construction.sessions (
  token_hash text PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES construction.accounts(id),
  expires_at timestamptz NOT NULL
);
CREATE INDEX ON construction.sessions(expires_at);
CREATE TABLE construction.auth_rate (
  key text PRIMARY KEY,
  attempts integer NOT NULL CHECK(attempts BETWEEN 1 AND 10),
  expires_at timestamptz NOT NULL
);
CREATE INDEX ON construction.auth_rate(expires_at);
CREATE TABLE construction.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES construction.organizations(id),
  code text NOT NULL CHECK(char_length(code) BETWEEN 1 AND 50),
  name text NOT NULL CHECK(char_length(name) BETWEEN 1 AND 160),
  chain_project_id numeric(78,0) CHECK(chain_project_id > 0),
  metadata jsonb NOT NULL CHECK(jsonb_typeof(metadata)='object'),
  revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
  UNIQUE(organization_id,code),
  UNIQUE(organization_id,id)
);
CREATE TABLE construction.project_members (
  organization_id uuid NOT NULL,
  project_id uuid NOT NULL,
  account_id uuid NOT NULL,
  PRIMARY KEY(organization_id,project_id,account_id),
  FOREIGN KEY(organization_id,project_id) REFERENCES construction.projects(organization_id,id),
  FOREIGN KEY(organization_id,account_id) REFERENCES construction.members(organization_id,account_id)
);
CREATE TABLE construction.audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES construction.organizations(id),
  project_id uuid,
  actor uuid,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  revision integer,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(organization_id,project_id) REFERENCES construction.projects(organization_id,id),
  FOREIGN KEY(organization_id,actor) REFERENCES construction.members(organization_id,account_id)
);
CREATE INDEX ON construction.audit(organization_id,project_id,id DESC);
