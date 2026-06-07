import type { AggregatedEvidence } from './evidence.js'
import type { Diagnosis, RootCauseType } from './analyze.js'
import { formatEvidenceForLLM } from './evidence.js'

// ═══════════════════════════════════════
// LLM 配置
// ═══════════════════════════════════════

export type LLMProvider = 'openai' | 'anthropic' | 'ollama'

export interface LLMConfig {
  provider: LLMProvider
  apiKey?: string
  baseUrl?: string
  model?: string
}

/** 默认模型配置 */
const DEFAULT_MODELS: Record<LLMProvider, { model: string; baseUrl: string }> = {
  openai: { model: 'gpt-4o-mini', baseUrl: 'https://api.openai.com/v1' },
  anthropic: { model: 'claude-sonnet-4-20250514', baseUrl: 'https://api.anthropic.com' },
  ollama: { model: 'llama3.1', baseUrl: 'http://localhost:11434' },
}

// ═══════════════════════════════════════
// LLM 请求/响应
// ═══════════════════════════════════════

interface LLMResponse {
  content: string
}

async function callOpenAI(config: LLMConfig, prompt: string): Promise<LLMResponse> {
  const base = config.baseUrl || DEFAULT_MODELS.openai.baseUrl
  const model = config.model || DEFAULT_MODELS.openai.model

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: '你是一个前端调试专家，擅长分析以下数据库/后端服务的问题：Supabase (PostgreSQL, RLS, Auth)、Firebase (Firestore, Authentication, Cloud Functions)、PlanetScale (MySQL)、Neon (Serverless Postgres)。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 1000,
    }),
  })

  if (!res.ok) {
    throw new Error(`OpenAI API error: ${res.status} ${res.statusText}`)
  }

  const data = await res.json() as { choices: { message: { content: string } }[] }
  return { content: data.choices[0]?.message?.content || '' }
}

async function callAnthropic(config: LLMConfig, prompt: string): Promise<LLMResponse> {
  const base = config.baseUrl || DEFAULT_MODELS.anthropic.baseUrl
  const model = config.model || DEFAULT_MODELS.anthropic.model

  const res = await fetch(`${base}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey || '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1000,
      system: '你是一个前端调试专家，擅长分析以下数据库/后端服务的问题：Supabase (PostgreSQL, RLS, Auth)、Firebase (Firestore, Authentication, Cloud Functions)、PlanetScale (MySQL)、Neon (Serverless Postgres)。',
      messages: [
        { role: 'user', content: prompt },
      ],
    }),
  })

  if (!res.ok) {
    throw new Error(`Anthropic API error: ${res.status} ${res.statusText}`)
  }

  const data = await res.json() as { content: { text: string }[] }
  return { content: data.content[0]?.text || '' }
}

async function callOllama(config: LLMConfig, prompt: string): Promise<LLMResponse> {
  const base = config.baseUrl || DEFAULT_MODELS.ollama.baseUrl
  const model = config.model || DEFAULT_MODELS.ollama.model

  const res = await fetch(`${base}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: `你是一个前端调试专家，擅长分析以下数据库/后端服务的问题：Supabase (PostgreSQL, RLS, Auth)、Firebase (Firestore, Authentication, Cloud Functions)、PlanetScale (MySQL)、Neon (Serverless Postgres)。\n\n${prompt}`,
      stream: false,
      options: { temperature: 0.1 },
    }),
  })

  if (!res.ok) {
    throw new Error(`Ollama API error: ${res.status} ${res.statusText}`)
  }

  const data = await res.json() as { response: string }
  return { content: data.response || '' }
}

// ═══════════════════════════════════════
// Prompt 构建
// ═══════════════════════════════════════

function buildPrompt(evidence: AggregatedEvidence): string {
  const evidenceText = formatEvidenceForLLM(evidence)

  return `以下是项目的现场勘察证据：

${evidenceText}

请分析这些证据，找出最可能的根因，并给出修复方案。

要求：
1. 只有在证据充分时才给出诊断，不要猜测
2. 如果证据不足，返回 null
3. 输出严格的 JSON 格式

输出格式（JSON）：
{
  "rootCause": "rls_missing_policy | auth_expired | api_error | network_error | code_bug | unknown",
  "severity": "critical | warning | info",
  "description": "根因描述（中文）",
  "confidence": "high | medium | low",
  "fix": {
    "type": "sql_migration | env_change | code_change | manual",
    "title": "修复标题",
    "description": "修复步骤描述",
    "content": "可选的 SQL/代码/命令内容"
  }
}

如果证据不足以诊断，返回：null`
}

// ═══════════════════════════════════════
// 响应解析
// ═══════════════════════════════════════

function parseLLMDiagnosis(content: string): Diagnosis | null {
  // 尝试提取 JSON（可能被 markdown 代码块包裹）
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || content.match(/(\{[\s\S]*\})/)
  if (!jsonMatch) return null

  try {
    const parsed = JSON.parse(jsonMatch[1].trim())

    // 如果 LLM 返回 null 或者缺少必要字段
    if (!parsed || !parsed.rootCause || !parsed.description) return null

    return {
      rootCause: parsed.rootCause as RootCauseType,
      severity: parsed.severity || 'warning',
      description: parsed.description,
      confidence: parsed.confidence || 'medium',
      evidenceSummary: 'LLM 分析',
      recommendedFix: {
        type: parsed.fix?.type || 'manual',
        title: parsed.fix?.title || '查看建议',
        description: parsed.fix?.description || '',
        content: parsed.fix?.content,
      },
    }
  } catch {
    return null
  }
}

// ═══════════════════════════════════════
// 主入口
// ═══════════════════════════════════════

/**
 * 使用 LLM 分析证据（规则引擎的兜底）
 * @param evidence 聚合后的证据
 * @param config LLM 配置
 * @returns 诊断结果，如果 LLM 也无法诊断则返回 null
 */
export async function analyzeWithLLM(
  evidence: AggregatedEvidence,
  config: LLMConfig,
): Promise<Diagnosis | null> {
  const prompt = buildPrompt(evidence)

  let response: LLMResponse
  try {
    switch (config.provider) {
      case 'openai':
        response = await callOpenAI(config, prompt)
        break
      case 'anthropic':
        response = await callAnthropic(config, prompt)
        break
      case 'ollama':
        response = await callOllama(config, prompt)
        break
      default:
        throw new Error(`不支持的 LLM provider: ${config.provider}`)
    }
  } catch (err) {
    const error = err as Error
    console.error(`LLM 调用失败: ${error.message}`)
    return null
  }

  return parseLLMDiagnosis(response.content)
}

/**
 * 验证 LLM 配置是否可用
 */
export async function verifyLLMConfig(config: LLMConfig): Promise<{ ok: boolean; error?: string }> {
  try {
    const testPrompt = '回复 OK 即可。'
    let response: LLMResponse

    switch (config.provider) {
      case 'openai':
        response = await callOpenAI(config, testPrompt)
        break
      case 'anthropic':
        response = await callAnthropic(config, testPrompt)
        break
      case 'ollama':
        response = await callOllama(config, testPrompt)
        break
      default:
        return { ok: false, error: `不支持的 provider: ${config.provider}` }
    }

    return { ok: response.content.length > 0 }
  } catch (err) {
    const error = err as Error
    return { ok: false, error: error.message }
  }
}
