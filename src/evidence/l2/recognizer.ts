import type { NetworkEntry } from './cdp.js'

export interface RecognizedIssue {
  /** 问题类型 */
  type: string
  /** 严重程度 */
  severity: 'critical' | 'warning' | 'info'
  /** 人类可读描述 */
  message: string
  /** 相关网络请求 */
  entry: NetworkEntry
}

// ═══════════════════════════════════════
// 模式注册系统
// ═══════════════════════════════════════

export interface IssuePattern {
  /** 问题类型 */
  type: string
  /** 默认严重程度 */
  severity: 'critical' | 'warning' | 'info'
  /** 返回 message 表示匹配，null 表示不适用 */
  match(entry: NetworkEntry): string | null
}

/** 模式注册表 */
export const patterns: IssuePattern[] = []

/** 注册模式 */
export function registerPattern(pattern: IssuePattern): void {
  patterns.push(pattern)
}

// ═══════════════════════════════════════
// 内置模式
// ═══════════════════════════════════════

/**
 * 识别 Supabase RLS 拒绝
 * 关键：认 body code:42501，不认 HTTP 状态（老栈有时返回 400）
 */
registerPattern({
  type: 'rls_denied',
  severity: 'critical',
  match(entry) {
    // 只检查 Supabase REST API
    if (!entry.url.includes('/rest/v1/') && !entry.url.includes('.supabase.co')) return null
    if (!entry.body) return null

    try {
      const body = JSON.parse(entry.body)
      // Postgres 错误码 42501 = insufficient_privilege
      if (body.code === '42501') return `RLS 策略拒绝了请求: ${entry.method} ${entry.url} → 42501`
      if (body.message?.includes('permission denied')) return `RLS 权限拒绝: ${entry.method} ${entry.url}`
      if (body.message?.includes('row-level security')) return `RLS 策略阻止: ${entry.method} ${entry.url}`
    } catch {
      // body 不是 JSON
    }
    return null
  },
})

/**
 * 识别认证错误
 */
registerPattern({
  type: 'auth_error',
  severity: 'critical',
  match(entry) {
    if (!entry.url.includes('/rest/v1/') && !entry.url.includes('.supabase.co')) return null

    if (entry.status === 401) return `认证失败: ${entry.method} ${entry.url} → 401`
    if (!entry.body) return null

    try {
      const body = JSON.parse(entry.body)
      if (body.error === 'invalid_grant') return `认证令牌无效: ${entry.method} ${entry.url}`
      if (body.msg?.includes('JWT')) return `JWT 错误: ${entry.method} ${entry.url}`
    } catch {}
    return null
  },
})

// ═══════════════════════════════════════
// Firebase 模式
// ═══════════════════════════════════════

/**
 * 识别 Firebase 权限拒绝
 */
registerPattern({
  type: 'firebase_permission_denied',
  severity: 'critical',
  match(entry) {
    if (!entry.url.includes('firestore.googleapis.com') &&
        !entry.url.includes('identitytoolkit.googleapis.com') &&
        !entry.url.includes('firebaseio.com')) return null

    try {
      const body = JSON.parse(entry.body || '{}')
      if (body.error?.code === 403 || body.error?.status === 'PERMISSION_DENIED') {
        return `Firebase 权限拒绝: ${entry.method} ${entry.url}`
      }
      if (body.error?.message?.includes('permission')) {
        return `Firebase 权限错误: ${body.error.message}`
      }
    } catch {}
    return null
  },
})

/**
 * 识别 Firebase 认证错误
 */
registerPattern({
  type: 'firebase_auth_error',
  severity: 'critical',
  match(entry) {
    if (!entry.url.includes('identitytoolkit.googleapis.com') &&
        !entry.url.includes('securetoken.googleapis.com')) return null

    if (entry.status === 400 || entry.status === 401) {
      try {
        const body = JSON.parse(entry.body || '{}')
        if (body.error?.message?.includes('INVALID_EMAIL') ||
            body.error?.message?.includes('EMAIL_NOT_FOUND') ||
            body.error?.message?.includes('INVALID_PASSWORD') ||
            body.error?.message?.includes('TOKEN_EXPIRED')) {
          return `Firebase 认证错误: ${body.error.message}`
        }
      } catch {}
      return `Firebase 认证失败: ${entry.method} ${entry.url} → ${entry.status}`
    }
    return null
  },
})

/**
 * 识别 Firebase 配额超限
 */
registerPattern({
  type: 'firebase_quota_exceeded',
  severity: 'warning',
  match(entry) {
    if (!entry.url.includes('googleapis.com')) return null

    try {
      const body = JSON.parse(entry.body || '{}')
      if (body.error?.code === 429 || body.error?.status === 'RESOURCE_EXHAUSTED') {
        return `Firebase 配额超限: ${entry.method} ${entry.url}`
      }
    } catch {}

    if (entry.status === 429) {
      return `Firebase 请求限流: ${entry.method} ${entry.url} → 429`
    }
    return null
  },
})

// ═══════════════════════════════════════
// PlanetScale 模式
// ═══════════════════════════════════════

/**
 * 识别 PlanetScale 连接错误
 */
registerPattern({
  type: 'planetscale_error',
  severity: 'critical',
  match(entry) {
    if (!entry.url.includes('psdb.cloud') && !entry.url.includes('planetscale.com')) return null

    if (entry.status >= 400) {
      try {
        const body = JSON.parse(entry.body || '{}')
        if (body.message?.includes('permission') || body.message?.includes('access')) {
          return `PlanetScale 权限错误: ${body.message}`
        }
        if (body.message?.includes('connection') || body.message?.includes('timeout')) {
          return `PlanetScale 连接错误: ${body.message}`
        }
      } catch {}
      return `PlanetScale 错误: ${entry.method} ${entry.url} → ${entry.status}`
    }
    return null
  },
})

/**
 * 识别 PlanetScale 分支错误
 */
registerPattern({
  type: 'planetscale_branch_error',
  severity: 'warning',
  match(entry) {
    if (!entry.url.includes('planetscale.com')) return null

    try {
      const body = JSON.parse(entry.body || '{}')
      if (body.message?.includes('branch') || body.message?.includes('deploy request')) {
        return `PlanetScale 分支错误: ${body.message}`
      }
    } catch {}
    return null
  },
})

// ═══════════════════════════════════════
// Neon 模式
// ═══════════════════════════════════════

/**
 * 识别 Neon 连接错误
 */
registerPattern({
  type: 'neon_error',
  severity: 'critical',
  match(entry) {
    if (!entry.url.includes('neon.tech')) return null

    if (entry.status >= 400) {
      try {
        const body = JSON.parse(entry.body || '{}')
        if (body.message?.includes('connection') || body.message?.includes('compute')) {
          return `Neon 连接错误: ${body.message}`
        }
        if (body.message?.includes('branch') || body.message?.includes('endpoint')) {
          return `Neon 分支/端点错误: ${body.message}`
        }
      } catch {}
      return `Neon 错误: ${entry.method} ${entry.url} → ${entry.status}`
    }
    return null
  },
})

// ═══════════════════════════════════════
// MongoDB Atlas 模式
// ═══════════════════════════════════════

/**
 * 识别 MongoDB Atlas 错误
 */
registerPattern({
  type: 'mongodb_error',
  severity: 'critical',
  match(entry) {
    if (!entry.url.includes('mongodb.net') && !entry.url.includes('mongodb.com')) return null

    if (entry.status >= 400) {
      try {
        const body = JSON.parse(entry.body || '{}')
        if (body.error?.includes('AuthenticationFailed') || body.errorCode === 18) {
          return `MongoDB 认证失败: ${body.error}`
        }
        if (body.error?.includes('NetworkTimeout') || body.errorCode === 89) {
          return `MongoDB 网络超时: ${body.error}`
        }
        if (body.error === 'Unauthorized') {
          return `MongoDB 未授权: 检查 API Key 权限`
        }
      } catch {}

      // 检查连接字符串错误
      if (entry.body?.includes('AuthenticationFailed')) {
        return `MongoDB 认证失败`
      }
      if (entry.body?.includes('NetworkTimeout')) {
        return `MongoDB 连接超时`
      }
    }
    return null
  },
})

/**
 * 识别 MongoDB Atlas API 错误
 */
registerPattern({
  type: 'mongodb_api_error',
  severity: 'warning',
  match(entry) {
    if (!entry.url.includes('cloud.mongodb.com')) return null

    if (entry.status === 401) {
      return `MongoDB Atlas API 认证失败: 检查 API Key`
    }
    if (entry.status === 403) {
      return `MongoDB Atlas API 权限不足: 检查 API Key 权限`
    }
    if (entry.status >= 500) {
      return `MongoDB Atlas API 服务错误: ${entry.status}`
    }
    return null
  },
})

/**
 * 识别服务端错误（5xx）
 */
registerPattern({
  type: 'server_error',
  severity: 'warning',
  match(entry) {
    if (entry.status >= 500) {
      return `服务端错误: ${entry.method} ${entry.url} → ${entry.status}`
    }
    return null
  },
})

/**
 * 识别 404 Not Found
 */
registerPattern({
  type: 'not_found',
  severity: 'warning',
  match(entry) {
    if (entry.status === 404) {
      return `资源不存在: ${entry.method} ${entry.url} → 404`
    }
    return null
  },
})

/**
 * 识别请求限流（429）
 */
registerPattern({
  type: 'rate_limited',
  severity: 'warning',
  match(entry) {
    if (entry.status === 429) {
      return `请求被限流: ${entry.method} ${entry.url} → 429`
    }
    return null
  },
})

/**
 * 识别请求体过大（413）
 */
registerPattern({
  type: 'payload_too_large',
  severity: 'warning',
  match(entry) {
    if (entry.status === 413) {
      return `请求体过大: ${entry.method} ${entry.url} → 413`
    }
    return null
  },
})

/**
 * 识别网关错误（502/503/504）
 */
registerPattern({
  type: 'gateway_error',
  severity: 'warning',
  match(entry) {
    if (entry.status === 502) return `Bad Gateway: ${entry.method} ${entry.url} → 502`
    if (entry.status === 503) return `Service Unavailable: ${entry.method} ${entry.url} → 503`
    if (entry.status === 504) return `Gateway Timeout: ${entry.method} ${entry.url} → 504`
    return null
  },
})

/**
 * 识别 CORS Preflight 失败
 */
registerPattern({
  type: 'cors_preflight_fail',
  severity: 'critical',
  match(entry) {
    if (entry.method === 'OPTIONS' && entry.status && entry.status >= 400) {
      return `CORS preflight 失败: ${entry.url} → ${entry.status}`
    }
    return null
  },
})

// ═══════════════════════════════════════
// 主入口
// ═══════════════════════════════════════

/**
 * 从网络请求中识别已知问题模式
 * 使用注册的模式列表，按顺序匹配（先匹配的优先级高）
 */
export function recognizeIssues(entries: NetworkEntry[]): RecognizedIssue[] {
  const issues: RecognizedIssue[] = []

  for (const entry of entries) {
    for (const pattern of patterns) {
      const message = pattern.match(entry)
      if (message) {
        issues.push({
          type: pattern.type,
          severity: pattern.severity,
          message,
          entry,
        })
        break  // 每个请求只匹配第一个模式
      }
    }
  }

  return issues
}

export default patterns
