import type { Action, Detail, Status, Summary } from "../../shared/contracts.ts"
import { type Database, type Tx, transact } from "../db.ts"
import { allow } from "../failure.ts"
import type { Scope } from "../identity/session.ts"

export type Work = {
  id: string
  source_order: string
  status: Status
  revision: number
  priority: number
  due_at: Date | null
  released_at: Date
  updated_at: Date
  claim_id: string | null
  assignee: string | null
}
export type Line = {
  id: string
  sku: string
  bin: string
  aliases: string[]
  required_units: number
  approved_units: number
  picked_units: number
}
export const workSource = `FROM work w LEFT JOIN claim c ON c.work_id=w.id AND c.ended_at IS NULL`
export const columns =
  "w.id,w.source_order,w.status,w.revision,w.priority,w.due_at,w.released_at,w.updated_at,c.id AS claim_id,c.assignee"
export function project(row: Work): Summary {
  return {
    id: row.id,
    reference: row.source_order,
    status: row.status,
    revision: row.revision,
    priority: row.priority,
    releasedAt: row.released_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    dueAt: row.due_at?.toISOString(),
    source: "manual",
  }
}
export async function workRow(db: Database | Tx, scope: Scope, id: string, lock = false) {
  const row = (
    await db.query<Work>(
      `SELECT ${columns} ${workSource} WHERE w.site_id=$1 AND w.id=$2 ${lock ? "FOR UPDATE OF w" : ""}`,
      [scope.siteId, id],
    )
  ).rows[0]
  allow(row, "WORK_UNAVAILABLE", 404)
  return row
}
export async function linesFor(db: Database | Tx, workId: string) {
  return (
    await db.query<Line>(
      "SELECT id,sku,bin,aliases,required_units,approved_units,picked_units FROM work_line WHERE work_id=$1 ORDER BY source_ref,id",
      [workId],
    )
  ).rows
}
const active = (state: Status) => state === "claimed" || state === "picking" || state === "exception"

export function allowedActions(work: Work, scope: Scope): Action[] {
  const grants = scope.roles
  const actions: Action[] = []
  if (grants.includes("picker")) {
    if (work.status === "released") actions.push("claim")
    if (work.assignee === scope.actor.id && (work.status === "claimed" || work.status === "picking")) {
      actions.push("pick", "shortage")
      if (work.status === "claimed") actions.push("release_claim")
    }
  }
  if (grants.includes("supervisor")) {
    if (active(work.status)) actions.push("reassign")
    if (work.status === "exception") actions.push("resolve")
    if (work.status !== "handed_over" && work.status !== "cancelled") actions.push("cancel")
    if (work.status === "handed_over") actions.push("open_return", "disposition")
  }
  if (grants.includes("packer") && work.status === "picked") actions.push("pack")
  if (grants.includes("handoff") && work.status === "packed") actions.push("handoff")
  if (grants.includes("handoff") && work.status === "handed_over")
    actions.push("open_return", "receive", "inspect")
  return actions
}

function fullDetail(scope: Scope, work: Work) {
  return (
    scope.roles.includes("supervisor") ||
    (scope.roles.includes("picker") && (work.status === "released" || work.assignee === scope.actor.id)) ||
    (scope.roles.includes("packer") && ["picked", "packed", "handed_over"].includes(work.status)) ||
    (scope.roles.includes("handoff") && ["packed", "handed_over"].includes(work.status))
  )
}

export function readDetail(db: Database, scope: Scope, workId: string): Promise<Detail> {
  return transact(db, (tx) => readDetailSnapshot(tx, scope, workId), true)
}

async function readDetailSnapshot(db: Tx, scope: Scope, workId: string): Promise<Detail> {
  const work = await workRow(db, scope, workId)
  const full = fullDetail(scope, work)
  allow(full || scope.roles.includes("support"), "WORK_UNAVAILABLE", 404)
  const history = (
    await db.query<{ id: string; type: string; at: Date; revision: number; actor: string }>(
      "SELECT id,type,at,revision,actor FROM work_event WHERE work_id=$1 ORDER BY revision DESC LIMIT 50",
      [workId],
    )
  ).rows.map((event) => ({
    eventId: event.id,
    type: event.type,
    at: event.at.toISOString(),
    revision: event.revision,
    actorRef: full ? event.actor : undefined,
  }))
  const result: Detail = { work: project(work), allowedActions: full ? allowedActions(work, scope) : [], history }
  if (full) {
    const lines = await linesFor(db, workId)
    const progress = await db.query<{ shortage: string | null; package: string | null }>(
      `SELECT (SELECT id FROM shortage WHERE work_id=$1 AND resolved_at IS NULL) AS shortage,
        (SELECT id FROM package WHERE work_id=$1) AS package`,
      [workId],
    )
    const returns = await db.query<NonNullable<Detail["returns"]>[number]>(
      `SELECT id,line_id AS "lineId",requested_units AS units,status,condition,disposition
        FROM return_line WHERE work_id=$1 ORDER BY id LIMIT 100`,
      [workId],
    )
    result.lines = lines.map((line) => ({
      id: line.id,
      sku: line.sku,
      bin: line.bin,
      unit: "EA",
      requiredUnits: line.required_units,
      pickedUnits: line.picked_units,
      approvedUnits: line.approved_units,
    }))
    result.claim = work.claim_id && work.assignee ? { id: work.claim_id, assigneeRef: work.assignee } : undefined
    result.shortageId = progress.rows[0]?.shortage ?? undefined
    result.packageId = progress.rows[0]?.package ?? undefined
    result.returns = returns.rows
  }
  return result
}
