import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readJson, readText, fileExists, readEnv } from '../../src/utils/fs.js'
import { resolve } from 'node:path'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'

const testDir = resolve(import.meta.dirname, '../../fixtures/_test_fs')

describe('文件工具', () => {
  beforeEach(() => {
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  describe('readJson', () => {
    it('读取有效的 JSON 文件', async () => {
      writeFileSync(resolve(testDir, 'test.json'), '{"name": "test", "version": "1.0.0"}')

      const result = await readJson(resolve(testDir, 'test.json'))
      expect(result).toEqual({ name: 'test', version: '1.0.0' })
    })

    it('文件不存在时返回 null', async () => {
      const result = await readJson(resolve(testDir, 'nonexistent.json'))
      expect(result).toBeNull()
    })

    it('JSON 格式错误时返回 null', async () => {
      writeFileSync(resolve(testDir, 'invalid.json'), 'not json')

      const result = await readJson(resolve(testDir, 'invalid.json'))
      expect(result).toBeNull()
    })
  })

  describe('readText', () => {
    it('读取文本文件', async () => {
      writeFileSync(resolve(testDir, 'test.txt'), 'hello world')

      const result = await readText(resolve(testDir, 'test.txt'))
      expect(result).toBe('hello world')
    })

    it('文件不存在时返回 null', async () => {
      const result = await readText(resolve(testDir, 'nonexistent.txt'))
      expect(result).toBeNull()
    })
  })

  describe('fileExists', () => {
    it('文件存在时返回 true', async () => {
      writeFileSync(resolve(testDir, 'test.txt'), 'content')

      const result = await fileExists(resolve(testDir, 'test.txt'))
      expect(result).toBe(true)
    })

    it('文件不存在时返回 false', async () => {
      const result = await fileExists(resolve(testDir, 'nonexistent.txt'))
      expect(result).toBe(false)
    })
  })

  describe('readEnv', () => {
    it('解析标准 .env 文件', async () => {
      const content = `KEY1=value1
KEY2=value2
KEY3="quoted value"
KEY4='single quoted'`
      writeFileSync(resolve(testDir, '.env'), content)

      const result = await readEnv(resolve(testDir, '.env'))
      expect(result.KEY1).toBe('value1')
      expect(result.KEY2).toBe('value2')
      expect(result.KEY3).toBe('quoted value')
      expect(result.KEY4).toBe('single quoted')
    })

    it('跳过注释和空行', async () => {
      const content = `# This is a comment
KEY1=value1

# Another comment
KEY2=value2`
      writeFileSync(resolve(testDir, '.env'), content)

      const result = await readEnv(resolve(testDir, '.env'))
      expect(Object.keys(result)).toHaveLength(2)
      expect(result.KEY1).toBe('value1')
      expect(result.KEY2).toBe('value2')
    })

    it('文件不存在时返回空对象', async () => {
      const result = await readEnv(resolve(testDir, 'nonexistent.env'))
      expect(result).toEqual({})
    })

    it('处理包含等号的值', async () => {
      writeFileSync(resolve(testDir, '.env'), 'DATABASE_URL=mysql://user:pass@host/db?opt=1')

      const result = await readEnv(resolve(testDir, '.env'))
      expect(result.DATABASE_URL).toBe('mysql://user:pass@host/db?opt=1')
    })
  })
})
