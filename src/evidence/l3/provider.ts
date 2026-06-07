import type { PolicyEntry, LogEntry } from './api.js'

// ═══════════════════════════════════════
// Provider 接口定义
// ═══════════════════════════════════════

export interface DatabaseProvider {
  /** provider 名称 */
  name: string
  /** 检测是否使用了该数据库 */
  detect(pkg: Record<string, unknown>, env: Record<string, string>): DatabaseDetection | null
  /** 收集云端证据 */
  collectEvidence(config: ProviderConfig): Promise<CloudEvidence>
  /** 获取 URL 匹配模式（用于 L2 recognizer） */
  getUrlPatterns(): RegExp[]
}

export interface DatabaseDetection {
  /** 数据库类型 */
  type: 'supabase' | 'firebase' | 'planetscale' | 'neon' | 'mongodb' | 'sentry'
  /** 依赖来源（包名或配置文件） */
  source: string
  /** 项目引用 ID */
  projectRef: string | null
  /** 检测置信度 */
  confidence: 'high' | 'medium' | 'low'
}

export interface ProviderConfig {
  /** 访问令牌 */
  accessToken?: string
  /** 项目引用 ID */
  projectRef: string
  /** 其他配置 */
  [key: string]: unknown
}

// ═══════════════════════════════════════
// 通用 CloudEvidence 接口
// ═══════════════════════════════════════

export interface CloudEvidence {
  /** provider 名称 */
  provider: string
  /** 令牌是否有效 */
  tokenOk: boolean
  /** 令牌来源 */
  tokenSource: string | null
  /** 策略/规则列表（Supabase RLS、Firebase rules 等） */
  policies: PolicyEntry[]
  /** 权限拒绝日志 */
  denials: LogEntry[]
  /** provider 特有数据 */
  extra?: Record<string, unknown>
  /** 采集时间 */
  capturedAt: string
  /** 错误信息 */
  errors: string[]
}

// ═══════════════════════════════════════
// Token 接口
// ═══════════════════════════════════════

export interface ProviderToken {
  /** 访问令牌 */
  access_token: string
  /** 令牌来源 */
  source: string
}
