import metricsRegistry, { registerRenderGauges } from './metrics'

describe('registerRenderGauges', () => {
  it('reports the current number of renders in progress on each scrape', async () => {
    const mapRendererService = { concurrency: { inProgress: 1 } }
    registerRenderGauges(mapRendererService)

    expect(await metricsRegistry.metrics()).toContain('map_renders_in_progress 1')

    mapRendererService.concurrency.inProgress = 2

    expect(await metricsRegistry.metrics()).toContain('map_renders_in_progress 2')
  })
})
