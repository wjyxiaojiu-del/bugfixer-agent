import { detectStack, type StackInfo } from '../stack/detect.js'
import { loadConfig } from '../config.js'
import chalk from 'chalk'

/**
 * 格式化框架信息
 */
function formatFramework(info: StackInfo): string {
  const label = {
    next: 'Next.js',
    nuxt: 'Nuxt',
    sveltekit: 'SvelteKit',
    remix: 'Remix',
    astro: 'Astro',
    vite: 'Vite',
    unknown: '未知',
  }[info.framework]
  const ver = info.frameworkVersion ? ` ${info.frameworkVersion}` : ''
  return `${label}${ver}`
}

/**
 * 格式化部署目标
 */
function formatDeploy(info: StackInfo): string {
  const label = {
    vercel: 'Vercel',
    netlify: 'Netlify',
    unknown: '未检测到',
  }[info.deployTarget]
  return label
}

/**
 * csi detect 命令 — 识别项目技术栈
 */
export async function detectCommand(projectRoot?: string): Promise<StackInfo> {
  const info = await detectStack(projectRoot)
  const config = await loadConfig(projectRoot || process.cwd())

  console.log()
  console.log(chalk.bold('  🔍 栈识别结果'))
  console.log()

  // 框架
  console.log(chalk.gray('  框架      '), chalk.white(formatFramework(info)))

  // Supabase
  if (info.hasSupabase) {
    const source = info.supabaseSource === 'client' ? '@supabase/supabase-js' : info.supabaseSource === 'admin' ? '@supabase/admin' : '未知'
    console.log(chalk.gray('  Supabase  '), chalk.green('✓'), source)
    if (info.supabaseRef) {
      const conf = info.supabaseRefConfidence === 'high' ? chalk.green('高') : info.supabaseRefConfidence === 'medium' ? chalk.yellow('中') : chalk.red('低')
      console.log(chalk.gray('  Project   '), info.supabaseRef, chalk.gray(`(可信度: ${conf})`))
    }
  } else {
    console.log(chalk.gray('  Supabase  '), chalk.red('✖'), '未检测到')
  }

  // 部署
  console.log(chalk.gray('  部署      '), formatDeploy(info))
  if (info.vercelProjectId) {
    console.log(chalk.gray('  Vercel ID '), info.vercelProjectId)
  }

  // LLM 配置
  if (config.llm) {
    console.log(chalk.gray('  LLM       '), chalk.green('✓'), `${config.llm.provider} (${config.llm.model || '默认'})`)
  } else {
    console.log(chalk.gray('  LLM       '), chalk.yellow('未配置'), chalk.gray('（仅规则引擎）'))
  }

  console.log()
  return info
}
