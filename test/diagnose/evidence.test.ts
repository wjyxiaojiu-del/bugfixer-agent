import { describe, it, expect } from 'vitest'
import { aggregateEvidence, formatEvidenceForLLM } from '../../src/diagnose/evidence.js'

describe('证据聚合', () => {
  it('聚合 L1 输出', () => {
    const evidence = aggregateEvidence({
      l1Outputs: [
        { readyUrl: 'http://localhost:3000', errors: ['Error: test'], warnings: [], rawLines: [] },
        { readyUrl: null, errors: [], warnings: ['Warning: deprecated'], rawLines: [] },
      ],
    })

    expect(evidence.terminal.readyUrl).toBe('http://localhost:3000')
    expect(evidence.terminal.errors).toHaveLength(1)
    expect(evidence.terminal.warnings).toHaveLength(1)
  })

  it('空证据不崩', () => {
    const evidence = aggregateEvidence({})
    expect(evidence.terminal.readyUrl).toBeNull()
    expect(evidence.network).toHaveLength(0)
    expect(evidence.cloud).toBeNull()
  })

  it('格式化为 LLM prompt', () => {
    const evidence = aggregateEvidence({
      l1Outputs: [{
        readyUrl: 'http://localhost:3000',
        errors: ['Error: test'],
        warnings: [],
        rawLines: [],
      }],
      recognizedIssues: [{
        type: 'rls_denied',
        severity: 'critical',
        message: 'RLS 拒绝了请求',
        entry: {
          url: 'https://test.supabase.co/rest/v1/users',
          method: 'GET',
          status: 403,
          statusText: 'Forbidden',
          body: '{"code":"42501"}',
          headers: {},
          timestamp: Date.now(),
        },
      }],
    })

    const prompt = formatEvidenceForLLM(evidence)
    expect(prompt).toContain('终端输出')
    expect(prompt).toContain('localhost:3000')
    expect(prompt).toContain('rls_denied')
    expect(prompt).toContain('已识别问题模式')
  })
})
