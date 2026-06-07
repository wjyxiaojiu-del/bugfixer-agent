import type { DatabaseProvider, DatabaseDetection, ProviderConfig, CloudEvidence } from './provider.js'
import type { PolicyEntry, LogEntry } from './api.js'

// ═══════════════════════════════════════
// Sentry 检测
// ═══════════════════════════════════════

export interface SentryDetection extends DatabaseDetection {
  type: 'sentry'
  dsn?: string
  org?: string
  project?: string
}

/**
 * 检测 Sentry 配置
 */
function detectSentry(env: Record<string, string>): SentryDetection | null {
  const dsn = env['SENTRY_DSN']
  const authToken = env['SENTRY_AUTH_TOKEN']
  const org = env['SENTRY_ORG']
  const project = env['SENTRY_PROJECT']

  if (!dsn && !authToken) return null

  return {
    type: 'sentry',
    source: dsn ? 'SENTRY_DSN' : 'SENTRY_AUTH_TOKEN',
    projectRef: project || null,
    confidence: authToken ? 'high' : 'medium',
    dsn,
    org,
    project,
  }
}

// ═══════════════════════════════════════
// Sentry API
// ═══════════════════════════════════════

interface SentryIssue {
  id: string
  title: string
  culprit: string
  count: string
  firstSeen: string
  lastSeen: string
  level: string
  userCount: number
}

interface SentryEvent {
  eventID: string
  message: string
  platform: string
  tags: Array<{ key: string; value: string }>
  entries: Array<{
    type: string
    data: {
      values?: Array<{
        type: string
        value: string
        stacktrace?: {
          frames: Array<{
            filename: string
            function: string
            lineNo: number
          }>
        }
      }>
    }
  }>
}

const SENTRY_API_BASE = 'https://sentry.io/api/0'

async function sentryFetch<T>(path: string, authToken: string): Promise<T> {
  const res = await fetch(`${SENTRY_API_BASE}${path}`, {
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json',
    },
  })

  if (!res.ok) {
    throw new Error(`Sentry API error: ${res.status} ${res.statusText}`)
  }

  return res.json() as Promise<T>
}

async function listIssues(
  authToken: string,
  org: string,
  project: string,
  query = 'is:unresolved',
  limit = 10,
): Promise<SentryIssue[]> {
  const params = new URLSearchParams({
    query,
    limit: limit.toString(),
    sort: 'date',
  })
  return sentryFetch<SentryIssue[]>(
    `/projects/${org}/${project}/issues/?${params}`,
    authToken,
  )
}

async function getIssueDetails(
  authToken: string,
  issueId: string,
): Promise<SentryEvent> {
  const events = await sentryFetch<SentryEvent[]>(
    `/issues/${issueId}/events/?full=true&limit=1`,
    authToken,
  )
  return events[0]
}

// ═══════════════════════════════════════
// Sentry Provider
// ═══════════════════════════════════════

export const sentryProvider: DatabaseProvider = {
  name: 'sentry',

  detect(_pkg, env) {
    return detectSentry(env)
  },

  async collectEvidence(config: ProviderConfig): Promise<CloudEvidence> {
    const errors: string[] = []
    let tokenOk = false
    let tokenSource: string | null = null
    const policies: PolicyEntry[] = []
    const denials: LogEntry[] = []

    // 读取 token
    const authToken = config.accessToken || process.env.SENTRY_AUTH_TOKEN

    if (!authToken) {
      errors.push('未找到 Sentry Auth Token。设置 SENTRY_AUTH_TOKEN 环境变量。')
      return {
        provider: 'sentry',
        tokenOk: false,
        tokenSource: null,
        policies: [],
        denials: [],
        capturedAt: new Date().toISOString(),
        errors,
      }
    }

    tokenSource = 'env'
    const org = config.org as string || process.env.SENTRY_ORG || ''
    const project = config.project as string || process.env.SENTRY_PROJECT || ''

    if (!org || !project) {
      errors.push('缺少 SENTRY_ORG 或 SENTRY_PROJECT 环境变量。')
      return {
        provider: 'sentry',
        tokenOk: false,
        tokenSource,
        policies: [],
        denials: [],
        capturedAt: new Date().toISOString(),
        errors,
      }
    }

    // 查询 issues
    try {
      const issues = await listIssues(authToken, org, project)
      tokenOk = true

      // 将 issues 转换为 policies 格式
      for (const issue of issues.slice(0, 10)) {
        policies.push({
          schemaname: 'sentry',
          tablename: issue.title,
          policyname: issue.id,
          permissive: issue.level === 'error' ? 'NO' : 'YES',
          roles: [`${issue.userCount} users`],
          cmd: issue.count,
          qual: issue.culprit,
          with_check: null,
        })
      }
    } catch (err) {
      errors.push(`Sentry API 调用失败: ${(err as Error).message}`)
    }

    return {
      provider: 'sentry',
      tokenOk,
      tokenSource,
      policies,
      denials,
      extra: {
        org,
        project,
      },
      capturedAt: new Date().toISOString(),
      errors,
    }
  },

  getUrlPatterns() {
    return [/sentry\.io/i, /ingest\.sentry\.io/i]
  },
}

export default sentryProvider
