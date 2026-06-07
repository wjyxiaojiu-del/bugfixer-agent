import type { DatabaseProvider, DatabaseDetection } from './provider.js'

// ═══════════════════════════════════════
// Provider 注册表
// ═══════════════════════════════════════

const providers: Map<string, DatabaseProvider> = new Map()

/** 注册 provider */
export function registerProvider(provider: DatabaseProvider): void {
  providers.set(provider.name, provider)
}

/** 获取指定名称的 provider */
export function getProvider(name: string): DatabaseProvider | undefined {
  return providers.get(name)
}

/** 获取所有已注册的 provider */
export function getAllProviders(): DatabaseProvider[] {
  return Array.from(providers.values())
}

/**
 * 检测项目使用了哪些数据库
 * @param pkg package.json 内容
 * @param env 环境变量
 * @returns 检测到的数据库列表
 */
export function detectDatabases(
  pkg: Record<string, unknown> | null,
  env: Record<string, string>,
): DatabaseDetection[] {
  if (!pkg) return []

  return getAllProviders()
    .map(p => p.detect(pkg, env))
    .filter((d): d is DatabaseDetection => d !== null)
}

/**
 * 获取所有 provider 的 URL 匹配模式
 * 用于 L2 recognizer 识别请求属于哪个数据库
 */
export function getAllUrlPatterns(): Array<{ provider: string; pattern: RegExp }> {
  const result: Array<{ provider: string; pattern: RegExp }> = []
  for (const provider of getAllProviders()) {
    for (const pattern of provider.getUrlPatterns()) {
      result.push({ provider: provider.name, pattern })
    }
  }
  return result
}

export default providers
