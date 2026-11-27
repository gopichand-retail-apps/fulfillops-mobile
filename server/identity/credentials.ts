import { argon2, createHash, randomBytes, timingSafeEqual } from "node:crypto"

export const digest = (value: string) => createHash("sha256").update(value).digest("hex")
export const token = () => randomBytes(32).toString("base64url")

function derive(message: string, nonce: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    argon2(
      "argon2id",
      { message, nonce, memory: 65536, passes: 3, parallelism: 1, tagLength: 32 },
      (error, key) => {
        if (error) reject(error)
        else resolve(key)
      },
    )
  })
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16)
  return `argon2id-v1:${salt.toString("hex")}:${(await derive(password, salt)).toString("hex")}`
}
export async function verifyPassword(password: string, stored?: string) {
  const [scheme, salt = "", key = ""] = stored?.split(":") ?? []
  const valid = scheme === "argon2id-v1" && /^[0-9a-f]{32}$/.test(salt) && /^[0-9a-f]{64}$/.test(key)
  const candidate = await derive(password, valid ? Buffer.from(salt, "hex") : Buffer.alloc(16))
  return valid && timingSafeEqual(candidate, Buffer.from(key, "hex"))
}
