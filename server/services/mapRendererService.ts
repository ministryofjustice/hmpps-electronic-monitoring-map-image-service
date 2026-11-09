import type { BrowserContext, Page } from 'playwright'
import createError from 'http-errors'
import logger from '../../logger'
import config from '../config'
import URLS from '../constants/urls'
import presentMapRender, { type MapRenderModel } from '../presenters/mapRender'
import type { MapRenderRequest } from '../schemas/mapRender'
import { toMapPageQuery } from '../schemas/mapPageControls'
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
// we only log it. Throwing here would hide the image or error the caller should receive,
// and would stop the render counter being decremented.
const closeBrowserContextSafely = async (browserContext: BrowserContext | undefined): Promise<void> => {
  try {
    await browserContext?.close()
  } catch (error) {
    logger.warn(error, '[mapRendererService] failed to close browser context')
  }
}

// State shared by render() and renderWithoutDeadline() for a single render:
// - browserContext: set once the browser context exists, so render() knows what to close when the render ends.
// - abandoned: set when render() has finished or timed out, so renderWithoutDeadline() knows to stop.
type RenderState = {
  browserContext?: BrowserContext
  abandoned: boolean
  trackBrowserContext: (browserContext: BrowserContext) => void
  abandon: () => void
}

const createRenderState = (): RenderState => {
  const state: RenderState = {
    abandoned: false,
    trackBrowserContext: browserContext => {
      state.browserContext = browserContext
    },
    abandon: () => {
      state.abandoned = true
    },
  }
  return state
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
    const state = createRenderState()

    const renderPromise = this.renderWithoutDeadline(model, state)
    // If the deadline wins, this promise fails later when its browser context is closed. That must not go unhandled.
    renderPromise.catch(() => {})

    activeRenderCount += 1
    logStep('render:start', `, layers=${model.layers.length}, format=${model.output.format}`)

    let timer: NodeJS.Timeout | undefined
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        state.abandon()
        reject(createError(504, `Map render did not complete within ${this.timeoutMs}ms`))
      }, this.timeoutMs)
    })

    try {
      return await Promise.race([renderPromise, timeoutPromise])
    } finally {
      clearTimeout(timer)
      state.abandon()
      await closeBrowserContextSafely(state.browserContext)
      activeRenderCount -= 1
      logStep('render:end')
    }
  }

  // Does the rendering in a fresh browser context, with no time limit of its own: render() enforces the deadline.
  private async renderWithoutDeadline(model: MapRenderModel, state: RenderState): Promise<MapImage> {
    const { width, height, format, quality, pixelRatio } = model.output

    const browser = await this.browserService.getBrowser()
    const browserContext = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: pixelRatio,
    })
    // Record the context before doing anything else so render() can always close it
    state.trackBrowserContext(browserContext)

    // If creating the browser context took so long that the timeout has already fired, render() has returned a 504
    // and finished its cleanup. It could not close this context because it didn't exist yet, so we close it here
    // rather than leave it open and carry on rendering for a caller that has already been answered.
    if (state.abandoned) {
      await closeBrowserContextSafely(browserContext)
      throw new Error('Render abandoned before the browser context was ready')
    }

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
