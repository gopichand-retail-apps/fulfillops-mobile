import { randomBytes } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import pg from "pg"

const directory = new URL("../.local/", import.meta.url)
const pass = (await readFile(new URL("cluster.setup", directory), "utf8")).trim()
const secret = () => randomBytes(32).toString("base64url")
const db = new pg.Client({
  host: "127.0.0.1",
  port: 5763,
  database: "postgres",
  user: "orderflow_cluster",
  password: pass,
})
await db.connect()
try {
  const app = secret()
  const owner = secret()
  await db.query(`CREATE ROLE orderflow_owner LOGIN PASSWORD ${db.escapeLiteral(owner)};`)
  await db.query(`CREATE ROLE orderflow_app LOGIN PASSWORD ${db.escapeLiteral(app)};`)
  for (const mode of ["it", "test"] as const) {
    await db.query(`CREATE DATABASE orderflow_${mode} OWNER orderflow_owner;`)
    await db.query(`REVOKE CONNECT ON DATABASE orderflow_${mode} FROM PUBLIC;`)
    await db.query(`GRANT CONNECT ON DATABASE orderflow_${mode} TO orderflow_app;`)
    const base = `@127.0.0.1:5763/orderflow_${mode}`
    const values = `ORDERFLOW_ENV=${mode}\nORDERFLOW_DATABASE_URL=postgresql://orderflow_app:${app}${base}\nORDERFLOW_MIGRATION_URL=postgresql://orderflow_owner:${owner}${base}\n`
    const file = mode === "it" ? "connection.env" : "test.env"
    await writeFile(new URL(file, directory), values, { flag: "wx" })
    if (mode === "it")
      await writeFile(
        new URL("operator.env", directory),
        `ORDERFLOW_ENV=it\nORDERFLOW_MIGRATION_URL=postgresql://orderflow_owner:${owner}${base}\n`,
        { flag: "wx" },
      )
  }
} finally {
  await db.end()
}
