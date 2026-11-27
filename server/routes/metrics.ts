import { Router } from 'express'
import asyncMiddleware from '../middleware/asyncMiddleware'
import URLS from '../constants/urls'
import metricsRegistry from '../monitoring/metrics'

export default function metricsRoutes(): Router {
  const router = Router()

  router.get(
    URLS.METRICS.READ,
    asyncMiddleware(async (_req, res) => {
      res.set('Content-Type', metricsRegistry.contentType)
      res.end(await metricsRegistry.metrics())
    }),
  )

  return router
}
