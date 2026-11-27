import { useState } from "react"
import { Image, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { z } from "zod"
import { inviteInput, session, signInInput, uuid } from "../../shared/contracts"
import { ApiError, request } from "../data/client"
import { type Login, storeLogin } from "../data/device"
import { text } from "../shared/content"
import { Button, Card, Copy, ErrorNotice, Field, Page } from "../shared/ui"

export default function Auth({ onLogin, fixedLogin }: { onLogin: (login: Login) => void; fixedLogin?: string }) {
  const [mode, setMode] = useState<"sign-in" | "invite">("sign-in")
  const [login, setLogin] = useState(fixedLogin ?? "")
  const [password, setPassword] = useState("")
  const [invitation, setInvitation] = useState("")
  const [error, setError] = useState<unknown>()
  const [busy, setBusy] = useState(false)
  const [enrolled, setEnrolled] = useState(false)
  async function submit() {
    setBusy(true)
    setError(undefined)
    try {
      if (mode === "invite") {
        const value = inviteInput.safeParse({ invitation: invitation.trim(), password })
        if (!value.success) throw new ApiError("INVALID_INPUT")
        await request("/v1/invitation-redemptions", z.object({ personId: uuid }), { payload: value.data })
        setEnrolled(true)
        setMode("sign-in")
        setInvitation("")
      } else {
        const input = signInInput.safeParse({ loginId: login, password })
        if (!input.success) throw new ApiError("INVALID_INPUT")
        const result = await request("/v1/sessions", session, { payload: input.data })
        const next = { ...result, login: input.data.loginId }
        await storeLogin(next)
        onLogin(next)
      }
      setPassword("")
    } catch (error) {
      setError(error)
    } finally {
      setBusy(false)
    }
  }
  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <Page>
        <View style={{ gap: 8, marginTop: 18, marginBottom: 9 }}>
          <Image
            source={require("../../assets/orderflow.png")}
            style={{ width: 58, height: 58, borderRadius: 16 }}
            accessible={false}
          />
          <Copy kind="eyebrow">{text("eyebrow")}</Copy>
          <Copy kind="title">{text("app")}</Copy>
          <Copy>{text("intro")}</Copy>
          <Copy kind="meta">{text("training")}</Copy>
        </View>
        <Card>
          <Copy kind="h2">{text(fixedLogin ? "unlock" : mode === "invite" ? "enroll" : "signIn")}</Copy>
          {enrolled && <Copy kind="meta">{text("enrollmentDone")}</Copy>}
          {mode === "invite" ? (
            <Field
              label={text("invitation")}
              value={invitation}
              onChangeText={setInvitation}
              autoCapitalize="none"
              autoCorrect={false}
            />
          ) : (
            <Field
              label={text("login")}
              value={login}
              editable={!fixedLogin}
              onChangeText={setLogin}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect={false}
            />
          )}
          <Field
            label={text("password")}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete={mode === "invite" ? "new-password" : "current-password"}
            onSubmitEditing={() => {
              if (!busy) void submit()
            }}
          />
          <ErrorNotice error={error} />
          <Button
            label={text(mode === "invite" ? "enroll" : "signIn")}
            press={() => {
              void submit()
            }}
            disabled={busy}
          />
          {!fixedLogin && (
            <Button
              secondary
              label={text(mode === "invite" ? "backToSignIn" : "enroll")}
              press={() => {
                setMode(mode === "invite" ? "sign-in" : "invite")
                setError(undefined)
                setPassword("")
              }}
              disabled={busy}
            />
          )}
        </Card>
      </Page>
    </SafeAreaView>
  )
}
