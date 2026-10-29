import { initialiseTelemetry, flushTelemetry, telemetry } from '@ministryofjustice/hmpps-azure-telemetry'

initialiseTelemetry({
  serviceName: 'hmpps-electronic-monitoring-map-image-service',
  serviceVersion: process.env.BUILD_NUMBER || 'unknown',
  connectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING,
  debug: process.env.DEBUG_TELEMETRY === 'true',
})
  .addFilter(telemetry.processors.filterSpanWherePath(['/health', '/ping', '/info', '/assets/*', '/favicon.ico']))
  .addModifier(telemetry.processors.enrichSpanNameWithHttpRoute())
  .startRecording()

export default async function shutdownTelemetry(): Promise<void> {
  await flushTelemetry()
}
