import { resolve, join } from 'node:path'
import { mkdirSync, writeFileSync, chmodSync, existsSync } from 'node:fs'
import chalk from 'chalk'

// ═══════════════════════════════════════
// Git Hook 命令
// ═══════════════════════════════════════

/**
 * bugfixer hooks install — 安装 Git hooks
 */
export async function hooksInstallCommand(projectDir: string): Promise<void> {
  const hooksDir = resolve(projectDir, '.git', 'hooks')

  if (!existsSync(resolve(projectDir, '.git'))) {
    console.log(chalk.red('  ✖ 不是 Git 仓库'))
    process.exit(1)
  }

  // 创建 pre-commit hook
  const preCommitPath = join(hooksDir, 'pre-commit')
  const preCommitContent = `#!/bin/sh
# Bugfixer Agent - Pre-commit hook
# 在提交前自动诊断代码

echo "🔍 Bugfixer Agent - 检查代码..."

# 运行诊断
npx github:wjyxiaojiu-del/bugfixer-agent repro --skip-cloud --once --fail-on-severity critical

# 如果诊断发现问题，阻止提交
if [ $? -ne 0 ]; then
  echo ""
  echo "❌ 发现问题，请修复后再提交"
  echo "   使用 --no-verify 跳过检查"
  exit 1
fi

echo "✅ 检查通过"
`

  writeFileSync(preCommitPath, preCommitContent)
  chmodSync(preCommitPath, 0o755)

  console.log(chalk.green('  ✓ Git pre-commit hook 已安装'))
  console.log(chalk.gray('  提交时会自动运行诊断'))
  console.log(chalk.gray('  使用 git commit --no-verify 跳过检查'))
}

/**
 * bugfixer hooks uninstall — 卸载 Git hooks
 */
export async function hooksUninstallCommand(projectDir: string): Promise<void> {
  const preCommitPath = resolve(projectDir, '.git', 'hooks', 'pre-commit')

  if (!existsSync(preCommitPath)) {
    console.log(chalk.gray('  pre-commit hook 不存在'))
    return
  }

  const { unlinkSync } = await import('node:fs')
  unlinkSync(preCommitPath)

  console.log(chalk.green('  ✓ Git pre-commit hook 已卸载'))
}
