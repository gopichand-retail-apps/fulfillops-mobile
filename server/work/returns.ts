import { randomUUID } from "node:crypto"
import type { z } from "zod"
import type * as input from "../../shared/contracts.ts"
import type { Tx } from "../db.ts"
import { allow } from "../failure.ts"
import type { Outcome } from "./commands.ts"
import type { Work } from "./records.ts"

type Context = { tx: Tx; work: Work }
export async function openReturn(
  { tx, work }: Context,
  body: z.infer<typeof input.requestReturn>,
): Promise<Outcome> {
  allow(work.status === "handed_over", "TRANSITION_DENIED")
  const capacity = (
    await tx.query<{ delivered: number; reserved: number }>(
      `SELECT
    (SELECT (i->>'units')::int FROM handoff h JOIN package p ON p.id=h.package_id,
      LATERAL jsonb_array_elements(p.contents) i WHERE h.work_id=$1 AND i->>'lineId'=$2::text) AS delivered,
    (SELECT coalesce(sum(requested_units),0)::int FROM return_line WHERE work_id=$1 AND line_id=$2::uuid) AS reserved`,
      [work.id, body.lineId],
    )
  ).rows[0]
  allow(
    capacity?.delivered && body.units + capacity.reserved <= capacity.delivered,
    "RETURN_CAPACITY_EXCEEDED",
    422,
  )
  const id = randomUUID()
  await tx.query(
    `INSERT INTO return_line (id,work_id,line_id,requested_units,reason,status)
    VALUES ($1,$2,$3,$4,$5,'requested')`,
    [id, work.id, body.lineId, body.units, body.reason],
  )
  return { status: work.status, recordId: id, details: { lineId: body.lineId, units: body.units } }
}

type Operation =
  | { step: "receive" }
  | { step: "inspect"; body: z.infer<typeof input.inspect> }
  | { step: "disposition"; body: z.infer<typeof input.disposition> }
const states = {
  receive: ["requested", "received"],
  inspect: ["received", "inspected"],
  disposition: ["inspected", "dispositioned"],
} as const

export async function progressReturn({ tx, work }: Context, id: string, operation: Operation): Promise<Outcome> {
  allow(work.status === "handed_over", "TRANSITION_DENIED")
  const [before, after] = states[operation.step]
  const condition = operation.step === "inspect" ? operation.body.condition : null
  const disposition = operation.step === "disposition" ? operation.body.disposition : null
  const updated = await tx.query(
    `UPDATE return_line SET status=$4,condition=coalesce($5,condition),disposition=coalesce($6,disposition)
    WHERE work_id=$1 AND id=$2 AND status=$3 AND ($6 IS DISTINCT FROM 'restock_eligible' OR condition='intact')`,
    [work.id, id, before, after, condition, disposition],
  )
  allow(updated.rowCount, "RETURN_TRANSITION_DENIED")
  return { status: work.status, recordId: id, details: operation.step === "receive" ? {} : operation.body }
}
