import type { Action, Detail } from "../../shared/contracts"
import type { Label } from "../shared/content"

export type Draft = { lineId: string; product: string; units: string; source: "manual" | "camera"; reason: string }
export type Form = {
  draft: Draft
  reference: string
  option: string
  assignee: string
  returnId: string
  physical: string
  observed: boolean
}
export const newDraft = (lineId = ""): Draft => ({ lineId, product: "", units: "1", source: "manual", reason: "" })
export const newForm = (lineId = ""): Form => ({
  draft: newDraft(lineId),
  reference: "",
  option: "",
  assignee: "",
  returnId: "",
  physical: "",
  observed: false,
})
type Target = { tail: string; fields: Record<string, unknown> }
type Input = { form: Form; detail: Detail }
const creator: Record<Action, (input: Input) => Target> = {
  claim: () => ({ tail: "claim", fields: {} }),
  release_claim: ({ detail, form }) => ({
    tail: "claim/release",
    fields: { claimId: detail.claim?.id, reason: form.draft.reason },
  }),
  reassign: ({ detail, form }) => ({
    tail: "claim/reassign",
    fields: { claimId: detail.claim?.id, assigneeRef: form.assignee.trim(), reason: form.draft.reason },
  }),
  pick: ({ detail, form: { draft } }) => ({
    tail: `lines/${draft.lineId}/picks`,
    fields: {
      claimId: detail.claim?.id,
      productRef: draft.product.trim(),
      pickedEach: Number(draft.units),
      source: draft.source,
    },
  }),
  shortage: ({ detail, form: { draft } }) => ({
    tail: `lines/${draft.lineId}/shortages`,
    fields: {
      claimId: detail.claim?.id,
      units: Number(draft.units),
      reason: draft.reason,
    },
  }),
  resolve: ({ detail, form }) => ({
    tail: `shortages/${detail.shortageId}/resolve`,
    fields: { decision: form.option, reason: form.draft.reason },
  }),
  pack: ({ detail, form }) => ({
    tail: "packages",
    fields: {
      reference: form.reference,
      contents: detail.lines
        ?.filter((line) => line.approvedUnits > 0)
        .map((line) => ({ lineId: line.id, units: line.approvedUnits })),
    },
  }),
  handoff: ({ detail, form }) => ({
    tail: "handoffs",
    fields: {
      packageId: detail.packageId,
      pickupRef: form.reference,
      method: form.option,
      observedAt: new Date().toISOString(),
      observed: form.observed,
    },
  }),
  cancel: ({ form }) => ({
    tail: "cancel",
    fields: { reason: form.draft.reason, physicalDisposition: form.physical.trim() || undefined },
  }),
  open_return: ({ form: { draft } }) => ({
    tail: "returns",
    fields: { lineId: draft.lineId, units: Number(draft.units), reason: draft.reason },
  }),
  receive: ({ form }) => ({ tail: `returns/${form.returnId}/receive`, fields: {} }),
  inspect: ({ form }) => ({
    tail: `returns/${form.returnId}/inspections`,
    fields: { condition: form.option, reason: form.draft.reason },
  }),
  disposition: ({ form }) => ({
    tail: `returns/${form.returnId}/disposition`,
    fields: { disposition: form.option, reason: form.draft.reason },
  }),
}
export function workOperation(action: Action, detail: Detail, form: Form) {
  const { tail, fields } = creator[action]({ detail, form })
  return { tail: `work/${detail.work.id}/${tail}`, payload: { expectedVersion: detail.work.revision, ...fields } }
}
export const choiceFields: Partial<Record<Action, { label: Label; options: Label[] }>> = {
  resolve: { label: "decision", options: ["wait", "partial"] },
  handoff: { label: "decision", options: ["pickup", "carrier_transfer"] },
  inspect: { label: "condition", options: ["intact", "opened", "damaged", "unknown"] },
  disposition: { label: "dispositionLabel", options: ["quarantine", "restock_eligible", "rejected"] },
}
export const returnsAt: Partial<Record<Action, "requested" | "received" | "inspected">> = {
  receive: "requested",
  inspect: "received",
  disposition: "inspected",
}
export const lineActions: Action[] = ["pick", "shortage", "open_return"]
export const reasonActions: Action[] = [
  "release_claim",
  "reassign",
  "shortage",
  "resolve",
  "cancel",
  "open_return",
  "inspect",
  "disposition",
]
