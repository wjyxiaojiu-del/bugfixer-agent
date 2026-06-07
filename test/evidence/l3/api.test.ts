import { describe, it, expect } from 'vitest'
import { verifyToken } from '../../../src/evidence/l3/api.js'

describe('L3 API', () => {
  it('verifyToken 无效 token 返回 false', async () => {
    // 不传真实 token，应该返回 false
    const result = await verifyToken('invalid-token')
    expect(result).toBe(false)
  })
})
