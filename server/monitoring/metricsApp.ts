import express from 'express'
import register from './metrics'

// Creates a separate Express app that only serves GET /metrics for Prometheus to scrape.
// It runs on its own port, which the ingress doesn't route to, so metrics stay internal to the cluster.
export default function createMetricsApp(): express.Application {
  const metricsApp = express()

  metricsApp.get('/metrics', async (_req, res, next) => {
    try {
      res.set('Content-Type', register.contentType)
      res.end(await register.metrics())
    } catch (error) {
      next(error)
    }
  })

  return metricsApp
}
