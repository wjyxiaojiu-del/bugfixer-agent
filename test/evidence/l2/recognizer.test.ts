import { describe, it, expect } from 'vitest'
import { recognizeIssues } from '../../../src/evidence/l2/recognizer.js'
import type { NetworkEntry } from '../../../src/evidence/l2/cdp.js'

function makeEntry(overrides: Partial<NetworkEntry> = {}): NetworkEntry {
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

describe('L2 问题识别器', () => {
  it('识别 RLS 42501 拒绝', () => {
    const entries = [makeEntry({
      status: 403,
      body: JSON.stringify({ code: '42501', message: 'permission denied for table users' }),
    })]

    const issues = recognizeIssues(entries)
    expect(issues).toHaveLength(1)
    expect(issues[0].type).toBe('rls_denied')
    expect(issues[0].severity).toBe('critical')
  })

  it('识别 RLS 通过 message 匹配', () => {
    const entries = [makeEntry({
      status: 400,
      body: JSON.stringify({ message: 'new row violates row-level security policy' }),
    })]

    const issues = recognizeIssues(entries)
    expect(issues).toHaveLength(1)
    expect(issues[0].type).toBe('rls_denied')
  })

  it('识别认证错误 401', () => {
    const entries = [makeEntry({
      status: 401,
      body: JSON.stringify({ error: 'invalid_grant' }),
    })]

    const issues = recognizeIssues(entries)
    expect(issues).toHaveLength(1)
    expect(issues[0].type).toBe('auth_error')
  })

  it('识别服务端错误 500', () => {
    const entries = [makeEntry({
      status: 500,
      statusText: 'Internal Server Error',
    })]

    const issues = recognizeIssues(entries)
    expect(issues).toHaveLength(1)
    expect(issues[0].type).toBe('server_error')
  })

  it('正常请求不报问题', () => {
    const entries = [makeEntry({ status: 200, body: JSON.stringify([{ id: 1 }]) })]
    const issues = recognizeIssues(entries)
    expect(issues).toHaveLength(0)
  })

  it('非 Supabase 请求的 403 不报 RLS', () => {
    const entries = [makeEntry({
      url: 'https://api.example.com/data',
      status: 403,
      body: JSON.stringify({ code: '42501' }),
    })]

    const issues = recognizeIssues(entries)
    expect(issues).toHaveLength(0)
  })

  it('空 body 不崩', () => {
    const entries = [makeEntry({ body: null })]
    expect(() => recognizeIssues(entries)).not.toThrow()
  })

  it('非法 JSON body 不崩', () => {
    const entries = [makeEntry({ body: 'not json' })]
    expect(() => recognizeIssues(entries)).not.toThrow()
  })

  // ═══════════════════════════════════════
  // 通用网络模式
  // ═══════════════════════════════════════

  it('识别 404 Not Found', () => {
    const entries = [makeEntry({
      url: 'https://api.example.com/users/123',
      status: 404,
    })]

    const issues = recognizeIssues(entries)
    expect(issues).toHaveLength(1)
    expect(issues[0].type).toBe('not_found')
    expect(issues[0].severity).toBe('warning')
  })

  it('识别 429 限流', () => {
    const entries = [makeEntry({
      url: 'https://api.example.com/data',
      status: 429,
    })]

    const issues = recognizeIssues(entries)
    expect(issues).toHaveLength(1)
    expect(issues[0].type).toBe('rate_limited')
  })

  it('识别 413 请求体过大', () => {
    const entries = [makeEntry({
      url: 'https://api.example.com/upload',
      method: 'POST',
      status: 413,
    })]

    const issues = recognizeIssues(entries)
    expect(issues).toHaveLength(1)
    expect(issues[0].type).toBe('payload_too_large')
  })

  it('识别 502 服务端错误', () => {
    const entries = [makeEntry({
      url: 'https://api.example.com/data',
      status: 502,
    })]

    const issues = recognizeIssues(entries)
    expect(issues).toHaveLength(1)
    // server_error 在 gateway_error 之前注册，所以 502 匹配 server_error
    expect(issues[0].type).toBe('server_error')
  })

  it('识别 503 服务端错误', () => {
    const entries = [makeEntry({
      url: 'https://api.example.com/data',
      status: 503,
    })]

    const issues = recognizeIssues(entries)
    expect(issues).toHaveLength(1)
    expect(issues[0].type).toBe('server_error')
  })

  it('识别 CORS Preflight 失败', () => {
    const entries = [makeEntry({
      url: 'https://api.example.com/data',
      method: 'OPTIONS',
      status: 403,
    })]

    const issues = recognizeIssues(entries)
    expect(issues).toHaveLength(1)
    expect(issues[0].type).toBe('cors_preflight_fail')
    expect(issues[0].severity).toBe('critical')
  })

  // ═══════════════════════════════════════
  // Firebase 模式
  // ═══════════════════════════════════════

  it('识别 Firebase 权限拒绝', () => {
    const entries = [makeEntry({
      url: 'https://firestore.googleapis.com/v1/projects/my-project/databases',
      status: 403,
      body: JSON.stringify({ error: { code: 403, status: 'PERMISSION_DENIED', message: 'Missing or insufficient permissions.' } }),
    })]

    const issues = recognizeIssues(entries)
    expect(issues).toHaveLength(1)
    expect(issues[0].type).toBe('firebase_permission_denied')
    expect(issues[0].severity).toBe('critical')
  })

  it('识别 Firebase 认证错误', () => {
    const entries = [makeEntry({
      url: 'https://identitytoolkit.googleapis.com/v1/accounts',
      status: 400,
      body: JSON.stringify({ error: { message: 'INVALID_EMAIL' } }),
    })]

    const issues = recognizeIssues(entries)
    expect(issues).toHaveLength(1)
    expect(issues[0].type).toBe('firebase_auth_error')
  })

  // ═══════════════════════════════════════
  // MongoDB 模式
  // ═══════════════════════════════════════

  it('识别 MongoDB 认证失败', () => {
    const entries = [makeEntry({
      url: 'https://cloud.mongodb.com/api/atlas/v2/groups',
      status: 401,
      body: JSON.stringify({ error: 'Unauthorized' }),
    })]

    const issues = recognizeIssues(entries)
    expect(issues).toHaveLength(1)
    // mongodb_error 和 mongodb_api_error 都匹配，先注册的先返回
    expect(['mongodb_error', 'mongodb_api_error']).toContain(issues[0].type)
  })

  it('识别 MongoDB 权限不足', () => {
    const entries = [makeEntry({
      url: 'https://cloud.mongodb.com/api/atlas/v2/groups',
      status: 403,
    })]

    const issues = recognizeIssues(entries)
    expect(issues).toHaveLength(1)
    expect(['mongodb_error', 'mongodb_api_error']).toContain(issues[0].type)
  })
})
