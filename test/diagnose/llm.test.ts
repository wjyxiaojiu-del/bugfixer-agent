import { describe, it, expect, vi, beforeEach } from 'vitest'
import { analyzeWithLLM, verifyLLMConfig } from '../../src/diagnose/llm.js'
import { aggregateEvidence } from '../../src/diagnose/evidence.js'
import type { LLMConfig } from '../../src/diagnose/llm.js'

// Mock fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('LLM 集成', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('OpenAI 返回有效诊断', async () => {
    const config: LLMConfig = { provider: 'openai', apiKey: 'test-key' }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              rootCause: 'code_bug',
              severity: 'warning',
              description: '测试诊断',
              confidence: 'high',
              fix: {
                type: 'manual',
                title: '测试修复',
                description: '修复步骤',
              },
            }),
          },
        }],
      }),
    })

    const evidence = aggregateEvidence({
      l1Outputs: [{
        readyUrl: 'http://localhost:3000',
        errors: ['Error: test'],
        warnings: [],
        rawLines: [],
      }],
    })

    const result = await analyzeWithLLM(evidence, config)
    expect(result).not.toBeNull()
    expect(result!.rootCause).toBe('code_bug')
    expect(result!.description).toBe('测试诊断')
    expect(mockFetch).toHaveBeenCalledOnce()
  })

  it('Anthropic 返回有效诊断', async () => {
    const config: LLMConfig = { provider: 'anthropic', apiKey: 'test-key' }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{
          text: JSON.stringify({
            rootCause: 'network_error',
            severity: 'critical',
            description: 'CORS 错误',
            confidence: 'high',
            fix: {
              type: 'code_change',
              title: '配置 CORS',
              description: '添加 CORS 头',
            },
          }),
        }],
      }),
    })

    const evidence = aggregateEvidence({})
    const result = await analyzeWithLLM(evidence, config)

    expect(result).not.toBeNull()
    expect(result!.rootCause).toBe('network_error')
  })

  it('Ollama 返回 null 时返回 null', async () => {
    const config: LLMConfig = { provider: 'ollama' }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        response: 'null',
      }),
    })

    const evidence = aggregateEvidence({})
    const result = await analyzeWithLLM(evidence, config)

    expect(result).toBeNull()
  })

  it('LLM 返回无效 JSON 时返回 null', async () => {
    const config: LLMConfig = { provider: 'openai', apiKey: 'test-key' }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: '这不是 JSON',
          },
        }],
      }),
    })

    const evidence = aggregateEvidence({})
    const result = await analyzeWithLLM(evidence, config)

    expect(result).toBeNull()
  })

  it('API 调用失败时返回 null', async () => {
    const config: LLMConfig = { provider: 'openai', apiKey: 'test-key' }

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    })

    const evidence = aggregateEvidence({})
    const result = await analyzeWithLLM(evidence, config)

    expect(result).toBeNull()
  })

  it('verifyLLMConfig 成功时返回 ok: true', async () => {
    const config: LLMConfig = { provider: 'openai', apiKey: 'test-key' }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{
          message: { content: 'OK' },
        }],
      }),
    })

    const result = await verifyLLMConfig(config)
    expect(result.ok).toBe(true)
  })

  it('verifyLLMConfig 失败时返回 ok: false 和 error', async () => {
    const config: LLMConfig = { provider: 'openai', apiKey: 'invalid' }

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    })

    const result = await verifyLLMConfig(config)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('401')
  })

  it('LLM 返回 markdown 代码块包裹的 JSON 也能解析', async () => {
    const config: LLMConfig = { provider: 'openai', apiKey: 'test-key' }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: '```json\n{"rootCause":"code_bug","severity":"warning","description":"test","confidence":"high","fix":{"type":"manual","title":"fix","description":"desc"}}\n```',
          },
        }],
      }),
    })

    const evidence = aggregateEvidence({})
    const result = await analyzeWithLLM(evidence, config)

    expect(result).not.toBeNull()
    expect(result!.rootCause).toBe('code_bug')
  })
})
