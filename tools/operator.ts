import { readFile, writeFile } from "node:fs/promises"
import { z } from "zod"
import { openDatabase } from "../server/db.ts"
import { bootstrap, invite, revoke } from "../server/identity/operator.ts"
import { role, signInInput, uuid } from "../shared/contracts.ts"

const [action, a, b, c, d] = process.argv.slice(2)
const db = openDatabase(process.env.ORDERFLOW_MIGRATION_URL, "owner", process.env.ORDERFLOW_ENV)
try {
  const label = z.string().trim().min(1).max(100)
  if (action === "bootstrap") {
    const password = (await readFile(".local/owner-password.txt", "utf8")).trim()
    const params = signInInput.extend({ password: z.string().min(12).max(256) }).parse({ loginId: d, password })
    console.log(
      await bootstrap(db, { business: label.parse(a), site: label.parse(b), timeZone: label.parse(c), ...params }),
    )
  } else if (action === "invite") {
    const siteId = uuid.parse(a)
    const loginId = signInInput.shape.loginId.parse(b)
    const roles = z.array(role).min(1).max(5).parse(c?.split(","))
    const code = await invite(db, { siteId, loginId, roles })
    await writeFile(`.local/invitation-${loginId}.txt`, `${code}\n`, { flag: "wx" })
    console.log("Invitation created in the private .local directory.")
  } else if (action === "revoke") {
    await revoke(db, uuid.parse(a), signInInput.shape.loginId.parse(b))
    console.log("Membership revoked.")
  } else {
    throw new Error(
      "Use bootstrap <business> <site> <zone> <login>, invite <site> <login> <roles>, or revoke <site> <login>.",
    )
  }
} finally {
  await db.end()
}
