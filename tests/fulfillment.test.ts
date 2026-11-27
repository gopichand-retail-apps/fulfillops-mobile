import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { once } from "node:events"
import type { Server } from "node:http"
import { test } from "node:test"
import { setTimeout as delay } from "node:timers/promises"
import { z } from "zod"
import { type Database, openDatabase } from "../server/db.ts"
import { createApi } from "../server/http.ts"
import { bootstrap, invite, revoke } from "../server/identity/operator.ts"
import * as contract from "../shared/contracts.ts"

const pwd = "OrderFlow-only acceptance credential!"
const operation = () => randomUUID()
async function listen(db: Database) {
  const api = createApi(db, { port: 0 })
  api.listen(0, "127.0.0.1")
  await once(api, "listening")
  const address = api.address()
  assert(address && typeof address !== "string")
  return { api, base: `http://127.0.0.1:${address.port}` }
}
const close = (api: Server) =>
  new Promise<void>((resolve, reject) => api.close((error) => (error ? reject(error) : resolve())))
type Call = {
  path: string
  token?: string
  payload?: unknown
  key?: string
  method?: string
  headers?: Record<string, string>
}
async function call(base: string, input: Call) {
  const headers: Record<string, string> = { ...input.headers }
  if (input.token) headers.Authorization = `Bearer ${input.token}`
  if (input.payload !== undefined) headers["Content-Type"] = "application/json"
  if (input.key) headers["Idempotency-Key"] = input.key
  const response = await fetch(base + input.path, {
    headers,
    method: input.method ?? (input.payload === undefined ? "GET" : "POST"),
    body: input.payload === undefined ? undefined : JSON.stringify(input.payload),
  })
  const data: unknown = response.status === 204 ? undefined : await response.json()
  return { status: response.status, data }
}
function ok<T>(response: Awaited<ReturnType<typeof call>>, schema: z.ZodType<T>, expected = 200) {
  assert.equal(response.status, expected, JSON.stringify(response.data))
  return schema.parse(response.data)
}
function failure(response: Awaited<ReturnType<typeof call>>, status: number, code: string) {
  assert.equal(response.status, status, JSON.stringify(response.data))
  assert.equal(contract.errorBody.parse(response.data).code, code)
}
async function racer(db: Database, workId: string, actions: [() => Promise<unknown>, () => Promise<unknown>]) {
  const gate = await db.connect()
  try {
    await gate.query("BEGIN")
    await gate.query("SELECT 1 FROM work WHERE id=$1 FOR UPDATE", [workId])
    const requests = Promise.all([actions[0](), actions[1]()])
    let overlap = false
    for (let attempt = 0; attempt < 40; attempt++) {
      const waiting = await db.query<{ found: number }>(`SELECT count(*)::int AS found FROM pg_stat_activity
        WHERE usename=current_user AND wait_event_type='Lock' AND query LIKE '%FOR UPDATE OF w%'`)
      if ((waiting.rows[0]?.found ?? 0) >= 2) {
        overlap = true
        break
      }
      await delay(25)
    }
    await gate.query("ROLLBACK")
    const result = await requests
    assert.ok(overlap, "Both command connections must wait on the held aggregate row before release")
    return result
  } finally {
    gate.release()
  }
}

test("isolated PostgreSQL fulfillment, replay and role denial", async (t) => {
  const owner = openDatabase(process.env.ORDERFLOW_MIGRATION_URL, "owner", "test")
  const db = openDatabase(process.env.ORDERFLOW_DATABASE_URL, "app", "test")
  let service = await listen(db)
  t.after(async () => {
    await close(service.api)
    await db.end()
    await owner.end()
  })
  const invoke = (data: Call) => call(service.base, data)
  const testRef = randomUUID()
  const businessId = randomUUID()
  const siteId = randomUUID()
  const otherSite = randomUUID()
  const sitePrefix = `/v1/sites/${siteId}`
  const read = (token: string, path: string) => invoke({ token, path: sitePrefix + path })
  const mutate = (token: string, path: string, payload: unknown, key = operation()) =>
    invoke({ token, path: sitePrefix + path, payload, key })
  const release = (suffix: string) => ({
    sourceReleaseRef: `REL-${testRef}-${suffix}`,
    sourceOrderRef: `WORK-${testRef}-${suffix}`,
    sourceRevision: 1,
    releasedByRef: "IT load manifest",
    observedAt: new Date().toISOString(),
    priority: 3,
    lines: [
      { sourceLineRef: "1", sku: "BX-14", bin: "A-08", unit: "EA", units: 2, barcodeAliases: ["0012345678905"] },
      { sourceLineRef: "2", sku: "LX-22", bin: "A-14", unit: "EA", units: 3 },
    ],
  })
  const ownerInput = {
    business: "Bootstrap acceptance",
    site: "Initial location",
    timeZone: "America/Chicago",
    loginId: "first-owner",
    password: pwd,
  }
  const initial = await owner.query("SELECT 1 FROM business WHERE deployment_singleton")
  if (!initial.rowCount) await bootstrap(owner, ownerInput)
  await assert.rejects(bootstrap(owner, ownerInput), { message: "ALREADY_BOOTSTRAPPED" })
  const first = (
    await owner.query<{ id: string }>(
      `SELECT s.id FROM site s JOIN business b ON b.id=s.business_id WHERE b.deployment_singleton`,
    )
  ).rows[0]
  assert(first)
  await assert.rejects(revoke(owner, first.id, ownerInput.loginId), { message: "LAST_OWNER_PROTECTED" })
  const foreignTenant = ok(
    await invoke({ path: "/v1/sessions", payload: { loginId: ownerInput.loginId, password: pwd } }),
    contract.session,
    201,
  )
  await owner.query("INSERT INTO business (id,name) VALUES ($1,'Synthetic suite')", [businessId])
  await owner.query(
    "INSERT INTO site (id,business_id,name,time_zone) VALUES ($1,$3,'North IT','America/Chicago'),($2,$3,'South IT','America/Chicago')",
    [siteId, otherSite, businessId],
  )
  const enrollment = z.object({ personId: contract.uuid })
  async function staff(name: string, roles: contract.Role[], site = siteId) {
    const loginId = `${name}-${testRef}`
    const invitation = await invite(owner, { siteId: site, loginId, roles })
    const form = { invitation, password: pwd }
    const enrolled = ok(await invoke({ path: "/v1/invitation-redemptions", payload: form }), enrollment, 201)
    const signed = ok(
      await invoke({ path: "/v1/sessions", payload: { loginId, password: pwd } }),
      contract.session,
      201,
    )
    return { ...enrolled, ...signed, loginId, form }
  }

  assert.equal((await invoke({ path: "/readyz" })).status, 200)
  failure(await invoke({ path: "/v1/sites" }), 401, "UNAUTHENTICATED")
  failure(
    await invoke({ path: "/healthz", headers: { Origin: "https://example.invalid" } }),
    403,
    "ORIGIN_UNAVAILABLE",
  )
  const supervisor = await staff("supervisor", ["supervisor"])
  const pickerA = await staff("picker-a", ["picker"])
  const pickerB = await staff("picker-b", ["picker"])
  const packing = await staff("packing", ["packer", "handoff"])
  const receiver = await staff("receiver", ["handoff"])
  const viewer = await staff("viewer", ["support"])
  const outsider = await staff("outsider", ["support"], otherSite)
  await assert.rejects(invite(owner, { siteId, loginId: "another-owner", roles: ["owner"] }), {
    message: "OWNER_GRANT_REQUIRES_RECOVERY",
  })
  await assert.rejects(revoke(owner, siteId, "unknown-staff"), { message: "SCOPE_UNAVAILABLE" })
  failure(
    await invoke({ path: "/v1/sessions", payload: { loginId: "unknown-staff", password: pwd } }),
    401,
    "INVALID_CREDENTIALS",
  )
  const staleInvite = await invite(owner, {
    siteId,
    loginId: `expired-${testRef}`,
    roles: ["picker"],
    lifetimeSeconds: -1,
  })
  failure(
    await invoke({ path: "/v1/invitation-redemptions", payload: { invitation: staleInvite, password: pwd } }),
    409,
    "INVITATION_UNAVAILABLE",
  )
  failure(
    await invoke({ path: "/v1/invitation-redemptions", payload: pickerA.form }),
    409,
    "INVITATION_UNAVAILABLE",
  )
  failure(
    await invoke({ path: "/v1/sessions", payload: { loginId: pickerA.loginId, password: "incorrect" } }),
    401,
    "INVALID_CREDENTIALS",
  )
  assert.equal(ok(await invoke({ path: "/v1/sites", token: pickerA.token }), contract.sites).sites[0]?.id, siteId)

  const releaseKey = operation()
  const input = release("one")
  const accepted = ok(await mutate(supervisor.token, "/releases", input, releaseKey), contract.receipt, 201)
  assert.deepEqual(
    ok(await mutate(supervisor.token, "/releases", input, releaseKey), contract.receipt, 201),
    accepted,
  )
  failure(
    await mutate(supervisor.token, "/releases", { ...input, priority: 4 }, releaseKey),
    409,
    "IDEMPOTENCY_MISMATCH",
  )
  failure(await mutate(supervisor.token, "/releases", input), 409, "RELEASE_CONFLICT")
  const workPath = `/work/${accepted.workId}`
  failure(await read(outsider.token, workPath), 404, "SCOPE_UNAVAILABLE")
  failure(await read(foreignTenant.token, workPath), 404, "SCOPE_UNAVAILABLE")
  failure(await mutate(foreignTenant.token, `${workPath}/claim`, { expectedVersion: 1 }), 404, "SCOPE_UNAVAILABLE")
  failure(await mutate(viewer.token, `${workPath}/claim`, { expectedVersion: 1 }), 403, "FORBIDDEN")
  const detail = ok(await read(supervisor.token, workPath), contract.detail)
  assert.equal(detail.lines?.length, 2)
  const support = ok(await read(viewer.token, workPath), contract.detail)
  assert.equal(support.lines, undefined)
  assert.equal(support.history[0]?.actorRef, undefined)
  const releaseTwo = ok(await mutate(supervisor.token, "/releases", release("two")), contract.receipt, 201)
  const firstPage = ok(await read(supervisor.token, "/work?limit=1"), contract.page)
  assert(firstPage.nextCursor)
  const secondPage = ok(
    await read(supervisor.token, `/work?limit=1&cursor=${firstPage.nextCursor}`),
    contract.page,
  )
  assert.notEqual(firstPage.items[0]?.id, secondPage.items[0]?.id)
  failure(await read(supervisor.token, "/work?limit=1&limit=2"), 400, "INVALID_QUERY")
  failure(await read(supervisor.token, "/work?limit=1&cursor=wrong.10"), 409, "CURSOR_EXPIRED")
  assert.equal(ok(await read(supervisor.token, "/work?limit=1&status=packed"), contract.page).items.length, 0)
  assert.equal(ok(await read(pickerA.token, "/work?assignment=available"), contract.page).items.length, 2)
  failure(await read(viewer.token, `/work?limit=1&cursor=${firstPage.nextCursor}`), 409, "CURSOR_EXPIRED")

  const aKey = operation()
  const bKey = operation()
  const raced = z
    .array(z.object({ status: z.number(), data: z.unknown() }))
    .length(2)
    .parse(
      await racer(db, accepted.workId, [
        () => mutate(pickerA.token, `${workPath}/claim`, { expectedVersion: 1 }, aKey),
        () => mutate(pickerB.token, `${workPath}/claim`, { expectedVersion: 1 }, bKey),
      ]),
    )
  const firstWin = raced[0]?.status === 201
  const won = raced[firstWin ? 0 : 1]
  const lost = raced[firstWin ? 1 : 0]
  assert(won && lost)
  const winner = firstWin ? pickerA : pickerB
  const loser = firstWin ? pickerB : pickerA
  const wonKey = firstWin ? aKey : bKey
  const claim = ok(won, contract.receipt, 201)
  assert.equal(claim.claim?.assigneeRef, winner.personId)
  failure(lost, 409, "ALREADY_CLAIMED")
  failure(await read(loser.token, workPath), 404, "WORK_UNAVAILABLE")
  await close(service.api)
  service = await listen(db)
  assert.deepEqual(ok(await read(winner.token, `/operations/${wonKey}`), contract.receipt), claim)
  assert.deepEqual(
    ok(await mutate(winner.token, `${workPath}/claim`, { expectedVersion: 1 }, wonKey), contract.receipt, 201),
    claim,
  )
  failure(await read(loser.token, `/operations/${wonKey}`), 404, "RECEIPT_UNAVAILABLE")
  assert.equal(
    ok(await read(winner.token, workPath), contract.detail).history.filter((value) => value.type === "work.claim")
      .length,
    1,
  )
  assert.equal(ok(await read(supervisor.token, workPath), contract.detail).claim?.assigneeRef, winner.personId)

  const [lineA, lineB] = detail.lines ?? []
  const claimId = claim.claim?.id
  assert(lineA && lineB && claimId)
  const pick = (lineId: string, productRef: string, pickedEach: number, expectedVersion: number) =>
    mutate(winner.token, `${workPath}/lines/${lineId}/picks`, {
      claimId,
      productRef,
      pickedEach,
      expectedVersion,
      source: "manual",
    })
  failure(await pick(lineA.id, "incorrect", 1, 2), 422, "WRONG_PRODUCT")
  failure(await pick(lineA.id, "BX-14", 3, 2), 422, "QUANTITY_EXCEEDS_REMAINING")
  failure(
    await mutate(packing.token, `${workPath}/packages`, {
      expectedVersion: 2,
      reference: "BOX",
      contents: [{ lineId: lineA.id, units: 1 }],
    }),
    409,
    "TRANSITION_DENIED",
  )
  assert.equal(ok(await pick(lineA.id, "0012345678905", 1, 2), contract.receipt, 201).status, "picking")
  const shortage = ok(
    await mutate(winner.token, `${workPath}/lines/${lineA.id}/shortages`, {
      claimId,
      units: 1,
      reason: "Bin short",
      expectedVersion: 3,
    }),
    contract.receipt,
    201,
  )
  assert.equal(shortage.status, "exception")
  assert.equal(
    ok(
      await mutate(supervisor.token, `${workPath}/shortages/${shortage.recordId}/resolve`, {
        expectedVersion: 4,
        decision: "partial",
        reason: "Release remaining verified stock",
      }),
      contract.receipt,
      201,
    ).status,
    "picking",
  )
  assert.equal(ok(await pick(lineB.id, "LX-22", 3, 5), contract.receipt, 201).status, "picked")

  const packaged = ok(
    await mutate(packing.token, `${workPath}/packages`, {
      expectedVersion: 6,
      reference: "BOX-13",
      contents: [
        { lineId: lineA.id, units: 1 },
        { lineId: lineB.id, units: 3 },
      ],
    }),
    contract.receipt,
    201,
  )
  assert.equal(packaged.status, "packed")
  assert.deepEqual(ok(await read(receiver.token, workPath), contract.detail).allowedActions, ["handoff"])
  const handoff = {
    expectedVersion: 7,
    packageId: packaged.recordId,
    pickupRef: "LOCAL-01",
    method: "pickup",
    observed: true,
    observedAt: new Date().toISOString(),
  }
  const handed = ok(await mutate(packing.token, `${workPath}/handoffs`, handoff), contract.receipt, 201)
  assert.equal(handed.status, "handed_over")
  failure(
    await mutate(supervisor.token, `${workPath}/cancel`, {
      expectedVersion: 7,
      reason: "late",
      physicalDisposition: "held",
    }),
    409,
    "VERSION_CONFLICT",
  )
  const returnPath = `${workPath}/returns`
  const returnInput = { expectedVersion: 8, lineId: lineA.id, units: 1, reason: "Intake" }
  const competingReturns = z
    .array(z.object({ status: z.number(), data: z.unknown() }))
    .parse(
      await racer(db, accepted.workId, [
        () => mutate(supervisor.token, returnPath, returnInput),
        () => mutate(receiver.token, returnPath, returnInput),
      ]),
    )
  assert.deepEqual(competingReturns.map((result) => result.status).sort(), [201, 409])
  const committedReturn = competingReturns.find((entry) => entry.status === 201)
  assert(committedReturn)
  const returnOne = ok(committedReturn, contract.receipt, 201)
  failure(
    await mutate(packing.token, returnPath, {
      expectedVersion: 9,
      lineId: lineA.id,
      units: 1,
      reason: "Duplicate",
    }),
    422,
    "RETURN_CAPACITY_EXCEEDED",
  )
  const ret = `${returnPath}/${returnOne.recordId}`
  ok(await mutate(packing.token, `${ret}/receive`, { expectedVersion: 9 }), contract.receipt, 201)
  ok(
    await mutate(packing.token, `${ret}/inspections`, {
      expectedVersion: 10,
      condition: "damaged",
      reason: "Torn package",
    }),
    contract.receipt,
    201,
  )
  failure(
    await mutate(supervisor.token, `${ret}/disposition`, {
      expectedVersion: 11,
      disposition: "restock_eligible",
      reason: "Wrong grade",
    }),
    409,
    "RETURN_TRANSITION_DENIED",
  )
  ok(
    await mutate(supervisor.token, `${ret}/disposition`, {
      expectedVersion: 11,
      disposition: "quarantine",
      reason: "Damage",
    }),
    contract.receipt,
    201,
  )
  assert.equal(ok(await read(supervisor.token, workPath), contract.detail).returns?.[0]?.disposition, "quarantine")
  const otherPath = `/work/${releaseTwo.workId}`
  const startClaim = ok(
    await mutate(pickerA.token, `${otherPath}/claim`, { expectedVersion: 1 }),
    contract.receipt,
    201,
  )
  const startedClaimId = startClaim.claim?.id
  assert(startedClaimId)
  failure(
    await mutate(pickerB.token, `${otherPath}/claim/release`, {
      claimId: startedClaimId,
      expectedVersion: 2,
      reason: "Not mine",
    }),
    403,
    "CLAIM_NOT_OWNED",
  )
  assert.equal(
    ok(
      await mutate(pickerA.token, `${otherPath}/claim/release`, {
        claimId: startedClaimId,
        expectedVersion: 2,
        reason: "Break",
      }),
      contract.receipt,
      201,
    ).status,
    "released",
  )
  const newClaim = ok(
    await mutate(pickerB.token, `${otherPath}/claim`, { expectedVersion: 3 }),
    contract.receipt,
    201,
  )
  const next = ok(
    await mutate(supervisor.token, `${otherPath}/claim/reassign`, {
      claimId: newClaim.claim?.id,
      expectedVersion: 4,
      assigneeRef: pickerA.personId,
      reason: "Next shift",
    }),
    contract.receipt,
    201,
  )
  const current = ok(await read(pickerA.token, otherPath), contract.detail)
  const [a, b] = current.lines ?? []
  assert(a && b && next.claim)
  for (const [index, line] of [a, b].entries()) {
    ok(
      await mutate(pickerA.token, `${otherPath}/lines/${line.id}/picks`, {
        claimId: next.claim.id,
        expectedVersion: 5 + index,
        productRef: line.sku,
        pickedEach: line.approvedUnits,
        source: "manual",
      }),
      contract.receipt,
      201,
    )
  }
  const box = ok(
    await mutate(packing.token, `${otherPath}/packages`, {
      expectedVersion: 7,
      reference: "RACE-BOX",
      contents: [a, b].map((line) => ({ lineId: line.id, units: line.approvedUnits })),
    }),
    contract.receipt,
    201,
  )
  const finalRace = z.array(z.object({ status: z.number(), data: z.unknown() })).parse(
    await racer(db, releaseTwo.workId, [
      () =>
        mutate(supervisor.token, `${otherPath}/cancel`, {
          expectedVersion: 8,
          reason: "Cancelled",
          physicalDisposition: "Package held",
        }),
      () =>
        mutate(packing.token, `${otherPath}/handoffs`, {
          expectedVersion: 8,
          packageId: box.recordId,
          pickupRef: "RACE-HANDOFF",
          method: "pickup",
          observed: true,
          observedAt: new Date().toISOString(),
        }),
    ]),
  )
  assert.deepEqual(finalRace.map((result) => result.status).sort(), [201, 409])
  const finished = ok(await read(supervisor.token, otherPath), contract.detail)
  assert.equal(finished.history.filter((item) => ["work.cancel", "work.handoff"].includes(item.type)).length, 1)
  const report = ok(await read(supervisor.token, "/report"), contract.report)
  assert.equal(report.pickedUnits, 9)
  assert.equal(report.shortageUnits, 1)
  assert.equal(report.unresolvedReturnUnits, 0)
  assert.equal(report.timeZone, "America/Chicago")
  failure(await read(viewer.token, "/report"), 403, "FORBIDDEN")
  await owner.query(
    `INSERT INTO work(id,site_id,business_id,source_release,source_order,source_revision,
    release_authority,observed_at,priority)
    SELECT gen_random_uuid(),$1,$2,$3||n::text,$3||n::text,1,'isolated capacity fixture',clock_timestamp(),1
    FROM generate_series(1,1001) n`,
    [siteId, businessId, testRef],
  )
  const bounded = ok(await read(supervisor.token, "/work?limit=100"), contract.page)
  assert.equal(bounded.items.length, 100)
  assert.equal(bounded.truncated, true)
  assert.ok(bounded.nextCursor)
  for (const limit of [20, 21, 22, 23]) await read(supervisor.token, `/work?limit=${limit}`)
  failure(await read(supervisor.token, `/work?limit=100&cursor=${bounded.nextCursor}`), 409, "CURSOR_EXPIRED")
  await revoke(owner, siteId, winner.loginId)
  failure(await read(winner.token, `/operations/${wonKey}`), 401, "UNAUTHENTICATED")
  assert.equal((await invoke({ path: "/v1/sessions/current", token: viewer.token, method: "DELETE" })).status, 204)
  failure(await read(viewer.token, workPath), 401, "UNAUTHENTICATED")
})
