import { randomUUID } from "node:crypto"
import type { Receipt, ReleaseInput, Role, Status } from "../../shared/contracts.ts"
import { type Database, type Tx, transact } from "../db.ts"
import { allow, Failure } from "../failure.ts"
import { digest } from "../identity/credentials.ts"
import type { Scope } from "../identity/session.ts"
import { project, type Work, workRow } from "./records.ts"

export type Command = { scope: Scope; key: string; name: string; correlationId: string; permission: Role[] }
export type WorkCommand = Command & { workId: string; expectedVersion: number }
export type Outcome = {
  status: Status
  recordId?: string
  claim?: Receipt["claim"]
  details?: Record<string, unknown>
}

const access = (scope: Scope, roles: Role[]) => scope.roles.some((role) => roles.includes(role))

function fingerprint(command: Command, input: unknown, workId?: string) {
  return digest(JSON.stringify([command.name, workId, input]))
}

async function recover(tx: Tx, command: Command, print: string): Promise<Receipt | undefined> {
  const { scope, key } = command
  await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    `${scope.siteId}:${scope.actor.id}:${key}`,
  ])
  const existing = (
    await tx.query<{ fingerprint: string; receipt: Receipt | null }>(
      `SELECT fingerprint,
    CASE WHEN committed_at > clock_timestamp()-interval '7 days' THEN receipt END AS receipt
    FROM operation_receipt WHERE site_id=$1 AND actor=$2 AND operation_id=$3`,
      [scope.siteId, scope.actor.id, key],
    )
  ).rows[0]
  if (existing) {
    allow(existing.fingerprint === print, "IDEMPOTENCY_MISMATCH")
    allow(existing.receipt, "RECEIPT_WINDOW_EXPIRED")
    return existing.receipt
  }
}
async function save(
  tx: Tx,
  command: Command,
  ids: { workId: string; revision: number; print: string },
  outcome: Outcome,
) {
  const { scope, key, name, correlationId } = command
  const event = (
    await tx.query<{ at: Date }>(
      `INSERT INTO work_event (id,work_id,actor,type,revision,correlation_id,details)
    VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING at`,
      [
        randomUUID(),
        ids.workId,
        scope.actor.id,
        name,
        ids.revision,
        correlationId,
        JSON.stringify(outcome.details ?? {}),
      ],
    )
  ).rows[0]
  allow(event, "COMMIT_FAILED", 503)
  const receipt: Receipt = {
    operationId: key,
    workId: ids.workId,
    type: name,
    revision: ids.revision,
    status: outcome.status,
    committedAt: event.at.toISOString(),
    claim: outcome.claim,
    recordId: outcome.recordId,
  }
  await tx.query(
    `INSERT INTO operation_receipt (site_id,actor,operation_id,fingerprint,work_id,command,receipt)
    VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [scope.siteId, scope.actor.id, key, ids.print, ids.workId, name, JSON.stringify(receipt)],
  )
  return receipt
}

export async function createRelease(db: Database, command: Command, input: ReleaseInput) {
  allow(access(command.scope, command.permission), "FORBIDDEN", 403)
  allow(Date.parse(input.observedAt) <= Date.now() + 300000, "INVALID_OBSERVATION_TIME", 422)
  return transact(db, async (tx) => {
    const print = fingerprint(command, input)
    const existing = await recover(tx, command, print)
    if (existing) return existing
    const id = randomUUID()
    const created = await tx.query(
      `INSERT INTO work (id,site_id,business_id,source_release,source_order,source_revision,
      release_authority,observed_at,priority,due_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING`,
      [
        id,
        command.scope.siteId,
        command.scope.businessId,
        input.sourceReleaseRef,
        input.sourceOrderRef,
        input.sourceRevision,
        input.releasedByRef,
        input.observedAt,
        input.priority,
        input.dueAt ?? null,
      ],
    )
    allow(created.rowCount, "RELEASE_CONFLICT")
    await tx.query(
      `INSERT INTO work_line (id,work_id,source_ref,sku,bin,aliases,required_units,approved_units)
      SELECT r.id,$1,r.ref,r.sku,r.bin,r.aliases,r.units,r.units
      FROM jsonb_to_recordset($2::jsonb) AS r(id uuid,ref text,sku text,bin text,aliases text[],units integer)`,
      [
        id,
        JSON.stringify(
          input.lines.map((line) => ({
            id: randomUUID(),
            ref: line.sourceLineRef,
            sku: line.sku,
            bin: line.bin,
            aliases: line.barcodeAliases,
            units: line.units,
          })),
        ),
      ],
    )
    return save(
      tx,
      command,
      { workId: id, revision: 1, print },
      { status: "released", details: { lineCount: input.lines.length } },
    )
  })
}

export async function changeWork(
  db: Database,
  command: WorkCommand,
  input: unknown,
  apply: (tx: Tx, work: Work) => Promise<Outcome>,
) {
  allow(access(command.scope, command.permission), "FORBIDDEN", 403)
  return transact(db, async (tx) => {
    const print = fingerprint(command, input, command.workId)
    const existing = await recover(tx, command, print)
    if (existing) return existing
    await workRow(tx, command.scope, command.workId, true)
    // Read assignment again after taking the aggregate lock. Another transaction can insert a claim while this one waits.
    const work = await workRow(tx, command.scope, command.workId)
    if (work.revision !== command.expectedVersion) {
      const code = command.name === "work.claim" && work.claim_id ? "ALREADY_CLAIMED" : "VERSION_CONFLICT"
      throw new Failure(409, code, undefined, { currentWork: project(work) })
    }
    const outcome = await apply(tx, work)
    const revision = work.revision + 1
    await tx.query("UPDATE work SET revision=$2,status=$3,updated_at=clock_timestamp() WHERE id=$1", [
      work.id,
      revision,
      outcome.status,
    ])
    return save(tx, command, { workId: work.id, revision, print }, outcome)
  })
}

export async function getReceipt(db: Database, scope: Scope, key: string, rolesFor: (command: string) => Role[]) {
  const result = (
    await db.query<{ command: string; receipt: Receipt }>(
      `SELECT command,receipt FROM operation_receipt
    WHERE site_id=$1 AND actor=$2 AND operation_id=$3 AND committed_at>clock_timestamp()-interval '7 days'`,
      [scope.siteId, scope.actor.id, key],
    )
  ).rows[0]
  allow(result && access(scope, rolesFor(result.command)), "RECEIPT_UNAVAILABLE", 404)
  return result.receipt
}
