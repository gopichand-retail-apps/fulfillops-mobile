CREATE TABLE shortage (
  id uuid PRIMARY KEY, work_id uuid NOT NULL, line_id uuid NOT NULL, units integer NOT NULL CHECK (units > 0),
  reason text NOT NULL, resolved_at timestamptz, resolution text CHECK (resolution IN ('wait','partial')),
  FOREIGN KEY (work_id,line_id) REFERENCES work_line(work_id,id)
);
CREATE UNIQUE INDEX one_open_shortage ON shortage(work_id) WHERE resolved_at IS NULL;
CREATE TABLE package (
  id uuid PRIMARY KEY, work_id uuid NOT NULL UNIQUE REFERENCES work(id), reference text NOT NULL,
  contents jsonb NOT NULL
);
CREATE TABLE handoff (
  id uuid PRIMARY KEY, work_id uuid NOT NULL UNIQUE REFERENCES work(id), package_id uuid NOT NULL UNIQUE REFERENCES package(id),
  pickup_ref text NOT NULL, method text NOT NULL, observed_at timestamptz NOT NULL
);
CREATE TABLE return_line (
  id uuid PRIMARY KEY, work_id uuid NOT NULL REFERENCES handoff(work_id), line_id uuid NOT NULL,
  requested_units integer NOT NULL CHECK (requested_units > 0), reason text NOT NULL,
  status text NOT NULL CHECK (status IN ('requested','received','inspected','dispositioned')),
  condition text, disposition text,
  FOREIGN KEY (work_id,line_id) REFERENCES work_line(work_id,id)
);
CREATE INDEX returns_by_handoff_line ON return_line(work_id,line_id);
GRANT SELECT, INSERT ON shortage, package, handoff, return_line TO orderflow_app;
GRANT UPDATE (resolved_at,resolution) ON shortage TO orderflow_app;
GRANT UPDATE (status,condition,disposition) ON return_line TO orderflow_app;
