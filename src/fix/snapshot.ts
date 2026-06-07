import { execSync } from 'node:child_process'
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

export interface Snapshot {
  /** 快照 ID（时间戳） */
  id: string
  /** git commit hash（如果在 git 仓库中） */
  gitHash: string | null
  /** 修改的文件列表 */
  files: { path: string; content: string }[]
  /** 创建时间 */
  createdAt: string
}

const SNAPSHOTS_DIR = '.csi/snapshots'

/**
 * 创建改前快照
 * 记录当前 git 状态 + 相关文件内容
 */
export function createSnapshot(projectRoot: string, filePaths: string[] = []): Snapshot {
  const id = Date.now().toString(36)
  const snapshotsDir = resolve(projectRoot, SNAPSHOTS_DIR)
  mkdirSync(snapshotsDir, { recursive: true })

  // 获取 git commit hash
  let gitHash: string | null = null
  try {
    gitHash = execSync('git rev-parse HEAD', { cwd: projectRoot, encoding: 'utf-8' }).trim()
  } catch {
    // 不在 git 仓库中
  }

  // 记录文件内容
  const files: { path: string; content: string }[] = []
  for (const filePath of filePaths) {
    const fullPath = resolve(projectRoot, filePath)
    if (existsSync(fullPath)) {
      files.push({
        path: filePath,
        content: readFileSync(fullPath, 'utf-8'),
      })
    }
  }

  const snapshot: Snapshot = {
    id,
    gitHash,
    files,
    createdAt: new Date().toISOString(),
  }

  // 保存快照
  const snapshotPath = resolve(snapshotsDir, `${id}.json`)
  writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2))

  return snapshot
}

/**
 * 从快照回滚
 * 恢复快照中记录的文件内容
 */
export function rollbackSnapshot(projectRoot: string, snapshot: Snapshot): void {
  for (const file of snapshot.files) {
    const fullPath = resolve(projectRoot, file.path)
    writeFileSync(fullPath, file.content)
  }
}

/**
 * 列出所有快照
 */
export function listSnapshots(projectRoot: string): Snapshot[] {
  const snapshotsDir = resolve(projectRoot, SNAPSHOTS_DIR)
  if (!existsSync(snapshotsDir)) return []

  const fs = require('fs')
  const files = fs.readdirSync(snapshotsDir).filter((f: string) => f.endsWith('.json'))
  return files.map((f: string) => {
    const content = readFileSync(resolve(snapshotsDir, f), 'utf-8')
    return JSON.parse(content) as Snapshot
  })
}
