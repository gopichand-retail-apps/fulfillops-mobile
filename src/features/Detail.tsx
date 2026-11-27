import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { View } from "react-native"
import { z } from "zod"
import { type Action, detail, uuid, type Detail as WorkDetail } from "../../shared/contracts"
import { ApiError, request, sitePath } from "../data/client"
import {
  clearLocal,
  getLocal,
  type Pending,
  readPending,
  recover,
  saveLocal,
  sendOperation,
  siteScope,
} from "../data/device"
import { message, text } from "../shared/content"
import { Button, Card, Copy, ErrorNotice, Loading, Page, styles } from "../shared/ui"
import ActionForm from "./ActionForm"
import { newForm, workOperation } from "./action-fields"
import { queueKey } from "./Queue"
import type { Screen, Staff } from "./types"

const pickDraft = z.object({
  lineId: uuid,
  product: z.string().max(80),
  units: z.string().max(5),
  source: z.enum(["manual", "camera"]),
  reason: z.string().max(240),
})
const cached = z.object({ details: detail, storedAt: z.number() })
export default function Detail({ route, staff }: Screen<"Detail"> & { staff: Staff }) {
  const { siteId, workId } = route.params
  const valid = uuid.safeParse(workId).success && staff.sites.some((site) => site.id === siteId)
  const scope = siteScope(staff.login, siteId)
  const [saved, setSaved] = useState<WorkDetail>()
  const [pending, setPending] = useState<Pending>()
  const [action, setAction] = useState<Action>()
  const [form, setForm] = useState(newForm)
  const [notice, setNotice] = useState<"submitted" | "draftSaved">()
  const [error, setError] = useState<unknown>()
  const [busy, setBusy] = useState(false)
  const running = useRef(false)
  const client = useQueryClient()
  const query = useQuery({
    queryKey: ["detail", siteId, workId, staff.login.token],
    enabled: valid,
    refetchOnWindowFocus: "always",
    queryFn: async ({ signal }) => {
      const current = await request(sitePath(siteId, `work/${workId}`), detail, {
        token: staff.login.token,
        signal,
      })
      await saveLocal(scope, `cache:${workId}`, { details: current, storedAt: Date.now() }).catch(() => undefined)
      return current
    },
  })
  useEffect(() => {
    if (!valid) return
    let active = true
    getLocal(scope, `cache:${workId}`)
      .then((raw) => {
        const value = cached.safeParse(raw)
        if (active && value.success && Date.now() - value.data.storedAt < 86400000) setSaved(value.data.details)
      })
      .catch(() => undefined)
    readPending(scope, workId)
      .then((value) => {
        if (active) setPending(value)
      })
      .catch((error) => {
        if (active) setError(error)
      })
    return () => {
      active = false
    }
  }, [scope, workId, valid])
  const denied = query.error instanceof ApiError && [401, 403, 404].includes(query.error.status)
  const current = denied ? undefined : (query.data ?? saved)
  const live = !!query.data && !query.isError
  const allowDraft = !live && !denied && !!current?.allowedActions.includes("pick")
  async function mutate(skipAction = false) {
    if (running.current || (!pending && (!action || !current || !live))) return
    if (pending && !skipAction) return
    running.current = true
    setBusy(true)
    setError(undefined)
    setNotice(undefined)
    try {
      const options = { login: staff.login, siteId, item: workId }
      if (pending) await recover({ ...options, pending })
      else if (action && current) await sendOperation({ ...options, ...workOperation(action, current, form) })
      if (action === "pick") await clearLocal(scope, `draft:${workId}`)
      setPending(undefined)
      setAction(undefined)
      setNotice("submitted")
      void client.invalidateQueries({ queryKey: queueKey(siteId, staff.login.token) })
      await query.refetch()
    } catch (error) {
      setError(error)
      await readPending(scope, workId).then(setPending).catch(setError)
      void query.refetch()
    } finally {
      running.current = false
      setBusy(false)
    }
  }
  function save() {
    const parsed = pickDraft.safeParse(form.draft)
    if (!parsed.success) {
      setError(new ApiError("INVALID_INPUT"))
      return
    }
    saveLocal(scope, `draft:${workId}`, parsed.data)
      .then(() => setNotice("draftSaved"))
      .catch(setError)
  }
  function restore() {
    getLocal(scope, `draft:${workId}`)
      .then((value) => {
        const result = pickDraft.safeParse(value)
        if (result.success) setForm((current) => ({ ...current, draft: result.data }))
      })
      .catch(setError)
  }
  if (!valid)
    return (
      <Page>
        <ErrorNotice error={new ApiError("WORK_UNAVAILABLE")} />
      </Page>
    )
  if (!current)
    return (
      <Page>
        {query.isPending ? (
          <Loading />
        ) : (
          <>
            <ErrorNotice error={query.error} />
            <Button
              label={text("retry")}
              press={() => {
                void query.refetch()
              }}
            />
          </>
        )}
      </Page>
    )
  const work = current.work
  const formAllowed =
    action && ((live && current.allowedActions.includes(action)) || (allowDraft && action === "pick"))
  return (
    <Page>
      <Copy kind="eyebrow">
        {text("manual")} · {text(work.status)}
      </Copy>
      <Copy kind="title">{work.reference}</Copy>
      <Copy kind="meta">
        {text("revision")} {work.revision} · {new Date(work.updatedAt).toLocaleString()}
      </Copy>
      <Copy kind="meta">{text("external")}</Copy>
      {!live && (
        <Card>
          <Copy>{text("stale")}</Copy>
          <ErrorNotice error={query.error} />
          <Button
            secondary
            label={text("refresh")}
            press={() => {
              void query.refetch()
            }}
          />
        </Card>
      )}
      <ErrorNotice error={error} />
      {notice && (
        <View accessibilityLiveRegion="polite">
          <Copy>{text(notice)}</Copy>
        </View>
      )}
      {pending && (
        <Card>
          <Copy kind="h2">{text("pending")}</Copy>
          <Copy>{text("pendingHelp")}</Copy>
          <Button
            label={text("reconcile")}
            disabled={busy}
            press={() => {
              void mutate(true)
            }}
          />
        </Card>
      )}
      {!pending && (live || allowDraft) && (
        <View style={styles.row}>
          {current.allowedActions
            .filter((value) => live || value === "pick")
            .map((value) => (
              <Button
                key={value}
                secondary={action !== value}
                label={text(value)}
                press={() => {
                  setForm(
                    newForm(
                      current.lines?.find((line) => line.pickedUnits < line.approvedUnits)?.id ??
                        current.lines?.[0]?.id,
                    ),
                  )
                  setAction(value)
                }}
                disabled={busy}
              />
            ))}
        </View>
      )}
      {!pending && formAllowed && (
        <ActionForm
          key={action}
          action={action}
          details={current}
          form={form}
          setForm={setForm}
          submit={() => {
            void mutate()
          }}
          save={save}
          restore={restore}
          busy={busy || !live}
        />
      )}
      {current.lines && (
        <Card>
          <Copy kind="h2">{text("lines")}</Copy>
          {current.lines.map((line) => (
            <View key={line.id} style={{ gap: 4 }}>
              <Copy>
                {line.sku} · {line.pickedUnits}/{line.approvedUnits} EA
              </Copy>
              <Copy kind="meta">
                {text("bin")} {line.bin}
                {line.requiredUnits !== line.approvedUnits ? ` · ${line.requiredUnits} EA` : ""}
              </Copy>
            </View>
          ))}
        </Card>
      )}
      {!!current.returns?.length && (
        <Card>
          <Copy kind="h2">{text("returns")}</Copy>
          {current.returns.map((row) => (
            <Copy key={row.id}>
              {text(row.status)} · {row.units} EA{row.disposition ? ` · ${message(row.disposition)}` : ""}
            </Copy>
          ))}
        </Card>
      )}
      <Card>
        <Copy kind="h2">{text("history")}</Copy>
        {current.history.length === 0 && <Copy>{text("emptyHistory")}</Copy>}
        {current.history.map((event) => (
          <View key={event.eventId} style={{ gap: 4 }}>
            <Copy>{message(event.type)}</Copy>
            <Copy kind="meta">{new Date(event.at).toLocaleString()}</Copy>
          </View>
        ))}
      </Card>
    </Page>
  )
}
