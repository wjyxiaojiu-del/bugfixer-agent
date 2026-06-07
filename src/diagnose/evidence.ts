import type { ParsedOutput } from '../evidence/l1/parser.js'
import type { NetworkEntry, ConsoleEntry } from '../evidence/l2/cdp.js'
import type { RecognizedIssue } from '../evidence/l2/recognizer.js'
import type { CloudEvidence } from '../evidence/l3/collector.js'

export interface AggregatedEvidence {
  /** L1 本地终端输出 */
  terminal: {
    readyUrl: string | null
    errors: string[]
    warnings: string[]
  }
  /** L2 浏览器网络请求 */
  network: NetworkEntry[]
  /** L2 浏览器控制台 */
  console: ConsoleEntry[]
  /** L2 已识别的问题模式 */
  recognizedIssues: RecognizedIssue[]
  /** L3 云端证据 */
  cloud: CloudEvidence | null
  /** 汇总时间 */
  capturedAt: string
}

/**
 * 将三流证据聚合为统一格式
 * L1(终端) + L2(浏览器) + L3(云端) → 诊断输入
 */
export function aggregateEvidence(opts: {
  l1Outputs?: ParsedOutput[]
  network?: NetworkEntry[]
  console?: ConsoleEntry[]
  recognizedIssues?: RecognizedIssue[]
  cloud?: CloudEvidence | null
}): AggregatedEvidence {
  const l1 = opts.l1Outputs || []

  // 从 L1 输出中提取首个 URL 和所有错误/警告
  let readyUrl: string | null = null
  const allErrors: string[] = []
  const allWarnings: string[] = []

  for (const output of l1) {
    if (!readyUrl && output.readyUrl) readyUrl = output.readyUrl
    allErrors.push(...output.errors)
    allWarnings.push(...output.warnings)
  }

  return {
    terminal: {
      readyUrl,
      errors: allErrors,
      warnings: allWarnings,
    },
    network: opts.network || [],
    console: opts.console || [],
    recognizedIssues: opts.recognizedIssues || [],
    cloud: opts.cloud ?? null,
    capturedAt: new Date().toISOString(),
  }
}

/**
 * 为 LLM 生成诊断 prompt
 * 将证据格式化为结构化文本
 */
export function formatEvidenceForLLM(evidence: AggregatedEvidence): string {
  const sections: string[] = []

  // 终端证据
  sections.push('## 终端输出（L1）')
  if (evidence.terminal.readyUrl) {
    sections.push(`就绪 URL: ${evidence.terminal.readyUrl}`)
  }
  if (evidence.terminal.errors.length > 0) {
    sections.push('错误:')
    for (const err of evidence.terminal.errors) {
      sections.push(`  - ${err}`)
    }
  }
  if (evidence.terminal.warnings.length > 0) {
    sections.push('警告:')
    for (const warn of evidence.terminal.warnings) {
      sections.push(`  - ${warn}`)
    }
  }

  // 浏览器证据
  sections.push('\n## 浏览器网络请求（L2）')
  if (evidence.network.length > 0) {
    for (const req of evidence.network.slice(0, 20)) {
      const status = req.status >= 400 ? ` ❌ ${req.status}` : ` ✓ ${req.status}`
      sections.push(`  ${req.method} ${req.url}${status}`)
      if (req.body && req.status >= 400) {
        sections.push(`    body: ${req.body.slice(0, 200)}`)
      }
    }
  } else {
    sections.push('  （无网络请求）')
  }

  // 已识别问题
  if (evidence.recognizedIssues.length > 0) {
    sections.push('\n## 已识别问题模式')
    for (const issue of evidence.recognizedIssues) {
      sections.push(`  [${issue.severity}] ${issue.type}: ${issue.message}`)
    }
  }

  // 云端证据
  if (evidence.cloud) {
    sections.push(`\n## 云端证据（L3 - ${evidence.cloud.provider}）`)
    if (evidence.cloud.policies.length > 0) {
      sections.push(`策略/规则: ${evidence.cloud.policies.length} 条`)
      for (const p of evidence.cloud.policies.slice(0, 10)) {
        sections.push(`  ${p.tablename}.${p.policyname} (${p.cmd}) → ${p.roles.join(',')}`)
      }
    }
    if (evidence.cloud.denials.length > 0) {
      sections.push(`权限拒绝: ${evidence.cloud.denials.length} 条`)
    }
  }

  return sections.join('\n')
}
