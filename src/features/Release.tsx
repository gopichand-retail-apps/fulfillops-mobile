import { useQueryClient } from "@tanstack/react-query"
import { randomUUID } from "expo-crypto"
import { useEffect, useRef, useState } from "react"
import { View } from "react-native"
import { type ReleaseInput, releaseInput } from "../../shared/contracts"
import { ApiError } from "../data/client"
import { type Pending, readPending, recover, sendOperation, siteScope } from "../data/device"
import { text } from "../shared/content"
import { Button, Card, Copy, ErrorNotice, Field, Page, styles } from "../shared/ui"
import { queueKey } from "./Queue"
import type { Screen, Staff } from "./types"

const fields = ["sourceRelease", "sourceOrder", "sourceRevision", "authority", "priority", "dueAt"] as const
type Entry = Record<(typeof fields)[number], string>
type EntryLine = {
  id: string
  sourceLine: string
  sku: string
  bin: string
  quantity: string
  sourceBarcode: string
}
const lineFields = ["sourceLine", "sku", "bin", "quantity", "sourceBarcode"] as const
const blank = (): EntryLine => ({
  id: randomUUID(),
  sourceLine: "",
  sku: "",
  bin: "",
  quantity: "",
  sourceBarcode: "",
})
export default function Release({ route, staff, navigation }: Screen<"Release"> & { staff: Staff }) {
  const { siteId } = route.params
  const site = staff.sites.find((value) => value.id === siteId)
  const [info, setInfo] = useState<Entry>({
    sourceRelease: "",
    sourceOrder: "",
    sourceRevision: "1",
    authority: "",
    priority: "2",
    dueAt: "",
  })
  const [lines, setLines] = useState(() => [blank()])
  const [preview, setPreview] = useState<ReleaseInput>()
  const [error, setError] = useState<unknown>()
  const [pending, setPending] = useState<Pending>()
  const [busy, setBusy] = useState(false)
  const running = useRef(false)
  const client = useQueryClient()
  const scope = siteScope(staff.login, siteId)
  useEffect(() => {
    readPending(scope, "create").then(setPending).catch(setError)
  }, [scope])
  function review() {
    const checked = releaseInput.safeParse({
      sourceReleaseRef: info.sourceRelease,
      sourceOrderRef: info.sourceOrder,
      sourceRevision: Number(info.sourceRevision),
      releasedByRef: info.authority,
      observedAt: new Date().toISOString(),
      priority: Number(info.priority),
      dueAt: info.dueAt.trim() || undefined,
      lines: lines.map((line) => ({
        sourceLineRef: line.sourceLine,
        sku: line.sku,
        bin: line.bin,
        units: Number(line.quantity),
        unit: "EA",
        barcodeAliases: line.sourceBarcode.trim() ? [line.sourceBarcode] : [],
      })),
    })
    if (checked.success) {
      setPreview(checked.data)
      setError(undefined)
    } else setError(new ApiError("INVALID_INPUT"))
  }
  async function submit() {
    if (running.current || (!preview && !pending)) return
    running.current = true
    setBusy(true)
    setError(undefined)
    try {
      const base = { login: staff.login, siteId, item: "create" }
      const result = pending
        ? await recover({ ...base, pending })
        : await sendOperation({ ...base, tail: "releases", payload: preview })
      void client.invalidateQueries({ queryKey: queueKey(siteId, staff.login.token) })
      navigation.replace("Detail", { siteId, workId: result.workId })
    } catch (error) {
      setError(error)
      await readPending(scope, "create").then(setPending).catch(setError)
    } finally {
      running.current = false
      setBusy(false)
    }
  }
  if (!site?.roles.includes("supervisor"))
    return (
      <Page>
        <ErrorNotice error={new ApiError("FORBIDDEN")} />
      </Page>
    )
  return (
    <Page>
      <Copy kind="title">{text("create")}</Copy>
      <Copy>{text("releaseHelp")}</Copy>
      <ErrorNotice error={error} />
      {pending ? (
        <Card>
          <Copy kind="h2">{text("pending")}</Copy>
          <Copy>{text("pendingHelp")}</Copy>
          <Button
            label={text("reconcile")}
            press={() => {
              void submit()
            }}
            disabled={busy}
          />
        </Card>
      ) : preview ? (
        <Card>
          <Copy kind="h2">{preview.sourceOrderRef}</Copy>
          <Copy>{text("releaseReview")}</Copy>
          {preview.lines.map((line) => (
            <Copy key={line.sourceLineRef}>
              {line.sku} · {line.bin} · {line.units} EA
            </Copy>
          ))}
          <Button
            label={text("commitRelease")}
            press={() => {
              void submit()
            }}
            disabled={busy}
          />
          <Button secondary label={text("dismiss")} press={() => setPreview(undefined)} disabled={busy} />
        </Card>
      ) : (
        <>
          <Card>
            {fields.map((field) => (
              <Field
                key={field}
                label={text(field)}
                value={info[field]}
                onChangeText={(value) => setInfo((current) => ({ ...current, [field]: value }))}
                keyboardType={field === "priority" || field === "sourceRevision" ? "number-pad" : "default"}
              />
            ))}
          </Card>
          <Copy kind="h2">{text("lines")}</Copy>
          {lines.map((line, index) => (
            <Card key={line.id}>
              {lineFields.map((field) => (
                <Field
                  key={field}
                  label={text(field)}
                  value={line[field]}
                  keyboardType={field === "quantity" ? "number-pad" : "default"}
                  onChangeText={(value) =>
                    setLines((current) =>
                      current.map((item, lineIndex) => (lineIndex === index ? { ...item, [field]: value } : item)),
                    )
                  }
                />
              ))}
              {lines.length > 1 && (
                <Button
                  secondary
                  label={text("removeLine")}
                  press={() => setLines((current) => current.filter((_, i) => i !== index))}
                />
              )}
            </Card>
          ))}
          <View style={styles.row}>
            <Button
              secondary
              label={text("addLine")}
              press={() => setLines((current) => [...current, blank()])}
              disabled={lines.length >= 100}
            />
            <Button label={text("reviewRelease")} press={review} />
          </View>
        </>
      )}
    </Page>
  )
}
