import express from 'express'
import request from 'supertest'
import metricsRoutes from './metrics'

describe('GET /metrics', () => {
  const app = express().use(metricsRoutes())

  it('serves default process metrics in Prometheus format', async () => {
    const response = await request(app).get('/metrics')

    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toContain('text/plain')
    // process_cpu_user_seconds_total is a built-in default metric, so we know the registry is wired in and the body isn't empty
    expect(response.text).toContain('process_cpu_user_seconds_total')
  })
})
