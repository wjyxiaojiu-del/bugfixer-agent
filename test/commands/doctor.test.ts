import { describe, it, expect } from 'vitest'

describe('csi doctor 命令', () => {
  it('Node.js 版本检查', () => {
    const major = parseInt(process.version.slice(1), 10)
    expect(major).toBeGreaterThanOrEqual(20)
  })

  it('关键依赖可解析', () => {
    // 这些包应该在 node_modules 中
    expect(() => require.resolve('commander')).not.toThrow()
  })
})
