import { describe, it, expect } from 'vitest'
import { supabaseProvider } from '../../../src/evidence/l3/supabase.js'

describe('Supabase Provider', () => {
  describe('detect', () => {
    it('检测 @supabase/supabase-js 依赖', () => {
      const pkg = {
        dependencies: { '@supabase/supabase-js': '^2.45.0', next: '14.2.0' },
      }
      const detection = supabaseProvider.detect(pkg, {})

      expect(detection).not.toBeNull()
      expect(detection!.type).toBe('supabase')
      expect(detection!.source).toBe('@supabase/supabase-js')
    })

    it('检测 @supabase/ssr 依赖', () => {
      const pkg = {
        dependencies: { '@supabase/ssr': '^0.5.0' },
      }
      const detection = supabaseProvider.detect(pkg, {})

      expect(detection).not.toBeNull()
      expect(detection!.type).toBe('supabase')
      expect(detection!.source).toBe('@supabase/ssr')
    })

    it('检测 @supabase/admin 依赖', () => {
      const pkg = {
        dependencies: { '@supabase/admin': '^1.0.0' },
      }
      const detection = supabaseProvider.detect(pkg, {})

      expect(detection).not.toBeNull()
      expect(detection!.type).toBe('supabase')
      expect(detection!.source).toBe('@supabase/admin')
    })

    it('从 NEXT_PUBLIC_SUPABASE_URL 提取 project ref', () => {
      const pkg = {
        dependencies: { '@supabase/supabase-js': '^2.45.0' },
      }
      const env = {
        NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghij.supabase.co',
      }
      const detection = supabaseProvider.detect(pkg, env)

      expect(detection).not.toBeNull()
      expect(detection!.projectRef).toBe('abcdefghij')
      expect(detection!.confidence).toBe('high')
    })

    it('从 SUPABASE_URL 提取 project ref', () => {
      const pkg = {
        dependencies: { '@supabase/supabase-js': '^2.45.0' },
      }
      const env = {
        SUPABASE_URL: 'https://myproject.supabase.co',
      }
      const detection = supabaseProvider.detect(pkg, env)

      expect(detection).not.toBeNull()
      expect(detection!.projectRef).toBe('myproject')
      expect(detection!.confidence).toBe('high')
    })

    it('无 Supabase 依赖时返回 null', () => {
      const pkg = {
        dependencies: { react: '^18.3.0' },
      }
      const detection = supabaseProvider.detect(pkg, {})

      expect(detection).toBeNull()
    })

    it('自定义域名时置信度为 medium', () => {
      const pkg = {
        dependencies: { '@supabase/supabase-js': '^2.45.0' },
      }
      const env = {
        NEXT_PUBLIC_SUPABASE_URL: 'https://api.example.com',
      }
      const detection = supabaseProvider.detect(pkg, env)

      expect(detection).not.toBeNull()
      expect(detection!.confidence).toBe('low')
    })
  })

  describe('getUrlPatterns', () => {
    it('返回 Supabase URL 模式', () => {
      const patterns = supabaseProvider.getUrlPatterns()

      expect(patterns.length).toBeGreaterThan(0)
      expect(patterns.some(p => p.test('https://abcdefghij.supabase.co'))).toBe(true)
      expect(patterns.some(p => p.test('https://xyz.supabase.co/rest/v1/users'))).toBe(true)
    })
  })
})
