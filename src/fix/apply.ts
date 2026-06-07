import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { execSync } from 'node:child_process'
import { createSnapshot, rollbackSnapshot, type Snapshot } from './snapshot.js'
import type { FixSuggestion } from '../diagnose/analyze.js'

export interface FixResult {
  /** 是否成功 */
  success: boolean
  /** 快照（用于回滚） */
  snapshot: Snapshot | null
  /** 生成的文件路径 */
  generatedFiles: string[]
  /** 消息 */
  message: string
}

/**
 * 应用修复方案
 * 改前自动创建快照，失败可回滚
 */
export function applyFix(
  projectRoot: string,
  fix: FixSuggestion,
  options: { dryRun?: boolean } = {},
): FixResult {
  const { dryRun = false } = options

  // SQL migration 类型修复
  if (fix.type === 'sql_migration' && fix.content) {
    return applySqlMigration(projectRoot, fix, dryRun)
  }

  // 代码变更类型修复
  if (fix.type === 'code_change' && fix.content) {
    return applyCodeChange(projectRoot, fix, dryRun)
  }

  // 环境变量变更
  if (fix.type === 'env_change' && fix.content) {
    return applyEnvChange(projectRoot, fix, dryRun)
  }

  // 手动操作
  if (fix.type === 'manual') {
    return {
      success: true,
      snapshot: null,
      generatedFiles: [],
      message: `请手动执行: ${fix.description}`,
    }
  }

  return {
    success: false,
    snapshot: null,
    generatedFiles: [],
    message: '不支持的修复类型',
  }
}

/**
 * 应用 SQL migration 修复
 */
function applySqlMigration(projectRoot: string, fix: FixSuggestion, dryRun: boolean): FixResult {
  // 生成 migration 文件
  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
  const migrationDir = resolve(projectRoot, 'supabase', 'migrations')
  const migrationFile = `${timestamp}_fix_rls.sql`
  const migrationPath = resolve(migrationDir, migrationFile)

  // 创建快照
  const snapshot = dryRun ? null : createSnapshot(projectRoot)

  if (dryRun) {
    return {
      success: true,
      snapshot: null,
      generatedFiles: [],
      message: `[dry-run] 将生成: supabase/migrations/${migrationFile}\n\n${fix.content}`,
    }
  }

  // 确保目录存在
  mkdirSync(migrationDir, { recursive: true })

  // 写入 migration 文件
  writeFileSync(migrationPath, fix.content!)

  return {
    success: true,
    snapshot,
    generatedFiles: [`supabase/migrations/${migrationFile}`],
    message: `已生成 migration: supabase/migrations/${migrationFile}`,
  }
}

/**
 * 应用代码变更修复
 */
function applyCodeChange(projectRoot: string, fix: FixSuggestion, dryRun: boolean): FixResult {
  const snapshot = dryRun ? null : createSnapshot(projectRoot)

  if (dryRun) {
    return {
      success: true,
      snapshot: null,
      generatedFiles: [],
      message: `[dry-run] 将执行: ${fix.content}`,
    }
  }

  try {
    execSync(fix.content!, { cwd: projectRoot, stdio: 'pipe' })
    return {
      success: true,
      snapshot,
      generatedFiles: [],
      message: `已执行: ${fix.content}`,
    }
  } catch (e: unknown) {
    const err = e as Error
    return {
      success: false,
      snapshot,
      generatedFiles: [],
      message: `执行失败: ${err.message}`,
    }
  }
}

/**
 * 应用环境变量变更
 */
function applyEnvChange(projectRoot: string, fix: FixSuggestion, dryRun: boolean): FixResult {
  const envPath = resolve(projectRoot, '.env')
  const snapshot = dryRun ? null : createSnapshot(projectRoot, ['.env'])

  if (dryRun) {
    return {
      success: true,
      snapshot: null,
      generatedFiles: [],
      message: `[dry-run] 将修改 .env: ${fix.content}`,
    }
  }

  // 追加到 .env
  const fs = require('fs')
  const existing = existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : ''
  fs.writeFileSync(envPath, existing + '\n' + fix.content + '\n')

  return {
    success: true,
    snapshot,
    generatedFiles: ['.env'],
    message: '已更新 .env 文件',
  }
}

/**
 * 回滚修复
 */
export function revertFix(projectRoot: string, snapshot: Snapshot): void {
  rollbackSnapshot(projectRoot, snapshot)
}
