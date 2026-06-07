import type { Page, CDPSession } from 'playwright'

export interface NetworkEntry {
  url: string
  method: string
  status: number
  statusText: string
  /** 响应体（可能为 null） */
  body: string | null
  /** 响应头 */
  headers: Record<string, string>
  /** 时间戳 */
  timestamp: number
}

export interface ConsoleEntry {
  type: string
  text: string
  timestamp: number
}

export interface CdpCapture {
  network: NetworkEntry[]
  console: ConsoleEntry[]
}

/**
 * 通过 CDP 抓取 console/network
 * 用 CDP 而非 Playwright 内置 API，因为需要 body 等详细信息
 */
export async function captureCdp(page: Page): Promise<CdpCapture> {
  const cdp: CDPSession = await page.context().newCDPSession(page)

  const network: NetworkEntry[] = []
  const consoleEntries: ConsoleEntry[] = []
  const pendingRequests = new Map<string, { method: string; url: string }>()

  // 启用 Network
  await cdp.send('Network.enable')

  // 请求发出
  cdp.on('Network.requestWillBeSent', (params) => {
    pendingRequests.set(params.requestId, {
      method: params.request.method,
      url: params.request.url,
    })
  })

  // 响应收到
  cdp.on('Network.responseReceived', async (params) => {
    const { requestId, response } = params
    const pending = pendingRequests.get(requestId)
    if (!pending) return

    let body: string | null = null
    try {
      const result = await cdp.send('Network.getResponseBody', { requestId })
      body = result.body
    } catch {
      // body 获取失败（可能被流式消耗）
    }

    network.push({
      url: response.url,
      method: pending.method,
      status: response.status,
      statusText: response.statusText,
      body,
      headers: response.headers || {},
      timestamp: Date.now(),
    })

    pendingRequests.delete(requestId)
  })

  // Console 输出
  cdp.on('Runtime.consoleAPICalled', (params) => {
    const text = params.args.map(a => a.value ?? a.description ?? '').join(' ')
    consoleEntries.push({
      type: params.type,
      text,
      timestamp: Date.now(),
    })
  })

  // 启用 Runtime（console）
  await cdp.send('Runtime.enable')

  // 返回一个可以停止采集并返回结果的函数
  return {
    get network() { return network },
    get console() { return consoleEntries },
  }
}

/**
 * 导出采集结果为 JSON
 */
export function exportCapture(capture: CdpCapture): string {
  return JSON.stringify({
    network: capture.network,
    console: capture.console,
    capturedAt: new Date().toISOString(),
  }, null, 2)
}
