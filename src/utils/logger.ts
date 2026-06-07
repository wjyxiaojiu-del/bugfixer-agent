import chalk from 'chalk'

export const log = {
  info: (...args: unknown[]) => console.log(chalk.blue('ℹ'), ...args),
  success: (...args: unknown[]) => console.log(chalk.green('✓'), ...args),
  warn: (...args: unknown[]) => console.log(chalk.yellow('⚠'), ...args),
  error: (...args: unknown[]) => console.log(chalk.red('✖'), ...args),
  dim: (...args: unknown[]) => console.log(chalk.gray('·'), ...args),
}
