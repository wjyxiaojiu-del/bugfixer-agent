import { resolve } from 'node:path'
import { readJson } from './utils/fs.js'
import type { LLMConfig, LLMProvider } from './diagnose/llm.js'

// ═══════════════════════════════════════
// 配置接口
// ═══════════════════════════════════════

export interface CsiConfig {
  /** LLM 配置 */
  llm?: LLMConfig
  /** 是否自动应用修复 */
  autoFix?: boolean
  /** 是否跳过 L3 云端采集 */
  skipCloud?: boolean
  /** 自定义 dev server 命令 */
  devCommand?: string[]
}

const CONFIG_DIR = '.csi'
const CONFIG_FILE = 'config.json'

// ═══════════════════════════════════════
// 配置加载
// ═══════════════════════════════════════

/**
 * 从多个来源加载配置，优先级：环境变量 > .csi/config.json > 默认值
 */
export async function loadConfig(projectRoot: string): Promise<CsiConfig> {
  // 1. 读 .csi/config.json
  const fileConfig = await readJson(resolve(projectRoot, CONFIG_DIR, CONFIG_FILE)) as CsiConfig | null

  // 2. 读环境变量
  const envConfig = loadEnvConfig()

  // 3. 合并（环境变量优先）
  return {
    llm: mergeLLMConfig(fileConfig?.llm, envConfig.llm),
    autoFix: envConfig.autoFix ?? fileConfig?.autoFix ?? false,
    skipCloud: envConfig.skipCloud ?? fileConfig?.skipCloud ?? false,
    devCommand: envConfig.devCommand ?? fileConfig?.devCommand,
  }
}

/**
 * 从环境变量读取 LLM 配置
 */
function loadEnvConfig(): Partial<CsiConfig> {
  const provider = process.env.CSI_LLM_PROVIDER as LLMProvider | undefined
  const apiKey = process.env.CSI_LLM_API_KEY
  const baseUrl = process.env.CSI_LLM_BASE_URL
  const model = process.env.CSI_LLM_MODEL

  const llm: LLMConfig | undefined = provider
    ? { provider, apiKey, baseUrl, model }
    : undefined

  return {
    llm,
    autoFix: process.env.CSI_AUTO_FIX === 'true' ? true : undefined,
    skipCloud: process.env.CSI_SKIP_CLOUD === 'true' ? true : undefined,
  }
}

/**
 * 合并 LLM 配置（环境变量优先）
 */
function mergeLLMConfig(file?: LLMConfig, env?: LLMConfig): LLMConfig | undefined {
  if (!file && !env) return undefined
  if (!env) return file
  if (!file) return env

  return {
    provider: env.provider || file.provider,
    apiKey: env.apiKey || file.apiKey,
    baseUrl: env.baseUrl || file.baseUrl,
    model: env.model || file.model,
  }
}

// ═══════════════════════════════════════
// 配置保存
// ═══════════════════════════════════════

/**
 * 保存配置到 .csi/config.json
 */
export async function saveConfig(projectRoot: string, config: CsiConfig): Promise<void> {
  const { mkdirSync, writeFileSync } = await import('node:fs')
  const dir = resolve(projectRoot, CONFIG_DIR)
  mkdirSync(dir, { recursive: true })
  writeFileSync(resolve(dir, CONFIG_FILE), JSON.stringify(config, null, 2))
}

// ═══════════════════════════════════════
// 配置验证
// ═══════════════════════════════════════

/**
 * 验证 LLM 配置是否完整
 */
export function validateLLMConfig(config?: LLMConfig): { valid: boolean; errors: string[] } {
  if (!config) return { valid: true, errors: [] }

  const errors: string[] = []

  if (!config.provider) {
    errors.push('缺少 LLM provider（openai / anthropic / ollama）')
  }

  if (config.provider !== 'ollama' && !config.apiKey) {
    errors.push(`provider "${config.provider}" 需要 apiKey`)
  }

  return { valid: errors.length === 0, errors }
}
