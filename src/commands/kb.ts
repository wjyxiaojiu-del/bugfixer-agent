import { KnowledgeStore } from '../knowledge/store.js'
import chalk from 'chalk'

/**
 * csi kb list — 列出知识库条目
 */
export async function kbListCommand(projectDir: string): Promise<void> {
  const kb = new KnowledgeStore(projectDir)
  await kb.load()

  console.log()
  console.log(chalk.bold('  🧠 问题知识库'))
  console.log()

  if (kb.size === 0) {
    console.log(chalk.gray('  暂无条目'))
    console.log(chalk.gray('  运行 csi repro 自动积累'))
    console.log()
    return
  }

  const entries = kb.getAll()
  for (const entry of entries) {
    const severity = entry.verified === true ? chalk.green('✓') : entry.verified === false ? chalk.red('✖') : chalk.gray('?')
    const used = entry.useCount > 0 ? chalk.gray(` (×${entry.useCount})`) : ''
    console.log(`  ${severity} ${chalk.white(entry.symptom.errorType)}${used}`)
    console.log(chalk.gray(`    ${entry.rootCause.slice(0, 60)}`))
    console.log(chalk.gray(`    ${entry.stack.framework} · ${entry.fix.type} · ${entry.createdAt.slice(0, 10)}`))
  }

  console.log()
  console.log(chalk.gray(`  共 ${kb.size} 条`))
  console.log()
}

/**
 * csi kb search — 搜索知识库
 */
export async function kbSearchCommand(projectDir: string, query: string): Promise<void> {
  const kb = new KnowledgeStore(projectDir)
  await kb.load()

  console.log()
  console.log(chalk.bold(`  🔍 搜索: ${query}`))
  console.log()

  const results = kb.query({
    keywords: query.split(/\s+/),
    limit: 5,
  })

  if (results.length === 0) {
    console.log(chalk.gray('  无匹配结果'))
    console.log()
    return
  }

  for (const entry of results) {
    console.log(chalk.white(`  ${entry.symptom.errorType}`) + chalk.gray(`  ${entry.rootCause.slice(0, 80)}`))
    console.log(chalk.gray(`    修复: ${entry.fix.title}`))
    if (entry.fix.content) {
      console.log(chalk.gray(`    SQL: ${entry.fix.content.split('\n')[0].slice(0, 60)}...`))
    }
    console.log(chalk.gray(`    框架: ${entry.stack.framework} · 使用: ${entry.useCount} 次`))
    console.log()
  }
}

/**
 * csi kb show — 查看条目详情
 */
export async function kbShowCommand(projectDir: string, entryId: string): Promise<void> {
  const kb = new KnowledgeStore(projectDir)
  await kb.load()

  const entries = kb.getAll()
  const entry = entries.find(e => e.id === entryId)

  if (!entry) {
    console.log()
    console.log(chalk.red(`  ✖ 未找到条目: ${entryId}`))
    console.log()
    process.exit(1)
  }

  console.log()
  console.log(chalk.bold('  📋 知识库条目详情'))
  console.log()

  console.log(chalk.gray('  ID:       ') + entry.id)
  console.log(chalk.gray('  创建:     ') + entry.createdAt)
  console.log(chalk.gray('  使用次数: ') + entry.useCount)
  console.log(chalk.gray('  验证:     ') + (entry.verified === true ? '✓ 通过' : entry.verified === false ? '✖ 失败' : '未验证'))
  console.log()

  console.log(chalk.bold('  技术栈'))
  console.log(chalk.gray('  框架:     ') + `${entry.stack.framework} ${entry.stack.frameworkVersion}`)
  console.log(chalk.gray('  Supabase: ') + (entry.stack.hasSupabase ? '✓' : '✖'))
  console.log(chalk.gray('  部署:     ') + entry.stack.deployTarget)
  console.log()

  console.log(chalk.bold('  症状'))
  console.log(chalk.gray('  类型:     ') + entry.symptom.errorType)
  console.log(chalk.gray('  错误码:   ') + (entry.symptom.errorCode || '-'))
  console.log(chalk.gray('  表名:     ') + (entry.symptom.tableName || '-'))
  console.log(chalk.gray('  关键词:   ') + entry.symptom.keywords.join(', '))
  console.log()

  console.log(chalk.bold('  根因'))
  console.log(`  ${entry.rootCause}`)
  console.log()

  console.log(chalk.bold('  修复方案'))
  console.log(chalk.gray('  类型:     ') + entry.fix.type)
  console.log(chalk.gray('  标题:     ') + entry.fix.title)
  console.log(chalk.gray('  描述:     ') + entry.fix.description)
  if (entry.fix.content) {
    console.log(chalk.gray('  内容:'))
    for (const line of entry.fix.content.split('\n')) {
      console.log(chalk.white(`    ${line}`))
    }
  }
  console.log()

  if (entry.tags.length > 0) {
    console.log(chalk.gray('  标签:     ') + entry.tags.join(', '))
  }
  if (entry.notes) {
    console.log(chalk.gray('  备注:     ') + entry.notes)
  }
  console.log()
}
