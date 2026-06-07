import { describe, it, expect } from 'vitest'
import { detectStack } from '../../src/stack/detect.js'
import { resolve } from 'node:path'

const fixturesDir = resolve(import.meta.dirname, '../../fixtures')

describe('栈识别器', () => {
  it('识别 Next.js + Supabase + Vercel 项目', async () => {
    const info = await detectStack(resolve(fixturesDir, 'next-supabase'))

    expect(info.framework).toBe('next')
    expect(info.frameworkVersion).toBeTruthy()
    expect(info.hasSupabase).toBe(true)
    expect(info.supabaseSource).toBe('client')
    expect(info.supabaseRef).toBe('abcdefghij')
    expect(info.supabaseRefConfidence).toBe('high')
    expect(info.deployTarget).toBe('vercel')
    expect(info.vercelProjectId).toBe('prj_test123')
    expect(info.vercelOrgId).toBe('team_test456')
  })

  it('识别 Vite 项目', async () => {
    const info = await detectStack(resolve(fixturesDir, 'vite-only'))

    expect(info.framework).toBe('vite')
    expect(info.hasSupabase).toBe(false)
    expect(info.deployTarget).toBe('unknown')
  })

  it('空目录不崩', async () => {
    const info = await detectStack(resolve(fixturesDir, 'nonexistent'))

    expect(info.framework).toBe('unknown')
    expect(info.hasSupabase).toBe(false)
    expect(info.deployTarget).toBe('unknown')
    expect(info.packageJson).toBeNull()
  })

  it('识别 Supabase anon key 可信度', async () => {
    const info = await detectStack(resolve(fixturesDir, 'next-supabase'))

    // .env 中有标准 supabase.co URL，可信度应为 high
    expect(info.supabaseRefConfidence).toBe('high')
  })

  it('Vercel project.json 能正确解析', async () => {
    const info = await detectStack(resolve(fixturesDir, 'next-supabase'))

    expect(info.vercelProjectId).toBe('prj_test123')
    expect(info.vercelOrgId).toBe('team_test456')
  })

  it('识别 Nuxt 项目', async () => {
    const info = await detectStack(resolve(fixturesDir, 'nuxt'))

    expect(info.framework).toBe('nuxt')
    expect(info.frameworkVersion).toBeTruthy()
    expect(info.hasSupabase).toBe(false)
  })

  it('识别 SvelteKit 项目', async () => {
    const info = await detectStack(resolve(fixturesDir, 'sveltekit'))

    expect(info.framework).toBe('sveltekit')
    expect(info.frameworkVersion).toBeTruthy()
    expect(info.hasSupabase).toBe(false)
  })

  it('识别 Astro 项目', async () => {
    const info = await detectStack(resolve(fixturesDir, 'astro'))

    expect(info.framework).toBe('astro')
    expect(info.frameworkVersion).toBeTruthy()
    expect(info.hasSupabase).toBe(false)
  })

  it('Nuxt 不会误判为 Vite', async () => {
    // Nuxt 依赖 vite，但应优先识别为 nuxt
    const info = await detectStack(resolve(fixturesDir, 'nuxt'))

    expect(info.framework).toBe('nuxt')
    expect(info.framework).not.toBe('vite')
  })

  it('SvelteKit 不会误判为 Vite', async () => {
    const info = await detectStack(resolve(fixturesDir, 'sveltekit'))

    expect(info.framework).toBe('sveltekit')
    expect(info.framework).not.toBe('vite')
  })

  // ═══════════════════════════════════════
  // 多数据库检测
  // ═══════════════════════════════════════

  it('检测多数据库项目', async () => {
    const info = await detectStack(resolve(fixturesDir, 'multi-db'))

    expect(info.framework).toBe('next')
    expect(info.hasSupabase).toBe(true)
    expect(info.databases.length).toBeGreaterThanOrEqual(3)

    const dbTypes = info.databases.map(d => d.type)
    expect(dbTypes).toContain('supabase')
    expect(dbTypes).toContain('firebase')
    expect(dbTypes).toContain('mongodb')
  })

  it('多数据库项目中每个数据库都有正确的 projectRef', async () => {
    const info = await detectStack(resolve(fixturesDir, 'multi-db'))

    const supabase = info.databases.find(d => d.type === 'supabase')
    expect(supabase?.projectRef).toBe('myproject')

    const firebase = info.databases.find(d => d.type === 'firebase')
    expect(firebase?.projectRef).toBe('my-firebase-app')

    const mongodb = info.databases.find(d => d.type === 'mongodb')
    expect(mongodb?.projectRef).toBe('prod-cluster')
  })

  it('识别 Firebase 项目', async () => {
    const info = await detectStack(resolve(fixturesDir, 'next-firebase'))

    expect(info.framework).toBe('next')
    expect(info.databases.some(d => d.type === 'firebase')).toBe(true)
  })

  it('识别 PlanetScale 项目', async () => {
    const info = await detectStack(resolve(fixturesDir, 'next-planetscale'))

    expect(info.framework).toBe('next')
    expect(info.databases.some(d => d.type === 'planetscale')).toBe(true)
  })

  it('识别 Neon 项目', async () => {
    const info = await detectStack(resolve(fixturesDir, 'next-neon'))

    expect(info.framework).toBe('next')
    expect(info.databases.some(d => d.type === 'neon')).toBe(true)
  })

  it('识别 MongoDB 项目', async () => {
    const info = await detectStack(resolve(fixturesDir, 'next-mongodb'))

    expect(info.framework).toBe('next')
    expect(info.databases.some(d => d.type === 'mongodb')).toBe(true)
  })

  it('无数据库时 databases 为空数组', async () => {
    const info = await detectStack(resolve(fixturesDir, 'vite-only'))

    expect(info.databases).toEqual([])
  })
})
