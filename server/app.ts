import express from 'express'
import { telemetryMiddleware } from '@ministryofjustice/hmpps-azure-telemetry'
import { emOrdnanceSurveyAuth } from '@ministryofjustice/hmpps-electronic-monitoring-components/map/ordnance-survey-auth'

import createError from 'http-errors'

import config from './config'
import nunjucksSetup from './utils/nunjucksSetup'
import errorHandler from './errorHandler'
import authorisationMiddleware from './middleware/authorisationMiddleware'

import setUpAuthentication from './middleware/setUpAuthentication'
import setUpCsrf from './middleware/setUpCsrf'
import setUpCurrentUser from './middleware/setUpCurrentUser'
import setUpMapImage from './middleware/setUpMapImage'
import setUpMapPage from './middleware/setUpMapPage'
import setUpHealthChecks from './middleware/setUpHealthChecks'
import setUpStaticResources from './middleware/setUpStaticResources'
import setUpWebRequestParsing from './middleware/setUpRequestParsing'
import setUpWebSecurity from './middleware/setUpWebSecurity'
import setUpWebSession from './middleware/setUpWebSession'

import routes from './routes'
import type { Services } from './services'

export default function createApp(services: Services): express.Application {
  const app = express()

  app.set('json spaces', 2)
  app.set('trust proxy', true)
  app.set('port', process.env.PORT || 3000)

  // Proxies OS Maps style, tiles and assets for the map page, keeping the OS key server-side.
  // Mounted before auth so Playwright can load it without tokens; access is limited by the ingress allowlist.
  app.use(emOrdnanceSurveyAuth({ apiKey: config.maps.apiKey, apiSecret: config.maps.apiSecret }))

  app.use(setUpHealthChecks(services.applicationInfo))
  // Unauthenticated API for other services, so it sits outside the session and login chain.
  // Access is limited by the ingress allowlist.
  app.use(setUpMapImage(services.mapRendererService))
  app.use(setUpWebSecurity())
  app.use(setUpWebSession())
  app.use(setUpWebRequestParsing())
  app.use(setUpStaticResources())
  nunjucksSetup(app)
  // Unauthenticated so Playwright can load it without tokens; access is limited by the ingress allowlist
  app.use(setUpMapPage())
  app.use(setUpAuthentication())
  app.use(authorisationMiddleware())
  app.use(setUpCsrf())
  app.use(setUpCurrentUser())
  // For prison users, register the `addUserMetadataToTelemetry` middleware after middleware that retrieves caseload data.
  app.use(telemetryMiddleware.addUserMetadataToTelemetry())

  app.use(routes(services))

  app.use((_req, _res, next) => next(createError(404, 'Not found')))
  app.use(errorHandler(process.env.NODE_ENV === 'production'))

  return app
}
