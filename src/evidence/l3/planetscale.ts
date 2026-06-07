import type { DatabaseProvider, DatabaseDetection, ProviderConfig, CloudEvidence } from './provider.js'
import type { PolicyEntry, LogEntry } from './api.js'

// ═══════════════════════════════════════
// PlanetScale 检测
// ═══════════════════════════════════════

function detectPlanetScale(pkg: Record<string, unknown>, env: Record<string, string>): DatabaseDetection | null {
  const deps = {
    ...(pkg.dependencies as Record<string, string> || {}),
    ...(pkg.devDependencies as Record<string, string> || {}),
  }

  // 检查 PlanetScale 相关依赖
  const hasPsDeps = deps['@planetscale/database'] ||
    deps['@planetscale/serverless'] ||
    deps['prisma'] && env['DATABASE_URL']?.includes('psdb.cloud')

  if (!hasPsDeps) return null

  // 从 DATABASE_URL 提取项目信息
  // 格式: mysql://user:pass@aws.connect.psdb.cloud/dbname?ssl={"rejectUnauthorized":true}
  const dbUrl = env['DATABASE_URL'] || ''
  // 匹配数据库名（在 psdb.cloud 之前的部分）
  const match = dbUrl.match(/@([^.]+)\.connect\.psdb\.cloud/i)

  return {
    type: 'planetscale',
    source: deps['@planetscale/database'] ? '@planetscale/database' : '@planetscale/serverless',
    projectRef: match ? match[1] : null,
    confidence: match ? 'high' : dbUrl.includes('psdb') ? 'medium' : 'low',
  }
}

// ═══════════════════════════════════════
// PlanetScale Token 管理
// ═══════════════════════════════════════

async function readPlanetScaleToken(): Promise<{ access_token: string; source: string } | null> {
  // 1. 环境变量
  if (process.env.PLANETSCALE_SERVICE_TOKEN_ID && process.env.PLANETSCALE_SERVICE_TOKEN) {
    return {
      access_token: `${process.env.PLANETSCALE_SERVICE_TOKEN_ID}:${process.env.PLANETSCALE_SERVICE_TOKEN}`,
      source: 'env',
    }
  }

  // 2. pscale CLI 配置
  try {
    const { readJson } = await import('../../utils/fs.js')
    const { homedir } = await import('node:os')
    const { resolve } = await import('node:path')

    const home = homedir()
    const configPaths = [
      resolve(home, '.config', 'planetscale', 'config.json'),
      resolve(home, '.pscale', 'config.json'),
    ]

    for (const configPath of configPaths) {
      const config = await readJson(configPath) as { access_token?: string } | null
      if (config?.access_token) {
        return { access_token: config.access_token, source: 'pscale-cli' }
      }
    }
  } catch {
    // 忽略
  }

  return null
}

// ═══════════════════════════════════════
// PlanetScale API
// ═══════════════════════════════════════

const PS_API_BASE = 'https://api.planetscale.com'

async function psFetch<T>(path: string, token: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${PS_API_BASE}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!res.ok) {
    throw new Error(`PlanetScale API error: ${res.status} ${res.statusText}`)
  }

  return res.json() as Promise<T>
}

async function listDatabases(token: string, org: string): Promise<Array<{ name: string; id: string }>> {
  return psFetch(`/v1/organizations/${org}/databases`, token)
}

async function getDatabaseBranches(token: string, org: string, db: string): Promise<Array<{ name: string; production: boolean }>> {
  return psFetch(`/v1/organizations/${org}/databases/${db}/branches`, token)
}

// ═══════════════════════════════════════
// PlanetScale Provider
// ═══════════════════════════════════════

export const planetscaleProvider: DatabaseProvider = {
  name: 'planetscale',

  detect(pkg, env) {
    return detectPlanetScale(pkg, env)
  },

  async collectEvidence(config: ProviderConfig): Promise<CloudEvidence> {
    const errors: string[] = []
    let tokenOk = false
    let tokenSource: string | null = null
    const policies: PolicyEntry[] = []

    // 读取 token
    const token = config.accessToken
      ? { access_token: config.accessToken, source: 'config' }
      : await readPlanetScaleToken()

    if (!token) {
      errors.push('未找到 PlanetScale 访问令牌。设置 PLANETSCALE_SERVICE_TOKEN_ID 和 PLANETSCALE_SERVICE_TOKEN 环境变量，或运行 pscale auth login。')
      return {
        provider: 'planetscale',
        tokenOk: false,
        tokenSource: null,
        policies: [],
        denials: [],
        capturedAt: new Date().toISOString(),
        errors,
      }
    }

    tokenSource = token.source

    // 尝试查询数据库列表验证 token
    try {
      const org = config.org as string || process.env.PLANETSCALE_ORG || ''
      if (org) {
        const dbs = await listDatabases(token.access_token, org)
        tokenOk = true

        // 将数据库列表作为策略记录
        for (const db of dbs) {
          policies.push({
            schemaname: org,
            tablename: db.name,
            policyname: 'database',
            permissive: 'YES',
            roles: ['all'],
            cmd: 'ALL',
            qual: null,
            with_check: null,
          })
        }
      } else {
        // 没有 org 信息，只验证 token 格式
        tokenOk = token.access_token.includes(':') || token.access_token.length > 10
      }
    } catch (err) {
      errors.push(`PlanetScale API 调用失败: ${(err as Error).message}`)
    }

    return {
      provider: 'planetscale',
      tokenOk,
      tokenSource,
      policies,
      denials: [],
      extra: {
        org: config.org,
        projectRef: config.projectRef,
      },
      capturedAt: new Date().toISOString(),
      errors,
    }
  },

  getUrlPatterns() {
    return [/\.psdb\.cloud/i, /planetscale\.com/i]
  },
}

export default planetscaleProvider
