import pg from "pg"
export type Tx = pg.PoolClient
export type Database = pg.Pool

export function openDatabase(value: string | undefined, role: "app" | "owner", environment: string | undefined) {
  if (!value || (environment !== "it" && environment !== "test")) {
    throw new Error("Select the isolated OrderFlow IT or test environment.")
  }
  const url = new URL(value)
  if (
    url.protocol !== "postgresql:" ||
    url.hostname !== "127.0.0.1" ||
    url.port !== "5763" ||
    url.username !== `orderflow_${role}` ||
    !url.password ||
    url.pathname !== `/orderflow_${environment}` ||
    url.search ||
    url.hash
  )
    throw new Error("Expected an OrderFlow-specific loopback connection.")
  return new pg.Pool({
    connectionString: value,
    max: 8,
    connectionTimeoutMillis: 2200,
    idleTimeoutMillis: 10000,
    statement_timeout: 4000,
    lock_timeout: 2500,
    idle_in_transaction_session_timeout: 5000,
  })
}

export async function transact<T>(db: Database, operation: (tx: Tx) => Promise<T>, snapshot = false) {
  const tx = await db.connect()
  let discard = false
  try {
    await tx.query(snapshot ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN")
    const result = await operation(tx)
    await tx.query("COMMIT")
    return result
  } catch (error) {
    try {
      await tx.query("ROLLBACK")
    } catch {
      discard = true
    }
    throw error
  } finally {
    tx.release(discard)
  }
}
