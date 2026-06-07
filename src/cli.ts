import { Command } from 'commander'
import { detectCommand } from './commands/detect.js'
import { doctorCommand } from './commands/doctor.js'
import { reproCommand } from './commands/repro.js'
import { fixListCommand, fixRollbackCommand } from './commands/fix.js'
import { kbListCommand, kbSearchCommand, kbShowCommand } from './commands/kb.js'
import { changelogCommand, changelogAddCommand } from './commands/changelog.js'
import { watchCommand } from './commands/watch.js'
import { hooksInstallCommand, hooksUninstallCommand } from './commands/hooks.js'

const program = new Command()

program
  .name('bugfixer')
  .description('自动 Bug 诊断与修复工具 — 给 vibe coder 的智能调试助手')
  .version('0.1.0')

// ─── detect ───
program
  .command('detect')
  .description('识别项目技术栈（框架 / Supabase / 部署目标）')
  .option('-d, --dir <path>', '项目目录', process.cwd())
  .action(async (opts) => {
    await detectCommand(opts.dir)
  })

// ─── doctor ───
program
  .command('doctor')
  .description('检查环境和依赖是否就绪')
  .action(async () => {
    const ok = await doctorCommand()
    process.exit(ok ? 0 : 1)
  })

// ─── repro ───
program
  .command('repro')
  .description('端到端现场勘察 — detect → L1 → L2 → L3 → 诊断 → 修复 → 知识库')
  .option('-d, --dir <path>', '项目目录', process.cwd())
  .option('--dev-command <cmd...>', '自定义 dev server 命令')
  .option('--ready-timeout <ms>', '等待就绪超时（ms）', '30000')
  .option('--auto-fix', '自动应用修复方案', false)
  .option('--dry-run', 'dry-run 模式（不实际修改文件）', false)
  .option('--skip-cloud', '跳过 L3 云端采集', false)
  .option('--fail-on-severity <level>', '诊断结果达到此级别时返回非零退出码 (critical|warning|info)', 'critical')
  .option('--json', '输出 JSON 格式（用于 CI 解析）')
  .option('--report-path <path>', '指定报告输出路径')
  .action(async (opts) => {
    await reproCommand({
      projectDir: opts.dir,
      devCommand: opts.devCommand,
      readyTimeout: parseInt(opts.readyTimeout, 10),
      autoFix: opts.autoFix,
      dryRun: opts.dryRun,
      skipCloud: opts.skipCloud,
      failOnSeverity: opts.failOnSeverity,
      json: opts.json,
      reportPath: opts.reportPath,
    })
  })

// ─── fix ───
const fixCmd = program
  .command('fix')
  .description('修复管理 — 快照列表 / 回滚')

fixCmd
  .command('list')
  .description('列出所有修复快照')
  .option('-d, --dir <path>', '项目目录', process.cwd())
  .action(async (opts) => {
    await fixListCommand(opts.dir)
  })

fixCmd
  .command('rollback <snapshot-id>')
  .description('回滚到指定快照')
  .option('-d, --dir <path>', '项目目录', process.cwd())
  .action(async (snapshotId, opts) => {
    await fixRollbackCommand(opts.dir, snapshotId)
  })

// ─── kb ───
const kbCmd = program
  .command('kb')
  .description('问题知识库 — 查询 / 搜索 / 详情')

kbCmd
  .command('list')
  .description('列出知识库条目')
  .option('-d, --dir <path>', '项目目录', process.cwd())
  .action(async (opts) => {
    await kbListCommand(opts.dir)
  })

kbCmd
  .command('search <query>')
  .description('搜索知识库（关键词）')
  .option('-d, --dir <path>', '项目目录', process.cwd())
  .action(async (query, opts) => {
    await kbSearchCommand(opts.dir, query)
  })

kbCmd
  .command('show <entry-id>')
  .description('查看条目详情')
  .option('-d, --dir <path>', '项目目录', process.cwd())
  .action(async (entryId, opts) => {
    await kbShowCommand(opts.dir, entryId)
  })

// ─── changelog ───
const changelogCmd = program
  .command('changelog')
  .description('版本变更记录')

changelogCmd
  .command('list')
  .description('查看变更记录')
  .option('-d, --dir <path>', '项目目录', process.cwd())
  .action(async (opts) => {
    await changelogCommand(opts.dir)
  })

changelogCmd
  .command('add <type> <description>')
  .description('添加变更记录 (added|changed|fixed|removed)')
  .option('-d, --dir <path>', '项目目录', process.cwd())
  .action(async (type, desc, opts) => {
    await changelogAddCommand(opts.dir, type, desc)
  })

// ─── hooks ───
const hooksCmd = program
  .command('hooks')
  .description('Git hooks 管理')

hooksCmd
  .command('install')
  .description('安装 Git hooks')
  .option('-d, --dir <path>', '项目目录', process.cwd())
  .action(async (opts) => {
    await hooksInstallCommand(opts.dir)
  })

hooksCmd
  .command('uninstall')
  .description('卸载 Git hooks')
  .option('-d, --dir <path>', '项目目录', process.cwd())
  .action(async (opts) => {
    await hooksUninstallCommand(opts.dir)
  })

// ─── watch ───
program
  .command('watch')
  .description('持续监控 — 定期检查项目状态')
  .option('-d, --dir <path>', '项目目录', process.cwd())
  .option('-i, --interval <seconds>', '检查间隔（秒）', '300')
  .option('--once', '只运行一次', false)
  .option('--skip-cloud', '跳过 L3 云端采集', false)
  .option('--file-watch', '文件变更时自动诊断', false)
  .action(async (opts) => {
    await watchCommand({
      projectDir: opts.dir,
      interval: parseInt(opts.interval, 10),
      once: opts.once,
      skipCloud: opts.skipCloud,
      fileWatch: opts.fileWatch,
    })
  })

program.parse()
