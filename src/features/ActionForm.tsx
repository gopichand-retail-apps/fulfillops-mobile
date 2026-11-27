import { useIsFocused } from "@react-navigation/native"
import { useState } from "react"
import { Alert, View } from "react-native"
import type { Action, Detail } from "../../shared/contracts"
import { text } from "../shared/content"
import { Button, Card, Copy, Field, styles } from "../shared/ui"
import { choiceFields, type Form, lineActions, reasonActions, returnsAt } from "./action-fields"
import Scanner from "./Scanner"

type Props = {
  action: Action
  details: Detail
  form: Form
  setForm: (value: Form) => void
  submit: () => void
  save: () => void
  restore: () => void
  busy: boolean
}
export default function ActionForm({ action, details, form, setForm, submit, save, restore, busy }: Props) {
  const [scanner, setScanner] = useState(false)
  const focused = useIsFocused()
  const patch = (value: Partial<Form>) => setForm({ ...form, ...value })
  const patchDraft = (value: Partial<Form["draft"]>) => patch({ draft: { ...form.draft, ...value } })
  const choice = choiceFields[action]
  const state = returnsAt[action]
  const returns = state ? (details.returns?.filter((row) => row.status === state) ?? []) : []
  const line = details.lines?.find((item) => item.id === form.draft.lineId)
  const lineRequired = lineActions.includes(action)
  function confirm() {
    const prompt =
      action === "handoff"
        ? "confirmHandoff"
        : action === "cancel"
          ? "confirmCancel"
          : action === "resolve" && form.option === "partial"
            ? "confirmPartial"
            : undefined
    if (!prompt) {
      submit()
      return
    }
    Alert.alert(text(action), text(prompt), [
      { text: text("dismiss"), style: "cancel" },
      { text: text("okay"), onPress: submit },
    ])
  }
  return (
    <Card>
      <Copy kind="h2">{text(action)}</Copy>
      {lineRequired && (
        <>
          <Copy>{text("workLine")}</Copy>
          <View style={styles.row}>
            {details.lines?.map((row) => (
              <Button
                key={row.id}
                label={row.sku}
                secondary={row.id !== form.draft.lineId}
                press={() => patchDraft({ lineId: row.id, product: "", source: "manual", units: "1" })}
              />
            ))}
          </View>
          {line && (
            <Copy kind="meta">
              {text("bin")} {line.bin} · {line.pickedUnits}/{line.approvedUnits} EA
            </Copy>
          )}
          <Field
            label={text("quantity")}
            keyboardType="number-pad"
            value={form.draft.units}
            onChangeText={(units) => patchDraft({ units })}
          />
        </>
      )}
      {action === "pick" && (
        <>
          <Field
            label={text("scanOrSku")}
            value={form.draft.product}
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={(product) => patchDraft({ product, source: "manual" })}
          />
          {scanner && focused ? (
            <Scanner
              onScan={(product) => patchDraft({ product, source: "camera" })}
              close={() => setScanner(false)}
            />
          ) : (
            <Button secondary label={text("scan")} press={() => setScanner(true)} />
          )}
          <View style={styles.row}>
            <Button secondary label={text("draftSave")} press={save} />
            <Button secondary label={text("draftRestore")} press={restore} />
          </View>
        </>
      )}
      {reasonActions.includes(action) && (
        <Field
          label={text("reason")}
          value={form.draft.reason}
          onChangeText={(reason) => patchDraft({ reason })}
        />
      )}
      {action === "reassign" && (
        <Field label={text("assignee")} value={form.assignee} onChangeText={(assignee) => patch({ assignee })} />
      )}
      {(action === "pack" || action === "handoff") && (
        <Field
          label={text(action === "pack" ? "packageRef" : "pickupRef")}
          value={form.reference}
          onChangeText={(reference) => patch({ reference })}
        />
      )}
      {action === "pack" &&
        details.lines?.map((row) => (
          <Copy key={row.id}>
            {row.sku} · {row.approvedUnits} EA
          </Copy>
        ))}
      {choice && (
        <>
          <Copy>{text(choice.label)}</Copy>
          <View style={styles.row}>
            {choice.options.map((option) => (
              <Button
                key={option}
                label={text(option)}
                secondary={form.option !== option}
                press={() => patch({ option })}
              />
            ))}
          </View>
        </>
      )}
      {action === "handoff" && (
        <Button
          secondary={!form.observed}
          label={text("observed")}
          press={() => patch({ observed: !form.observed })}
        />
      )}
      {action === "cancel" && (
        <Field label={text("physical")} value={form.physical} onChangeText={(physical) => patch({ physical })} />
      )}
      {state && (
        <View style={styles.row}>
          {returns.map((row) => (
            <Button
              key={row.id}
              label={`${details.lines?.find((line) => line.id === row.lineId)?.sku ?? row.id} · ${row.units}`}
              secondary={row.id !== form.returnId}
              press={() => patch({ returnId: row.id })}
            />
          ))}
          {returns.length === 0 && <Copy kind="meta">{text("noReturns")}</Copy>}
        </View>
      )}
      <Button
        label={text("confirm")}
        press={confirm}
        disabled={
          busy ||
          (lineRequired && !line) ||
          (!!choice && !form.option) ||
          (!!state && !form.returnId) ||
          (action === "handoff" && !form.observed)
        }
      />
    </Card>
  )
}
