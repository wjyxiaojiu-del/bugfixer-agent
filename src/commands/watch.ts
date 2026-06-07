import { detectStack } from '../stack/detect.js'
import { aggregateEvidence } from '../diagnose/evidence.js'
import { diagnose } from '../diagnose/analyze.js'
import { collectAllEvidence } from '../evidence/l3/collector.js'
import { readEnv } from '../utils/fs.js'
import { loadConfig } from '../config.js'
import { resolve, join } from 'node:path'
import { watch } from 'node:fs'
import chalk from 'chalk'
import type { Diagnosis } from '../diagnose/analyze.js'

// ═══════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════

export interface WatchOptions {
  projectDir: string
  /** 检查间隔（秒） */
  interval?: number
  /** 只运行一次 */
  once?: boolean
  /** 发现问题时的回调 */
  onIssue?: (diagnosis: Diagnosis) => void
  /** 跳过 L3 云端采集 */
  skipCloud?: boolean
  /** 文件变更时自动诊断 */
  fileWatch?: boolean
}

export interface DiagnosisResult {
  stack: Awaited<ReturnType<typeof detectStack>>
  diagnosis: Diagnosis | null
}

// ═══════════════════════════════════════
// 轻量级诊断
// ═══════════════════════════════════════

/**
 * 运行轻量级诊断（不需要启动 dev server）
 */
export async function runDiagnosis(projectDir: string): Promise<DiagnosisResult> {
  const stack = await detectStack(projectDir)
  const env = await readEnv(resolve(projectDir, '.env'))

  // 收集云端证据
  let cloudEvidence = null
  try {
    const cloudResults = await collectAllEvidence(stack.packageJson, env)
    if (cloudResults.length > 0) {
      cloudEvidence = cloudResults[0] // 取第一个
    }
  } catch {
    // 忽略云端采集错误
  }

  // 聚合证据
  const evidence = aggregateEvidence({
    cloud: cloudEvidence,
  })

  // 诊断
  const diagnosis = await diagnose(evidence)

  return { stack, diagnosis }
}

// ═══════════════════════════════════════
// Watch 命令
// ═══════════════════════════════════════

/**
 * csi watch — 持续监控
 */
export async function watchCommand(opts: WatchOptions): Promise<void> {
  const { projectDir, interval = 300, once = false, onIssue, fileWatch = false } = opts

  if (!once) {
    console.log()
    console.log(chalk.bold('  🔍 Watch 模式'))
    console.log(chalk.gray(`  项目: ${projectDir}`))
    if (fileWatch) {
      console.log(chalk.gray('  模式: 文件变更自动诊断'))
    } else {
      console.log(chalk.gray(`  间隔: ${interval} 秒`))
    }
    console.log(chalk.gray('  按 Ctrl+C 退出'))
    console.log()
  }

  // 文件变更模式
  if (fileWatch && !once) {
    return watchFiles(projectDir, onIssue)
  }

  // 定时检查模式
  let checkCount = 0

  while (true) {
    checkCount++
    const now = new Date().toLocaleTimeString()

    try {
      const result = await runDiagnosis(projectDir)

      if (result.diagnosis) {
        const severityIcon = {
          critical: chalk.red('✖'),
          warning: chalk.yellow('⚠'),
          info: chalk.blue('ℹ'),
        }[result.diagnosis.severity]

        console.log(`  [${now}] ${severityIcon} ${result.diagnosis.description}`)
        onIssue?.(result.diagnosis)
      } else {
        console.log(`  [${now}] ${chalk.green('✓')} 无问题`)
      }
    } catch (err) {
      console.log(`  [${now}] ${chalk.red('✖')} 诊断失败: ${(err as Error).message}`)
    }

    if (once) break

    // 等待下一次检查
    await sleep(interval * 1000)
  }
}

/**
 * 文件变更监控
 */
function watchFiles(projectDir: string, onIssue?: (diagnosis: Diagnosis) => void): void {
  const srcDir = join(projectDir, 'src')
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  console.log(chalk.gray('  监控目录: src/'))
  console.log(chalk.gray('  等待文件变更...'))
  console.log()

  const watcher = watch(srcDir, { recursive: true }, async (eventType, filename) => {
    if (!filename) return

    // 防抖：避免频繁触发
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(async () => {
      const now = new Date().toLocaleTimeString()
      console.log(chalk.gray(`  [${now}] 文件变更: ${filename}`))

      try {
        const result = await runDiagnosis(projectDir)

        if (result.diagnosis) {
          const severityIcon = {
            critical: chalk.red('✖'),
            warning: chalk.yellow('⚠'),
            info: chalk.blue('ℹ'),
          }[result.diagnosis.severity]

          console.log(`  [${now}] ${severityIcon} ${result.diagnosis.description}`)
          onIssue?.(result.diagnosis)
        } else {
          console.log(`  [${now}] ${chalk.green('✓')} 无问题`)
        }
      } catch (err) {
        console.log(`  [${now}] ${chalk.red('✖')} 诊断失败: ${(err as Error).message}`)
      }
    }, 1000) // 1 秒防抖
  })

  // 优雅退出
  process.on('SIGINT', () => {
    watcher.close()
    console.log(chalk.gray('\n  停止监控'))
    process.exit(0)
  })
}

// ═══════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
