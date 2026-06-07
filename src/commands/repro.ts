import { detectStack } from '../stack/detect.js'
import { spawnDevServer, waitForReady } from '../evidence/l1/pty.js'
import { parseDevOutput } from '../evidence/l1/parser.js'
import { launchBrowser } from '../evidence/l2/browser.js'
import { captureCdp, exportCapture } from '../evidence/l2/cdp.js'
import { recognizeIssues } from '../evidence/l2/recognizer.js'
import { collectCloudEvidence } from '../evidence/l3/collector.js'
import { aggregateEvidence, formatEvidenceForLLM } from '../diagnose/evidence.js'
import { diagnose } from '../diagnose/analyze.js'
import { applyFix, revertFix } from '../fix/apply.js'
import { KnowledgeStore } from '../knowledge/store.js'
import { loadConfig, type CsiConfig } from '../config.js'
import chalk from 'chalk'
import { resolve } from 'node:path'
import { writeFileSync, mkdirSync } from 'node:fs'

export interface ReproOptions {
  projectDir: string
  /** dev server 命令（默认自动检测） */
  devCommand?: string[]
  /** 等待就绪超时（ms） */
  readyTimeout?: number
  /** 是否自动应用修复 */
  autoFix?: boolean
  /** dry-run 模式 */
  dryRun?: boolean
  /** 跳过 L3 云端采集 */
  skipCloud?: boolean
  /** 诊断结果达到此级别时返回非零退出码 */
  failOnSeverity?: 'critical' | 'warning' | 'info'
  /** 输出 JSON 格式 */
  json?: boolean
  /** 指定报告输出路径 */
  reportPath?: string
}

/**
 * csi repro — 端到端现场勘察
 *
 * 流程：detect → L1(PTY) → L2(浏览器) → L3(云端) → 诊断 → 修复 → 知识库
 */
export async function reproCommand(opts: ReproOptions): Promise<void> {
  const { projectDir, dryRun = false, failOnSeverity = 'critical', json = false, reportPath } = opts
  const startTime = Date.now()

  // 加载配置
  const config = await loadConfig(projectDir)
  const autoFix = opts.autoFix ?? config.autoFix ?? false
  const skipCloud = opts.skipCloud ?? config.skipCloud ?? false

  // CI 模式下跳过 chalk 输出
  const log = json ? () => {} : console.log

  log()
  log(chalk.bold('  🔬 CSI Agent — 现场勘察'))
  log(chalk.gray(`  项目: ${projectDir}`))
  if (config.llm) {
    log(chalk.gray(`  LLM: ${config.llm.provider} (${config.llm.model || '默认'})`))
  }
  log()

  // ═══════════════════════════════════════
  // Step 1: 栈识别
  // ═══════════════════════════════════════
  log(chalk.blue('  ① 栈识别'))
  const stack = await detectStack(projectDir)
  log(chalk.gray(`     框架: ${stack.framework} ${stack.frameworkVersion || ''}`))
  log(chalk.gray(`     Supabase: ${stack.hasSupabase ? '✓' : '✖'}`))
  log(chalk.gray(`     部署: ${stack.deployTarget}`))
  if (stack.supabaseRef) {
    log(chalk.gray(`     Project: ${stack.supabaseRef}`))
  }
  log()

  // ═══════════════════════════════════════
  // Step 2: L1 — 启动 dev server
  // ═══════════════════════════════════════
  log(chalk.blue('  ② L1 本地采集 — 启动 dev server'))
  const devCommand = opts.devCommand || detectDevCommand(stack.framework)
  log(chalk.gray(`     命令: ${devCommand.join(' ')}`))

  let readyUrl: string | null = null
  let l1Session: ReturnType<typeof spawnDevServer> | null = null

  try {
    l1Session = spawnDevServer({ cwd: projectDir, command: devCommand })
    log(chalk.gray('     等待服务就绪...'))

    readyUrl = await waitForReady(l1Session, opts.readyTimeout || 30_000)
    log(chalk.green(`     ✓ 就绪: ${readyUrl}`))
  } catch (e: unknown) {
    const err = e as Error
    log(chalk.yellow(`     ⚠ dev server 启动失败: ${err.message}`))
    log(chalk.gray('     跳过 L1/L2，仅使用 L3 证据'))
  }
  log()

  // ═══════════════════════════════════════
  // Step 3: L2 — 浏览器采集
  // ═══════════════════════════════════════
  let networkEntries: any[] = []
  let consoleEntries: any[] = []
  let recognizedIssues: any[] = []
  let browserSession: Awaited<ReturnType<typeof launchBrowser>> | null = null

  if (readyUrl) {
    log(chalk.blue('  ③ L2 浏览器采集'))
    try {
      browserSession = await launchBrowser({ headless: true })
      log(chalk.gray('     Chromium 启动'))

      // 导航到 dev server
      await browserSession.page.goto(readyUrl, { waitUntil: 'networkidle', timeout: 15_000 })
      log(chalk.gray(`     导航到 ${readyUrl}`))

      // 等待一下让请求完成
      await browserSession.page.waitForTimeout(2000)

      // CDP 采集
      const capture = await captureCdp(browserSession.page)
      networkEntries = capture.network
      consoleEntries = capture.console

      // 识别问题模式
      recognizedIssues = recognizeIssues(networkEntries)

      log(chalk.gray(`     网络请求: ${networkEntries.length}`))
      log(chalk.gray(`     控制台: ${consoleEntries.length}`))

      if (recognizedIssues.length > 0) {
        for (const issue of recognizedIssues) {
          const icon = issue.severity === 'critical' ? chalk.red('✖') : chalk.yellow('⚠')
          log(`     ${icon} ${issue.message}`)
        }
      } else {
        log(chalk.green('     ✓ 未发现已知问题模式'))
      }

      // 保存截图
      const screenshotDir = resolve(projectDir, '.csi', 'screenshots')
      mkdirSync(screenshotDir, { recursive: true })
      const ts = new Date().toISOString().replace(/[:.]/g, '-')
      await browserSession.page.screenshot({
        path: resolve(screenshotDir, `repro-${ts}.png`),
        fullPage: true,
      })
      log(chalk.gray('     截图已保存'))

      // 保存网络采集
      const captureDir = resolve(projectDir, '.csi', 'captures')
      mkdirSync(captureDir, { recursive: true })
      writeFileSync(resolve(captureDir, `capture-${ts}.json`), exportCapture(capture))
    } catch (e: unknown) {
      const err = e as Error
      log(chalk.yellow(`     ⚠ 浏览器采集失败: ${err.message}`))
    }
    log()
  }

  // ═══════════════════════════════════════
  // Step 4: L3 — 云端采集
  // ═══════════════════════════════════════
  let cloudEvidence = null
  if (!skipCloud && stack.hasSupabase && stack.supabaseRef) {
    log(chalk.blue('  ④ L3 云端采集'))
    try {
      cloudEvidence = await collectCloudEvidence(stack.supabaseRef)
      log(chalk.gray(`     Token: ${cloudEvidence.tokenOk ? '✓' : '✖'} (${cloudEvidence.tokenSource || '无'})`))
      log(chalk.gray(`     RLS 策略: ${cloudEvidence.policies.length} 条`))
      log(chalk.gray(`     权限拒绝日志: ${cloudEvidence.denials.length} 条`))
      if (cloudEvidence.errors.length > 0) {
        for (const err of cloudEvidence.errors) {
          log(chalk.yellow(`     ⚠ ${err}`))
        }
      }
    } catch (e: unknown) {
      const err = e as Error
      log(chalk.yellow(`     ⚠ 云端采集失败: ${err.message}`))
    }
    log()
  }

  // ═══════════════════════════════════════
  // Step 5: 诊断
  // ═══════════════════════════════════════
  log(chalk.blue('  ⑤ 诊断'))

  // 聚合证据
  const evidence = aggregateEvidence({
    l1Outputs: l1Session?.outputs || [],
    network: networkEntries,
    console: consoleEntries,
    recognizedIssues,
    cloud: cloudEvidence,
  })

  // 诊断（规则优先，LLM 兜底）
  let diagnosis = await diagnose(evidence)
  let diagnosisSource = '规则引擎'

  // 规则没命中时，尝试 LLM
  if (!diagnosis && config.llm) {
    log(chalk.gray('     规则引擎未命中，调用 LLM 分析...'))
    diagnosis = await diagnose(evidence, config.llm)
    diagnosisSource = 'LLM'
  }

  if (diagnosis) {
    const severityColor = diagnosis.severity === 'critical' ? chalk.red : chalk.yellow
    log(severityColor(`     根因: ${diagnosis.description}`))
    log(chalk.gray(`     类型: ${diagnosis.rootCause}`))
    log(chalk.gray(`     置信度: ${diagnosis.confidence}`))
    log(chalk.gray(`     来源: ${diagnosisSource}`))
    log(chalk.gray(`     修复方案: ${diagnosis.recommendedFix.title}`))
  } else {
    log(chalk.green('     ✓ 未发现已知问题模式'))
  }

  // 保存诊断报告
  const reportDir = resolve(projectDir, '.csi', 'reports')
  mkdirSync(reportDir, { recursive: true })
  const reportTs = new Date().toISOString().replace(/[:.]/g, '-')
  const finalReportPath = reportPath || resolve(reportDir, `report-${reportTs}.json`)
  const report = {
    timestamp: new Date().toISOString(),
    stack: {
      framework: stack.framework,
      frameworkVersion: stack.frameworkVersion,
      hasSupabase: stack.hasSupabase,
      deployTarget: stack.deployTarget,
      supabaseRef: stack.supabaseRef,
    },
    evidence: {
      l1: { readyUrl, errors: evidence.terminal.errors, warnings: evidence.terminal.warnings },
      l2: { networkCount: networkEntries.length, consoleCount: consoleEntries.length, issues: recognizedIssues },
      l3: cloudEvidence ? { tokenOk: cloudEvidence.tokenOk, policies: cloudEvidence.policies.length, denials: cloudEvidence.denials.length } : null,
    },
    diagnosis: diagnosis ? {
      rootCause: diagnosis.rootCause,
      severity: diagnosis.severity,
      description: diagnosis.description,
      confidence: diagnosis.confidence,
      fix: diagnosis.recommendedFix,
    } : null,
    llmPrompt: formatEvidenceForLLM(evidence),
  }
  writeFileSync(finalReportPath, JSON.stringify(report, null, 2))
  log(chalk.gray(`     报告已保存`))
  log()

  // ═══════════════════════════════════════
  // Step 6: 修复（可选）
  // ═══════════════════════════════════════
  if (diagnosis && autoFix) {
    log(chalk.blue('  ⑥ 修复'))
    const fixResult = applyFix(projectDir, diagnosis.recommendedFix, { dryRun })

    if (fixResult.success) {
      log(chalk.green(`     ✓ ${fixResult.message}`))
      if (fixResult.generatedFiles.length > 0) {
        log(chalk.gray(`     生成文件: ${fixResult.generatedFiles.join(', ')}`))
      }
      if (fixResult.snapshot) {
        log(chalk.gray(`     快照: ${fixResult.snapshot.id}（可回滚）`))
      }
    } else {
      log(chalk.red(`     ✖ ${fixResult.message}`))
    }
    log()
  } else if (diagnosis && !autoFix) {
    log(chalk.blue('  ⑥ 修复'))
    log(chalk.gray('     跳过（未启用 --auto-fix）'))
    log(chalk.gray(`     方案: ${diagnosis.recommendedFix.title}`))
    if (diagnosis.recommendedFix.content) {
      log(chalk.gray('     SQL:'))
      log(chalk.white(`     ${diagnosis.recommendedFix.content.split('\n').join('\n     ')}`))
    }
    log()
  }

  // ═══════════════════════════════════════
  // Step 7: 知识库
  // ═══════════════════════════════════════
  if (diagnosis) {
    log(chalk.blue('  ⑦ 知识库'))
    const kb = new KnowledgeStore(projectDir)
    await kb.load()

    const entry = kb.autoCreate({
      stack: {
        framework: stack.framework,
        frameworkVersion: stack.frameworkVersion || '',
        hasSupabase: stack.hasSupabase,
        deployTarget: stack.deployTarget,
      },
      symptom: {
        errorType: diagnosis.rootCause,
        errorCode: recognizedIssues[0]?.entry?.body ? extractErrorCode(recognizedIssues[0].entry.body) : null,
        tableName: extractTableNameFromIssue(recognizedIssues[0]),
        httpMethod: recognizedIssues[0]?.entry?.method || null,
        keywords: diagnosis.description.split(/\s+/).slice(0, 5),
      },
      rootCause: diagnosis.description,
      rootCauseType: diagnosis.rootCause,
      fix: {
        type: diagnosis.recommendedFix.type,
        title: diagnosis.recommendedFix.title,
        description: diagnosis.recommendedFix.description,
        content: diagnosis.recommendedFix.content || null,
      },
    })

    log(chalk.gray(`     条目: ${entry.id} (使用 ${entry.useCount} 次)`))
    log(chalk.gray(`     知识库总量: ${kb.size} 条`))
    log()
  }

  // ═══════════════════════════════════════
  // 清理
  // ═══════════════════════════════════════
  if (browserSession) {
    await browserSession.close()
  }
  if (l1Session) {
    await l1Session.stop()
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  log(chalk.bold(`  完成！用时 ${elapsed}s`))
  log()

  // ═══════════════════════════════════════
  // CI 模式：JSON 输出 + 退出码
  // ═══════════════════════════════════════
  if (json) {
    // JSON 模式：直接输出报告到 stdout
    console.log(JSON.stringify(report, null, 2))
  }

  // 根据 --fail-on-severity 决定退出码
  if (diagnosis) {
    const severityLevels: Record<string, number> = { info: 0, warning: 1, critical: 2 }
    const failLevel = severityLevels[failOnSeverity] ?? 2
    const diagnosisLevel = severityLevels[diagnosis.severity] ?? 0

    if (diagnosisLevel >= failLevel) {
      process.exit(1)
    }
  }
}

/** 根据框架推断 dev 命令 */
function detectDevCommand(framework: string): string[] {
  switch (framework) {
    case 'next': return ['npx', 'next', 'dev']
    case 'nuxt': return ['npx', 'nuxi', 'dev']
    case 'sveltekit': return ['npx', 'vite', 'dev']
    case 'remix': return ['npx', 'remix', 'dev']
    case 'astro': return ['npx', 'astro', 'dev']
    case 'vite': return ['npx', 'vite']
    default: return ['npm', 'run', 'dev']
  }
}

/** 从 body JSON 提取错误码 */
function extractErrorCode(body: string): string | null {
  try {
    const parsed = JSON.parse(body)
    return parsed.code || null
  } catch {
    return null
  }
}

/** 从 issue 中提取表名 */
function extractTableNameFromIssue(issue: any): string | null {
  if (!issue?.entry?.url) return null
  const match = issue.entry.url.match(/\/rest\/v1\/([^?/]+)/)
  return match ? match[1] : null
}
