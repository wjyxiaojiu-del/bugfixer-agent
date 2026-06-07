import { describe, it, expect } from 'vitest'
import { analyzeEvidence } from '../../src/diagnose/analyze.js'
import { aggregateEvidence } from '../../src/diagnose/evidence.js'
import type { NetworkEntry } from '../../src/evidence/l2/cdp.js'

function makeNetworkEntry(overrides: Partial<NetworkEntry> = {}): NetworkEntry {
  return {
    url: 'https://test.example.com/api',
    method: 'GET',
    status: 200,
    statusText: 'OK',
    body: null,
    headers: {},
    timestamp: Date.now(),
    ...overrides,
  }
}

describe('扩展诊断规则', () => {
  // ═══════════════════════════════════════
  // L1 终端规则
  // ═══════════════════════════════════════

  it('识别 Prisma 错误', () => {
    const evidence = aggregateEvidence({
      l1Outputs: [{
        readyUrl: null,
        errors: ['PANIC: unreachable: Error in query graph construction'],
        warnings: [],
        rawLines: [],
      }],
    })

    const diagnosis = analyzeEvidence(evidence)
    expect(diagnosis).not.toBeNull()
    expect(diagnosis!.rootCause).toBe('code_bug')
    expect(diagnosis!.description).toContain('Prisma')
  })

  it('识别 next.config 错误', () => {
    const evidence = aggregateEvidence({
      l1Outputs: [{
        readyUrl: null,
        errors: ['Error: Invalid next.config.js options detected'],
        warnings: [],
        rawLines: [],
      }],
    })

    const diagnosis = analyzeEvidence(evidence)
    expect(diagnosis).not.toBeNull()
    expect(diagnosis!.rootCause).toBe('code_bug')
    expect(diagnosis!.description).toContain('Next.js 配置')
  })

  it('识别 ESLint 错误', () => {
    const evidence = aggregateEvidence({
      l1Outputs: [{
        readyUrl: null,
        errors: ['ESLint: 5 errors, 3 warnings'],
        warnings: [],
        rawLines: [],
      }],
    })

    const diagnosis = analyzeEvidence(evidence)
    expect(diagnosis).not.toBeNull()
    expect(diagnosis!.rootCause).toBe('code_bug')
    expect(diagnosis!.description).toContain('ESLint')
  })

  it('识别构建失败', () => {
    const evidence = aggregateEvidence({
      l1Outputs: [{
        readyUrl: null,
        errors: ['Build failed with errors'],
        warnings: [],
        rawLines: [],
      }],
    })

    const diagnosis = analyzeEvidence(evidence)
    expect(diagnosis).not.toBeNull()
    expect(diagnosis!.rootCause).toBe('code_bug')
    expect(diagnosis!.description).toContain('构建')
  })

  // ═══════════════════════════════════════
  // L2 网络规则
  // ═══════════════════════════════════════

  it('识别 SSL 证书错误', () => {
    const evidence = aggregateEvidence({
      l1Outputs: [{
        readyUrl: null,
        errors: ['Error: SSL certificate problem: unable to get local issuer certificate'],
        warnings: [],
        rawLines: [],
      }],
    })

    const diagnosis = analyzeEvidence(evidence)
    expect(diagnosis).not.toBeNull()
    expect(diagnosis!.rootCause).toBe('network_error')
    expect(diagnosis!.description).toContain('SSL')
  })

  it('识别请求超时', () => {
    const evidence = aggregateEvidence({
      l1Outputs: [{
        readyUrl: null,
        errors: ['Error: ETIMEDOUT connect ETIMEDOUT 10.0.0.1:443'],
        warnings: [],
        rawLines: [],
      }],
    })

    const diagnosis = analyzeEvidence(evidence)
    expect(diagnosis).not.toBeNull()
    expect(diagnosis!.rootCause).toBe('network_error')
    expect(diagnosis!.description).toContain('超时')
  })

  it('识别 DNS 解析失败', () => {
    const evidence = aggregateEvidence({
      l1Outputs: [{
        readyUrl: null,
        errors: ['Error: getaddrinfo ENOTFOUND api.example.com'],
        warnings: [],
        rawLines: [],
      }],
    })

    const diagnosis = analyzeEvidence(evidence)
    expect(diagnosis).not.toBeNull()
    expect(diagnosis!.rootCause).toBe('network_error')
    expect(diagnosis!.description).toContain('DNS')
  })

  // ═══════════════════════════════════════
  // L2 控制台规则
  // ═══════════════════════════════════════

  it('识别内存泄漏', () => {
    const evidence = aggregateEvidence({
      console: [{
        type: 'error',
        text: 'FATAL ERROR: CALL_AND_RETRY_LAST Allocation failed - JavaScript heap out of memory',
        timestamp: Date.now(),
      }],
    })

    const diagnosis = analyzeEvidence(evidence)
    expect(diagnosis).not.toBeNull()
    expect(diagnosis!.rootCause).toBe('code_bug')
    expect(diagnosis!.description).toContain('内存')
  })

  it('识别无限递归', () => {
    const evidence = aggregateEvidence({
      console: [{
        type: 'error',
        text: 'RangeError: Maximum call stack size exceeded',
        timestamp: Date.now(),
      }],
    })

    const diagnosis = analyzeEvidence(evidence)
    expect(diagnosis).not.toBeNull()
    expect(diagnosis!.rootCause).toBe('code_bug')
    expect(diagnosis!.description).toContain('递归')
  })

  it('识别 DOM 操作错误', () => {
    const evidence = aggregateEvidence({
      console: [{
        type: 'error',
        text: 'NotFoundError: Failed to execute \'removeChild\' on \'Node\': The node to be removed is not a child of this node.',
        timestamp: Date.now(),
      }],
    })

    const diagnosis = analyzeEvidence(evidence)
    expect(diagnosis).not.toBeNull()
    expect(diagnosis!.rootCause).toBe('code_bug')
    expect(diagnosis!.description).toContain('DOM')
  })
})
