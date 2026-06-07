import { describe, it, expect } from 'vitest'
import { parseDevOutput } from '../../../src/evidence/l1/parser.js'

describe('L1 输出解析器', () => {
  it('解析 Next.js 就绪 URL', () => {
    const result = parseDevOutput('  ▲ Next.js 14.2.0\n  - Local:        http://localhost:3000\n')
    expect(result.readyUrl).toBe('http://localhost:3000')
  })

  it('解析 127.0.0.1 URL', () => {
    const result = parseDevOutput('Server running at http://127.0.0.1:5173/')
    expect(result.readyUrl).toBe('http://127.0.0.1:5173')
  })

  it('解析 0.0.0.0 URL', () => {
    const result = parseDevOutput('  VITE v5.4.0  ready in 300ms\n  → Local:   http://0.0.0.0:5173/')
    expect(result.readyUrl).toBe('http://0.0.0.0:5173')
  })

  it('检测错误信息', () => {
    const result = parseDevOutput('Error: Cannot find module \'./missing\'\n')
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0]).toContain('Cannot find module')
  })

  it('检测警告信息', () => {
    const result = parseDevOutput('Warning: API endpoint deprecated\n')
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  it('空输入不崩', () => {
    const result = parseDevOutput('')
    expect(result.readyUrl).toBeNull()
    expect(result.errors).toHaveLength(0)
    expect(result.rawLines).toHaveLength(0)
  })

  it('多次解析取首个 URL', () => {
    const result = parseDevOutput('http://localhost:3000\nhttp://localhost:3001\n')
    expect(result.readyUrl).toBe('http://localhost:3000')
  })

  it('解析 ECONNREFUSED 错误', () => {
    const result = parseDevOutput('Error: connect ECONNREFUSED 127.0.0.1:5432\n')
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0]).toContain('ECONNREFUSED')
  })

  it('同时检测 URL 和错误', () => {
    const result = parseDevOutput('http://localhost:3000\nError: something failed\n')
    expect(result.readyUrl).toBe('http://localhost:3000')
    expect(result.errors.length).toBeGreaterThan(0)
  })
})
