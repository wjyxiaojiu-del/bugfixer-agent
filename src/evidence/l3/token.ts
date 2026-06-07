import { readJson, readText, fileExists } from '../../utils/fs.js'
import { resolve } from 'node:path'
import { homedir } from 'node:os'

export interface SupabaseToken {
  access_token: string
  source: 'cli-config' | 'env'
}

/**
 * 读取 Supabase CLI token
 * 优先级：环境变量 > CLI 配置文件
 */
export async function readSupabaseToken(): Promise<SupabaseToken | null> {
  // 1. 环境变量
  if (process.env.SUPABASE_ACCESS_TOKEN) {
    return {
      access_token: process.env.SUPABASE_ACCESS_TOKEN,
      source: 'env',
    }
  }

  // 2. CLI 配置文件
  // Windows: %APPDATA%/supabase/config.json
  // macOS/Linux: ~/.config/supabase/config.json 或 ~/.supabase/access-token
  const home = homedir()
  const candidates = [
    // 新版 CLI
    resolve(process.env.APPDATA || home, 'supabase', 'config.json'),
    resolve(home, '.config', 'supabase', 'config.json'),
    // 旧版
    resolve(home, '.supabase', 'access-token'),
  ]

  for (const path of candidates) {
    if (path.endsWith('.json')) {
      const config = await readJson(path)
      if (config?.access_token) {
        return {
          access_token: config.access_token as string,
          source: 'cli-config',
        }
      }
    } else {
      const token = await readText(path)
      if (token?.trim()) {
        return {
          access_token: token.trim(),
          source: 'cli-config',
        }
      }
    }
  }

  return null
}
