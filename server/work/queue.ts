import { randomUUID } from "node:crypto"
import { z } from "zod"
import { reference, type Summary, status } from "../../shared/contracts.ts"
import type { Database } from "../db.ts"
import { allow, check } from "../failure.ts"
import type { Scope } from "../identity/session.ts"
import { columns, project, type Work, workSource } from "./records.ts"

const filtersSchema = z.strictObject({
  cursor: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  reference: reference.optional(),
  assignment: z.enum(["available", "mine"]).optional(),
  status: status.optional(),
})
type Snapshot = { scope: string; filter: string; expires: number; at: string; rows: Summary[]; truncated: boolean }

export class WorkQueue {
  private snapshots = new Map<string, Snapshot>()

  async list(db: Database, scope: Scope, values: URLSearchParams) {
    allow(
      [...values.keys()].every((key) => values.getAll(key).length === 1),
      "INVALID_QUERY",
      400,
    )
    const { cursor, ...filter } = check(filtersSchema, Object.fromEntries(values))
    const now = Date.now()
    for (const [key, snapshot] of this.snapshots) if (snapshot.expires <= now) this.snapshots.delete(key)
    const scopeKey = JSON.stringify([scope.siteId, scope.actor.sessionId, [...scope.roles].sort()])
    const filterKey = JSON.stringify(filter)
    if (cursor) return this.nextPage(cursor, scopeKey, filterKey, filter.limit)
    const rows = await this.load(db, scope, filter)
    const id = randomUUID()
    const snapshot = {
      scope: scopeKey,
      filter: filterKey,
      expires: now + 60000,
      at: new Date(now).toISOString(),
      rows: rows.slice(0, 1000).map(project),
      truncated: rows.length > 1000,
    }
    if (snapshot.rows.length > filter.limit) {
      const scopeRows = [...this.snapshots].filter(([, candidate]) => candidate.scope === scopeKey)
      if (scopeRows.length >= 4 && scopeRows[0]) this.snapshots.delete(scopeRows[0][0])
      if (this.snapshots.size >= 32) {
        const oldest = this.snapshots.keys().next().value
        if (oldest) this.snapshots.delete(oldest)
      }
      this.snapshots.set(id, snapshot)
    }
    return this.page(id, snapshot, 0, filter.limit)
  }
  private nextPage(cursor: string, scope: string, filters: string, limit: number) {
    const pieces = cursor.split(".")
    const id = pieces[0] ?? ""
    const start = Number(pieces[1])
    const snapshot = this.snapshots.get(id)
    allow(
      pieces.length === 2 &&
        snapshot &&
        snapshot.scope === scope &&
        snapshot.filter === filters &&
        Number.isInteger(start) &&
        start >= limit &&
        start % limit === 0 &&
        start < snapshot.rows.length,
      "CURSOR_EXPIRED",
    )
    return this.page(id, snapshot, start, limit)
  }
  private page(id: string, snapshot: Snapshot, start: number, limit: number) {
    const end = start + limit
    return {
      items: snapshot.rows.slice(start, end),
      asOf: snapshot.at,
      truncated: snapshot.truncated,
      nextCursor: end < snapshot.rows.length ? `${id}.${end}` : undefined,
    }
  }
  private async load(db: Database, scope: Scope, filter: Omit<z.infer<typeof filtersSchema>, "cursor">) {
    const result = await db.query<Work>(
      `SELECT ${columns} ${workSource}
      WHERE w.site_id=$1 AND ($2::text IS NULL OR w.status=$2) AND ($3::text IS NULL OR w.source_order=$3)
      AND ($4::text IS NULL OR ($4='mine' AND c.assignee=$5) OR ($4='available' AND w.status='released'))
      AND ('supervisor'=ANY($6::text[]) OR 'support'=ANY($6::text[])
        OR ('picker'=ANY($6::text[]) AND (w.status='released' OR c.assignee=$5))
        OR ('packer'=ANY($6::text[]) AND w.status IN ('picked','packed','handed_over'))
        OR ('handoff'=ANY($6::text[]) AND w.status IN ('packed','handed_over')))
      ORDER BY w.priority DESC,w.due_at ASC NULLS LAST,w.id LIMIT 1001`,
      [
        scope.siteId,
        filter.status ?? null,
        filter.reference ?? null,
        filter.assignment ?? null,
        scope.actor.id,
        scope.roles,
      ],
    )
    return result.rows
  }
}
