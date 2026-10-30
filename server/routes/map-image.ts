import express, { type NextFunction, type Request, type Response, Router } from 'express'
import createError from 'http-errors'
import logger from '../../logger'
import asyncMiddleware from '../middleware/asyncMiddleware'
import URLS from '../constants/urls'
import MapImageController from '../controllers/map/image'
import type MapRendererService from '../services/mapRendererService'

// The schema allows up to 10,000 points, which is well under this once serialised
const MAX_BODY_SIZE = '2mb'

const ERROR_CODES: Record<number, string> = {
  400: 'VALIDATION_FAILED',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  504: 'RENDER_TIMEOUT',
}

// JSON error responses
// 4xx messages are returned to the client; 5xx responses use a generic message
const jsonErrorHandler = (error: createError.HttpError, req: Request, res: Response, _next: NextFunction): void => {
  const status = error.status || error.statusCode || 500

  if (status >= 500) {
    logger.error(`Error rendering map image for '${req.originalUrl}'`, error)
  } else {
    logger.info(`Rejected map image request: ${error.message}`)
  }

  let { message } = error
  if (status === 504) message = 'Map render timed out'
  else if (status >= 500) message = 'Failed to render map image'

  const code = ERROR_CODES[status] ?? 'RENDER_FAILED'

  res.status(status).json({ status, code, message, errors: error.errors })
}

export default function mapImageRoutes(mapRendererService: MapRendererService): Router {
  const router = Router()
  const controller = new MapImageController(mapRendererService)

  // Make sure request is using application/json
  const requireJson = (req: Request, _res: Response, next: NextFunction) =>
    next(req.is('application/json') ? undefined : createError(415, 'Content-Type must be application/json'))

  router.post(
    URLS.MAP_IMAGE.CREATE,
    requireJson,
    express.json({ limit: MAX_BODY_SIZE }),
    asyncMiddleware(controller.create),
  )

  router.use(URLS.MAP_IMAGE.CREATE, jsonErrorHandler)

  return router
}
