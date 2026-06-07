import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { loadConfig, saveConfig, validateLLMConfig } from '../src/config.js'
import { resolve } from 'node:path'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'

const testDir = resolve(import.meta.dirname, '../fixtures/_test_config')

describe('配置管理', () => {
  beforeEach(() => {
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
    // 清理环境变量
    delete process.env.CSI_LLM_PROVIDER
    delete process.env.CSI_LLM_API_KEY
  })

  it('无配置文件时返回默认值', async () => {
    const config = await loadConfig(testDir)

    expect(config.llm).toBeUndefined()
    expect(config.autoFix).toBe(false)
    expect(config.skipCloud).toBe(false)
  })

  it('从 .csi/config.json 读取配置', async () => {
    mkdirSync(resolve(testDir, '.csi'), { recursive: true })
    writeFileSync(resolve(testDir, '.csi', 'config.json'), JSON.stringify({
      llm: { provider: 'openai', apiKey: 'sk-test' },
      autoFix: true,
    }))

    const config = await loadConfig(testDir)

    expect(config.llm?.provider).toBe('openai')
    expect(config.llm?.apiKey).toBe('sk-test')
    expect(config.autoFix).toBe(true)
  })

  it('环境变量优先于配置文件', async () => {
    mkdirSync(resolve(testDir, '.csi'), { recursive: true })
    writeFileSync(resolve(testDir, '.csi', 'config.json'), JSON.stringify({
      llm: { provider: 'openai', apiKey: 'sk-file' },
    }))

    process.env.CSI_LLM_PROVIDER = 'anthropic'
    process.env.CSI_LLM_API_KEY = 'sk-env'

    const config = await loadConfig(testDir)

    expect(config.llm?.provider).toBe('anthropic')
    expect(config.llm?.apiKey).toBe('sk-env')
  })

  it('保存配置到 .csi/config.json', async () => {
    await saveConfig(testDir, {
      llm: { provider: 'ollama' },
      autoFix: true,
    })

    const config = await loadConfig(testDir)
    expect(config.llm?.provider).toBe('ollama')
    expect(config.autoFix).toBe(true)
  })

  it('validateLLMConfig 无配置时返回 valid', () => {
    const result = validateLLMConfig(undefined)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('validateLLMConfig 缺少 apiKey 时报错', () => {
    const result = validateLLMConfig({ provider: 'openai' })
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('apiKey')
  })

  it('validateLLMConfig ollama 不需要 apiKey', () => {
    const result = validateLLMConfig({ provider: 'ollama' })
    expect(result.valid).toBe(true)
  })
})
