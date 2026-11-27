import type { z } from "zod"
import * as contracts from "../../shared/contracts"

const configured = process.env.EXPO_PUBLIC_ORDERFLOW_ORIGIN
export const origin = __DEV__ ? (configured ?? "http://127.0.0.1:5761") : configured
export class ApiError extends Error {
  readonly code: string
  readonly status: number
  constructor(code: string, status = 0) {
    super(code)
    this.code = code
    this.status = status
  }
}
type Options = { token?: string; payload?: unknown; key?: string; method?: string; signal?: AbortSignal }

export async function request<T>(path: string, schema: z.ZodType<T>, options: Options = {}): Promise<T> {
  if (!origin || (!__DEV__ && !origin.startsWith("https://"))) throw new ApiError("OFFLINE")
  const controller = new AbortController()
  const cancel = () => controller.abort()
  options.signal?.addEventListener("abort", cancel, { once: true })
  if (options.signal?.aborted) cancel()
  const timer = setTimeout(cancel, 4900)
  try {
    const headers: Record<string, string> = { Accept: "application/json" }
    if (options.token) headers.Authorization = `Bearer ${options.token}`
    if (options.payload !== undefined) headers["Content-Type"] = "application/json"
    if (options.key) headers["Idempotency-Key"] = options.key
    const result = await fetch(origin + path, {
      method: options.method ?? (options.payload === undefined ? "GET" : "POST"),
      headers,
      body: options.payload === undefined ? undefined : JSON.stringify(options.payload),
      signal: controller.signal,
    })
    const data: unknown = result.status === 204 ? undefined : await result.json()
    if (!result.ok) {
      const problem = contracts.errorBody.safeParse(data)
      throw new ApiError(problem.success ? problem.data.code : "UNKNOWN", result.status)
    }
    return schema.parse(data)
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(controller.signal.aborted ? "TIMEOUT" : "OFFLINE")
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener("abort", cancel)
  }
}
export const sitePath = (id: string, tail: string) => `/v1/sites/${id}/${tail}`
export function readSites(token: string) {
  return request("/v1/sites", contracts.sites, { token })
}
