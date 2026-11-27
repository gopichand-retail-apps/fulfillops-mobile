import { randomUUID } from "node:crypto"
import type { Role } from "../../shared/contracts.ts"
import { type Database, transact } from "../db.ts"
import { allow } from "../failure.ts"
import { digest, hashPassword, token } from "./credentials.ts"

export async function bootstrap(
  db: Database,
  input: { business: string; site: string; timeZone: string; loginId: string; password: string },
) {
  new Intl.DateTimeFormat("en", { timeZone: input.timeZone }).format()
  const hash = await hashPassword(input.password)
  return transact(db, async (tx) => {
    const businessId = randomUUID()
    const siteId = randomUUID()
    const personId = randomUUID()
    const first = await tx.query(
      "INSERT INTO business (id,name,deployment_singleton) VALUES ($1,$2,true) ON CONFLICT DO NOTHING",
      [businessId, input.business],
    )
    allow(first.rowCount, "ALREADY_BOOTSTRAPPED")
    await tx.query("INSERT INTO site (id,business_id,name,time_zone) VALUES ($1,$2,$3,$4)", [
      siteId,
      businessId,
      input.site,
      input.timeZone,
    ])
    await tx.query("INSERT INTO person (id,login_id,password_hash) VALUES ($1,$2,$3)", [
      personId,
      input.loginId,
      hash,
    ])
    await tx.query("INSERT INTO membership (site_id,person_id,roles) VALUES ($1,$2,ARRAY['owner'])", [
      siteId,
      personId,
    ])
    return { businessId, siteId, personId }
  })
}

export async function invite(
  db: Database,
  options: { siteId: string; loginId: string; roles: Role[]; lifetimeSeconds?: number },
) {
  allow(!options.roles.includes("owner"), "OWNER_GRANT_REQUIRES_RECOVERY", 403)
  const value = token()
  await db.query(
    `INSERT INTO invitation (digest,site_id,login_id,roles,expires_at)
    VALUES ($1,$2,$3,$4,clock_timestamp()+make_interval(secs => $5))`,
    [digest(value), options.siteId, options.loginId, options.roles, options.lifetimeSeconds ?? 1800],
  )
  return value
}

export async function revoke(db: Database, siteId: string, loginId: string) {
  return transact(db, async (tx) => {
    const row = (
      await tx.query<{ person_id: string; roles: Role[] }>(
        `SELECT m.person_id,m.roles FROM membership m JOIN person p ON p.id=m.person_id
      WHERE m.site_id=$1 AND p.login_id=$2 AND m.revoked_at IS NULL FOR UPDATE OF m`,
        [siteId, loginId],
      )
    ).rows[0]
    allow(row, "SCOPE_UNAVAILABLE", 404)
    allow(!row.roles.includes("owner"), "LAST_OWNER_PROTECTED")
    await tx.query("UPDATE membership SET revoked_at=clock_timestamp() WHERE site_id=$1 AND person_id=$2", [
      siteId,
      row.person_id,
    ])
    await tx.query("DELETE FROM staff_session WHERE person_id=$1", [row.person_id])
  })
}
