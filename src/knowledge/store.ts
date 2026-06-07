import { readJson, fileExists } from '../utils/fs.js'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import type { KnowledgeEntry, KnowledgeQuery, StackFingerprint, SymptomFingerprint } from './schema.js'

const KB_DIR = '.csi/knowledge'
const KB_FILE = 'entries.json'

/**
 * 问题知识库
 * 存储在项目目录的 .csi/knowledge/entries.json
 */
export class KnowledgeStore {
  private entries: KnowledgeEntry[] = []
  private filePath: string

  constructor(private projectRoot: string) {
    this.filePath = resolve(projectRoot, KB_DIR, KB_FILE)
  }

  /**
   * 加载知识库
   */
  async load(): Promise<void> {
    const data = await readJson(this.filePath)
    if (data && Array.isArray(data.entries)) {
      this.entries = data.entries as KnowledgeEntry[]
    }
  }

  /**
   * 保存知识库到磁盘
   */
  save(): void {
    const dir = resolve(this.projectRoot, KB_DIR)
    mkdirSync(dir, { recursive: true })
    writeFileSync(this.filePath, JSON.stringify({ entries: this.entries }, null, 2))
  }

  /**
   * 添加新条目
   */
  add(entry: Omit<KnowledgeEntry, 'id' | 'createdAt' | 'lastUsedAt' | 'useCount'>): KnowledgeEntry {
    const newEntry: KnowledgeEntry = {
      ...entry,
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      createdAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
      useCount: 0,
    }
    this.entries.push(newEntry)
    this.save()
    return newEntry
  }

  /**
   * 查询知识库
   * 基于症状指纹匹配相似问题
   */
  query(query: KnowledgeQuery): KnowledgeEntry[] {
    let results = [...this.entries]

    if (query.errorType) {
      results = results.filter(e => e.symptom.errorType === query.errorType)
    }
    if (query.errorCode) {
      results = results.filter(e => e.symptom.errorCode === query.errorCode)
    }
    if (query.tableName) {
      results = results.filter(e => e.symptom.tableName === query.tableName)
    }
    if (query.framework) {
      results = results.filter(e => e.stack.framework === query.framework)
    }
    if (query.keywords && query.keywords.length > 0) {
      results = results.filter(e =>
        query.keywords!.some(kw =>
          e.symptom.keywords.some(ek => ek.toLowerCase().includes(kw.toLowerCase())) ||
          e.tags.some(t => t.toLowerCase().includes(kw.toLowerCase())) ||
          e.notes.toLowerCase().includes(kw.toLowerCase())
        )
      )
    }

    // 按使用次数和最后使用时间排序（常用优先）
    results.sort((a, b) => {
      if (b.useCount !== a.useCount) return b.useCount - a.useCount
      return new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime()
    })

    return results.slice(0, query.limit || 10)
  }

  /**
   * 标记条目被使用（更新计数和时间）
   */
  markUsed(id: string): void {
    const entry = this.entries.find(e => e.id === id)
    if (entry) {
      entry.useCount++
      entry.lastUsedAt = new Date().toISOString()
      this.save()
    }
  }

  /**
   * 更新重验结果
   */
  markVerified(id: string, verified: boolean): void {
    const entry = this.entries.find(e => e.id === id)
    if (entry) {
      entry.verified = verified
      this.save()
    }
  }

  /**
   * 获取所有条目
   */
  getAll(): KnowledgeEntry[] {
    return [...this.entries]
  }

  /**
   * 条目数量
   */
  get size(): number {
    return this.entries.length
  }

  /**
   * 根据诊断结果自动创建知识库条目
   */
  autoCreate(opts: {
    stack: StackFingerprint
    symptom: SymptomFingerprint
    rootCause: string
    rootCauseType: string
    fix: { type: string; title: string; description: string; content: string | null }
  }): KnowledgeEntry {
    // 检查是否已有相似条目
    const existing = this.query({
      errorType: opts.symptom.errorType,
      errorCode: opts.symptom.errorCode || undefined,
      tableName: opts.symptom.tableName || undefined,
    })

    if (existing.length > 0) {
      // 更新已有条目
      const entry = existing[0]
      entry.lastUsedAt = new Date().toISOString()
      entry.useCount++
      this.save()
      return entry
    }

    // 创建新条目
    return this.add({
      stack: opts.stack,
      symptom: opts.symptom,
      rootCause: opts.rootCause,
      rootCauseType: opts.rootCauseType,
      fix: opts.fix,
      verified: null,
      tags: [opts.symptom.errorType, opts.symptom.tableName, opts.stack.framework].filter(Boolean) as string[],
      notes: '',
    })
  }
}
