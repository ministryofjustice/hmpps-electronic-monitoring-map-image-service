import { Router } from 'express'
import asyncMiddleware from '../middleware/asyncMiddleware'
import URLS from '../constants/urls'
import register from '../monitoring/metrics'

export default function metricsRoutes(): Router {
  const router = Router()

  router.get(
    URLS.METRICS.READ,
    asyncMiddleware(async (_req, res) => {
      res.set('Content-Type', register.contentType)
      res.end(await register.metrics())
    }),
  )

  return router
}
