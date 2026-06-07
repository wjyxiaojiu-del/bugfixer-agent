import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createSnapshot, rollbackSnapshot, listSnapshots } from '../../src/fix/snapshot.js'
import { resolve } from 'node:path'
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'

const testDir = resolve(import.meta.dirname, '../../fixtures/_test_snapshot')

describe('快照管理', () => {
  beforeEach(() => {
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('创建快照并记录文件', () => {
    // 创建测试文件
    writeFileSync(resolve(testDir, 'test.txt'), 'original content')

    const snapshot = createSnapshot(testDir, ['test.txt'])

    expect(snapshot.id).toBeTruthy()
    expect(snapshot.files).toHaveLength(1)
    expect(snapshot.files[0].path).toBe('test.txt')
    expect(snapshot.files[0].content).toBe('original content')
    expect(snapshot.createdAt).toBeTruthy()
  })

  it('快照保存到 .csi/snapshots/', () => {
    writeFileSync(resolve(testDir, 'test.txt'), 'content')

    const snapshot = createSnapshot(testDir, ['test.txt'])
    const snapshotPath = resolve(testDir, '.csi', 'snapshots', `${snapshot.id}.json`)

    expect(existsSync(snapshotPath)).toBe(true)
  })

  it('不存在的文件不记录', () => {
    const snapshot = createSnapshot(testDir, ['nonexistent.txt'])

    expect(snapshot.files).toHaveLength(0)
  })

  it('回滚恢复文件内容', () => {
    // 创建并修改文件
    writeFileSync(resolve(testDir, 'test.txt'), 'original')
    const snapshot = createSnapshot(testDir, ['test.txt'])

    // 修改文件
    writeFileSync(resolve(testDir, 'test.txt'), 'modified')
    expect(readFileSync(resolve(testDir, 'test.txt'), 'utf-8')).toBe('modified')

    // 回滚
    rollbackSnapshot(testDir, snapshot)
    expect(readFileSync(resolve(testDir, 'test.txt'), 'utf-8')).toBe('original')
  })

  it('列出所有快照', () => {
    writeFileSync(resolve(testDir, 'test.txt'), 'content')

    createSnapshot(testDir, ['test.txt'])
    createSnapshot(testDir, ['test.txt'])

    const snapshots = listSnapshots(testDir)
    expect(snapshots).toHaveLength(2)
  })

  it('无快照目录时返回空数组', () => {
    const snapshots = listSnapshots(testDir)
    expect(snapshots).toHaveLength(0)
  })
})
