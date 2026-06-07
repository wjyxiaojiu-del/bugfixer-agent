import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { changelogCommand, changelogAddCommand, loadChangelog, saveChangelog } from '../../src/commands/changelog.js'
import { resolve } from 'node:path'
import { mkdirSync, rmSync, readFileSync } from 'node:fs'

const testDir = resolve(import.meta.dirname, '../../fixtures/_test_changelog')

describe('CHANGELOG 命令', () => {
  beforeEach(() => {
    mkdirSync(testDir, { recursive: true })
    mkdirSync(resolve(testDir, '.csi'), { recursive: true })
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('无 changelog 文件时返回空数组', async () => {
    const entries = await loadChangelog(testDir)
    expect(entries).toEqual([])
  })

  it('添加条目后能读取', async () => {
    await changelogAddCommand(testDir, 'added', '支持 Next.js 检测')

    const entries = await loadChangelog(testDir)
    expect(entries).toHaveLength(1)
    expect(entries[0].changes[0].type).toBe('added')
    expect(entries[0].changes[0].description).toBe('支持 Next.js 检测')
  })

  it('多个变更合并到同一天', async () => {
    await changelogAddCommand(testDir, 'added', '第一个')
    await changelogAddCommand(testDir, 'fixed', '第二个')

    const entries = await loadChangelog(testDir)
    // 同一天的变更合并到一个条目
    expect(entries).toHaveLength(1)
    expect(entries[0].changes).toHaveLength(2)
    expect(entries[0].changes[0].description).toBe('第一个')
    expect(entries[0].changes[1].description).toBe('第二个')
  })

  it('相同日期的条目合并到同一版本', async () => {
    await changelogAddCommand(testDir, 'added', '功能 A')
    await changelogAddCommand(testDir, 'fixed', '修复 B')

    const entries = await loadChangelog(testDir)
    // 同一天应该合并
    expect(entries).toHaveLength(1)
    expect(entries[0].changes).toHaveLength(2)
  })

  it('保存和加载保持一致', async () => {
    const data = {
      entries: [{
        version: '0.1.0',
        date: '2026-06-07',
        changes: [
          { type: 'added' as const, description: '测试功能' },
        ],
      }],
    }

    await saveChangelog(testDir, data.entries)
    const loaded = await loadChangelog(testDir)

    expect(loaded).toEqual(data.entries)
  })

  it('changelogAddCommand 使用正确的类型', async () => {
    await changelogAddCommand(testDir, 'added', '新增')
    await changelogAddCommand(testDir, 'changed', '变更')
    await changelogAddCommand(testDir, 'fixed', '修复')
    await changelogAddCommand(testDir, 'removed', '移除')

    const entries = await loadChangelog(testDir)
    const types = entries.flatMap(e => e.changes.map(c => c.type))

    expect(types).toContain('added')
    expect(types).toContain('changed')
    expect(types).toContain('fixed')
    expect(types).toContain('removed')
  })
})
