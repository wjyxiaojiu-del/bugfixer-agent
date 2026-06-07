import { describe, it, expect } from 'vitest'
import { planetscaleProvider } from '../../../src/evidence/l3/planetscale.js'

describe('PlanetScale Provider', () => {
  describe('detect', () => {
    it('检测 @planetscale/database 依赖', () => {
      const pkg = {
        dependencies: { '@planetscale/database': '^1.11.0', next: '14.2.0' },
      }
      const detection = planetscaleProvider.detect(pkg, {})

      expect(detection).not.toBeNull()
      expect(detection!.type).toBe('planetscale')
      expect(detection!.source).toBe('@planetscale/database')
    })

    it('检测 @planetscale/serverless 依赖', () => {
      const pkg = {
        dependencies: { '@planetscale/serverless': '^1.0.0' },
      }
      const detection = planetscaleProvider.detect(pkg, {})

      expect(detection).not.toBeNull()
      expect(detection!.type).toBe('planetscale')
      expect(detection!.source).toBe('@planetscale/serverless')
    })

    it('从 DATABASE_URL 提取项目信息', () => {
      const pkg = {
        dependencies: { '@planetscale/database': '^1.11.0' },
      }
      const env = {
        DATABASE_URL: 'mysql://user:pass@mydb.connect.psdb.cloud/mydb',
      }
      const detection = planetscaleProvider.detect(pkg, env)

      expect(detection).not.toBeNull()
      expect(detection!.projectRef).toBe('mydb')
      expect(detection!.confidence).toBe('high')
    })

    it('无 PlanetScale 依赖时返回 null', () => {
      const pkg = {
        dependencies: { react: '^18.3.0' },
      }
      const detection = planetscaleProvider.detect(pkg, {})

      expect(detection).toBeNull()
    })
  })

  describe('getUrlPatterns', () => {
    it('返回 PlanetScale URL 模式', () => {
      const patterns = planetscaleProvider.getUrlPatterns()

      expect(patterns.length).toBeGreaterThan(0)
      expect(patterns.some(p => p.test('https://aws.connect.psdb.cloud'))).toBe(true)
      expect(patterns.some(p => p.test('https://api.planetscale.com'))).toBe(true)
    })
  })
})
