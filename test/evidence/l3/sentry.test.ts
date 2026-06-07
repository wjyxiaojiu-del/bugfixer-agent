import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { sentryProvider } from '../../../src/evidence/l3/sentry.js'

describe('Sentry Provider', () => {
  describe('detect', () => {
    it('检测 SENTRY_DSN 环境变量', () => {
      const env = { SENTRY_DSN: 'https://xxx@sentry.io/123' }
      const detection = sentryProvider.detect({}, env)

      expect(detection).not.toBeNull()
      expect(detection!.type).toBe('sentry')
      expect(detection!.source).toBe('SENTRY_DSN')
    })

    it('检测 SENTRY_AUTH_TOKEN 环境变量', () => {
      const env = { SENTRY_AUTH_TOKEN: 'sntrys_xxx' }
      const detection = sentryProvider.detect({}, env)

      expect(detection).not.toBeNull()
      expect(detection!.type).toBe('sentry')
      expect(detection!.source).toBe('SENTRY_AUTH_TOKEN')
    })

    it('无 Sentry 配置时返回 null', () => {
      const env = {}
      const detection = sentryProvider.detect({}, env)

      expect(detection).toBeNull()
    })
  })

  describe('getUrlPatterns', () => {
    it('返回 Sentry URL 模式', () => {
      const patterns = sentryProvider.getUrlPatterns()

      expect(patterns.length).toBeGreaterThan(0)
      expect(patterns.some(p => p.test('https://sentry.io'))).toBe(true)
      expect(patterns.some(p => p.test('https://xxx.ingest.sentry.io'))).toBe(true)
    })
  })
})
