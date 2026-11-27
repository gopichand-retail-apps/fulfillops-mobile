CREATE TABLE person (
  id uuid PRIMARY KEY, login_id text NOT NULL UNIQUE,
  password_hash text NOT NULL, disabled_at timestamptz
);
CREATE TABLE business (
  id uuid PRIMARY KEY, name text NOT NULL,
  deployment_singleton boolean UNIQUE CHECK (deployment_singleton)
);
CREATE TABLE site (
  id uuid PRIMARY KEY, business_id uuid NOT NULL REFERENCES business(id),
  name text NOT NULL, time_zone text NOT NULL, UNIQUE (business_id, id)
);
CREATE TABLE membership (
  site_id uuid NOT NULL REFERENCES site(id), person_id uuid NOT NULL REFERENCES person(id),
  roles text[] NOT NULL CHECK (cardinality(roles) BETWEEN 1 AND 6 AND
    roles <@ ARRAY['owner','supervisor','picker','packer','handoff','support']),
  revoked_at timestamptz,
  PRIMARY KEY (site_id, person_id)
);
CREATE TABLE invitation (
  digest text PRIMARY KEY, site_id uuid NOT NULL REFERENCES site(id),
  login_id text NOT NULL, roles text[] NOT NULL, expires_at timestamptz NOT NULL,
  used_at timestamptz
);
CREATE TABLE staff_session (
  digest text PRIMARY KEY, person_id uuid NOT NULL REFERENCES person(id),
  expires_at timestamptz NOT NULL, last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX session_person ON staff_session (person_id);

CREATE TABLE work (
  id uuid PRIMARY KEY, site_id uuid NOT NULL, business_id uuid NOT NULL,
  source_release text NOT NULL, source_order text NOT NULL, source_revision integer NOT NULL CHECK (source_revision > 0),
  release_authority text NOT NULL, observed_at timestamptz NOT NULL,
  priority smallint NOT NULL CHECK (priority BETWEEN 0 AND 5), due_at timestamptz,
  released_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  status text NOT NULL DEFAULT 'released' CHECK (status IN ('released','claimed','picking','exception','picked','packed','handed_over','cancelled')),
  UNIQUE (business_id, source_release),
  UNIQUE (business_id, source_order),
  FOREIGN KEY (business_id, site_id) REFERENCES site(business_id,id)
);
CREATE INDEX scoped_work_queue ON work (site_id, priority DESC, due_at ASC NULLS LAST, id);
CREATE TABLE work_line (
  id uuid PRIMARY KEY, work_id uuid NOT NULL REFERENCES work(id), source_ref text NOT NULL,
  sku text NOT NULL, bin text NOT NULL, aliases text[] NOT NULL,
  required_units integer NOT NULL CHECK (required_units BETWEEN 1 AND 10000),
  approved_units integer NOT NULL CHECK (approved_units BETWEEN 0 AND required_units),
  picked_units integer NOT NULL DEFAULT 0 CHECK (picked_units BETWEEN 0 AND approved_units),
  UNIQUE (work_id,source_ref), UNIQUE (work_id,id)
);
CREATE TABLE claim (
  id uuid PRIMARY KEY, work_id uuid NOT NULL REFERENCES work(id), assignee uuid NOT NULL REFERENCES person(id),
  claimed_at timestamptz NOT NULL DEFAULT clock_timestamp(), ended_at timestamptz
);
CREATE UNIQUE INDEX one_active_claim ON claim(work_id) WHERE ended_at IS NULL;
CREATE TABLE work_event (
  id uuid PRIMARY KEY, work_id uuid NOT NULL REFERENCES work(id), actor uuid NOT NULL REFERENCES person(id),
  type text NOT NULL, revision integer NOT NULL CHECK (revision > 0),
  at timestamptz NOT NULL DEFAULT clock_timestamp(), correlation_id uuid NOT NULL, details jsonb NOT NULL,
  UNIQUE (work_id,revision)
);
CREATE TABLE operation_receipt (
  site_id uuid NOT NULL REFERENCES site(id), actor uuid NOT NULL REFERENCES person(id), operation_id uuid NOT NULL,
  fingerprint text NOT NULL, work_id uuid NOT NULL REFERENCES work(id), command text NOT NULL,
  receipt jsonb NOT NULL, committed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(site_id,actor,operation_id)
);
GRANT SELECT ON schema_migrations, person, business, site, membership, invitation, staff_session,
  work, work_line, claim, work_event, operation_receipt TO orderflow_app;
GRANT INSERT ON person, membership, staff_session, work, work_line, claim, work_event, operation_receipt TO orderflow_app;
GRANT UPDATE (used_at) ON invitation TO orderflow_app;
GRANT UPDATE (last_seen_at), DELETE ON staff_session TO orderflow_app;
GRANT UPDATE (revision,status,updated_at) ON work TO orderflow_app;
GRANT UPDATE (ended_at) ON claim TO orderflow_app;
GRANT UPDATE (approved_units,picked_units) ON work_line TO orderflow_app;
