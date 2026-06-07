import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

// 简易版 @actions/core（避免额外依赖）
const core = {
  getInput(name: string, options?: { required?: boolean }): string {
    const val = process.env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`] || ''
    if (options?.required && !val) {
      throw new Error(`Input required and not supplied: ${name}`)
    }
    return val
  },
  setOutput(name: string, value: string): void {
    // GitHub Actions output 格式
    console.log(`::set-output name=${name}::${value}`)
    // 新格式
    if (process.env.GITHUB_OUTPUT) {
      const fs = require('node:fs')
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`)
    }
  },
  setFailed(message: string): void {
    console.error(`::error::${message}`)
    process.exit(1)
  },
  info(message: string): void {
    console.log(message)
  },
  warning(message: string): void {
    console.log(`::warning::${message}`)
  },
  exportVariable(name: string, value: string): void {
    process.env[name] = value
    if (process.env.GITHUB_ENV) {
      const fs = require('node:fs')
      fs.appendFileSync(process.env.GITHUB_ENV, `${name}=${value}\n`)
    }
  },
}

async function run(): Promise<void> {
  try {
    // 读取 inputs
    const projectDir = core.getInput('project-dir') || '.'
    const devCommand = core.getInput('dev-command')
    const readyTimeout = core.getInput('ready-timeout') || '30000'
    const skipCloud = core.getInput('skip-cloud') === 'true'
    const failOnSeverity = core.getInput('fail-on-severity') || 'critical'
    const autoFix = core.getInput('auto-fix') === 'true'

    core.info(`CSI Agent — 项目目录: ${projectDir}`)

    // 设置环境变量（供 repro 命令使用）
    if (skipCloud) {
      process.env.CSI_SKIP_CLOUD = 'true'
    }

    // 动态导入 reproCommand（避免循环依赖）
    const { reproCommand } = await import('./commands/repro.js')

    // 运行诊断
    await reproCommand({
      projectDir,
      devCommand: devCommand ? devCommand.split(' ') : undefined,
      readyTimeout: parseInt(readyTimeout, 10),
      skipCloud,
      failOnSeverity: failOnSeverity as 'critical' | 'warning' | 'info',
      autoFix,
      json: true, // CI 模式始终输出 JSON
    })

    // 读取最新报告
    const reportDir = resolve(projectDir, '.csi', 'reports')
    let report: any = null

    try {
      const files = readdirSync(reportDir)
        .filter(f => f.startsWith('report-') && f.endsWith('.json'))
        .sort()
        .reverse()

      if (files.length > 0) {
        const reportPath = resolve(reportDir, files[0])
        report = JSON.parse(readFileSync(reportPath, 'utf-8'))
        core.setOutput('report-path', reportPath)
      }
    } catch {
      // 报告目录可能不存在
    }

    if (report?.diagnosis) {
      core.setOutput('diagnosis', JSON.stringify(report.diagnosis))
      core.setOutput('severity', report.diagnosis.severity)

      // 根据 fail-on-severity 决定是否失败
      const severityLevels: Record<string, number> = { info: 0, warning: 1, critical: 2 }
      const failLevel = severityLevels[failOnSeverity] ?? 2
      const diagnosisLevel = severityLevels[report.diagnosis.severity] ?? 0

      if (diagnosisLevel >= failLevel) {
        core.setFailed(`诊断发现问题: ${report.diagnosis.description}`)
        return
      }

      core.info(`诊断完成: ${report.diagnosis.severity} - ${report.diagnosis.description}`)
    } else {
      core.setOutput('severity', 'none')
      core.info('诊断完成: 未发现问题')
    }
  } catch (error: any) {
    core.setFailed(error.message)
  }
}

run()
