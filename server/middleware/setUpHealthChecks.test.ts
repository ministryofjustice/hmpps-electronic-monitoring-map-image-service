import express from 'express'
import request from 'supertest'
import setUpHealthChecks from './setUpHealthChecks'
import type PlaywrightBrowserService from '../services/playwrightBrowserService'
import type { ApplicationInfo } from '../applicationInfo'

jest.mock('../../logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}))

describe('health checks', () => {
  const applicationInfo = { applicationName: 'map-image-service' } as ApplicationInfo
  const isReady = jest.fn()
  const app = express().use(setUpHealthChecks(applicationInfo, { isReady } as unknown as PlaywrightBrowserService))

  it('readiness is 200 when the browser is ready', async () => {
    isReady.mockReturnValue(true)

    const response = await request(app).get('/health/readiness')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: 'UP', components: { playwright: { status: 'UP' } } })
  })

  it('readiness is 503 when the browser is not ready', async () => {
    isReady.mockReturnValue(false)

    const response = await request(app).get('/health/readiness')

    expect(response.status).toBe(503)
    expect(response.body.status).toBe('DOWN')
  })

  it('liveness does not depend on the browser', async () => {
    isReady.mockReturnValue(false)

    const response = await request(app).get('/health/liveness')

    expect(response.status).toBe(200)
  })
})
