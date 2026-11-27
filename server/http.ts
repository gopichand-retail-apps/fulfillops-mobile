import { randomUUID } from "node:crypto"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { inviteInput, signInInput, uuid } from "../shared/contracts.ts"
import type { Database } from "./db.ts"
import { allow, check, Failure } from "./failure.ts"
import { authenticate, authorize, enroll, listSites, signIn, signOut } from "./identity/session.ts"
import { schemaVersion } from "./migrate.ts"
import { fulfillment } from "./work/routes.ts"

const limit = 64 * 1024
type Result = { status: number; data?: unknown }
async function readBody(req: IncomingMessage): Promise<unknown> {
  allow(req.headers["content-type"]?.split(";")[0]?.trim() === "application/json", "UNSUPPORTED_MEDIA", 415)
  allow(Number(req.headers["content-length"] ?? 0) <= limit, "BODY_TOO_LARGE", 413)
  const chunks: Buffer[] = []
  let size = 0
  for await (const data of req.iterator({ destroyOnReturn: false })) {
    const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data)
    size += chunk.length
    allow(size <= limit, "BODY_TOO_LARGE", 413)
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks, size).toString("utf8"))
  } catch {
    throw new Failure(400, "INVALID_JSON")
  }
}
function send(res: ServerResponse, status: number, data?: unknown) {
  res.statusCode = status
  if (data !== undefined) {
    res.setHeader("Content-Type", "application/json; charset=utf-8")
    res.end(JSON.stringify(data))
  } else res.end()
}
class Limits {
  private windows = new Map<string, { till: number; count: number }>()
  private running = 0
  enter(key: string, allowance: number) {
    const now = Date.now()
    for (const [id, entry] of this.windows) if (entry.till <= now) this.windows.delete(id)
    let window = this.windows.get(key)
    if (!window) {
      allow(this.windows.size < 1024, "RATE_LIMITED", 429)
      window = { till: now + 60000, count: 0 }
      this.windows.set(key, window)
    }
    allow(window.count < allowance && this.running < 8, "RATE_LIMITED", 429)
    window.count++
    this.running++
    return () => {
      this.running--
    }
  }
}

export function createApi(db: Database, options: { port: number; log?: boolean }) {
  const work = fulfillment(db)
  const ingress = new Limits()
  const identities = new Limits()
  const authed = new Limits()
  async function dispatch(req: IncomingMessage, correlationId: string): Promise<Result> {
    const method = req.method ?? "GET"
    const uri = req.url ?? ""
    allow(uri.startsWith("/") && !uri.startsWith("//") && uri.length <= 2048, "INVALID_PATH", 400)
    const url = new URL(uri, "http://127.0.0.1")
    if (method === "GET" && url.pathname === "/healthz") return { status: 200, data: { status: "ok" } }
    if (method === "GET" && url.pathname === "/readyz") {
      const version = (
        await db.query<{ version: number }>(`SELECT coalesce(max(version),0) AS version FROM schema_migrations`)
      ).rows[0]?.version
      allow(version === schemaVersion, "SCHEMA_UNAVAILABLE", 503)
      return { status: 200, data: { status: "ok" } }
    }
    if (method === "POST" && ["/v1/sessions", "/v1/invitation-redemptions"].includes(url.pathname)) {
      const release = identities.enter("local-auth", 24)
      try {
        const input = await readBody(req)
        const data =
          url.pathname === "/v1/sessions"
            ? await signIn(db, check(signInInput, input))
            : await enroll(db, check(inviteInput, input))
        return { status: 201, data }
      } finally {
        release()
      }
    }
    const actor = await authenticate(db, req.headers.authorization)
    const release = authed.enter(actor.id, 150)
    try {
      if (method === "DELETE" && url.pathname === "/v1/sessions/current") {
        await signOut(db, actor)
        return { status: 204 }
      }
      if (method === "GET" && url.pathname === "/v1/sites")
        return { status: 200, data: await listSites(db, actor) }
      const route = /^\/v1\/sites\/([^/]+)\/(.+)$/.exec(url.pathname)
      allow(route?.[2], "ROUTE_UNAVAILABLE", 404)
      const scope = await authorize(db, actor, check(uuid, route[1]))
      return await work({
        scope,
        method,
        tail: route[2],
        query: url.searchParams,
        correlationId,
        body: () => readBody(req),
        operation: () => check(uuid, req.headers["idempotency-key"]),
      })
    } finally {
      release()
    }
  }

  return createServer({ requestTimeout: 10000, headersTimeout: 6000, maxHeaderSize: 8192 }, async (req, res) => {
    const started = performance.now()
    const correlationId = randomUUID()
    res.setHeader("Cache-Control", "no-store")
    res.setHeader("X-Content-Type-Options", "nosniff")
    res.setHeader("X-Request-Id", correlationId)
    let finish: (() => void) | undefined
    try {
      const port = options.port || (req.socket.localPort ?? 0)
      allow(
        req.headers.host === `127.0.0.1:${port}` &&
          !req.headers.origin &&
          !req.headers["sec-fetch-site"] &&
          !req.headers.forwarded,
        "ORIGIN_UNAVAILABLE",
        403,
      )
      allow(
        (req.headersDistinct.authorization?.length ?? 0) <= 1 &&
          (req.headersDistinct["idempotency-key"]?.length ?? 0) <= 1,
        "INVALID_HEADERS",
        400,
      )
      finish = ingress.enter("loopback", 450)
      const { status, data } = await dispatch(req, correlationId)
      send(res, status, data)
    } catch (error) {
      const failure = error instanceof Failure ? error : new Failure(503, "SERVICE_UNAVAILABLE")
      if (failure.status === 429) res.setHeader("Retry-After", "60")
      if (failure.status === 413) res.setHeader("Connection", "close")
      send(res, failure.status, {
        code: failure.code,
        message: failure.code.replaceAll("_", " ").toLowerCase(),
        correlationId,
        fieldErrors: failure.fields,
        ...failure.context,
      })
    } finally {
      finish?.()
      if (options.log)
        console.log(
          JSON.stringify({
            correlationId,
            status: res.statusCode,
            durationMs: Math.round(performance.now() - started),
          }),
        )
    }
  })
}
