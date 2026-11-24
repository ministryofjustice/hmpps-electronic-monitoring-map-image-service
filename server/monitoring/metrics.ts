import promClient from '@prometheus-io/client'

// A dedicated registry avoids duplicate-metric errors if this module is loaded twice
const register = new promClient.Registry()

promClient.collectDefaultMetrics({ register })

// Measures total render duration, including time spent waiting for a free slot.
export const renderDuration = new promClient.Histogram({
  name: 'map_render_duration_seconds',
  help: 'Time to render a map image, including time waiting for a free slot',
  labelNames: ['outcome'] as const,
  buckets: [0.5, 1, 1.5, 2, 3, 5, 10, 15, 20, 30, 45],
  registers: [register],
})

export default register
