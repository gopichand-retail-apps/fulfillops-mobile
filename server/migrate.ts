import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import { type Database, openDatabase, transact } from "./db.ts"

const migrations = ["001-work.sql", "002-inspection.sql"]
export const schemaVersion = migrations.length

export async function migrate(db: Database) {
  await transact(db, async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(5763000)")
    await tx.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, checksum text NOT NULL)",
    )
    const applied = await tx.query<{ version: number; checksum: string }>(
      "SELECT version,checksum FROM schema_migrations ORDER BY version",
    )
    if (applied.rowCount && applied.rowCount > migrations.length)
      throw new Error("OrderFlow database is newer than this application.")
    for (const [index, name] of migrations.entries()) {
      const version = index + 1
      const sql = await readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8")
      const checksum = createHash("sha256").update(sql).digest("hex")
      const prior = applied.rows[index]
      if (!prior) {
        await tx.query(sql)
        await tx.query("INSERT INTO schema_migrations VALUES ($1,$2)", [version, checksum])
      } else if (prior.version !== version || prior.checksum !== checksum) {
        throw new Error(`Migration history mismatch at ${version}.`)
      }
    }
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pool = openDatabase(process.env.ORDERFLOW_MIGRATION_URL, "owner", process.env.ORDERFLOW_ENV)
  try {
    await migrate(pool)
    console.log(`OrderFlow schema ${schemaVersion} ready.`)
  } finally {
    await pool.end()
  }
}
