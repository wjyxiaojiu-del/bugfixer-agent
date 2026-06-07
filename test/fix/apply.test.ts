import { describe, it, expect } from 'vitest'
import { applyFix } from '../../src/fix/apply.js'

describe('修复应用', () => {
  it('dry-run 模式不实际修改文件', () => {
    const result = applyFix(process.cwd(), {
      type: 'sql_migration',
      title: '测试',
      description: '测试修复',
      content: 'SELECT 1;',
    }, { dryRun: true })

    expect(result.success).toBe(true)
    expect(result.snapshot).toBeNull()
    expect(result.generatedFiles).toHaveLength(0)
    expect(result.message).toContain('dry-run')
  })

  it('manual 类型返回提示信息', () => {
    const result = applyFix(process.cwd(), {
      type: 'manual',
      title: '手动操作',
      description: '请运行 supabase login',
    })

    expect(result.success).toBe(true)
    expect(result.message).toContain('supabase login')
  })

  it('不支持的类型返回失败', () => {
    const result = applyFix(process.cwd(), {
      type: 'sql_migration' as any,
      title: '空修复',
      description: '无内容',
      // 没有 content
    })

    expect(result.success).toBe(false)
  })
})
