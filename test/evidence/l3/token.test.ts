import { describe, it, expect, vi, beforeEach } from 'vitest'

// mock fs 模块
vi.mock('../../../src/utils/fs.js', () => ({
  readJson: vi.fn(),
  readText: vi.fn(),
  fileExists: vi.fn(),
}))

import { readSupabaseToken } from '../../../src/evidence/l3/token.js'
import * as fs from '../../../src/utils/fs.js'

describe('L3 token 读取', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    delete process.env.SUPABASE_ACCESS_TOKEN
  })

  it('环境变量优先', async () => {
    process.env.SUPABASE_ACCESS_TOKEN = 'test-token-env'
    const token = await readSupabaseToken()
    expect(token?.access_token).toBe('test-token-env')
    expect(token?.source).toBe('env')
  })

  it('无 token 返回 null', async () => {
    vi.mocked(fs.readJson).mockResolvedValue(null)
    vi.mocked(fs.readText).mockResolvedValue(null)
    const token = await readSupabaseToken()
    expect(token).toBeNull()
  })

  it('CLI 配置文件读取', async () => {
    vi.mocked(fs.readJson).mockResolvedValue({ access_token: 'cli-token-123' })
    const token = await readSupabaseToken()
    expect(token?.access_token).toBe('cli-token-123')
    expect(token?.source).toBe('cli-config')
  })
})
