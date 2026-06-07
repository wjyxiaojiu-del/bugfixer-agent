import { execSync } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import chalk from 'chalk'

const require = createRequire(import.meta.url)

interface CheckResult {
  name: string
  ok: boolean
  detail: string
}

function checkNode(): CheckResult {
  const ver = process.version
  const major = parseInt(ver.slice(1), 10)
  return {
    name: 'Node.js',
    ok: major >= 20,
    detail: ver,
  }
}

function checkCommand(cmd: string): boolean {
  try {
    // shell 兼容 Windows（npx 实际是 npx.cmd）
    execSync(`${cmd} --version`, { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

function checkNpx(): CheckResult {
  const ok = checkCommand('npx')
  return {
    name: 'npx',
    ok,
    detail: ok ? '可用' : '未找到',
  }
}

function checkPty(): CheckResult {
  try {
    require.resolve('@lydell/node-pty')
    return { name: '@lydell/node-pty', ok: true, detail: '已安装' }
  } catch {
    return { name: '@lydell/node-pty', ok: false, detail: '未安装' }
  }
}

function checkPlaywright(): CheckResult {
  try {
    require.resolve('playwright')
    return { name: 'Playwright', ok: true, detail: '已安装' }
  } catch {
    return { name: 'Playwright', ok: false, detail: '未安装' }
  }
}

function checkVercelAuth(): CheckResult {
  const authPath = resolve(process.env.HOME || process.env.USERPROFILE || '', '.vercel', 'auth.json')
  try {
    accessSync(authPath, constants.R_OK)
    return { name: 'Vercel 登录', ok: true, detail: '已登录' }
  } catch {
    return { name: 'Vercel 登录', ok: false, detail: '未登录（运行 vercel login）' }
  }
}

/**
 * csi doctor 命令 — 检查环境和依赖
 */
export async function doctorCommand(): Promise<boolean> {
  const checks: CheckResult[] = [
    checkNode(),
    checkNpx(),
    checkPty(),
    checkPlaywright(),
    checkVercelAuth(),
  ]

  console.log()
  console.log(chalk.bold('  🩺 环境检查'))
  console.log()

  let allOk = true
  for (const c of checks) {
    const icon = c.ok ? chalk.green('✓') : chalk.red('✖')
    console.log(`  ${icon} ${c.name.padEnd(18)} ${c.detail}`)
    if (!c.ok) allOk = false
  }

  console.log()
  if (allOk) {
    console.log(chalk.green('  所有检查通过，可以开工了！'))
  } else {
    console.log(chalk.yellow('  部分检查未通过，请修复后再运行。'))
  }
  console.log()

  return allOk
}
