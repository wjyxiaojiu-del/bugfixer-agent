import { resolve } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import { readJson } from '../utils/fs.js'
import chalk from 'chalk'

// ═══════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════

export interface ChangelogChange {
  type: 'added' | 'changed' | 'fixed' | 'removed'
  description: string
}

export interface ChangelogEntry {
  version: string
  date: string
  changes: ChangelogChange[]
}

export interface ChangelogData {
  entries: ChangelogEntry[]
}

// ═══════════════════════════════════════
// 存储
// ═══════════════════════════════════════

const CHANGELOG_DIR = '.csi'
const CHANGELOG_FILE = 'changelog.json'

/**
 * 加载 changelog
 */
export async function loadChangelog(projectDir: string): Promise<ChangelogEntry[]> {
  const filePath = resolve(projectDir, CHANGELOG_DIR, CHANGELOG_FILE)
  const data = await readJson(filePath) as ChangelogData | null
  return data?.entries || []
}

/**
 * 保存 changelog
 */
export async function saveChangelog(projectDir: string, entries: ChangelogEntry[]): Promise<void> {
  const dir = resolve(projectDir, CHANGELOG_DIR)
  mkdirSync(dir, { recursive: true })
  writeFileSync(resolve(dir, CHANGELOG_FILE), JSON.stringify({ entries }, null, 2))
}

// ═══════════════════════════════════════
// 命令
// ═══════════════════════════════════════

/**
 * csi changelog list — 查看变更记录
 */
export async function changelogCommand(projectDir: string): Promise<void> {
  const entries = await loadChangelog(projectDir)

  if (entries.length === 0) {
    console.log(chalk.gray('  暂无变更记录'))
    console.log(chalk.gray('  使用 csi changelog add <type> <description> 添加'))
    return
  }

  console.log()
  console.log(chalk.bold('  📋 变更记录'))
  console.log()

  for (const entry of entries) {
    console.log(chalk.bold(`  ${entry.version} (${entry.date})`))
    for (const change of entry.changes) {
      const icon = {
        added: chalk.green('+'),
        changed: chalk.blue('~'),
        fixed: chalk.yellow('!'),
        removed: chalk.red('-'),
      }[change.type]

      console.log(`    ${icon} ${change.description}`)
    }
    console.log()
  }
}

/**
 * csi changelog add — 添加变更记录
 */
export async function changelogAddCommand(
  projectDir: string,
  type: string,
  description: string,
): Promise<void> {
  const validTypes = ['added', 'changed', 'fixed', 'removed']
  if (!validTypes.includes(type)) {
    console.error(chalk.red(`  无效类型: ${type}，支持: ${validTypes.join(', ')}`))
    process.exit(1)
  }

  const entries = await loadChangelog(projectDir)
  const today = new Date().toISOString().split('T')[0]
  const version = getVersionFromPackage(projectDir)

  // 查找今天的条目
  const existing = entries.find(e => e.date === today)

  if (existing) {
    // 合并到今天的条目
    existing.changes.push({ type: type as ChangelogChange['type'], description })
  } else {
    // 创建新条目
    entries.unshift({
      version,
      date: today,
      changes: [{ type: type as ChangelogChange['type'], description }],
    })
  }

  await saveChangelog(projectDir, entries)

  console.log(chalk.green(`  ✓ 已添加: [${type}] ${description}`))
}

/**
 * 从 package.json 获取版本号
 */
function getVersionFromPackage(projectDir: string): string {
  try {
    const { readFileSync } = require('node:fs')
    const pkg = JSON.parse(readFileSync(resolve(projectDir, 'package.json'), 'utf-8'))
    return pkg.version || '0.0.0'
  } catch {
    return '0.0.0'
  }
}
