import type { DatabaseProvider, DatabaseDetection, ProviderConfig, CloudEvidence, ProviderToken } from './provider.js'
import type { PolicyEntry, LogEntry } from './api.js'

// ═══════════════════════════════════════
// Firebase 检测
// ═══════════════════════════════════════

function detectFirebase(pkg: Record<string, unknown>): DatabaseDetection | null {
  const deps = {
    ...(pkg.dependencies as Record<string, string> || {}),
    ...(pkg.devDependencies as Record<string, string> || {}),
  }

  // 检查 Firebase 依赖
  if (deps['firebase'] || deps['firebase/app']) {
    return {
      type: 'firebase',
      source: deps['firebase'] ? 'firebase' : 'firebase/app',
      projectRef: null, // 需要从配置文件读取
      confidence: 'high',
    }
  }

  return null
}

function extractProjectId(env: Record<string, string>): string | null {
  return env['NEXT_PUBLIC_FIREBASE_PROJECT_ID'] ||
    env['FIREBASE_PROJECT_ID'] ||
    env['GCLOUD_PROJECT'] ||
    null
}

// ═══════════════════════════════════════
// Firebase Token 管理
// ═══════════════════════════════════════

async function readFirebaseToken(): Promise<ProviderToken | null> {
  // 1. 环境变量
  if (process.env.FIREBASE_TOKEN) {
    return { access_token: process.env.FIREBASE_TOKEN, source: 'env' }
  }

  // 2. Google Application Credentials
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return { access_token: process.env.GOOGLE_APPLICATION_CREDENTIALS, source: 'gcloud' }
  }

  // 3. Firebase CLI 配置
  try {
    const { readJson } = await import('../../utils/fs.js')
    const { homedir } = await import('node:os')
    const { resolve } = await import('node:path')

    const home = homedir()
    const configPath = resolve(home, '.config', 'configstore', 'firebase-tools.json')
    const config = await readJson(configPath) as { tokens?: { access_token?: string } } | null

    if (config?.tokens?.access_token) {
      return { access_token: config.tokens.access_token, source: 'firebase-cli' }
    }
  } catch {
    // 忽略错误
  }

  return null
}

// ═══════════════════════════════════════
// Firebase 证据收集
// ═══════════════════════════════════════

async function collectFirebaseEvidence(config: ProviderConfig): Promise<CloudEvidence> {
  const errors: string[] = []
  let tokenOk = false
  let tokenSource: string | null = null
  const policies: PolicyEntry[] = []
  const denials: LogEntry[] = []

  // 读取 token
  const token = config.accessToken
    ? { access_token: config.accessToken, source: 'config' }
    : await readFirebaseToken()

  if (!token) {
    errors.push('未找到 Firebase 访问令牌。设置 FIREBASE_TOKEN 环境变量或运行 firebase login。')
    return {
      provider: 'firebase',
      tokenOk: false,
      tokenSource: null,
      policies: [],
      denials: [],
      capturedAt: new Date().toISOString(),
      errors,
    }
  }

  tokenSource = token.source

  // 读取 Firestore rules 文件（如果存在）
  try {
    const { readText, fileExists } = await import('../../utils/fs.js')
    const { resolve } = await import('node:path')
    const cwd = process.cwd()

    const rulesPath = resolve(cwd, 'firestore.rules')
    if (await fileExists(rulesPath)) {
      const rulesContent = await readText(rulesPath)
      if (rulesContent) {
        // 将 rules 文件作为策略记录
        policies.push({
          schemaname: 'firestore',
          tablename: 'rules',
          policyname: 'firestore.rules',
          permissive: 'YES',
          roles: ['all'],
          cmd: 'ALL',
          qual: rulesContent.slice(0, 200), // 截取前 200 字符
          with_check: null,
        })
      }
    }

    // 检查 firebase.json
    const firebaseJsonPath = resolve(cwd, 'firebase.json')
    if (await fileExists(firebaseJsonPath)) {
      const firebaseConfig = await import('../../utils/fs.js').then(m => m.readJson(firebaseJsonPath))
      if (firebaseConfig) {
        tokenOk = true // 有 firebase.json 就认为配置有效
      }
    }
  } catch (err) {
    errors.push(`Firebase 配置读取失败: ${(err as Error).message}`)
  }

  // 尝试通过 Firebase CLI 获取项目信息
  if (config.projectRef) {
    try {
      const { execSync } = await import('node:child_process')
      const result = execSync('firebase projects:list --json', {
        encoding: 'utf-8',
        timeout: 10000,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      const projects = JSON.parse(result) as Array<{ projectId: string }>
      const project = projects.find(p => p.projectId === config.projectRef)
      if (project) {
        tokenOk = true
      }
    } catch {
      // Firebase CLI 可能未安装或未登录，忽略
    }
  }

  return {
    provider: 'firebase',
    tokenOk,
    tokenSource,
    policies,
    denials,
    extra: {
      projectId: config.projectRef,
    },
    capturedAt: new Date().toISOString(),
    errors,
  }
}

// ═══════════════════════════════════════
// Firebase Provider 实现
// ═══════════════════════════════════════

export const firebaseProvider: DatabaseProvider = {
  name: 'firebase',

  detect(pkg, env) {
    const detection = detectFirebase(pkg)
    if (!detection) return null

    // 尝试从环境变量提取项目 ID
    const projectId = extractProjectId(env)
    if (projectId) {
      detection.projectRef = projectId
      detection.confidence = 'high'
    }

    return detection
  },

  async collectEvidence(config: ProviderConfig): Promise<CloudEvidence> {
    return collectFirebaseEvidence(config)
  },

  getUrlPatterns() {
    return [
      /firebase\.googleapis\.com/i,
      /firestore\.googleapis\.com/i,
      /identitytoolkit\.googleapis\.com/i,
      /securetoken\.googleapis\.com/i,
    ]
  },
}

export default firebaseProvider
