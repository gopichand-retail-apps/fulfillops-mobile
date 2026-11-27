import type { z } from "zod"

export class Failure extends Error {
  readonly status: number
  readonly code: string
  readonly fields?: { field: string; code: string }[]
  readonly context?: Record<string, unknown>
  constructor(status: number, code: string, fields?: Failure["fields"], context?: Failure["context"]) {
    super(code)
    this.status = status
    this.code = code
    this.fields = fields
    this.context = context
  }
}

export function check<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    throw new Failure(
      422,
      "INVALID_INPUT",
      parsed.error.issues.slice(0, 30).map((issue) => ({
        field: issue.path.join("."),
        code: issue.code,
      })),
    )
  }
  return parsed.data
}

export function allow(condition: unknown, code: string, status = 409): asserts condition {
  if (!condition) throw new Failure(status, code)
}
