import { Router } from 'express'
import asyncMiddleware from '../middleware/asyncMiddleware'
import MapPageController from '../controllers/map/page'
import URLS from '../constants/urls'

export default function mapPageRoutes(): Router {
  const router = Router()
  const controller = new MapPageController()

  router.get(URLS.MAP.VIEW, asyncMiddleware(controller.view))

  return router
}
