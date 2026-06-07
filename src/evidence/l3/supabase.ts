import type { DatabaseProvider, DatabaseDetection, ProviderConfig, CloudEvidence, ProviderToken } from './provider.js'
import type { PolicyEntry, LogEntry } from './api.js'

// ═══════════════════════════════════════
// Supabase API 客户端
// ═══════════════════════════════════════

const API_BASE = 'https://api.supabase.com'

interface ApiOptions {
  accessToken: string
  projectRef: string
}

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
    throw new Error(`Supabase API error: ${res.status} ${res.statusText}`)
  }

  return res.json() as Promise<T>
}

async function queryLogs(opts: ApiOptions, query: string, from?: string, to?: string): Promise<LogEntry[]> {
  const params = new URLSearchParams({ query })
  if (from) params.set('from', from)
  if (to) params.set('to', to)

  return apiFetch<LogEntry[]>(
    `/v1/projects/${opts.projectRef}/logs?${params}`,
    opts.accessToken,
  )
}

async function queryPolicies(opts: ApiOptions): Promise<PolicyEntry[]> {
  return apiFetch<PolicyEntry[]>(
    `/v1/projects/${opts.projectRef}/database/query`,
    opts.accessToken,
    {
      method: 'POST',
      body: JSON.stringify({ query: 'SELECT * FROM pg_policies' }),
    },
  )
}

async function queryRecentRlsDenials(opts: ApiOptions, hours = 24): Promise<LogEntry[]> {
  const from = new Date(Date.now() - hours * 3600_000).toISOString()
  const query = `SELECT timestamp, event_message, level, metadata FROM edge_logs WHERE event_message LIKE '%42501%' OR event_message LIKE '%permission denied%' OR event_message LIKE '%row-level security%' ORDER BY timestamp DESC LIMIT 50`
  return queryLogs(opts, query, from)
}

async function verifyToken(accessToken: string): Promise<boolean> {
  try {
    await apiFetch('/v1/projects', accessToken)
    return true
  } catch {
    return false
  }
}

// ═══════════════════════════════════════
// Token 管理
// ═══════════════════════════════════════

async function readToken(): Promise<ProviderToken | null> {
  // 1. 环境变量
  if (process.env.SUPABASE_ACCESS_TOKEN) {
    return { access_token: process.env.SUPABASE_ACCESS_TOKEN, source: 'env' }
  }

  // 2. CLI 配置文件
  const { readJson } = await import('../../utils/fs.js')
  const { homedir } = await import('node:os')
  const { resolve } = await import('node:path')

  const home = homedir()
  const configPaths = [
    resolve(process.env.APPDATA || home, 'supabase', 'config.json'),
    resolve(home, '.config', 'supabase', 'config.json'),
  ]

  for (const configPath of configPaths) {
    const config = await readJson(configPath) as { access_token?: string } | null
    if (config?.access_token) {
      return { access_token: config.access_token, source: 'cli-config' }
    }
  }

  return null
}

// ═══════════════════════════════════════
// Supabase Provider 实现
// ═══════════════════════════════════════

export const supabaseProvider: DatabaseProvider = {
  name: 'supabase',

  detect(pkg, env) {
    const deps = {
      ...(pkg.dependencies as Record<string, string> || {}),
      ...(pkg.devDependencies as Record<string, string> || {}),
    }

    let source: string | null = null
    if (deps['@supabase/supabase-js'] || deps['@supabase/ssr']) {
      source = deps['@supabase/supabase-js'] ? '@supabase/supabase-js' : '@supabase/ssr'
    } else if (deps['@supabase/admin']) {
      source = '@supabase/admin'
    }

    if (!source) return null

    // 提取 project ref
    const url = env['NEXT_PUBLIC_SUPABASE_URL'] || env['SUPABASE_URL'] || ''
    const match = url.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/i)

    return {
      type: 'supabase',
      source,
      projectRef: match ? match[1] : null,
      confidence: match ? 'high' : url.includes('supabase') ? 'medium' : 'low',
    }
  },

  async collectEvidence(config: ProviderConfig): Promise<CloudEvidence> {
    const errors: string[] = []
    let tokenOk = false
    let tokenSource: string | null = null
    let policies: PolicyEntry[] = []
    let denials: LogEntry[] = []

    // 读取 token
    const token = config.accessToken
      ? { access_token: config.accessToken, source: 'config' }
      : await readToken()

    if (!token) {
      errors.push('未找到 Supabase 访问令牌。设置 SUPABASE_ACCESS_TOKEN 环境变量或运行 supabase login。')
      return {
        provider: 'supabase',
        tokenOk: false,
        tokenSource: null,
        policies: [],
        denials: [],
        capturedAt: new Date().toISOString(),
        errors,
      }
    }

    tokenSource = token.source

    // 验证 token
    try {
      tokenOk = await verifyToken(token.access_token)
      if (!tokenOk) {
        errors.push('Supabase 访问令牌无效。')
      }
    } catch (err) {
      errors.push(`Token 验证失败: ${(err as Error).message}`)
    }

    // 采集数据
    if (tokenOk && config.projectRef) {
      const apiOpts: ApiOptions = {
        accessToken: token.access_token,
        projectRef: config.projectRef,
      }

      try {
        const [policiesResult, denialsResult] = await Promise.all([
          queryPolicies(apiOpts).catch(() => []),
          queryRecentRlsDenials(apiOpts).catch(() => []),
        ])
        policies = policiesResult
        denials = denialsResult
      } catch (err) {
        errors.push(`云端数据采集失败: ${(err as Error).message}`)
      }
    }

    return {
      provider: 'supabase',
      tokenOk,
      tokenSource,
      policies,
      denials,
      capturedAt: new Date().toISOString(),
      errors,
    }
  },

  getUrlPatterns() {
    return [/\.supabase\.co/i, /\/rest\/v1\//]
  },
}

export default supabaseProvider
