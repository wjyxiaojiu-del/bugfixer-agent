import { type IPty, spawn } from '@lydell/node-pty'
import { parseDevOutput, type ParsedOutput } from './parser.js'

export interface PtySession {
  /** PTY 进程实例 */
  pty: IPty
  /** 所有输出行 */
  outputs: ParsedOutput[]
  /** 就绪 URL（首次检测到时设置） */
  readyUrl: string | null
  /** 停止 */
  stop: () => Promise<void>
}

export interface SpawnOptions {
  /** 工作目录 */
  cwd: string
  /** 要执行的命令（如 ['npx', 'next', 'dev']） */
  command: string[]
  /** 终端列数 */
  cols?: number
  /** 终试行数 */
  rows?: number
  /** 就绪超时（ms） */
  readyTimeout?: number
}

/**
 * 启动 PTY 包装的 dev server
 * 用 PTY 而非裸管道，因为 next dev 检测 isTTY，裸管道会降级输出
 */
export function spawnDevServer(options: SpawnOptions): PtySession {
  const {
    cwd,
    command,
    cols = 120,
    rows = 30,
    readyTimeout = 30_000,
  } = options

  let [cmd, ...args] = command
  const outputs: ParsedOutput[] = []
  let readyUrl: string | null = null
  // onDataCallback 通过闭包引用，运行时可被赋值
  const callbacks: { onReady?: (url: string) => void } = {}

  // Windows 兼容：npx/npm/node 需要 .cmd 后缀
  if (process.platform === 'win32') {
    const winCmds = ['npx', 'npm', 'node', 'pnpm', 'yarn']
    if (winCmds.includes(cmd) && !cmd.endsWith('.cmd')) {
      cmd = cmd + '.cmd'
    }
  }

  const pty = spawn(cmd, args, {
    name: 'xterm-256color',
    cols,
    rows,
    cwd,
    env: { ...process.env } as Record<string, string>,
  })

  pty.onData((rawData: string) => {
    const parsed = parseDevOutput(rawData)
    outputs.push(parsed)

    // 检测就绪 URL
    if (!readyUrl && parsed.readyUrl) {
      readyUrl = parsed.readyUrl
      callbacks.onReady?.(readyUrl)
    }
  })

  const stop = (): Promise<void> => {
    return new Promise((resolve) => {
      pty.onExit(() => resolve())
      pty.kill()
      // 兜底：500ms 后强制 resolve
      setTimeout(resolve, 500)
    })
  }

  return {
    pty,
    outputs,
    get readyUrl() { return readyUrl },
    stop,
  }
}

/**
 * 等待 dev server 就绪（返回 URL）
 */
export function waitForReady(session: PtySession, timeout: number = 30_000): Promise<string> {
  return new Promise((resolve, reject) => {
    // 已经就绪
    if (session.readyUrl) {
      resolve(session.readyUrl)
      return
    }

    const timer = setTimeout(() => {
      reject(new Error(`Dev server 未在 ${timeout}ms 内就绪`))
    }, timeout)

    // 轮询检查
    const check = setInterval(() => {
      if (session.readyUrl) {
        clearInterval(check)
        clearTimeout(timer)
        resolve(session.readyUrl)
      }
    }, 100)

    // 进程退出
    session.pty.onExit(() => {
      clearInterval(check)
      clearTimeout(timer)
      reject(new Error('Dev server 进程意外退出'))
    })
  })
}
