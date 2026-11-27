import { randomUUID } from "expo-crypto"
import * as SecureStore from "expo-secure-store"
import { openDatabaseAsync } from "expo-sqlite"
import { z } from "zod"
import { receipt } from "../../shared/contracts"
import { ApiError, origin, request, sitePath } from "./client"

const loginSchema = z.object({ login: z.string(), token: z.string(), expiresAt: z.string() })
export type Login = z.infer<typeof loginSchema>
const sessionKey = "orderflow-session-v1"

export async function storedLogin() {
  const raw = await SecureStore.getItemAsync(sessionKey)
  if (!raw) return undefined
  const result = loginSchema.safeParse(JSON.parse(raw))
  return result.success ? result.data : undefined
}
export function storeLogin(login: Login) {
  return SecureStore.setItemAsync(sessionKey, JSON.stringify(login), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  })
}
export const forgetLogin = () => SecureStore.deleteItemAsync(sessionKey)

const pendingSchema = z.object({ key: z.uuid(), tail: z.string(), payload: z.unknown(), createdAt: z.number() })
export type Pending = z.infer<typeof pendingSchema>
const database = async () => {
  const db = await openDatabaseAsync("orderflow-it-v1.db")
  await db.execAsync(
    "CREATE TABLE IF NOT EXISTS local_state (scope TEXT, item TEXT, json TEXT NOT NULL, PRIMARY KEY(scope,item));",
  )
  return db
}
export const userScope = (login: Login) => `${JSON.stringify([origin, login.login])}|`
export const siteScope = (login: Login, siteId: string) => userScope(login) + siteId

export async function getLocal(scope: string, item: string): Promise<unknown> {
  const db = await database()
  try {
    const row = await db.getFirstAsync<{ json: string }>(
      "SELECT json FROM local_state WHERE scope=? AND item=?",
      scope,
      item,
    )
    return row ? JSON.parse(row.json) : undefined
  } finally {
    await db.closeAsync()
  }
}
export async function saveLocal(scope: string, item: string, data: unknown) {
  const db = await database()
  try {
    await db.runAsync(
      `INSERT INTO local_state(scope,item,json) VALUES (?,?,?)
      ON CONFLICT(scope,item) DO UPDATE SET json=excluded.json`,
      scope,
      item,
      JSON.stringify(data),
    )
  } finally {
    await db.closeAsync()
  }
}
export async function clearLocal(scope: string, item: string) {
  const db = await database()
  try {
    await db.runAsync("DELETE FROM local_state WHERE scope=? AND item=?", scope, item)
  } finally {
    await db.closeAsync()
  }
}
export async function deleteScopeIfSettled(login: Login, discardDrafts = false) {
  const prefix = userScope(login)
  const db = await database()
  try {
    const row = await db.getFirstAsync(
      "SELECT 1 FROM local_state WHERE substr(scope,1,?)=? AND item LIKE 'pending:%' LIMIT 1",
      prefix.length,
      prefix,
    )
    if (row) return "pending"
    if (!discardDrafts) {
      const draft = await db.getFirstAsync(
        "SELECT 1 FROM local_state WHERE substr(scope,1,?)=? AND item LIKE 'draft:%' LIMIT 1",
        prefix.length,
        prefix,
      )
      if (draft) return "draft"
    }
    await db.runAsync("DELETE FROM local_state WHERE substr(scope,1,?)=?", prefix.length, prefix)
    return "cleared"
  } finally {
    await db.closeAsync()
  }
}

export async function readPending(scope: string, item: string) {
  const result = pendingSchema.safeParse(await getLocal(scope, `pending:${item}`))
  return result.success ? result.data : undefined
}
export async function sendOperation(options: {
  login: Login
  siteId: string
  item: string
  tail: string
  payload: unknown
  retry?: Pending
}) {
  const scope = siteScope(options.login, options.siteId)
  const index = `pending:${options.item}`
  const previous = await readPending(scope, options.item)
  if (previous && !options.retry) throw new ApiError("TIMEOUT")
  const pending = options.retry ?? {
    key: randomUUID(),
    tail: options.tail,
    payload: options.payload,
    createdAt: Date.now(),
  }
  if (Date.now() - pending.createdAt >= 86400000) throw new ApiError("RECEIPT_WINDOW_EXPIRED")
  await saveLocal(scope, index, pending)
  try {
    const result = await request(sitePath(options.siteId, pending.tail), receipt, {
      token: options.login.token,
      key: pending.key,
      payload: pending.payload,
    })
    await clearLocal(scope, index)
    return result
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.status >= 400 &&
      error.status < 500 &&
      (!options.retry || error.code === "VERSION_CONFLICT" || error.code === "ALREADY_CLAIMED")
    )
      await clearLocal(scope, index)
    throw error
  }
}
export async function recover(options: { login: Login; siteId: string; item: string; pending: Pending }) {
  const { login, siteId, item, pending } = options
  try {
    const result = await request(sitePath(siteId, `operations/${pending.key}`), receipt, { token: login.token })
    await clearLocal(siteScope(login, siteId), `pending:${item}`)
    return result
  } catch (error) {
    if (!(error instanceof ApiError) || error.code !== "RECEIPT_UNAVAILABLE") throw error
    return sendOperation({ login, siteId, item, tail: pending.tail, payload: pending.payload, retry: pending })
  }
}
