import { resolve } from 'node:path'
import { readJson, readEnv, fileExists } from '../utils/fs.js'
import { detectDatabases, registerProvider } from '../evidence/l3/registry.js'
import { supabaseProvider } from '../evidence/l3/supabase.js'
import { firebaseProvider } from '../evidence/l3/firebase.js'
import { planetscaleProvider } from '../evidence/l3/planetscale.js'
import { neonProvider } from '../evidence/l3/neon.js'
import { mongodbProvider } from '../evidence/l3/mongodb.js'
import { sentryProvider } from '../evidence/l3/sentry.js'
import type { DatabaseDetection } from '../evidence/l3/provider.js'

export type Framework = 'next' | 'nuxt' | 'sveltekit' | 'remix' | 'astro' | 'vite' | 'unknown'
export type DeployTarget = 'vercel' | 'netlify' | 'unknown'

// 注册内置 providers
registerProvider(supabaseProvider)
registerProvider(firebaseProvider)
registerProvider(planetscaleProvider)
registerProvider(neonProvider)
registerProvider(mongodbProvider)
registerProvider(sentryProvider)

export interface StackInfo {
  /** 项目根目录 */
  root: string
  /** 前端框架 */
  framework: Framework
  /** 框架版本 */
  frameworkVersion: string | null
  /** 是否使用 Supabase */
  hasSupabase: boolean
  /** Supabase 依赖来源（client / admin / unknown） */
  supabaseSource: 'client' | 'admin' | 'unknown'
  /** Supabase project ref（从 .env 解析） */
  supabaseRef: string | null
  /** Supabase URL 可信度 */
  supabaseRefConfidence: 'high' | 'medium' | 'low'
  /** 检测到的数据库列表 */
  databases: DatabaseDetection[]
  /** 部署目标 */
  deployTarget: DeployTarget
  /** Vercel org ID */
  vercelOrgId: string | null
  /** Vercel project ID */
  vercelProjectId: string | null
  /** 原始 package.json */
  packageJson: Record<string, unknown> | null
}

/** 从 package.json 判定框架 */
function detectFramework(pkg: Record<string, unknown> | null): { framework: Framework; version: string | null } {
  if (!pkg) return { framework: 'unknown', version: null }
  const deps = { ...(pkg.dependencies as Record<string, string> || {}), ...(pkg.devDependencies as Record<string, string> || {}) }

  // 优先判定 meta-framework（vite 必须放最后，因为 nuxt/sveltekit/astro 都依赖 vite）
  if (deps['next']) return { framework: 'next', version: deps['next'] }
  if (deps['nuxt']) return { framework: 'nuxt', version: deps['nuxt'] }
  if (deps['@sveltejs/kit']) return { framework: 'sveltekit', version: deps['@sveltejs/kit'] }
  if (deps['@remix-run/react'] || deps['@remix-run/node']) return { framework: 'remix', version: deps['@remix-run/react'] || deps['@remix-run/node'] || null }
  if (deps['astro']) return { framework: 'astro', version: deps['astro'] }
  if (deps['vite']) return { framework: 'vite', version: deps['vite'] }

  return { framework: 'unknown', version: null }
}

/** 判定 Supabase 依赖来源 */
function detectSupabase(pkg: Record<string, unknown> | null): { has: boolean; source: 'client' | 'admin' | 'unknown' } {
  if (!pkg) return { has: false, source: 'unknown' }
  const deps = { ...(pkg.dependencies as Record<string, string> || {}), ...(pkg.devDependencies as Record<string, string> || {}) }

  if (deps['@supabase/supabase-js']) return { has: true, source: 'client' }
  if (deps['@supabase/ssr']) return { has: true, source: 'client' }
  if (deps['@supabase/admin']) return { has: true, source: 'admin' }

  return { has: false, source: 'unknown' }
}

/** 从 .env 提取 Supabase project ref */
function extractSupabaseRef(env: Record<string, string>): { ref: string | null; confidence: 'high' | 'medium' | 'low' } {
  const url = env['NEXT_PUBLIC_SUPABASE_URL'] || env['SUPABASE_URL'] || ''
  if (!url) return { ref: null, confidence: 'low' }

  // https://abcdefghij.supabase.co → abcdefghij
  const match = url.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/i)
  if (match) return { ref: match[1], confidence: 'high' }

  // 可能是自定义域名，但格式不标准
  if (url.includes('supabase')) return { ref: url, confidence: 'medium' }

  return { ref: null, confidence: 'low' }
}

/** 判定部署目标 */
async function detectDeployTarget(root: string): Promise<{ target: DeployTarget; orgId: string | null; projectId: string | null }> {
  // 先查 .vercel/project.json
  const vercelConfig = await readJson(resolve(root, '.vercel/project.json'))
  if (vercelConfig) {
    return {
      target: 'vercel',
      orgId: (vercelConfig.orgId as string) || null,
      projectId: (vercelConfig.projectId as string) || null,
    }
  }

  // 查 netlify.toml
  if (await fileExists(resolve(root, 'netlify.toml'))) {
    return { target: 'netlify', orgId: null, projectId: null }
  }

  // 旁注：有 vercel.json 但没有 project.json
  if (await fileExists(resolve(root, 'vercel.json'))) {
    return { target: 'vercel', orgId: null, projectId: null }
  }

  return { target: 'unknown', orgId: null, projectId: null }
}

/**
 * 主入口：检测项目技术栈
 * @param projectRoot 项目根目录（默认当前目录）
 */
export async function detectStack(projectRoot: string = process.cwd()): Promise<StackInfo> {
  const root = resolve(projectRoot)
  const pkg = await readJson(resolve(root, 'package.json'))
  const env = await readEnv(resolve(root, '.env'))

  const { framework, version: frameworkVersion } = detectFramework(pkg)
  const { has: hasSupabase, source: supabaseSource } = detectSupabase(pkg)
  const { ref: supabaseRef, confidence: supabaseRefConfidence } = extractSupabaseRef(env)
  const { target: deployTarget, orgId: vercelOrgId, projectId: vercelProjectId } = await detectDeployTarget(root)

  // 使用 provider 注册表检测所有数据库
  const databases = detectDatabases(pkg, env)

  return {
    root,
    framework,
    frameworkVersion,
    hasSupabase,
    supabaseSource,
    supabaseRef,
    supabaseRefConfidence,
    databases,
    deployTarget,
    vercelOrgId,
    vercelProjectId,
    packageJson: pkg,
  }
}
