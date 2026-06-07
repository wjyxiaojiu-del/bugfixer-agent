import { describe, it, expect } from 'vitest'
import { neonProvider } from '../../../src/evidence/l3/neon.js'

describe('Neon Provider', () => {
  describe('detect', () => {
    it('检测 @neondatabase/serverless 依赖', () => {
      const pkg = {
        dependencies: { '@neondatabase/serverless': '^0.9.0', next: '14.2.0' },
      }
      const detection = neonProvider.detect(pkg, {})

      expect(detection).not.toBeNull()
      expect(detection!.type).toBe('neon')
      expect(detection!.source).toBe('@neondatabase/serverless')
    })

    it('检测 neon 依赖', () => {
      const pkg = {
        dependencies: { neon: '^1.0.0' },
      }
      const detection = neonProvider.detect(pkg, {})

      expect(detection).not.toBeNull()
      expect(detection!.type).toBe('neon')
      expect(detection!.source).toBe('neon')
    })

    it('从 DATABASE_URL 提取项目信息', () => {
      const pkg = {
        dependencies: { '@neondatabase/serverless': '^0.9.0' },
      }
      const env = {
        DATABASE_URL: 'postgres://user:pass@ep-cool-forest.us-east-2.aws.neon.tech/mydb',
      }
      const detection = neonProvider.detect(pkg, env)

      expect(detection).not.toBeNull()
      expect(detection!.projectRef).toBe('cool-forest.us-east-2')
      expect(detection!.confidence).toBe('high')
    })

    it('从 NEON_DATABASE_URL 提取', () => {
      const pkg = {
        dependencies: {},
      }
      const env = {
        NEON_DATABASE_URL: 'postgres://user:pass@ep-old-bird-789012.us-west-2.aws.neon.tech/mydb',
      }
      const detection = neonProvider.detect(pkg, env)

      expect(detection).not.toBeNull()
      expect(detection!.type).toBe('neon')
      expect(detection!.confidence).toBe('high')
    })

    it('无 Neon 依赖且无 URL 时返回 null', () => {
      const pkg = {
        dependencies: { react: '^18.3.0' },
      }
      const detection = neonProvider.detect(pkg, {})

      expect(detection).toBeNull()
    })
  })

  describe('getUrlPatterns', () => {
    it('返回 Neon URL 模式', () => {
      const patterns = neonProvider.getUrlPatterns()

      expect(patterns.length).toBeGreaterThan(0)
      expect(patterns.some(p => p.test('https://ep-cool-forest-123456.us-east-2.aws.neon.tech'))).toBe(true)
      expect(patterns.some(p => p.test('https://console.neon.tech'))).toBe(true)
    })
  })
})
