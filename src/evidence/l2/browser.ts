import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { resolve } from 'node:path'
import { mkdir } from 'node:fs/promises'

export interface BrowserSession {
  browser: Browser
  context: BrowserContext
  page: Page
  /** 关闭（含截图保存） */
  close: () => Promise<void>
}

export interface LaunchOptions {
  /** 持久 profile 目录（全新 profile 没登录 = bug 复现不出） */
  profileDir?: string
  /** 是否无头模式 */
  headless?: boolean
  /** 截图保存目录 */
  screenshotDir?: string
}

/**
 * 启动受控 Chromium + 持久 profile
 * 持久 profile 保留登录态，否则 bug 复现不出
 */
export async function launchBrowser(options: LaunchOptions = {}): Promise<BrowserSession> {
  const {
    profileDir = resolve(process.cwd(), '.csi', 'browser-profile'),
    headless = false,
    screenshotDir = resolve(process.cwd(), '.csi', 'screenshots'),
  } = options

  // 确保目录存在
  await mkdir(profileDir, { recursive: true })
  await mkdir(screenshotDir, { recursive: true })

  const context = await chromium.launchPersistentContext(profileDir, {
    headless,
    args: ['--disable-blink-features=AutomationControlled'],
    viewport: { width: 1280, height: 720 },
  })

  const page = await context.newPage()

  const close = async () => {
    try {
      // 截图留档
      const ts = new Date().toISOString().replace(/[:.]/g, '-')
      await page.screenshot({ path: resolve(screenshotDir, `final-${ts}.png`) })
    } catch {
      // 截图失败不阻塞关闭
    }
    await context.close()
  }

  return { browser: context.browser()!, context, page, close }
}
