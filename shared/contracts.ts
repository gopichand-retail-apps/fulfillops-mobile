import { z } from "zod"

export const uuid = z.uuid()
export const role = z.enum(["owner", "supervisor", "picker", "packer", "handoff", "support"])
export const status = z.enum([
  "released",
  "claimed",
  "picking",
  "exception",
  "picked",
  "packed",
  "handed_over",
  "cancelled",
])
export const version = z.number().int().min(1).max(2147483647)
export const units = z.number().int().min(1).max(10000)
export const stamp = z.iso.datetime({ offset: true })
export const reference = z.string().trim().min(1).max(80)
const reason = z.string().trim().min(1).max(240)
const loginId = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9@._-]{2,119}$/)
const password = z.string().min(1).max(256)
export const signInInput = z.strictObject({ loginId, password })
export const inviteInput = z.strictObject({ invitation: z.string().min(32).max(256), password: password.min(12) })
export const session = z.object({ token: z.string().min(32).max(512), expiresAt: stamp })
export const site = z.object({ id: uuid, name: z.string(), timeZone: z.string(), roles: z.array(role) })
export const sites = z.object({ sites: z.array(site) })
export const releaseLine = z.strictObject({
  sourceLineRef: reference,
  sku: reference,
  bin: reference.max(64),
  unit: z.literal("EA"),
  units,
  barcodeAliases: z.array(reference).max(8).default([]),
})
export const releaseInput = z
  .strictObject({
    sourceReleaseRef: reference,
    sourceOrderRef: reference,
    sourceRevision: version,
    releasedByRef: z.string().trim().min(1).max(100),
    observedAt: stamp,
    priority: z.number().int().min(0).max(5),
    dueAt: stamp.optional(),
    lines: z.array(releaseLine).min(1).max(100),
  })
  .refine((input) => new Set(input.lines.map((line) => line.sourceLineRef)).size === input.lines.length, {
    path: ["lines"],
  })

export const summary = z.object({
  id: uuid,
  reference: z.string(),
  status,
  revision: version,
  priority: z.number(),
  releasedAt: stamp,
  updatedAt: stamp,
  dueAt: stamp.optional(),
  source: z.literal("manual"),
})
export const page = z.object({
  items: z.array(summary),
  asOf: stamp,
  truncated: z.boolean(),
  nextCursor: z.string().optional(),
})
export const actions = z.enum([
  "claim",
  "release_claim",
  "reassign",
  "pick",
  "shortage",
  "resolve",
  "pack",
  "handoff",
  "cancel",
  "open_return",
  "receive",
  "inspect",
  "disposition",
])
const claim = z.object({ id: uuid, assigneeRef: uuid })
const line = z.object({
  id: uuid,
  sku: z.string(),
  bin: z.string(),
  unit: z.literal("EA"),
  requiredUnits: units,
  pickedUnits: z.number().int().nonnegative(),
  approvedUnits: z.number().int().nonnegative(),
})
export const returnStatus = z.enum(["requested", "received", "inspected", "dispositioned"])
export const detail = z.object({
  work: summary,
  allowedActions: z.array(actions),
  lines: z.array(line).optional(),
  claim: claim.optional(),
  history: z.array(
    z.object({ eventId: uuid, type: z.string(), at: stamp, revision: version, actorRef: uuid.optional() }),
  ),
  shortageId: uuid.optional(),
  packageId: uuid.optional(),
  returns: z
    .array(
      z.object({
        id: uuid,
        lineId: uuid,
        units,
        status: returnStatus,
        condition: z.string().nullable(),
        disposition: z.string().nullable(),
      }),
    )
    .optional(),
})
export const receipt = z.object({
  operationId: uuid,
  workId: uuid,
  type: z.string(),
  revision: version,
  status,
  committedAt: stamp,
  claim: claim.optional(),
  recordId: uuid.optional(),
})
export const expected = z.strictObject({ expectedVersion: version })
export const releaseClaim = expected.extend({ claimId: uuid, reason })
export const reassign = releaseClaim.extend({ assigneeRef: uuid })
export const pick = expected.extend({
  claimId: uuid,
  productRef: reference,
  pickedEach: units,
  source: z.enum(["manual", "camera", "wedge"]),
})
export const shortage = expected.extend({ claimId: uuid, units, reason })
export const resolution = expected.extend({ decision: z.enum(["wait", "partial"]), reason })
export const packing = expected.extend({
  reference,
  contents: z
    .array(z.strictObject({ lineId: uuid, units }))
    .min(1)
    .max(100),
})
export const handoff = expected.extend({
  packageId: uuid,
  pickupRef: reference,
  method: z.enum(["pickup", "carrier_transfer"]),
  observedAt: stamp,
  observed: z.literal(true),
})
export const cancel = expected.extend({ reason, physicalDisposition: reason.optional() })
export const requestReturn = expected.extend({ lineId: uuid, units, reason })
export const inspect = expected.extend({ condition: z.enum(["intact", "opened", "damaged", "unknown"]), reason })
export const disposition = expected.extend({
  disposition: z.enum(["quarantine", "restock_eligible", "rejected"]),
  reason,
})
export const errorBody = z.object({ code: z.string(), correlationId: uuid })
export const report = z.object({
  timeZone: z.string(),
  asOf: stamp,
  from: stamp,
  oldestReleasedAt: stamp.nullable(),
  pickedUnits: z.number().int().nonnegative(),
  shortageUnits: z.number().int().nonnegative(),
  averageHandoffMinutes: z.number().nullable(),
  unresolvedReturnUnits: z.number().int().nonnegative(),
})

export type Role = z.infer<typeof role>
export type Status = z.infer<typeof status>
export type Action = z.infer<typeof actions>
export type Receipt = z.infer<typeof receipt>
export type ReleaseInput = z.infer<typeof releaseInput>
export type Summary = z.infer<typeof summary>
export type Detail = z.infer<typeof detail>
export type Site = z.infer<typeof site>
export type ReturnStatus = z.infer<typeof returnStatus>
