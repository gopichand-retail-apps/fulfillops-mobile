import { randomUUID } from "node:crypto"
import type { z } from "zod"
import type * as input from "../../shared/contracts.ts"
import type { Tx } from "../db.ts"
import { allow } from "../failure.ts"
import type { Scope } from "../identity/session.ts"
import type { Outcome } from "./commands.ts"
import { type Line, linesFor, type Work } from "./records.ts"

type Context = { tx: Tx; work: Work; scope: Scope }
type Params<T extends z.ZodType> = z.infer<T>

export async function claim({ tx, work, scope }: Context): Promise<Outcome> {
  allow(work.status === "released" && !work.claim_id, "ALREADY_CLAIMED")
  const id = randomUUID()
  await tx.query("INSERT INTO claim (id,work_id,assignee) VALUES ($1,$2,$3)", [id, work.id, scope.actor.id])
  return { status: "claimed", claim: { id, assigneeRef: scope.actor.id } }
}
function assertHolder(context: Context, id: string) {
  allow(context.work.claim_id === id && context.work.assignee === context.scope.actor.id, "CLAIM_NOT_OWNED", 403)
}
export async function releaseClaim(context: Context, body: Params<typeof input.releaseClaim>): Promise<Outcome> {
  const { tx, work } = context
  assertHolder(context, body.claimId)
  allow(work.status === "claimed", "TRANSITION_DENIED")
  await tx.query("UPDATE claim SET ended_at=clock_timestamp() WHERE id=$1", [body.claimId])
  return { status: "released", details: { reason: body.reason } }
}
export async function reassign(
  { tx, work, scope }: Context,
  body: Params<typeof input.reassign>,
): Promise<Outcome> {
  allow(
    work.claim_id === body.claimId && ["claimed", "picking", "exception"].includes(work.status),
    "TRANSITION_DENIED",
  )
  allow(await eligiblePicker(tx, scope.siteId, body.assigneeRef), "ASSIGNEE_UNAVAILABLE", 422)
  await tx.query("UPDATE claim SET ended_at=clock_timestamp() WHERE id=$1", [body.claimId])
  const id = randomUUID()
  await tx.query("INSERT INTO claim (id,work_id,assignee) VALUES ($1,$2,$3)", [id, work.id, body.assigneeRef])
  return {
    status: work.status,
    claim: { id, assigneeRef: body.assigneeRef },
    details: { reason: body.reason, priorClaim: body.claimId },
  }
}
async function eligiblePicker(tx: Tx, siteId: string, personId: string) {
  const result = await tx.query(
    `SELECT 1 FROM membership m JOIN person p ON p.id=m.person_id
    WHERE m.site_id=$1 AND m.person_id=$2 AND m.revoked_at IS NULL AND p.disabled_at IS NULL AND 'picker'=ANY(m.roles)`,
    [siteId, personId],
  )
  return Boolean(result.rowCount)
}
function selectedLine(lines: Line[], id: string) {
  const line = lines.find((line) => line.id === id)
  allow(line, "LINE_UNAVAILABLE", 404)
  return line
}
function assertPicking(context: Context, claimId: string) {
  assertHolder(context, claimId)
  allow(["claimed", "picking"].includes(context.work.status), "TRANSITION_DENIED")
}
const isComplete = (lines: Line[]) => lines.every((line) => line.picked_units === line.approved_units)
export async function pick(context: Context, lineId: string, body: Params<typeof input.pick>): Promise<Outcome> {
  const { tx, work } = context
  assertPicking(context, body.claimId)
  const lines = await linesFor(tx, work.id)
  const line = selectedLine(lines, lineId)
  allow(line.sku === body.productRef || line.aliases.includes(body.productRef), "WRONG_PRODUCT", 422)
  allow(line.picked_units + body.pickedEach <= line.approved_units, "QUANTITY_EXCEEDS_REMAINING", 422)
  line.picked_units += body.pickedEach
  await tx.query("UPDATE work_line SET picked_units=$2 WHERE id=$1", [line.id, line.picked_units])
  return {
    status: isComplete(lines) ? "picked" : "picking",
    details: { lineId, units: body.pickedEach, source: body.source },
  }
}
export async function reportShortage(
  context: Context,
  lineId: string,
  body: Params<typeof input.shortage>,
): Promise<Outcome> {
  const { tx, work } = context
  assertPicking(context, body.claimId)
  const line = selectedLine(await linesFor(tx, work.id), lineId)
  allow(body.units <= line.approved_units - line.picked_units, "QUANTITY_EXCEEDS_REMAINING", 422)
  const id = randomUUID()
  await tx.query("INSERT INTO shortage (id,work_id,line_id,units,reason) VALUES ($1,$2,$3,$4,$5)", [
    id,
    work.id,
    lineId,
    body.units,
    body.reason,
  ])
  return { status: "exception", recordId: id, details: { lineId, units: body.units, reason: body.reason } }
}
export async function resolve(
  { tx, work }: Context,
  shortageId: string,
  body: Params<typeof input.resolution>,
): Promise<Outcome> {
  allow(work.status === "exception", "TRANSITION_DENIED")
  const result = await tx.query<{ line_id: string; units: number }>(
    `UPDATE shortage SET resolved_at=clock_timestamp(),resolution=$3
    WHERE work_id=$1 AND id=$2 AND resolved_at IS NULL RETURNING line_id,units`,
    [work.id, shortageId, body.decision],
  )
  const shortage = result.rows[0]
  allow(shortage, "SHORTAGE_UNAVAILABLE", 404)
  const lines = await linesFor(tx, work.id)
  if (body.decision === "partial") {
    const line = selectedLine(lines, shortage.line_id)
    line.approved_units -= shortage.units
    allow(
      lines.some((candidate) => candidate.approved_units > 0),
      "EMPTY_PACKAGE",
      422,
    )
    await tx.query("UPDATE work_line SET approved_units=$2 WHERE id=$1", [line.id, line.approved_units])
  }
  return {
    status: isComplete(lines) ? "picked" : "picking",
    recordId: shortageId,
    details: { reason: body.reason, decision: body.decision },
  }
}
export async function pack({ tx, work }: Context, body: Params<typeof input.packing>): Promise<Outcome> {
  allow(work.status === "picked", "TRANSITION_DENIED")
  const lines = (await linesFor(tx, work.id)).filter((line) => line.approved_units > 0)
  const quantities = new Map(body.contents.map((line) => [line.lineId, line.units]))
  allow(
    lines.length === body.contents.length &&
      quantities.size === lines.length &&
      lines.every(
        (line) => quantities.get(line.id) === line.approved_units && line.picked_units === line.approved_units,
      ),
    "PACK_CONTENTS_MISMATCH",
    422,
  )
  const id = randomUUID()
  await tx.query("INSERT INTO package (id,work_id,reference,contents) VALUES ($1,$2,$3,$4)", [
    id,
    work.id,
    body.reference,
    JSON.stringify(body.contents),
  ])
  return { status: "packed", recordId: id, details: { packageId: id } }
}
export async function handoff({ tx, work }: Context, body: Params<typeof input.handoff>): Promise<Outcome> {
  allow(work.status === "packed", "TRANSITION_DENIED")
  const observed = Date.parse(body.observedAt)
  allow(observed >= work.released_at.getTime() && observed <= Date.now() + 300000, "INVALID_OBSERVATION_TIME", 422)
  const id = randomUUID()
  const inserted = await tx.query(
    `INSERT INTO handoff (id,work_id,package_id,pickup_ref,method,observed_at)
    SELECT $1,$2,id,$4,$5,$6 FROM package WHERE work_id=$2 AND id=$3`,
    [id, work.id, body.packageId, body.pickupRef, body.method, body.observedAt],
  )
  allow(inserted.rowCount, "PACKAGE_UNAVAILABLE", 404)
  return {
    status: "handed_over",
    recordId: id,
    details: { packageId: body.packageId, method: body.method, observedAt: body.observedAt },
  }
}
export async function cancel({ tx, work }: Context, body: Params<typeof input.cancel>): Promise<Outcome> {
  allow(!["handed_over", "cancelled"].includes(work.status), "TRANSITION_DENIED")
  const picked = (await linesFor(tx, work.id)).some((line) => line.picked_units > 0)
  allow(!picked || body.physicalDisposition, "PHYSICAL_DISPOSITION_REQUIRED", 422)
  await tx.query("UPDATE claim SET ended_at=clock_timestamp() WHERE work_id=$1 AND ended_at IS NULL", [work.id])
  return { status: "cancelled", details: body }
}
