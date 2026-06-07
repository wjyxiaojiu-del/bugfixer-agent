import { describe, it, expect } from 'vitest'
import { detectStack } from '../../src/stack/detect.js'
import { resolve } from 'node:path'

const fixturesDir = resolve(import.meta.dirname, '../../fixtures')

describe('csi detect 命令', () => {
  it('在 Next+Supabase 目录下正确识别', async () => {
    const info = await detectStack(resolve(fixturesDir, 'next-supabase'))

    expect(info.framework).toBe('next')
    expect(info.hasSupabase).toBe(true)
    expect(info.deployTarget).toBe('vercel')
  })

  it('在 Vite 目录下正确识别', async () => {
    const info = await detectStack(resolve(fixturesDir, 'vite-only'))

    expect(info.framework).toBe('vite')
    expect(info.hasSupabase).toBe(false)
  })

  it('默认使用当前目录', async () => {
    // 当前目录（csi-agent 项目本身）没有 package.json 中的框架依赖
    const info = await detectStack()
    // 不崩就行
    expect(info).toBeTruthy()
  })
})
