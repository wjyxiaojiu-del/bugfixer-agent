import type { DatabaseProvider, DatabaseDetection, ProviderConfig, CloudEvidence } from './provider.js'
import type { PolicyEntry, LogEntry } from './api.js'

// ═══════════════════════════════════════
// Neon 检测
// ═══════════════════════════════════════

function detectNeon(pkg: Record<string, unknown>, env: Record<string, string>): DatabaseDetection | null {
  const deps = {
    ...(pkg.dependencies as Record<string, string> || {}),
    ...(pkg.devDependencies as Record<string, string> || {}),
  }

  // 检查 Neon 相关依赖
  const hasNeonDeps = deps['@neondatabase/serverless'] ||
    deps['@neon-tech/serverless'] ||
    deps['neon']

  // 或者通过 DATABASE_URL 检测
  const dbUrl = env['DATABASE_URL'] || env['NEON_DATABASE_URL'] || ''
  const isNeonUrl = dbUrl.includes('neon.tech')

  if (!hasNeonDeps && !isNeonUrl) return null

  // 从 URL 提取项目信息
  const match = dbUrl.match(/ep-([a-z0-9-]+)\.([a-z0-9-]+)\.aws\.neon\.tech/i)

  // 确定 source（包名而非版本号）
  let source = 'DATABASE_URL'
  if (deps['@neondatabase/serverless']) source = '@neondatabase/serverless'
  else if (deps['neon']) source = 'neon'
  else if (deps['@neon-tech/serverless']) source = '@neon-tech/serverless'

  return {
    type: 'neon',
    source,
    projectRef: match ? `${match[1]}.${match[2]}` : null,
    confidence: match ? 'high' : isNeonUrl ? 'high' : 'medium',
  }
}

// ═══════════════════════════════════════
// Neon Token 管理
// ═══════════════════════════════════════

async function readNeonToken(): Promise<{ access_token: string; source: string } | null> {
  // 1. 环境变量
  if (process.env.NEON_API_KEY) {
    return { access_token: process.env.NEON_API_KEY, source: 'env' }
  }

  // 2. neon CLI 配置
  try {
    const { readJson } = await import('../../utils/fs.js')
    const { homedir } = await import('node:os')
    const { resolve } = await import('node:path')

    const home = homedir()
    const configPaths = [
      resolve(home, '.config', 'neonctl', 'credentials.json'),
      resolve(home, '.neon', 'credentials.json'),
    ]

    for (const configPath of configPaths) {
      const config = await readJson(configPath) as { api_key?: string; access_token?: string } | null
      if (config?.api_key || config?.access_token) {
        return { access_token: config.api_key || config.access_token!, source: 'neon-cli' }
      }
    }
  } catch {
    // 忽略
  }

  return null
}

// ═══════════════════════════════════════
// Neon API
// ═══════════════════════════════════════

const NEON_API_BASE = 'https://console.neon.tech/api/v2'

async function neonFetch<T>(path: string, token: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${NEON_API_BASE}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!res.ok) {
    throw new Error(`Neon API error: ${res.status} ${res.statusText}`)
  }

  return res.json() as Promise<T>
}

interface NeonProject {
  id: string
  name: string
  region_id: string
  created_at: string
}

async function listProjects(token: string): Promise<NeonProject[]> {
  const data = await neonFetch<{ projects: NeonProject[] }>('/projects', token)
  return data.projects || []
}

async function listBranches(token: string, projectId: string): Promise<Array<{ id: string; name: string; primary: boolean }>> {
  const data = await neonFetch<{ branches: Array<{ id: string; name: string; primary: boolean }> }>(
    `/projects/${projectId}/branches`,
    token,
  )
  return data.branches || []
}

// ═══════════════════════════════════════
// Neon Provider
// ═══════════════════════════════════════

export const neonProvider: DatabaseProvider = {
  name: 'neon',

  detect(pkg, env) {
    return detectNeon(pkg, env)
  },

  async collectEvidence(config: ProviderConfig): Promise<CloudEvidence> {
    const errors: string[] = []
    let tokenOk = false
    let tokenSource: string | null = null
    const policies: PolicyEntry[] = []

    // 读取 token
    const token = config.accessToken
      ? { access_token: config.accessToken, source: 'config' }
      : await readNeonToken()

    if (!token) {
      errors.push('未找到 Neon API Key。设置 NEON_API_KEY 环境变量，或运行 neonctl auth。')
      return {
        provider: 'neon',
        tokenOk: false,
        tokenSource: null,
        policies: [],
        denials: [],
        capturedAt: new Date().toISOString(),
        errors,
      }
    }

    tokenSource = token.source

    // 查询项目列表验证 token
    try {
      const projects = await listProjects(token.access_token)
      tokenOk = true

      // 将项目列表作为策略记录
      for (const project of projects.slice(0, 5)) {
        policies.push({
          schemaname: 'neon',
          tablename: project.name,
          policyname: project.id,
          permissive: 'YES',
          roles: ['all'],
          cmd: 'ALL',
          qual: project.region_id,
          with_check: null,
        })
      }

      // 如果有 projectRef，查询分支
      if (config.projectRef) {
        try {
          const branches = await listBranches(token.access_token, config.projectRef)
          for (const branch of branches) {
            policies.push({
              schemaname: 'branch',
              tablename: branch.name,
              policyname: branch.id,
              permissive: branch.primary ? 'YES' : 'NO',
              roles: ['all'],
              cmd: 'ALL',
              qual: branch.primary ? 'primary' : 'secondary',
              with_check: null,
            })
          }
        } catch {
          // 分支查询失败，忽略
        }
      }
    } catch (err) {
      errors.push(`Neon API 调用失败: ${(err as Error).message}`)
    }

    return {
      provider: 'neon',
      tokenOk,
      tokenSource,
      policies,
      denials: [],
      extra: {
        projectRef: config.projectRef,
      },
      capturedAt: new Date().toISOString(),
      errors,
    }
  },

  getUrlPatterns() {
    return [/\.neon\.tech/i, /neon\.tech/i]
  },
}

export default neonProvider
