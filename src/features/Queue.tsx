import { type InfiniteData, useInfiniteQuery } from "@tanstack/react-query"
import { useState } from "react"
import { FlatList, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import type { z } from "zod"
import { page, type Summary } from "../../shared/contracts"
import { ApiError, request, sitePath } from "../data/client"
import { type Label, text } from "../shared/content"
import { Button, Card, Copy, ErrorNotice, Field, Loading, styles, useColors } from "../shared/ui"
import Report from "./Report"
import type { Screen, Staff } from "./types"

const filters = ["all", "available", "mine", "exception", "packed", "handed_over"] as const
export const queueKey = (id: string, token: string) => ["queue", id, token]
export default function Queue({ navigation, route, staff }: Screen<"Queue"> & { staff: Staff }) {
  const { siteId } = route.params
  const site = staff.sites.find((value) => value.id === siteId)
  const c = useColors()
  const [find, setFind] = useState("")
  const [search, setSearch] = useState("")
  const [showReport, setShowReport] = useState(false)
  const [filter, setFilter] = useState<(typeof filters)[number]>("all")
  type WorkPage = z.infer<typeof page>
  const jobs = useInfiniteQuery<WorkPage, Error, InfiniteData<WorkPage, string>, readonly unknown[], string>({
    queryKey: [...queueKey(siteId, staff.login.token), filter, search],
    enabled: !!site,
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor,
    refetchInterval: 10000,
    queryFn: ({ pageParam, signal }) => {
      const values: string[] = []
      if (search) values.push(`reference=${encodeURIComponent(search)}`)
      if (pageParam) values.push(`cursor=${encodeURIComponent(pageParam)}`)
      if (filter === "mine" || filter === "available") values.push(`assignment=${filter}`)
      else if (filter !== "all") values.push(`status=${filter}`)
      return request(sitePath(siteId, `work?${values.join("&")}`), page, { token: staff.login.token, signal })
    },
  })
  if (!site)
    return (
      <View style={styles.page}>
        <ErrorNotice error={new ApiError("SCOPE_UNAVAILABLE")} />
      </View>
    )
  const items = jobs.data?.pages.flatMap((part) => part.items) ?? []
  const last = jobs.data?.pages.at(-1)
  function row({ item }: { item: Summary }) {
    return (
      <Card>
        <View style={styles.row}>
          <Copy kind="h2">{item.reference}</Copy>
          <Copy kind="meta">{text(item.status)}</Copy>
        </View>
        <Copy kind="meta">{item.dueAt ? new Date(item.dueAt).toLocaleString() : text("manual")}</Copy>
        <Button
          secondary
          label={`${text("detail")} · ${item.reference}`}
          press={() => navigation.navigate("Detail", { siteId, workId: item.id })}
        />
      </Card>
    )
  }
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["bottom", "left", "right"]}>
      <FlatList
        data={items}
        renderItem={row}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
        refreshing={jobs.isRefetching}
        onRefresh={() => {
          void jobs.refetch()
        }}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <Copy kind="eyebrow">{text("training")}</Copy>
            <Copy kind="title">{site.name}</Copy>
            <Copy>{text("queueCaption")}</Copy>
            {site.roles.includes("supervisor") && (
              <>
                <Button secondary={!showReport} label={text("report")} press={() => setShowReport(!showReport)} />
                {showReport && <Report login={staff.login} siteId={siteId} />}
              </>
            )}
            <Field
              label={text("search")}
              value={find}
              onChangeText={setFind}
              onSubmitEditing={() => setSearch(find.trim())}
              returnKeyType="search"
            />
            <View style={styles.row}>
              <Button secondary label={text("searchApply")} press={() => setSearch(find.trim())} />
              <Button
                secondary
                label={text("refresh")}
                press={() => {
                  void jobs.refetch()
                }}
              />
              {site.roles.includes("supervisor") && (
                <Button label={text("create")} press={() => navigation.navigate("Release", { siteId })} />
              )}
            </View>
            <View style={styles.row}>
              {filters.map((value) => (
                <Button
                  key={value}
                  secondary={filter !== value}
                  label={text(value as Label)}
                  press={() => setFilter(value)}
                />
              ))}
            </View>
            {last && (
              <Copy kind="meta">
                {new Date(last.asOf).toLocaleTimeString()} · {items.length} {text("workCount")}
              </Copy>
            )}
            {jobs.isError && <ErrorNotice error={jobs.error} />}
          </View>
        }
        ListEmptyComponent={
          jobs.isPending ? <Loading /> : jobs.isSuccess ? <Copy>{text("noWork")}</Copy> : undefined
        }
        ListFooterComponent={
          <View style={{ gap: 10 }}>
            {last?.truncated && <Copy kind="meta">{text("limit")}</Copy>}
            {jobs.hasNextPage && (
              <Button
                secondary
                label={text("more")}
                disabled={jobs.isFetching}
                press={() => {
                  void jobs.fetchNextPage()
                }}
              />
            )}
          </View>
        }
      />
    </SafeAreaView>
  )
}
