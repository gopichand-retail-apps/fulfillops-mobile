import { openDatabase } from "./db.ts"
import { createApi } from "./http.ts"

const db = openDatabase(process.env.ORDERFLOW_DATABASE_URL, "app", process.env.ORDERFLOW_ENV)
const port = 5761
const service = createApi(db, { port, log: true })
db.on("error", () => console.error("OrderFlow database idle connection failed."))
service.once("error", async () => {
  console.error("OrderFlow could not bind the selected loopback API port.")
  await db.end()
  process.exitCode = 1
})
service.listen(port, "127.0.0.1", () => console.log(`OrderFlow API http://127.0.0.1:${port}`))
function close() {
  service.close(async () => {
    await db.end()
  })
}
process.once("SIGINT", close)
process.once("SIGTERM", close)
