import type { ReactNode } from "react"
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  useColorScheme,
  View,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { ApiError } from "../data/client"
import { message, text } from "./content"

const light = {
  bg: "#F6F6FB",
  panel: "#FFFFFF",
  ink: "#202137",
  muted: "#585975",
  primary: "#403B86",
  button: "#FFFFFF",
  line: "#DEDEEC",
  tint: "#ECEAFB",
  danger: "#9B2335",
}
const dark = {
  bg: "#171726",
  panel: "#222236",
  ink: "#F4F2FF",
  muted: "#C1BDD9",
  primary: "#C4C0FF",
  button: "#171726",
  line: "#484662",
  tint: "#33304E",
  danger: "#FFAAAF",
}
export function useColors() {
  return useColorScheme() === "dark" ? dark : light
}

export function Copy({
  children,
  kind = "body",
}: {
  children: ReactNode
  kind?: "title" | "h2" | "body" | "meta" | "eyebrow" | "error"
}) {
  const c = useColors()
  const color = kind === "error" ? c.danger : kind === "eyebrow" ? c.primary : kind === "meta" ? c.muted : c.ink
  return (
    <Text
      accessibilityRole={kind === "title" || kind === "h2" ? "header" : undefined}
      style={[styles[kind], { color }]}
    >
      {children}
    </Text>
  )
}
export function Page({ children }: { children: ReactNode }) {
  const c = useColors()
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["bottom", "left", "right"]}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>
        {children}
      </ScrollView>
    </SafeAreaView>
  )
}
export function Card({ children }: { children: ReactNode }) {
  const c = useColors()
  return <View style={[styles.card, { backgroundColor: c.panel, borderColor: c.line }]}>{children}</View>
}
export function Button({
  label,
  press,
  secondary = false,
  disabled = false,
}: {
  label: string
  press: () => void
  secondary?: boolean
  disabled?: boolean
}) {
  const c = useColors()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      onPress={press}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: secondary ? c.tint : c.primary, opacity: disabled ? 0.5 : pressed ? 0.7 : 1 },
      ]}
    >
      <Text
        style={{ color: secondary ? c.primary : c.button, fontSize: 15, fontWeight: "700", textAlign: "center" }}
      >
        {label}
      </Text>
    </Pressable>
  )
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const c = useColors()
  return (
    <View style={{ gap: 5 }}>
      <Copy kind="meta">{label}</Copy>
      <TextInput
        {...props}
        accessibilityLabel={label}
        placeholderTextColor={c.muted}
        style={[styles.field, { color: c.ink, backgroundColor: c.bg, borderColor: c.line }, props.style]}
      />
    </View>
  )
}
export function ErrorNotice({ error }: { error: unknown }) {
  if (!error) return null
  return (
    <View accessibilityLiveRegion="polite">
      <Copy kind="error">{message(error instanceof ApiError ? error.code : "UNKNOWN")}</Copy>
    </View>
  )
}
export function Loading() {
  return (
    <View style={{ alignItems: "center", gap: 10, padding: 24 }}>
      <ActivityIndicator />
      <Copy kind="meta">{text("loading")}</Copy>
    </View>
  )
}
export const styles = StyleSheet.create({
  page: { padding: 18, gap: 14, width: "100%", maxWidth: 840, alignSelf: "center", paddingBottom: 36 },
  card: { padding: 16, gap: 12, borderWidth: 1, borderRadius: 16 },
  button: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 48,
    minWidth: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  field: { padding: 12, fontSize: 16, borderWidth: 1, borderRadius: 10, minHeight: 48 },
  title: { fontSize: 31, fontWeight: "800", letterSpacing: -0.6 },
  h2: { fontSize: 20, fontWeight: "700" },
  body: { fontSize: 16 },
  meta: { fontSize: 14 },
  eyebrow: { fontSize: 12, fontWeight: "800", letterSpacing: 1.4 },
  error: { fontSize: 15, fontWeight: "600" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  grow: { flexGrow: 1, flexBasis: 230, gap: 12 },
})
