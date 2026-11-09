import type { BrowserContext, Page } from 'playwright'
import createError from 'http-errors'
import logger from '../../logger'
import config from '../config'
import URLS from '../constants/urls'
import presentMapRender, { type MapRenderModel } from '../presenters/mapRender'
import type { MapRenderRequest } from '../schemas/mapRender'
import { toMapPageQuery } from '../schemas/mapPageControls'
import raceAgainstTimeout from '../utils/raceAgainstTimeout'
import type PlaywrightBrowserService from './playwrightBrowserService'

export type MapImage = {
  image: Buffer
  contentType: 'image/jpeg' | 'image/png'
}

// Number of renders currently in progress, used to correlate memory spikes with concurrent renders.
let activeRenderCount = 0

// Log a pipeline step, tagged with the number of renders in progress.
const logStep = (step: string, extraInfo = ''): void => {
  logger.info(`[mapRendererService] ${step} (activeRenders=${activeRenderCount}${extraInfo})`)
}

// Capture a screenshot of the map element, returning it as a buffer.
const screenshotMapElement = async (page: Page, format: 'jpeg' | 'png', quality?: number): Promise<Buffer> => {
  const mapElement = await page.$('em-map')
  if (!mapElement) {
    throw new Error('Map element <em-map> not found for screenshot')
  }

  return mapElement.screenshot(format === 'jpeg' ? { type: 'jpeg', quality } : { type: 'png' })
}

// Hand the presented data model to the client script and wait for the map to finish rendering.
const renderMapInPage = async (page: Page, model: MapRenderModel): Promise<void> => {
  await page.evaluate(async renderModel => {
    const { renderMap } = globalThis as unknown as { renderMap?: (renderModel: unknown) => Promise<void> }
    if (!renderMap) throw new Error('renderMap is not available on the map page')
    await renderMap(renderModel)
  }, model)
}

// Closes the browser context at the end of a render. If closing fails (for example because Chromium has crashed),
// we only log it. Throwing here would hide the image or error the caller should receive.
const closeBrowserContextSafely = async (browserContext: BrowserContext | undefined): Promise<void> => {
  try {
    await browserContext?.close()
  } catch (error) {
    logger.warn(error, '[mapRendererService] failed to close browser context')
  }
}

export default class MapRendererService {
  constructor(
    private readonly browserService: PlaywrightBrowserService,
    private readonly baseUrl: string = config.playwright.renderBaseUrl,
    private readonly timeoutMs: number = config.playwright.renderTimeoutMs,
  ) {}

  // Renders a map image, failing with a 504 if it takes longer than timeoutMs overall.
  async render(request: MapRenderRequest): Promise<MapImage> {
    const model = presentMapRender(request)

    activeRenderCount += 1
    logStep('render:start', `, layers=${model.layers.length}, format=${model.output.format}`)

    try {
      return await raceAgainstTimeout(
        this.timeoutMs,
        () => createError(504, `Map render did not complete within ${this.timeoutMs}ms`),
        signal => this.createImage(model, signal),
      )
    } finally {
      activeRenderCount -= 1
      logStep('render:end')
    }
  }

  // Creates the browser context and captures the image. This is the work that gets the time limit.
  private async createImage(model: MapRenderModel, signal: AbortSignal): Promise<MapImage> {
    const { width, height, pixelRatio } = model.output

    const browser = await this.browserService.getBrowser()
    const browserContext = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: pixelRatio })

    try {
      // If creating the context was so slow that the timeout has already fired, the abort listener below would never
      // run, so we stop here (the finally closes the context) rather than carry on rendering for a caller who has gone.
      if (signal.aborted) {
        throw new Error('Render abandoned before the browser context was ready')
      }
      signal.addEventListener('abort', () => closeBrowserContextSafely(browserContext), { once: true })

      return await this.captureImage(browserContext, model)
    } finally {
      await closeBrowserContextSafely(browserContext)
    }
  }

  // Loads the map page in the browser context, draws the map and screenshots it.
  private async captureImage(browserContext: BrowserContext, model: MapRenderModel): Promise<MapImage> {
    const { format, quality } = model.output

    const page = await browserContext.newPage()
    page.setDefaultTimeout(this.timeoutMs)
    page.setDefaultNavigationTimeout(this.timeoutMs)

    await page.goto(`${this.baseUrl}${URLS.MAP.VIEW}?${toMapPageQuery(model.controls)}`, {
      waitUntil: 'domcontentloaded',
    })
    await renderMapInPage(page, model)
    logStep('render:pageReady')

    const image = await screenshotMapElement(page, format, quality)
    logStep('render:captured', `, bytes=${image.length}`)

    return { image, contentType: format === 'jpeg' ? 'image/jpeg' : 'image/png' }
  }
}
