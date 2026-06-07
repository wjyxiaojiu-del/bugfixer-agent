import { readFile, access, constants } from 'node:fs/promises'
import { resolve } from 'node:path'

/** 安全读文件，不存在返回 null */
export async function readJson(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await readFile(filePath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** 安全读文本文件，不存在返回 null */
export async function readText(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf-8')
  } catch {
    return null
  }
}

/** 检查文件是否存在 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK)
    return true
  } catch {
    return false
  }
}

/** 安全解析 .env 文件为键值对 */
export async function readEnv(filePath: string): Promise<Record<string, string>> {
  const content = await readText(filePath)
  if (!content) return {}
  const env: Record<string, string> = {}
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    let value = trimmed.slice(eqIdx + 1).trim()
    // 去引号
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }
  return env
}
