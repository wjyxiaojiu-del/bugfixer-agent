import type { CloudEvidence } from './provider.js'
import type { PolicyEntry, LogEntry } from './api.js'
import { getProvider, detectDatabases } from './registry.js'

// 重新导出类型以保持向后兼容
export type { CloudEvidence } from './provider.js'
export type { PolicyEntry, LogEntry } from './api.js'

/**
 * L3 云端证据采集（通用版本）
 * @param providerName 数据库 provider 名称
 * @param config provider 配置
 */
export async function collectEvidence(
  providerName: string,
  config: { accessToken?: string; projectRef: string },
): Promise<CloudEvidence> {
  const provider = getProvider(providerName)
  if (!provider) {
    return {
      provider: providerName,
      tokenOk: false,
      tokenSource: null,
      policies: [],
      denials: [],
      capturedAt: new Date().toISOString(),
      errors: [`未知的数据库 provider: ${providerName}`],
    }
  }

  return provider.collectEvidence(config)
}

/**
 * 自动检测并采集所有数据库的证据
 * @param pkg package.json 内容
 * @param env 环境变量
 * @param projectDir 项目目录
 */
export async function collectAllEvidence(
  pkg: Record<string, unknown> | null,
  env: Record<string, string>,
): Promise<CloudEvidence[]> {
  const detections = detectDatabases(pkg, env)
  const results: CloudEvidence[] = []

  for (const detection of detections) {
    const provider = getProvider(detection.type)
    if (!provider) continue

    try {
      const evidence = await provider.collectEvidence({
        projectRef: detection.projectRef || '',
      })
      results.push(evidence)
    } catch (err) {
      results.push({
        provider: detection.type,
        tokenOk: false,
        tokenSource: null,
        policies: [],
        denials: [],
        capturedAt: new Date().toISOString(),
        errors: [`${detection.type} 证据采集失败: ${(err as Error).message}`],
      })
    }
  }

  return results
}

/**
 * L3 云端证据采集（Supabase 专用，向后兼容）
 * @deprecated 使用 collectEvidence('supabase', config) 代替
 */
export async function collectCloudEvidence(projectRef: string): Promise<CloudEvidence> {
  return collectEvidence('supabase', { projectRef })
}
