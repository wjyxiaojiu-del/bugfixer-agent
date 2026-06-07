import type { AggregatedEvidence } from './evidence.js'
import { rules } from './rules.js'
import { analyzeWithLLM, type LLMConfig } from './llm.js'

export type RootCauseType =
  | 'rls_missing_policy'
  | 'rls_overly_restrictive'
  | 'auth_expired'
  | 'auth_misconfigured'
  | 'api_error'
  | 'network_error'
  | 'code_bug'
  | 'unknown'

export interface Diagnosis {
  /** 根因类型 */
  rootCause: RootCauseType
  /** 严重程度 */
  severity: 'critical' | 'warning' | 'info'
  /** 人类可读描述 */
  description: string
  /** 推荐修复方案 */
  recommendedFix: FixSuggestion
  /** 诊断置信度 */
  confidence: 'high' | 'medium' | 'low'
  /** 原始证据摘要 */
  evidenceSummary: string
}

export interface FixSuggestion {
  /** 修复类型 */
  type: 'sql_migration' | 'env_change' | 'code_change' | 'manual'
  /** 修复标题 */
  title: string
  /** 修复描述 */
  description: string
  /** SQL 或代码内容 */
  content?: string
  /** 回滚命令 */
  rollback?: string
}

/**
 * 基于规则的根因分析（不依赖 LLM）
 * 遍历注册的规则，返回第一个匹配的诊断
 */
export function analyzeEvidence(evidence: AggregatedEvidence): Diagnosis | null {
  for (const rule of rules) {
    const result = rule.evaluate(evidence)
    if (result) return result
  }
  return null
}

/**
 * 完整诊断流程：规则优先，LLM 兜底
 * @param evidence 聚合后的证据
 * @param llmConfig LLM 配置（可选，不传则跳过 LLM）
 */
export async function diagnose(
  evidence: AggregatedEvidence,
  llmConfig?: LLMConfig,
): Promise<Diagnosis | null> {
  // 1. 先跑规则引擎
  const ruleResult = analyzeEvidence(evidence)
  if (ruleResult) return ruleResult

  // 2. 规则没命中，调 LLM
  if (llmConfig) {
    try {
      const llmResult = await analyzeWithLLM(evidence, llmConfig)
      if (llmResult) return llmResult
    } catch (err) {
      const error = err as Error
      console.error(`LLM 诊断失败: ${error.message}`)
    }
  }

  return null
}
