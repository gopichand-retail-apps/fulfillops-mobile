import { DarkTheme, DefaultTheme, type LinkingOptions, NavigationContainer } from "@react-navigation/native"
import { createNativeStackNavigator } from "@react-navigation/native-stack"
import { focusManager, QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query"
import { Component, type ReactNode, useEffect, useState } from "react"
import { Alert, AppState, Linking, useColorScheme } from "react-native"
import { SafeAreaProvider } from "react-native-safe-area-context"
import { z } from "zod"
import { uuid } from "../shared/contracts"
import { ApiError, readSites, request } from "./data/client"
import { deleteScopeIfSettled, forgetLogin, type Login, storedLogin } from "./data/device"
import Auth from "./features/Auth"
import WorkDetail from "./features/Detail"
import Queue from "./features/Queue"
import Release from "./features/Release"
import type { RouteMap, Screen } from "./features/types"
import { text } from "./shared/content"
import { Button, Card, Copy, ErrorNotice, Loading, Page } from "./shared/ui"

const client = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 3000 }, mutations: { retry: false } },
})
const Stack = createNativeStackNavigator<RouteMap>()
const schemes = ["orderflow-dev://", "orderflow-it://"]
function allowedLink(url: string | null | undefined) {
  if (!url) return null
  const matched = /^orderflow-(?:dev|it):\/\/sites\/([^/]+)\/work\/([^/]+)$/.exec(url)
  return matched && uuid.safeParse(matched[1]).success && uuid.safeParse(matched[2]).success ? url : null
}
const linking: LinkingOptions<RouteMap> = {
  prefixes: schemes,
  config: { screens: { Detail: "sites/:siteId/work/:workId" } },
  async getInitialURL() {
    return allowedLink(await Linking.getInitialURL())
  },
  subscribe(listener) {
    const sub = Linking.addEventListener("url", (event) => {
      const url = allowedLink(event.url)
      if (url) listener(url)
    })
    return () => sub.remove()
  },
}
class ScreenBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? (
      <Page>
        <Copy>{text("unavailable")}</Copy>
        <Button label={text("retry")} press={() => this.setState({ failed: false })} />
      </Page>
    ) : (
      this.props.children
    )
  }
}

function Workspace({
  login,
  onExit,
  onReauthenticate,
}: {
  login: Login
  onExit: () => void
  onReauthenticate: (value: Login) => void
}) {
  const [signOutError, setSignOutError] = useState<unknown>()
  const [blocked, setBlocked] = useState(false)
  const theme = useColorScheme() === "dark" ? DarkTheme : DefaultTheme
  const grants = useQuery({
    queryKey: ["grants", login.token],
    queryFn: () => readSites(login.token),
    refetchOnWindowFocus: "always",
  })
  const sites = grants.data?.sites ?? []
  const staff = { login, sites }
  async function exit(discardDrafts = false) {
    setSignOutError(undefined)
    setBlocked(false)
    try {
      const outcome = await deleteScopeIfSettled(login, discardDrafts)
      if (outcome === "pending") {
        setBlocked(true)
        return
      }
      if (outcome === "draft") {
        Alert.alert(text("signOut"), text("discardDrafts"), [
          { text: text("dismiss"), style: "cancel" },
          {
            text: text("discard"),
            style: "destructive",
            onPress: () => {
              void exit(true)
            },
          },
        ])
        return
      }
      try {
        await request("/v1/sessions/current", z.undefined(), { method: "DELETE", token: login.token })
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) throw error
      }
      await forgetLogin()
      client.clear()
      onExit()
    } catch (error) {
      setSignOutError(error)
    }
  }
  if (grants.isPending)
    return (
      <Page>
        <Loading />
      </Page>
    )
  const invalid = grants.error instanceof ApiError && grants.error.status === 401
  if (invalid) return <Auth fixedLogin={login.login} onLogin={onReauthenticate} />
  if (grants.isError && (!grants.data || invalid))
    return (
      <Page>
        <ErrorNotice error={grants.error} />
        <Button
          label={text("retry")}
          press={() => {
            void grants.refetch()
          }}
        />
        <Button
          secondary
          label={text("signOut")}
          press={() => {
            void exit()
          }}
        />
        {blocked && <Copy kind="error">{text("confirmSignOut")}</Copy>}
        <ErrorNotice error={signOutError} />
      </Page>
    )

  function siteScreen({ navigation }: Screen<"Sites">) {
    return (
      <Page>
        <Copy kind="eyebrow">{text("training")}</Copy>
        <Copy kind="title">{text("enterSite")}</Copy>
        {sites.length === 0 && <Copy>{text("noSites")}</Copy>}
        {sites.map((site) => (
          <Card key={site.id}>
            <Copy kind="h2">{site.name}</Copy>
            <Copy kind="meta">{site.timeZone}</Copy>
            <Button label={text("queue")} press={() => navigation.navigate("Queue", { siteId: site.id })} />
          </Card>
        ))}
        {blocked && <Copy kind="error">{text("confirmSignOut")}</Copy>}
        <ErrorNotice error={signOutError} />
        <Button
          secondary
          label={text("signOut")}
          press={() => {
            void exit()
          }}
        />
      </Page>
    )
  }

  return (
    <NavigationContainer theme={theme} linking={linking}>
      <Stack.Navigator initialRouteName="Sites">
        <Stack.Screen name="Sites" options={{ title: text("app") }}>
          {siteScreen}
        </Stack.Screen>
        <Stack.Screen name="Queue" options={{ title: text("queue") }}>
          {(props) => (
            <ScreenBoundary key={props.route.key}>
              <Queue {...props} staff={staff} />
            </ScreenBoundary>
          )}
        </Stack.Screen>
        <Stack.Screen name="Detail" options={{ title: text("detail") }}>
          {(props) => (
            <ScreenBoundary key={props.route.key}>
              <WorkDetail {...props} staff={staff} />
            </ScreenBoundary>
          )}
        </Stack.Screen>
        <Stack.Screen name="Release" options={{ title: text("create") }}>
          {(props) => (
            <ScreenBoundary key={props.route.key}>
              <Release {...props} staff={staff} />
            </ScreenBoundary>
          )}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  )
}

export default function App() {
  const [login, setLogin] = useState<Login>()
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let active = true
    storedLogin()
      .then((value) => {
        if (active) setLogin(value)
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setReady(true)
      })
    const state = AppState.addEventListener("change", (value) => focusManager.setFocused(value === "active"))
    return () => {
      active = false
      state.remove()
    }
  }, [])
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={client}>
        <ScreenBoundary>
          {!ready ? (
            <Page>
              <Loading />
            </Page>
          ) : login ? (
            <Workspace
              login={login}
              onExit={() => setLogin(undefined)}
              onReauthenticate={(value) => {
                client.clear()
                setLogin(value)
              }}
            />
          ) : (
            <Auth onLogin={setLogin} />
          )}
        </ScreenBoundary>
      </QueryClientProvider>
    </SafeAreaProvider>
  )
}
