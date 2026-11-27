import type { Database } from "../db.ts"
import { allow } from "../failure.ts"
import type { Scope } from "../identity/session.ts"

export async function readReport(db: Database, scope: Scope) {
  allow(scope.roles.includes("supervisor"), "FORBIDDEN", 403)
  const result = await db.query<{
    timeZone: string
    asOf: Date
    from: Date
    oldestReleasedAt: Date | null
    pickedUnits: number
    shortageUnits: number
    averageHandoffMinutes: number | null
    unresolvedReturnUnits: number
  }>(
    `WITH boundary AS (
      SELECT time_zone, clock_timestamp() AS observed,
        (date_trunc('day', clock_timestamp() AT TIME ZONE time_zone) - interval '6 days') AT TIME ZONE time_zone AS cutoff
      FROM site WHERE id=$1
    )
    SELECT time_zone AS "timeZone", observed AS "asOf", cutoff AS "from",
      (SELECT min(released_at) FROM work WHERE site_id=$1 AND status='released') AS "oldestReleasedAt",
      (SELECT coalesce(sum((details->>'units')::int),0)::int FROM work_event e JOIN work w ON w.id=e.work_id
        WHERE w.site_id=$1 AND e.at>=cutoff AND e.type='line.pick') AS "pickedUnits",
      (SELECT coalesce(sum((details->>'units')::int),0)::int FROM work_event e JOIN work w ON w.id=e.work_id
        WHERE w.site_id=$1 AND e.at>=cutoff AND e.type='line.shortage') AS "shortageUnits",
      (SELECT round(avg(extract(epoch FROM h.observed_at-w.released_at)/60),1)::float8
        FROM handoff h JOIN work w ON w.id=h.work_id WHERE w.site_id=$1
        AND h.observed_at>=cutoff AND h.observed_at<=observed) AS "averageHandoffMinutes",
      (SELECT coalesce(sum(r.requested_units),0)::int FROM return_line r JOIN work w ON w.id=r.work_id
        WHERE w.site_id=$1 AND r.status<>'dispositioned') AS "unresolvedReturnUnits"
    FROM boundary`,
    [scope.siteId],
  )
  allow(result.rows[0], "SCOPE_UNAVAILABLE", 404)
  return result.rows[0]
}
