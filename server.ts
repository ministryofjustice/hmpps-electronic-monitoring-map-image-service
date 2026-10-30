import shutdownTelemetry from './server/utils/azureAppInsights'

import { app, services } from './server/index'
import logger from './logger'

async function start(): Promise<void> {
  // Fail fast if Chromium can't start, so the pod restarts rather than serving renders that can't succeed
  await services.playwrightBrowserService.getBrowser()
  logger.info('[playwright] browser launched at startup')

  const port = app.get('port')

  const server = app.listen(port, () => {
    logger.info(`Server listening on port ${port}`)
  })

  // Handle graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down`)

    server.close(async () => {
      try {
        await services.playwrightBrowserService.close()
        logger.info('[playwright] browser closed')
      } catch (error) {
        logger.warn(error, '[playwright] error closing browser')
      }

      try {
        await shutdownTelemetry()
        logger.info('Telemetry flushed')
      } catch (error) {
        logger.warn(error, 'Failed to flush telemetry')
      }

      process.exit(0)
    })
  }

  // Listen for termination signals to allow for graceful shutdown
  process.on('SIGTERM', () => {
    shutdown('SIGTERM').catch(error => {
      logger.error(error, 'SIGTERM shutdown failed')
      process.exit(1)
    })
  })

  // Also listen for SIGINT (e.g. Ctrl+C) to allow for graceful shutdown in development
  process.on('SIGINT', () => {
    shutdown('SIGINT').catch(error => {
      logger.error(error, 'SIGINT shutdown failed')
      process.exit(1)
    })
  })
}

start().catch(error => {
  logger.error(error, '[playwright] failed to launch browser at startup')
  process.exit(1)
})
