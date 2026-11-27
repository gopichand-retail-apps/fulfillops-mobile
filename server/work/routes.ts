import type { z } from "zod"
import type { Role } from "../../shared/contracts.ts"
import * as schemas from "../../shared/contracts.ts"
import type { Database, Tx } from "../db.ts"
import { check, Failure } from "../failure.ts"
import type { Scope } from "../identity/session.ts"
import { changeWork, createRelease, getReceipt, type Outcome } from "./commands.ts"
import { WorkQueue } from "./queue.ts"
import { readDetail, type Work } from "./records.ts"
import { readReport } from "./reports.ts"
import { openReturn, progressReturn } from "./returns.ts"
import * as transition from "./transitions.ts"

type Context = { tx: Tx; work: Work; scope: Scope }
type CommandRoute = {
  name: string
  roles: Role[]
  path: RegExp
  transition: (context: Context, path: string | undefined, body: unknown) => Promise<Outcome>
  parse: (body: unknown) => { expectedVersion: number }
}
function command<T extends { expectedVersion: number }>(
  config: { name: string; roles: Role[]; path: RegExp; schema: z.ZodType<T> },
  invoke: (context: Context, path: string, body: T) => Promise<Outcome>,
): CommandRoute {
  return {
    ...config,
    parse: (body) => check(config.schema, body),
    transition: (context, id, body) => invoke(context, id ?? "", check(config.schema, body)),
  }
}
const routes: CommandRoute[] = [
  command({ name: "work.claim", roles: ["picker"], path: /^claim$/, schema: schemas.expected }, transition.claim),
  command(
    { name: "claim.release", roles: ["picker"], path: /^claim\/release$/, schema: schemas.releaseClaim },
    (c, _, b) => transition.releaseClaim(c, b),
  ),
  command(
    { name: "claim.reassign", roles: ["supervisor"], path: /^claim\/reassign$/, schema: schemas.reassign },
    (c, _, b) => transition.reassign(c, b),
  ),
  command(
    { name: "line.pick", roles: ["picker"], path: /^lines\/([^/]+)\/picks$/, schema: schemas.pick },
    transition.pick,
  ),
  command(
    { name: "line.shortage", roles: ["picker"], path: /^lines\/([^/]+)\/shortages$/, schema: schemas.shortage },
    transition.reportShortage,
  ),
  command(
    {
      name: "shortage.resolve",
      roles: ["supervisor"],
      path: /^shortages\/([^/]+)\/resolve$/,
      schema: schemas.resolution,
    },
    transition.resolve,
  ),
  command({ name: "work.pack", roles: ["packer"], path: /^packages$/, schema: schemas.packing }, (c, _, b) =>
    transition.pack(c, b),
  ),
  command({ name: "work.handoff", roles: ["handoff"], path: /^handoffs$/, schema: schemas.handoff }, (c, _, b) =>
    transition.handoff(c, b),
  ),
  command({ name: "work.cancel", roles: ["supervisor"], path: /^cancel$/, schema: schemas.cancel }, (c, _, b) =>
    transition.cancel(c, b),
  ),
  command(
    { name: "return.open", roles: ["handoff", "supervisor"], path: /^returns$/, schema: schemas.requestReturn },
    (c, _, b) => openReturn(c, b),
  ),
  command(
    { name: "return.receive", roles: ["handoff"], path: /^returns\/([^/]+)\/receive$/, schema: schemas.expected },
    (c, id) => progressReturn(c, id, { step: "receive" }),
  ),
  command(
    {
      name: "return.inspect",
      roles: ["handoff"],
      path: /^returns\/([^/]+)\/inspections$/,
      schema: schemas.inspect,
    },
    (c, id, body) => progressReturn(c, id, { step: "inspect", body }),
  ),
  command(
    {
      name: "return.disposition",
      roles: ["supervisor"],
      path: /^returns\/([^/]+)\/disposition$/,
      schema: schemas.disposition,
    },
    (c, id, body) => progressReturn(c, id, { step: "disposition", body }),
  ),
]
const rolesFor = (name: string): Role[] =>
  name === "release.create" ? ["supervisor"] : (routes.find((route) => route.name === name)?.roles ?? [])

export function fulfillment(db: Database) {
  const queue = new WorkQueue()
  return async (exchange: {
    method: string
    tail: string
    scope: Scope
    query: URLSearchParams
    body: () => Promise<unknown>
    operation: () => string
    correlationId: string
  }) => {
    const { method, tail, scope } = exchange
    if (method === "GET" && tail === "work")
      return { status: 200, data: await queue.list(db, scope, exchange.query) }
    if (method === "GET" && tail === "report") return { status: 200, data: await readReport(db, scope) }
    const work = /^work\/([^/]+)(?:\/(.+))?$/.exec(tail)
    const operation = /^operations\/([^/]+)$/.exec(tail)
    if (method === "GET" && work && !work[2])
      return { status: 200, data: await readDetail(db, scope, check(schemas.uuid, work[1])) }
    if (method === "GET" && operation)
      return { status: 200, data: await getReceipt(db, scope, check(schemas.uuid, operation[1]), rolesFor) }
    if (method === "POST" && tail === "releases") {
      const body = check(schemas.releaseInput, await exchange.body())
      const data = await createRelease(
        db,
        {
          scope,
          key: exchange.operation(),
          correlationId: exchange.correlationId,
          name: "release.create",
          permission: ["supervisor"],
        },
        body,
      )
      return { status: 201, data }
    }
    if (method === "POST" && work?.[2]) {
      const tail = work[2]
      const route = routes.find((item) => item.path.test(tail))
      if (route) {
        const id = route.path.exec(tail)?.[1]
        const resource = id ? check(schemas.uuid, id) : undefined
        const body = route.parse(await exchange.body())
        const command = {
          scope,
          key: exchange.operation(),
          correlationId: exchange.correlationId,
          name: route.name,
          permission: route.roles,
          workId: check(schemas.uuid, work[1]),
          expectedVersion: body.expectedVersion,
        }
        const data = await changeWork(db, command, { resource, body }, (tx, w) =>
          route.transition({ tx, work: w, scope }, resource, body),
        )
        return { status: 201, data }
      }
    }
    throw new Failure(404, "ROUTE_UNAVAILABLE")
  }
}
