import { describe, it, expect, beforeEach } from 'vitest'
import { KnowledgeStore } from '../../src/knowledge/store.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('知识库', () => {
  let store: KnowledgeStore
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'csi-kb-test-'))
    store = new KnowledgeStore(tempDir)
  })

  it('添加和查询条目', async () => {
    await store.load()

    const entry = store.add({
      stack: { framework: 'next', frameworkVersion: '14.2.0', hasSupabase: true, deployTarget: 'vercel' },
      symptom: { errorType: 'rls_denied', errorCode: '42501', tableName: 'users', httpMethod: 'GET', keywords: ['permission denied'] },
      rootCause: '缺少 INSERT 策略',
      rootCauseType: 'rls_missing_policy',
      fix: { type: 'sql_migration', title: '添加策略', description: '...', content: 'CREATE POLICY...' },
      verified: true,
      tags: ['rls', 'users'],
      notes: '测试条目',
    })

    expect(entry.id).toBeTruthy()
    expect(entry.useCount).toBe(0)

    // 查询
    const results = store.query({ errorType: 'rls_denied' })
    expect(results).toHaveLength(1)
    expect(results[0].rootCause).toBe('缺少 INSERT 策略')
  })

  it('按关键词查询', async () => {
    await store.load()

    store.add({
      stack: { framework: 'next', frameworkVersion: '14.2.0', hasSupabase: true, deployTarget: 'vercel' },
      symptom: { errorType: 'rls_denied', errorCode: '42501', tableName: 'posts', httpMethod: 'POST', keywords: ['row-level security'] },
      rootCause: '...',
      rootCauseType: 'rls_missing_policy',
      fix: { type: 'sql_migration', title: '...', description: '...', content: null },
      verified: null,
      tags: ['rls'],
      notes: '',
    })

    const results = store.query({ keywords: ['row-level'] })
    expect(results).toHaveLength(1)
  })

  it('标记使用次数', async () => {
    await store.load()

    const entry = store.add({
      stack: { framework: 'next', frameworkVersion: '14.2.0', hasSupabase: true, deployTarget: 'vercel' },
      symptom: { errorType: 'auth_error', errorCode: null, tableName: null, httpMethod: null, keywords: [] },
      rootCause: '...',
      rootCauseType: 'auth_expired',
      fix: { type: 'manual', title: '...', description: '...', content: null },
      verified: null,
      tags: [],
      notes: '',
    })

    store.markUsed(entry.id)
    store.markUsed(entry.id)

    const results = store.query({ errorType: 'auth_error' })
    expect(results[0].useCount).toBe(2)
  })

  it('自动创建去重', async () => {
    await store.load()

    const opts = {
      stack: { framework: 'next', frameworkVersion: '14.2.0', hasSupabase: true, deployTarget: 'vercel' },
      symptom: { errorType: 'rls_denied', errorCode: '42501', tableName: 'users', httpMethod: 'GET', keywords: ['permission denied'] },
      rootCause: '缺少策略',
      rootCauseType: 'rls_missing_policy',
      fix: { type: 'sql_migration', title: '...', description: '...', content: null },
    }

    const e1 = store.autoCreate(opts)
    const e2 = store.autoCreate(opts)

    // 应该复用同一个条目（e1 和 e2 是同一对象引用）
    expect(e1.id).toBe(e2.id)
    expect(e2.useCount).toBe(1) // 第二次调用后 useCount=1
  })

  it('持久化到磁盘', async () => {
    await store.load()

    store.add({
      stack: { framework: 'vite', frameworkVersion: '5.4.0', hasSupabase: false, deployTarget: 'unknown' },
      symptom: { errorType: 'code_bug', errorCode: null, tableName: null, httpMethod: null, keywords: ['module'] },
      rootCause: '...',
      rootCauseType: 'code_bug',
      fix: { type: 'code_change', title: '...', description: '...', content: null },
      verified: null,
      tags: [],
      notes: '',
    })

    // 重新加载
    const store2 = new KnowledgeStore(tempDir)
    await store2.load()
    expect(store2.size).toBe(1)
  })

  it('空知识库查询不崩', async () => {
    await store.load()
    const results = store.query({ errorType: 'nonexistent' })
    expect(results).toHaveLength(0)
  })
})
