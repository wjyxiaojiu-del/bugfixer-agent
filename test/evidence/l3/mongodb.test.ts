import { describe, it, expect } from 'vitest'
import { mongodbProvider } from '../../../src/evidence/l3/mongodb.js'

describe('MongoDB Atlas Provider', () => {
  describe('detect', () => {
    it('检测 mongoose 依赖', () => {
      const pkg = {
        dependencies: { mongoose: '^8.5.0', next: '14.2.0' },
      }
      const detection = mongodbProvider.detect(pkg, {})

      expect(detection).not.toBeNull()
      expect(detection!.type).toBe('mongodb')
      expect(detection!.source).toBe('mongoose')
    })

    it('检测 mongodb 依赖', () => {
      const pkg = {
        dependencies: { mongodb: '^6.7.0' },
      }
      const detection = mongodbProvider.detect(pkg, {})

      expect(detection).not.toBeNull()
      expect(detection!.type).toBe('mongodb')
      expect(detection!.source).toBe('mongodb')
    })

    it('从 MONGODB_URI 提取项目信息', () => {
      const pkg = {
        dependencies: { mongoose: '^8.5.0' },
      }
      const env = {
        MONGODB_URI: 'mongodb+srv://user:pass@mycluster.abc123.mongodb.net/mydb?retryWrites=true&w=majority',
      }
      const detection = mongodbProvider.detect(pkg, env)

      expect(detection).not.toBeNull()
      expect(detection!.projectRef).toBe('mycluster')
      expect(detection!.confidence).toBe('high')
    })

    it('从 MONGO_URI 提取', () => {
      const pkg = {
        dependencies: {},
      }
      const env = {
        MONGO_URI: 'mongodb+srv://user:pass@prod-cluster.xyz789.mongodb.net/mydb',
      }
      const detection = mongodbProvider.detect(pkg, env)

      expect(detection).not.toBeNull()
      expect(detection!.type).toBe('mongodb')
      expect(detection!.confidence).toBe('high')
    })

    it('无 MongoDB 依赖且无 URI 时返回 null', () => {
      const pkg = {
        dependencies: { react: '^18.3.0' },
      }
      const detection = mongodbProvider.detect(pkg, {})

      expect(detection).toBeNull()
    })
  })

  describe('getUrlPatterns', () => {
    it('返回 MongoDB URL 模式', () => {
      const patterns = mongodbProvider.getUrlPatterns()

      expect(patterns.length).toBeGreaterThan(0)
      expect(patterns.some(p => p.test('https://mycluster.abc123.mongodb.net'))).toBe(true)
      expect(patterns.some(p => p.test('https://cloud.mongodb.com'))).toBe(true)
    })
  })
})
