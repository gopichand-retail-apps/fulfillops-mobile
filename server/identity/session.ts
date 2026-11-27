import { randomUUID } from "node:crypto"
import type { z } from "zod"
import type { inviteInput, Role, signInInput } from "../../shared/contracts.ts"
import { type Database, transact } from "../db.ts"
import { allow, Failure } from "../failure.ts"
import { digest, hashPassword, token, verifyPassword } from "./credentials.ts"

export type Actor = { id: string; sessionId: string }
export type Scope = { siteId: string; businessId: string; roles: Role[]; actor: Actor }

export async function signIn(db: Database, input: z.infer<typeof signInInput>) {
  const found = await db.query<{ id: string; password_hash: string }>(
    "SELECT id,password_hash FROM person WHERE login_id=$1 AND disabled_at IS NULL",
    [input.loginId],
  )
  const account = found.rows[0]
  const okay = await verifyPassword(input.password, account?.password_hash)
  allow(okay && account, "INVALID_CREDENTIALS", 401)
  const sessionToken = token()
  const result = await db.query<{ expires_at: Date }>(
    "INSERT INTO staff_session (digest,person_id,expires_at) VALUES ($1,$2,clock_timestamp()+interval '12 hours') RETURNING expires_at",
    [digest(sessionToken), account.id],
  )
  return { token: sessionToken, expiresAt: result.rows[0]?.expires_at.toISOString() }
}

export async function enroll(db: Database, input: z.infer<typeof inviteInput>) {
  const key = digest(input.invitation)
  const canEnroll = await db.query(
    "SELECT 1 FROM invitation WHERE digest=$1 AND used_at IS NULL AND expires_at>clock_timestamp()",
    [key],
  )
  allow(canEnroll.rowCount, "INVITATION_UNAVAILABLE", 409)
  const hash = await hashPassword(input.password)
  return transact(db, async (tx) => {
    const invitation = (
      await tx.query<{ site_id: string; login_id: string; roles: Role[] }>(
        "UPDATE invitation SET used_at=clock_timestamp() WHERE digest=$1 AND used_at IS NULL AND expires_at>clock_timestamp() RETURNING site_id,login_id,roles",
        [key],
      )
    ).rows[0]
    allow(invitation, "INVITATION_UNAVAILABLE", 409)
    const id = randomUUID()
    const applied = await tx.query(
      "INSERT INTO person (id,login_id,password_hash) VALUES ($1,$2,$3) ON CONFLICT (login_id) DO NOTHING",
      [id, invitation.login_id, hash],
    )
    allow(applied.rowCount, "INVITATION_UNAVAILABLE", 409)
    await tx.query("INSERT INTO membership (site_id,person_id,roles) VALUES ($1,$2,$3)", [
      invitation.site_id,
      id,
      invitation.roles,
    ])
    return { personId: id }
  })
}

export async function authenticate(db: Database, authorization: string | undefined): Promise<Actor> {
  const value = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization ?? "")?.[1]
  if (!value) throw new Failure(401, "UNAUTHENTICATED")
  const id = digest(value)
  const result = await db.query<{ person_id: string }>(
    `UPDATE staff_session s SET last_seen_at=clock_timestamp()
    FROM person p WHERE s.digest=$1 AND s.person_id=p.id AND p.disabled_at IS NULL
    AND s.expires_at>clock_timestamp() AND s.last_seen_at>clock_timestamp()-interval '30 minutes' RETURNING s.person_id`,
    [id],
  )
  const actor = result.rows[0]
  allow(actor, "UNAUTHENTICATED", 401)
  return { id: actor.person_id, sessionId: id }
}

export async function listSites(db: Database, actor: Actor) {
  const result = await db.query(
    `SELECT s.id,s.name,s.time_zone AS "timeZone",m.roles FROM membership m
    JOIN site s ON s.id=m.site_id WHERE m.person_id=$1 AND m.revoked_at IS NULL ORDER BY s.name,s.id LIMIT 100`,
    [actor.id],
  )
  return { sites: result.rows }
}

export async function authorize(db: Database, actor: Actor, siteId: string): Promise<Scope> {
  const result = await db.query<{ business_id: string; roles: Role[] }>(
    `SELECT s.business_id,m.roles FROM membership m
    JOIN site s ON s.id=m.site_id WHERE m.person_id=$1 AND m.site_id=$2 AND m.revoked_at IS NULL`,
    [actor.id, siteId],
  )
  const grant = result.rows[0]
  allow(grant, "SCOPE_UNAVAILABLE", 404)
  return { siteId, businessId: grant.business_id, roles: grant.roles, actor }
}

export async function signOut(db: Database, actor: Actor) {
  await db.query("DELETE FROM staff_session WHERE digest=$1", [actor.sessionId])
}
