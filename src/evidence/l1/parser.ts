export interface ParsedOutput {
  /** 就绪 URL（如 http://localhost:3000） */
  readyUrl: string | null
  /** 错误信息 */
  errors: string[]
  /** 警告信息 */
  warnings: string[]
  /** 原始行 */
  rawLines: string[]
}

/** 匹配常见 dev server 就绪 URL */
const URL_PATTERNS = [
  /https?:\/\/localhost:\d+/gi,
  /https?:\/\/127\.0\.0\.1:\d+/gi,
  /https?:\/\/0\.0\.0\.0:\d+/gi,
  /https?:\/\/\[::\]:\d+/gi,
]

/** 匹配错误模式 */
const ERROR_PATTERNS = [
  // 通用错误
  /error/gi,
  /failed/gi,
  /ECONNREFUSED/gi,
  /ENOENT/gi,
  /Module not found/gi,
  /Cannot find module/gi,
  /SyntaxError/gi,
  /TypeError/gi,

  // TypeScript 错误
  /TS\d{4}:/,
  /error TS/,

  // Hydration 错误
  /Hydration failed/i,
  /did not match/i,
  /hydrat/i,

  // CORS 错误
  /CORS/i,
  /Access-Control-Allow-Origin/i,

  // 端口占用
  /EADDRINUSE/i,
  /port.*already/i,
  /address already in use/i,

  // 构建错误
  /Module build failed/i,
  /webpack/i,
  /Turbopack/i,

  // 致命错误
  /FATAL/i,
  /PANIC/i,

  // 环境变量
  /is not defined/i,
  /env.*undefined/i,
]

/** 匹配警告模式 */
const WARNING_PATTERNS = [
  /warn(ing)?/gi,
  /deprecated/gi,
]

/**
 * 解析 dev server 输出
 * @param data PTY 输出的原始文本
 */
export function parseDevOutput(data: string): ParsedOutput {
  const lines = data.split(/\r?\n/).filter(Boolean)
  const errors: string[] = []
  const warnings: string[] = []
  let readyUrl: string | null = null

  for (const line of lines) {
    // 检测 URL
    if (!readyUrl) {
      for (const pattern of URL_PATTERNS) {
        pattern.lastIndex = 0
        const match = pattern.exec(line)
        if (match) {
          readyUrl = match[0]
          break
        }
      }
    }

    // 检测错误
    for (const pattern of ERROR_PATTERNS) {
      pattern.lastIndex = 0
      if (pattern.test(line)) {
        errors.push(line.trim())
        break
      }
    }

    // 检测警告
    for (const pattern of WARNING_PATTERNS) {
      pattern.lastIndex = 0
      if (pattern.test(line)) {
        warnings.push(line.trim())
        break
      }
    }
  }

  return { readyUrl, errors, warnings, rawLines: lines }
}

// ═══════════════════════════════════════
// 结构化错误解析
// ═══════════════════════════════════════

export interface StructuredError {
  /** 出错文件路径 */
  file?: string
  /** 行号 */
  line?: number
  /** 列号 */
  column?: number
  /** 错误码（如 TS2322） */
  code?: string
  /** 错误消息 */
  message: string
  /** 来源识别 */
  source: 'tsc' | 'webpack' | 'vite' | 'next' | 'prisma' | 'generic'
}

/**
 * 从终端输出行中提取结构化错误信息
 * @param line 终端输出的一行
 * @returns 结构化错误信息，如果无法解析则返回 null
 */
export function parseStructuredError(line: string): StructuredError | null {
  // TypeScript 错误：src/app/page.tsx:15:3 - error TS2322: Type 'string' is not assignable to type 'number'.
  const tsMatch = line.match(/([\w./-]+\.\w+):(\d+):(\d+)\s*-\s*error\s+(TS\d{4}):\s*(.+)/)
  if (tsMatch) {
    return {
      file: tsMatch[1],
      line: parseInt(tsMatch[2], 10),
      column: parseInt(tsMatch[3], 10),
      code: tsMatch[4],
      message: tsMatch[5].trim(),
      source: 'tsc',
    }
  }

  // TypeScript 错误（简化格式）：error TS2322: ...
  const tsSimpleMatch = line.match(/error\s+(TS\d{4}):\s*(.+)/)
  if (tsSimpleMatch) {
    return {
      code: tsSimpleMatch[1],
      message: tsSimpleMatch[2].trim(),
      source: 'tsc',
    }
  }

  // Webpack 错误：./app/page.tsx Module build failed
  const webpackMatch = line.match(/\.\/*([\w./-]+\.\w+)\s+Module build failed/)
  if (webpackMatch) {
    return {
      file: webpackMatch[1],
      message: 'Module build failed',
      source: 'webpack',
    }
  }

  // Vite 错误：[vite] Internal server error in /src/App.vue
  const viteMatch = line.match(/\[vite\]\s+(.+?)\s+in\s+([\w./-]+)/)
  if (viteMatch) {
    return {
      file: viteMatch[2],
      message: viteMatch[1],
      source: 'vite',
    }
  }

  // Next.js 错误：Error: ...
  const nextMatch = line.match(/Error:\s+(.+)/)
  if (nextMatch) {
    return {
      message: nextMatch[1],
      source: 'next',
    }
  }

  // Prisma 错误：PANIC: ...
  const prismaMatch = line.match(/PANIC:\s+(.+)/)
  if (prismaMatch) {
    return {
      message: prismaMatch[1],
      source: 'prisma',
    }
  }

  // 通用文件路径匹配：src/xxx.tsx:15:3
  const fileMatch = line.match(/([\w./-]+\.\w+):(\d+):(\d+)/)
  if (fileMatch) {
    return {
      file: fileMatch[1],
      line: parseInt(fileMatch[2], 10),
      column: parseInt(fileMatch[3], 10),
      message: line.trim(),
      source: 'generic',
    }
  }

  return null
}
