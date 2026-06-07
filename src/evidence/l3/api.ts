export interface ApiOptions {
  accessToken: string
  projectRef: string
}

export interface LogEntry {
  timestamp: string
  event_message: string
  level: string
  metadata: Record<string, unknown>
}

export interface PolicyEntry {
  schemaname: string
  tablename: string
  policyname: string
  permissive: string
  roles: string[]
  cmd: string
  qual: string | null
  with_check: string | null
}

const API_BASE = 'https://api.supabase.com'

async function apiFetch<T>(path: string, token: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Supabase API ${res.status}: ${body}`)
  }

  return res.json() as Promise<T>
}

/**
 * 查询项目日志
 * GET /v1/projects/{ref}/logs
 * 免 DB 密码，用 Management API token
 */
export async function queryLogs(
  opts: ApiOptions,
  query: string,
  from?: string,
  to?: string,
): Promise<LogEntry[]> {
  const params = new URLSearchParams({ sql: query })
  if (from) params.set('from', from)
  if (to) params.set('to', to)

  const data = await apiFetch<{ result: LogEntry[] }>(
    `/v1/projects/${opts.projectRef}/logs?${params}`,
    opts.accessToken,
  )

  return data.result || []
}

/**
 * 查询 RLS 策略
 * 通过 Management API 的 database/query 端点
 * POST /v1/projects/{ref}/database/query
 */
export async function queryPolicies(opts: ApiOptions): Promise<PolicyEntry[]> {
  const sql = `
    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    ORDER BY schemaname, tablename, policyname;
  `

  const data = await apiFetch<{ result: PolicyEntry[] }>(
    `/v1/projects/${opts.projectRef}/database/query`,
    opts.accessToken,
    {
      method: 'POST',
      body: JSON.stringify({ query: sql }),
    },
  )

  return data.result || []
}

/**
 * 查询最近的 42501 错误（RLS 拒绝）
 */
export async function queryRecentRlsDenials(opts: ApiOptions, hours: number = 24): Promise<LogEntry[]> {
  const to = new Date().toISOString()
  const from = new Date(Date.now() - hours * 3600_000).toISOString()

  const sql = `
    SELECT timestamp, event_message, level, metadata
    FROM edge_logs
    WHERE event_message LIKE '%42501%'
       OR event_message LIKE '%permission denied%'
       OR event_message LIKE '%row-level security%'
    ORDER BY timestamp DESC
    LIMIT 50;
  `

  return queryLogs(opts, sql, from, to)
}

/**
 * 检查 Management API token 是否有效
 */
export async function verifyToken(accessToken: string): Promise<boolean> {
  try {
    await apiFetch('/v1/projects', accessToken)
    return true
  } catch {
    return false
  }
}
