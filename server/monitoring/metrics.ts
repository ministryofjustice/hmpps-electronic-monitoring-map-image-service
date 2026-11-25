import promClient from '@prometheus-io/client'

// A dedicated registry avoids duplicate-metric errors if this module is loaded twice
const metricsRegistry = new promClient.Registry()

promClient.collectDefaultMetrics({ register: metricsRegistry })

// Measures total render duration, including time spent waiting for a free slot.
export const renderDuration = new promClient.Histogram({
  name: 'map_render_duration_seconds',
  help: 'Time to render a map image, including time waiting for a free slot',
  labelNames: ['outcome'] as const,
  buckets: [0.5, 1, 1.5, 2, 3, 5, 10, 15, 20, 30, 45],
  registers: [metricsRegistry],
})

type MonitoredRenderer = { concurrency: { inProgress: number; queued: number } }

// Reports how busy rendering is, read from the limiter each time Prometheus scrapes.
export const registerRenderGauges = (mapRendererService: MonitoredRenderer): void => {
  // eslint-disable-next-line no-new
  new promClient.Gauge({
    name: 'map_renders_in_progress',
    help: 'Number of renders in progress',
    registers: [metricsRegistry],
    collect() {
      this.set(mapRendererService.concurrency.inProgress)
    },
  })

  // eslint-disable-next-line no-new
  new promClient.Gauge({
    name: 'map_renders_queued',
    help: 'Number of renders waiting for a free slot',
    registers: [metricsRegistry],
    collect() {
      this.set(mapRendererService.concurrency.queued)
    },
  })
}

export default metricsRegistry
