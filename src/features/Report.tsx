import { useQuery } from "@tanstack/react-query"
import { report } from "../../shared/contracts"
import { request, sitePath } from "../data/client"
import type { Login } from "../data/device"
import { text } from "../shared/content"
import { Card, Copy, ErrorNotice, Loading } from "../shared/ui"

export default function Report({ login, siteId }: { login: Login; siteId: string }) {
  const result = useQuery({
    queryKey: ["report", siteId, login.token],
    queryFn: ({ signal }) => request(sitePath(siteId, "report"), report, { token: login.token, signal }),
  })
  const data = result.data
  if (!data) return <Card>{result.isPending ? <Loading /> : <ErrorNotice error={result.error} />}</Card>
  const date = (value: string) => new Date(value).toLocaleString(undefined, { timeZone: data.timeZone })
  const rows = [
    ["oldestReleased", data.oldestReleasedAt ? date(data.oldestReleasedAt) : text("notAvailable")],
    ["reportPicked", data.pickedUnits],
    ["reportShort", data.shortageUnits],
    ["reportHandoff", data.averageHandoffMinutes ?? text("notAvailable")],
    ["reportReturn", data.unresolvedReturnUnits],
  ] as const
  return (
    <Card>
      <Copy kind="h2">{text("report")}</Copy>
      <Copy kind="meta">{`${date(data.from)} → ${date(data.asOf)} · ${data.timeZone}`}</Copy>
      {rows.map(([key, value]) => (
        <Copy key={key}>{`${text(key)} · ${value}`}</Copy>
      ))}
    </Card>
  )
}
