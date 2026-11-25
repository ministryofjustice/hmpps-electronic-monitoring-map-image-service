import metricsRegistry, { registerRenderGauges } from './metrics'

describe('registerRenderGauges', () => {
  it('reports the current number of renders in progress and queued on each scrape', async () => {
    const mapRendererService = { concurrency: { inProgress: 1, queued: 3 } }
    registerRenderGauges(mapRendererService)

    let metrics = await metricsRegistry.metrics()
    expect(metrics).toContain('map_renders_in_progress 1')
    expect(metrics).toContain('map_renders_queued 3')

    mapRendererService.concurrency = { inProgress: 2, queued: 0 }

    metrics = await metricsRegistry.metrics()
    expect(metrics).toContain('map_renders_in_progress 2')
    expect(metrics).toContain('map_renders_queued 0')
  })
})
