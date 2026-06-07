import { describe, it, expect } from 'vitest'
import { exportCapture } from '../../../src/evidence/l2/cdp.js'
import type { CdpCapture } from '../../../src/evidence/l2/cdp.js'

describe('L2 CDP 采集', () => {
  it('exportCapture 输出合法 JSON', () => {
    const capture: CdpCapture = {
      network: [{
        url: 'https://test.supabase.co/rest/v1/users',
        method: 'GET',
        status: 200,
        statusText: 'OK',
        body: '[{"id":1}]',
        headers: { 'content-type': 'application/json' },
        timestamp: Date.now(),
      }],
      console: [{
        type: 'log',
        text: 'Hello world',
        timestamp: Date.now(),
      }],
    }

    const json = exportCapture(capture)
    const parsed = JSON.parse(json)

    expect(parsed.network).toHaveLength(1)
    expect(parsed.console).toHaveLength(1)
    expect(parsed.capturedAt).toBeTruthy()
  })

  it('空采集结果不崩', () => {
    const capture: CdpCapture = { network: [], console: [] }
    const json = exportCapture(capture)
    const parsed = JSON.parse(json)

    expect(parsed.network).toHaveLength(0)
    expect(parsed.console).toHaveLength(0)
  })
})
