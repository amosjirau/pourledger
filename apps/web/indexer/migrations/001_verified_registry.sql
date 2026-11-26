BEGIN;
CREATE SCHEMA IF NOT EXISTS registry_index;
CREATE TABLE IF NOT EXISTS registry_index.sync (
  scope text PRIMARY KEY,
  first_block bigint NOT NULL CHECK (first_block >= 0),
  confirmations integer NOT NULL CHECK (confirmations > 0),
  tip bigint NOT NULL,
  tip_hash text,
  counts jsonb NOT NULL,
  generation bigint NOT NULL DEFAULT 0,
  target bigint,
  status text NOT NULL CHECK (status IN ('syncing', 'ready', 'error')),
  error text,
  checked_at timestamptz NOT NULL DEFAULT now(),
  CHECK (tip >= first_block - 1),
  CHECK ((tip_hash IS NULL) = (tip = first_block - 1))
);
CREATE TABLE IF NOT EXISTS registry_index.checkpoints (
  scope text NOT NULL REFERENCES registry_index.sync(scope) ON DELETE CASCADE,
  end_block bigint NOT NULL,
  block_hash text NOT NULL,
  counts jsonb NOT NULL,
  PRIMARY KEY (scope, end_block)
);
CREATE TABLE IF NOT EXISTS registry_index.events (
  scope text NOT NULL,
  checkpoint bigint NOT NULL,
  block_no bigint NOT NULL,
  log_index integer NOT NULL CHECK (log_index >= 0),
  block_hash text NOT NULL,
  tx_hash text NOT NULL,
  name text NOT NULL,
  topics text[] NOT NULL,
  data text NOT NULL,
  project_id numeric(78,0),
  lot_id numeric(78,0),
  element_id numeric(78,0),
  entity_id numeric(78,0),
  account text,
  role integer,
  quantity numeric(78,0),
  PRIMARY KEY (scope, block_no, log_index),
  FOREIGN KEY (scope, checkpoint) REFERENCES registry_index.checkpoints(scope, end_block) ON DELETE CASCADE,
  CHECK (block_no <= checkpoint)
);
CREATE UNIQUE INDEX IF NOT EXISTS events_identity ON registry_index.events (scope, name, entity_id) WHERE entity_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS events_receipt ON registry_index.events (scope, tx_hash, log_index);
CREATE INDEX IF NOT EXISTS events_checkpoint ON registry_index.events (scope, checkpoint);
CREATE INDEX IF NOT EXISTS events_project ON registry_index.events (scope, name, project_id, block_no, log_index);
CREATE INDEX IF NOT EXISTS events_lot ON registry_index.events (scope, name, lot_id, block_no, log_index) INCLUDE (quantity);
CREATE INDEX IF NOT EXISTS events_element ON registry_index.events (scope, name, element_id, block_no, log_index);
CREATE INDEX IF NOT EXISTS events_role ON registry_index.events (scope, project_id, account, role, block_no DESC, log_index DESC)
  WHERE name = 'ProjectRoleUpdated';
COMMIT;
