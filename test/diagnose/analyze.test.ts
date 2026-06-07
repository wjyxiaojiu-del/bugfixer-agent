import { describe, it, expect } from 'vitest'
import { analyzeEvidence } from '../../src/diagnose/analyze.js'
import { aggregateEvidence } from '../../src/diagnose/evidence.js'
import type { NetworkEntry } from '../../src/evidence/l2/cdp.js'

function makeNetworkEntry(overrides: Partial<NetworkEntry> = {}): NetworkEntry {
  return {
    url: 'https://test.supabase.co/rest/v1/users',
    method: 'GET',
    status: 200,
    statusText: 'OK',
    body: null,
    headers: {},
    timestamp: Date.now(),
    ...overrides,
  }
}

describe('诊断分析', () => {
  it('识别 RLS 拒绝并生成修复方案', () => {
    const evidence = aggregateEvidence({
      recognizedIssues: [{
        type: 'rls_denied',
        severity: 'critical',
        message: 'RLS 拒绝',
        entry: makeNetworkEntry({
          status: 403,
          body: JSON.stringify({ code: '42501', message: 'permission denied' }),
        }),
      }],
    })

    const diagnosis = analyzeEvidence(evidence)
    expect(diagnosis).not.toBeNull()
    expect(diagnosis!.rootCause).toBe('rls_missing_policy')
    expect(diagnosis!.recommendedFix.type).toBe('sql_migration')
    expect(diagnosis!.recommendedFix.content).toContain('CREATE POLICY')
  })

  it('识别认证过期', () => {
    const evidence = aggregateEvidence({
      recognizedIssues: [{
        type: 'auth_error',
        severity: 'critical',
        message: '认证失败',
        entry: makeNetworkEntry({ status: 401 }),
      }],
    })

    const diagnosis = analyzeEvidence(evidence)
    expect(diagnosis).not.toBeNull()
    expect(diagnosis!.rootCause).toBe('auth_expired')
    expect(diagnosis!.recommendedFix.type).toBe('manual')
  })

  it('识别模块缺失', () => {
    const evidence = aggregateEvidence({
      l1Outputs: [{
        readyUrl: null,
        errors: ["Cannot find module '@supabase/supabase-js'"],
        warnings: [],
        rawLines: [],
      }],
    })

    const diagnosis = analyzeEvidence(evidence)
    expect(diagnosis).not.toBeNull()
    expect(diagnosis!.rootCause).toBe('code_bug')
    expect(diagnosis!.recommendedFix.content).toContain('supabase-js')
  })

  it('无问题时返回 null', () => {
    const evidence = aggregateEvidence({})
    const diagnosis = analyzeEvidence(evidence)
    expect(diagnosis).toBeNull()
  })

  it('L3 云端有 RLS 日志时识别', () => {
    const evidence = aggregateEvidence({
      cloud: {
        provider: 'supabase',
        tokenOk: true,
        tokenSource: 'cli-config',
        policies: [],
        denials: [{
          timestamp: new Date().toISOString(),
          event_message: 'permission denied for table users',
          level: 'error',
          metadata: {},
        }],
        capturedAt: new Date().toISOString(),
        errors: [],
      },
    })

    const diagnosis = analyzeEvidence(evidence)
    expect(diagnosis).not.toBeNull()
    expect(diagnosis!.rootCause).toBe('rls_overly_restrictive')
  })

  // ═══════════════════════════════════════
  // 新增 L1 终端规则测试
  // ═══════════════════════════════════════

  it('识别 TypeScript 编译错误', () => {
    const evidence = aggregateEvidence({
      l1Outputs: [{
        readyUrl: null,
        errors: ["src/app/page.tsx:15:3 - error TS2322: Type 'string' is not assignable to type 'number'."],
        warnings: [],
        rawLines: [],
      }],
    })

    const diagnosis = analyzeEvidence(evidence)
    expect(diagnosis).not.toBeNull()
    expect(diagnosis!.rootCause).toBe('code_bug')
    expect(diagnosis!.description).toContain('TS2322')
    expect(diagnosis!.description).toContain('page.tsx')
  })

  it('识别 Hydration 不匹配', () => {
    const evidence = aggregateEvidence({
      l1Outputs: [{
        readyUrl: 'http://localhost:3000',
        errors: ['Error: Hydration failed because the initial UI does not match what was rendered on the server.'],
        warnings: [],
        rawLines: [],
      }],
    })

    const diagnosis = analyzeEvidence(evidence)
    expect(diagnosis).not.toBeNull()
    expect(diagnosis!.rootCause).toBe('code_bug')
    expect(diagnosis!.description).toContain('Hydration')
    expect(diagnosis!.recommendedFix.content).toContain('useEffect')
  })

  it('识别 CORS 错误', () => {
    const evidence = aggregateEvidence({
      console: [{
        type: 'error',
        text: 'Access to fetch at \'https://api.example.com/data\' from origin \'http://localhost:3000\' has been blocked by CORS policy',
        timestamp: Date.now(),
      }],
    })

    const diagnosis = analyzeEvidence(evidence)
    expect(diagnosis).not.toBeNull()
    expect(diagnosis!.rootCause).toBe('network_error')
    expect(diagnosis!.description).toContain('CORS')
  })

  it('识别环境变量缺失', () => {
    const evidence = aggregateEvidence({
      l1Outputs: [{
        readyUrl: null,
        errors: ['Error: NEXT_PUBLIC_SUPABASE_URL is not defined'],
        warnings: [],
        rawLines: [],
      }],
    })

    const diagnosis = analyzeEvidence(evidence)
    expect(diagnosis).not.toBeNull()
    expect(diagnosis!.rootCause).toBe('code_bug')
    expect(diagnosis!.description).toContain('环境变量')
  })

  it('识别端口占用', () => {
    const evidence = aggregateEvidence({
      l1Outputs: [{
        readyUrl: null,
        errors: ['Error: listen EADDRINUSE: address already in use :::3000'],
        warnings: [],
        rawLines: [],
      }],
    })

    const diagnosis = analyzeEvidence(evidence)
    expect(diagnosis).not.toBeNull()
    expect(diagnosis!.rootCause).toBe('code_bug')
    expect(diagnosis!.description).toContain('端口')
  })

  it('识别 Webpack 构建错误', () => {
    const evidence = aggregateEvidence({
      l1Outputs: [{
        readyUrl: null,
        errors: ['Module build failed: SyntaxError: Unexpected token'],
        warnings: [],
        rawLines: [],
      }],
    })

    const diagnosis = analyzeEvidence(evidence)
    expect(diagnosis).not.toBeNull()
    expect(diagnosis!.rootCause).toBe('code_bug')
    expect(diagnosis!.description).toContain('Webpack')
  })

  // ═══════════════════════════════════════
  // 新增 L2 网络规则测试
  // ═══════════════════════════════════════

  it('识别 API 路由 404', () => {
    const evidence = aggregateEvidence({
      network: [makeNetworkEntry({
        url: 'http://localhost:3000/api/users',
        method: 'GET',
        status: 404,
      })],
    })

    const diagnosis = analyzeEvidence(evidence)
    expect(diagnosis).not.toBeNull()
    expect(diagnosis!.rootCause).toBe('code_bug')
    expect(diagnosis!.description).toContain('API 路由不存在')
  })

  it('识别请求限流', () => {
    const evidence = aggregateEvidence({
      network: [makeNetworkEntry({
        url: 'https://api.example.com/data',
        method: 'GET',
        status: 429,
      })],
    })

    const diagnosis = analyzeEvidence(evidence)
    expect(diagnosis).not.toBeNull()
    expect(diagnosis!.rootCause).toBe('api_error')
    expect(diagnosis!.description).toContain('限流')
  })

  it('识别请求体过大', () => {
    const evidence = aggregateEvidence({
      network: [makeNetworkEntry({
        url: 'http://localhost:3000/api/upload',
        method: 'POST',
        status: 413,
      })],
    })

    const diagnosis = analyzeEvidence(evidence)
    expect(diagnosis).not.toBeNull()
    expect(diagnosis!.rootCause).toBe('api_error')
    expect(diagnosis!.description).toContain('过大')
  })

  it('识别网关错误', () => {
    const evidence = aggregateEvidence({
      network: [makeNetworkEntry({
        url: 'https://api.example.com/data',
        method: 'GET',
        status: 502,
      })],
    })

    const diagnosis = analyzeEvidence(evidence)
    expect(diagnosis).not.toBeNull()
    expect(diagnosis!.rootCause).toBe('network_error')
    expect(diagnosis!.description).toContain('Bad Gateway')
  })

  // ═══════════════════════════════════════
  // 新增 L2 控制台规则测试
  // ═══════════════════════════════════════

  it('识别 React 状态更新循环', () => {
    const evidence = aggregateEvidence({
      console: [{
        type: 'error',
        text: 'Maximum update depth exceeded. This can happen when a component repeatedly calls setState inside componentWillUpdate or componentDidUpdate.',
        timestamp: Date.now(),
      }],
    })

    const diagnosis = analyzeEvidence(evidence)
    expect(diagnosis).not.toBeNull()
    expect(diagnosis!.rootCause).toBe('code_bug')
    expect(diagnosis!.description).toContain('状态更新循环')
  })

  it('识别未捕获的 Promise 异常', () => {
    const evidence = aggregateEvidence({
      console: [{
        type: 'error',
        text: 'UnhandledPromiseRejection: TypeError: Failed to fetch',
        timestamp: Date.now(),
      }],
    })

    const diagnosis = analyzeEvidence(evidence)
    expect(diagnosis).not.toBeNull()
    expect(diagnosis!.rootCause).toBe('code_bug')
    expect(diagnosis!.description).toContain('异步操作')
  })

  it('识别 API 废弃警告', () => {
    const evidence = aggregateEvidence({
      console: [{
        type: 'warning',
        text: 'componentWillMount is deprecated and will be removed in the next major version. Use componentDidMount instead.',
        timestamp: Date.now(),
      }],
    })

    const diagnosis = analyzeEvidence(evidence)
    expect(diagnosis).not.toBeNull()
    expect(diagnosis!.rootCause).toBe('code_bug')
    expect(diagnosis!.severity).toBe('info')
  })

  // ═══════════════════════════════════════
  // 边界情况测试
  // ═══════════════════════════════════════

  it('多条规则同时命中时返回优先级最高的', () => {
    const evidence = aggregateEvidence({
      recognizedIssues: [{
        type: 'rls_denied',
        severity: 'critical',
        message: 'RLS 拒绝',
        entry: makeNetworkEntry({
          status: 403,
          body: JSON.stringify({ code: '42501', message: 'permission denied' }),
        }),
      }],
      l1Outputs: [{
        readyUrl: null,
        errors: ["Cannot find module 'lodash'"],
        warnings: [],
        rawLines: [],
      }],
    })

    const diagnosis = analyzeEvidence(evidence)
    // RLS 拒绝优先级高于模块缺失
    expect(diagnosis!.rootCause).toBe('rls_missing_policy')
  })

  it('无问题时返回 null（确认不会误报）', () => {
    const evidence = aggregateEvidence({
      l1Outputs: [{
        readyUrl: 'http://localhost:3000',
        errors: [],
        warnings: [],
        rawLines: ['Server started on port 3000'],
      }],
      network: [makeNetworkEntry()],
      console: [{ type: 'log', text: 'App loaded', timestamp: Date.now() }],
    })

    const diagnosis = analyzeEvidence(evidence)
    expect(diagnosis).toBeNull()
  })
})
