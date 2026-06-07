import type { DatabaseProvider, DatabaseDetection, ProviderConfig, CloudEvidence } from './provider.js'
import type { PolicyEntry, LogEntry } from './api.js'

// ═══════════════════════════════════════
// MongoDB Atlas 检测
// ═══════════════════════════════════════

function detectMongoDB(pkg: Record<string, unknown>, env: Record<string, string>): DatabaseDetection | null {
  const deps = {
    ...(pkg.dependencies as Record<string, string> || {}),
    ...(pkg.devDependencies as Record<string, string> || {}),
  }

  // 检查 MongoDB 相关依赖
  const hasMongoDeps = deps['mongodb'] || deps['mongoose']

  // 或者通过 MONGODB_URI 检测
  const mongoUri = env['MONGODB_URI'] || env['MONGO_URI'] || ''
  const isMongoUri = mongoUri.includes('mongodb.net') || mongoUri.includes('mongodb+srv')

  if (!hasMongoDeps && !isMongoUri) return null

  // 从 URI 提取项目信息
  // 格式: mongodb+srv://user:pass@cluster0.abc123.mongodb.net/dbname?retryWrites=true&w=majority
  const match = mongoUri.match(/mongodb\+srv:\/\/[^@]+@([^.]+)\.[^.]+\.mongodb\.net/i)

  return {
    type: 'mongodb',
    source: hasMongoDeps ? (deps['mongoose'] ? 'mongoose' : 'mongodb') : 'MONGODB_URI',
    projectRef: match ? match[1] : null,
    confidence: match ? 'high' : isMongoUri ? 'high' : 'medium',
  }
}

// ═══════════════════════════════════════
// MongoDB Atlas Token 管理
// ═══════════════════════════════════════

async function readMongoToken(): Promise<{ public_key: string; private_key: string; source: string } | null> {
  // 1. 环境变量
  if (process.env.MONGODB_ATLAS_PUBLIC_KEY && process.env.MONGODB_ATLAS_PRIVATE_KEY) {
    return {
      public_key: process.env.MONGODB_ATLAS_PUBLIC_KEY,
      private_key: process.env.MONGODB_ATLAS_PRIVATE_KEY,
      source: 'env',
    }
  }

  // 2. mongosh 配置
  try {
    const { readJson } = await import('../../utils/fs.js')
    const { homedir } = await import('node:os')
    const { resolve } = await import('node:path')

    const home = homedir()
    const configPath = resolve(home, '.config', 'atlascli', 'config.json')
    const config = await readJson(configPath) as { publicKey?: string; privateKey?: string } | null

    if (config?.publicKey && config?.privateKey) {
      return {
        public_key: config.publicKey,
        private_key: config.privateKey,
        source: 'atlas-cli',
      }
    }
  } catch {
    // 忽略
  }

  return null
}

// ═══════════════════════════════════════
// MongoDB Atlas API
// ═══════════════════════════════════════

const ATLAS_API_BASE = 'https://cloud.mongodb.com/api/atlas/v2'

async function atlasFetch<T>(path: string, publicKey: string, privateKey: string, options?: RequestInit): Promise<T> {
  const auth = Buffer.from(`${publicKey}:${privateKey}`).toString('base64')
  const res = await fetch(`${ATLAS_API_BASE}${path}`, {
    ...options,
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.atlas.2024-05-30+json',
      ...options?.headers,
    },
  })

  if (!res.ok) {
    throw new Error(`MongoDB Atlas API error: ${res.status} ${res.statusText}`)
  }

  return res.json() as Promise<T>
}

interface AtlasProject {
  id: string
  name: string
  orgId: string
}

interface AtlasCluster {
  name: string
  stateName: string
  mongoDBVersion: string
}

async function listProjects(publicKey: string, privateKey: string): Promise<AtlasProject[]> {
  const data = await atlasFetch<{ results: AtlasProject[] }>('/groups', publicKey, privateKey)
  return data.results || []
}

async function listClusters(publicKey: string, privateKey: string, projectId: string): Promise<AtlasCluster[]> {
  const data = await atlasFetch<{ results: AtlasCluster[] }>(
    `/groups/${projectId}/clusters`,
    publicKey,
    privateKey,
  )
  return data.results || []
}

// ═══════════════════════════════════════
// MongoDB Atlas Provider
// ═══════════════════════════════════════

export const mongodbProvider: DatabaseProvider = {
  name: 'mongodb',

  detect(pkg, env) {
    return detectMongoDB(pkg, env)
  },

  async collectEvidence(config: ProviderConfig): Promise<CloudEvidence> {
    const errors: string[] = []
    let tokenOk = false
    let tokenSource: string | null = null
    const policies: PolicyEntry[] = []

    // 读取 token
    const token = config.accessToken
      ? { public_key: 'config', private_key: config.accessToken, source: 'config' }
      : await readMongoToken()

    if (!token) {
      errors.push('未找到 MongoDB Atlas API Key。设置 MONGODB_ATLAS_PUBLIC_KEY 和 MONGODB_ATLAS_PRIVATE_KEY 环境变量，或运行 atlas auth login。')
      return {
        provider: 'mongodb',
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
      const projects = await listProjects(token.public_key, token.private_key)
      tokenOk = true

      // 将项目列表作为策略记录
      for (const project of projects.slice(0, 5)) {
        policies.push({
          schemaname: 'mongodb',
          tablename: project.name,
          policyname: project.id,
          permissive: 'YES',
          roles: ['all'],
          cmd: 'ALL',
          qual: project.orgId,
          with_check: null,
        })

        // 查询集群
        try {
          const clusters = await listClusters(token.public_key, token.private_key, project.id)
          for (const cluster of clusters) {
            policies.push({
              schemaname: 'cluster',
              tablename: cluster.name,
              policyname: cluster.stateName,
              permissive: cluster.stateName === 'IDLE' ? 'YES' : 'NO',
              roles: ['all'],
              cmd: 'ALL',
              qual: `MongoDB ${cluster.mongoDBVersion}`,
              with_check: null,
            })
          }
        } catch {
          // 集群查询失败，忽略
        }
      }
    } catch (err) {
      errors.push(`MongoDB Atlas API 调用失败: ${(err as Error).message}`)
    }

    return {
      provider: 'mongodb',
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
    return [/mongodb\.net/i, /mongodb\.com/i, /mongodb\+srv/i]
  },
}

export default mongodbProvider
