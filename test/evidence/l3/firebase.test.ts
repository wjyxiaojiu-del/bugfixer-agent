import { describe, it, expect, beforeEach } from 'vitest'
import { firebaseProvider } from '../../../src/evidence/l3/firebase.js'
import { registerProvider, detectDatabases, getProvider, getAllProviders } from '../../../src/evidence/l3/registry.js'
import { supabaseProvider } from '../../../src/evidence/l3/supabase.js'

// 确保 providers 已注册（通常在 detect.ts 中完成）
registerProvider(supabaseProvider)
registerProvider(firebaseProvider)

describe('Firebase Provider', () => {
  describe('detect', () => {
    it('检测 firebase 依赖', () => {
      const pkg = {
        dependencies: { firebase: '^10.12.0', react: '^18.3.0' },
      }
      const detection = firebaseProvider.detect(pkg, {})

      expect(detection).not.toBeNull()
      expect(detection!.type).toBe('firebase')
      expect(detection!.source).toBe('firebase')
      expect(detection!.confidence).toBe('high')
    })

    it('检测 firebase/app 依赖', () => {
      const pkg = {
        dependencies: { 'firebase/app': '^10.12.0' },
      }
      const detection = firebaseProvider.detect(pkg, {})

      expect(detection).not.toBeNull()
      expect(detection!.type).toBe('firebase')
      expect(detection!.source).toBe('firebase/app')
    })

    it('从环境变量提取项目 ID', () => {
      const pkg = {
        dependencies: { firebase: '^10.12.0' },
      }
      const env = {
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'my-project-123',
      }
      const detection = firebaseProvider.detect(pkg, env)

      expect(detection).not.toBeNull()
      expect(detection!.projectRef).toBe('my-project-123')
    })

    it('无 firebase 依赖时返回 null', () => {
      const pkg = {
        dependencies: { react: '^18.3.0' },
      }
      const detection = firebaseProvider.detect(pkg, {})

      expect(detection).toBeNull()
    })
  })

  describe('getUrlPatterns', () => {
    it('返回 Firebase URL 模式', () => {
      const patterns = firebaseProvider.getUrlPatterns()

      expect(patterns.length).toBeGreaterThan(0)
      expect(patterns.some(p => p.test('https://firestore.googleapis.com/v1/projects/my-project/databases'))).toBe(true)
      expect(patterns.some(p => p.test('https://identitytoolkit.googleapis.com/v1/accounts'))).toBe(true)
    })
  })
})

describe('Provider Registry', () => {
  beforeEach(() => {
    // 清空并重新注册
    const providers = getAllProviders()
    // 注意：由于 providers 是全局的，测试之间会互相影响
    // 在实际项目中应该有更好的隔离机制
  })

  it('获取已注册的 provider', () => {
    // supabase 和 firebase 应该已经在 detect.ts 中注册
    const supabase = getProvider('supabase')
    const firebase = getProvider('firebase')

    expect(supabase).toBeDefined()
    expect(firebase).toBeDefined()
    expect(supabase!.name).toBe('supabase')
    expect(firebase!.name).toBe('firebase')
  })

  it('检测多个数据库', () => {
    const pkg = {
      dependencies: {
        '@supabase/supabase-js': '^2.45.0',
        firebase: '^10.12.0',
      },
    }
    const env = {
      NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghij.supabase.co',
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'my-firebase-project',
    }

    const detections = detectDatabases(pkg, env)

    expect(detections.length).toBe(2)
    expect(detections.some(d => d.type === 'supabase')).toBe(true)
    expect(detections.some(d => d.type === 'firebase')).toBe(true)
  })

  it('无数据库时返回空数组', () => {
    const pkg = {
      dependencies: { react: '^18.3.0' },
    }

    const detections = detectDatabases(pkg, {})

    expect(detections.length).toBe(0)
  })
})
