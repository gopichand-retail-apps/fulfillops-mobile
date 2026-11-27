import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import type { Site } from "../../shared/contracts"
import type { Login } from "../data/device"

export type RouteMap = {
  Sites: undefined
  Queue: { siteId: string }
  Detail: { siteId: string; workId: string }
  Release: { siteId: string }
}
export type Screen<T extends keyof RouteMap> = NativeStackScreenProps<RouteMap, T>
export type Staff = { login: Login; sites: Site[] }
