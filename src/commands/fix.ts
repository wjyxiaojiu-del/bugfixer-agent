import { listSnapshots, rollbackSnapshot, type Snapshot } from '../fix/snapshot.js'
import chalk from 'chalk'

/**
 * csi fix list — 列出所有快照
 */
export async function fixListCommand(projectDir: string): Promise<void> {
  const snapshots = listSnapshots(projectDir)

  console.log()
  console.log(chalk.bold('  📸 修复快照'))
  console.log()

  if (snapshots.length === 0) {
    console.log(chalk.gray('  暂无快照'))
    console.log()
    return
  }

  for (const snap of snapshots) {
    const files = snap.files.length
    const git = snap.gitHash ? snap.gitHash.slice(0, 7) : '无 git'
    console.log(chalk.white(`  ${snap.id}`) + chalk.gray(`  ${snap.createdAt}  ${files} 文件  ${git}`))
  }

  console.log()
  console.log(chalk.gray(`  共 ${snapshots.length} 个快照`))
  console.log()
}

/**
 * csi fix rollback — 回滚到指定快照
 */
export async function fixRollbackCommand(projectDir: string, snapshotId: string): Promise<void> {
  const snapshots = listSnapshots(projectDir)
  const target = snapshots.find(s => s.id === snapshotId)

  if (!target) {
    console.log()
    console.log(chalk.red(`  ✖ 未找到快照: ${snapshotId}`))
    console.log(chalk.gray('  运行 csi fix list 查看可用快照'))
    console.log()
    process.exit(1)
  }

  console.log()
  console.log(chalk.bold('  🔄 回滚'))
  console.log(chalk.gray(`  快照: ${target.id}`))
  console.log(chalk.gray(`  创建: ${target.createdAt}`))
  console.log(chalk.gray(`  文件: ${target.files.length} 个`))
  console.log()

  for (const file of target.files) {
    console.log(chalk.gray(`  恢复: ${file.path}`))
  }

  rollbackSnapshot(projectDir, target)

  console.log()
  console.log(chalk.green('  ✓ 回滚完成'))
  console.log()
}
