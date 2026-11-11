import createError from 'http-errors'
import MapRendererService from './mapRendererService'
import ConcurrencyLimiter from '../utils/concurrencyLimiter'
import type PlaywrightBrowserService from './playwrightBrowserService'
import mapRenderSchema from '../schemas/mapRender'

const flushPromises = () =>
  new Promise<void>(resolve => {
    setImmediate(resolve)
  })

jest.mock('../../logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}))

describe('MapRendererService', () => {
  const request = mapRenderSchema.parse({
    output: { width: 1200, height: 650, pixelRatio: 1.2, format: 'jpeg', quality: 80 },
    layers: [{ type: 'locations', id: 'l', points: [{ latitude: 51.5, longitude: -0.1 }] }],
  })

  const createMocks = () => {
    const mapElement = { screenshot: jest.fn().mockResolvedValue(Buffer.from('image')) }
    const page = {
      evaluate: jest.fn().mockResolvedValue(undefined),
      goto: jest.fn().mockResolvedValue(undefined),
      setDefaultTimeout: jest.fn(),
      setDefaultNavigationTimeout: jest.fn(),
      $: jest.fn().mockResolvedValue(mapElement),
    }
    const context = { newPage: jest.fn().mockResolvedValue(page), close: jest.fn().mockResolvedValue(undefined) }
    const browser = { newContext: jest.fn().mockResolvedValue(context) }
    const browserService = { getBrowser: jest.fn().mockResolvedValue(browser) } as unknown as PlaywrightBrowserService

    return { mapElement, page, context, browser, service: new MapRendererService(browserService, 'http://map.test') }
  }

  // A service limited to one render with one queue place, whose first render stays loading until finishFirst() is called
  const createBusyService = () => {
    const { browser, page, context } = createMocks()
    const { promise: firstRenderLoading, resolve: finishFirst } = Promise.withResolvers<void>()
    page.goto.mockReturnValueOnce(firstRenderLoading)
    const browserService = { getBrowser: jest.fn().mockResolvedValue(browser) } as unknown as PlaywrightBrowserService
    const limiter = new ConcurrencyLimiter(1, 1, () => createError(503, 'busy'))
    const service = new MapRendererService(browserService, 'http://map.test', 15_000, limiter, 1000)

    return { context, page, service, finishFirst }
  }

  it('renders the model in the map page and returns the screenshot', async () => {
    const { mapElement, page, context, browser, service } = createMocks()

    const result = await service.render(request)

    expect(browser.newContext).toHaveBeenCalledWith({ viewport: { width: 1200, height: 650 }, deviceScaleFactor: 1.2 })
    expect(page.setDefaultTimeout).toHaveBeenCalledWith(15_000)
    expect(page.goto).toHaveBeenCalledWith('http://map.test/map?compass=true&scaleBar=bar', {
      waitUntil: 'domcontentloaded',
    })
    expect(page.evaluate).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ layers: [expect.objectContaining({ type: 'locations' })] }),
    )
    expect(mapElement.screenshot).toHaveBeenCalledWith({ type: 'jpeg', quality: 80 })
    expect(context.close).toHaveBeenCalled()
    expect(result).toEqual({ image: Buffer.from('image'), contentType: 'image/jpeg' })
  })

  it('captures png without a quality', async () => {
    const { mapElement, service } = createMocks()

    const result = await service.render({ ...request, output: { format: 'png' } })

    expect(mapElement.screenshot).toHaveBeenCalledWith({ type: 'png' })
    expect(result.contentType).toBe('image/png')
  })

  it('rejects with the page script error and still closes the context', async () => {
    const { page, mapElement, context, service } = createMocks()
    page.evaluate.mockRejectedValue(new Error('Could not fit the map to the supplied layers'))

    await expect(service.render(request)).rejects.toThrow('Could not fit the map to the supplied layers')
    expect(mapElement.screenshot).not.toHaveBeenCalled()
    expect(context.close).toHaveBeenCalledTimes(1)
  })

  it('times out when the page never finishes rendering and still closes the context', async () => {
    const { page, mapElement, context, browser } = createMocks()
    page.evaluate.mockReturnValue(new Promise(() => {}))
    const browserService = { getBrowser: jest.fn().mockResolvedValue(browser) } as unknown as PlaywrightBrowserService
    const service = new MapRendererService(browserService, 'http://map.test', 20)

    await expect(service.render(request)).rejects.toMatchObject({
      status: 504,
      message: 'Map render did not complete within 20ms',
    })
    expect(mapElement.screenshot).not.toHaveBeenCalled()
    expect(context.close).toHaveBeenCalledTimes(1)
  })

  it('returns the render result when closing the context fails', async () => {
    const { context, service } = createMocks()
    context.close.mockRejectedValue(new Error('Target closed'))

    await expect(service.render(request)).resolves.toMatchObject({ contentType: 'image/jpeg' })
  })

  it('rejects with the original error when the context cannot be created', async () => {
    const { browser, service } = createMocks()
    browser.newContext.mockRejectedValue(new Error('Browser has been closed'))

    await expect(service.render(request)).rejects.toThrow('Browser has been closed')
  })

  it('includes launching the context in the deadline and closes a context that arrives late', async () => {
    const { browser, context, page } = createMocks()
    let resolveContext: (value: unknown) => void = () => {}
    browser.newContext.mockReturnValue(
      new Promise(resolve => {
        resolveContext = resolve
      }),
    )
    const browserService = { getBrowser: jest.fn().mockResolvedValue(browser) } as unknown as PlaywrightBrowserService
    const service = new MapRendererService(browserService, 'http://map.test', 20)

    await expect(service.render(request)).rejects.toMatchObject({ status: 504 })

    resolveContext(context)
    await flushPromises()
    expect(context.close).toHaveBeenCalledTimes(1)
    expect(page.goto).not.toHaveBeenCalled()
  })

  it('times out when the page never finishes loading', async () => {
    const { browser, page, context } = createMocks()
    page.goto.mockReturnValue(new Promise(() => {}))
    const browserService = { getBrowser: jest.fn().mockResolvedValue(browser) } as unknown as PlaywrightBrowserService
    const service = new MapRendererService(browserService, 'http://map.test', 20)

    await expect(service.render(request)).rejects.toMatchObject({ status: 504 })
    expect(context.close).toHaveBeenCalledTimes(1)
  })

  describe('when renders are at the concurrency limit', () => {
    it('fails with a 503 straight away when the request sets maxQueueWaitMs to 0', async () => {
      const { service, finishFirst } = createBusyService()
      const first = service.render(request)
      await flushPromises()

      await expect(service.render({ ...request, maxQueueWaitMs: 0 })).rejects.toMatchObject({ status: 503 })

      finishFirst()
      await first
    })

    it('waits for a free slot by default, then renders', async () => {
      const { service, context, finishFirst } = createBusyService()
      const first = service.render(request)
      await flushPromises()
      const second = service.render(request)
      await flushPromises()

      finishFirst()

      await expect(Promise.all([first, second])).resolves.toHaveLength(2)
      expect(context.close).toHaveBeenCalledTimes(2)
    })
  })
})
