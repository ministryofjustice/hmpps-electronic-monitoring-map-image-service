import { chromium, type Browser } from 'playwright'
import logger from '../../logger'
import config from '../config'

const RELAUNCH_RETRY_DELAY_MS = 5_000

export default class PlaywrightBrowserService {
  private browser?: Browser

  private launching?: Promise<Browser>

  private closing = false

  private relaunchTimer?: NodeJS.Timeout

  async getBrowser(): Promise<Browser> {
    if (this.browser?.isConnected()) return this.browser
    if (this.launching) return this.launching

    this.launching = (async () => {
      try {
        logger.info('[playwright] launching shared browser')
        const chromiumBrowser = await chromium.launch({
          executablePath: config.playwright.chromiumExecutablePath,
          headless: true,
        })

        chromiumBrowser.on('disconnected', () => {
          logger.error('[playwright] shared browser disconnected')

          if (this.browser === chromiumBrowser) {
            this.browser = undefined
            this.relaunch()
          }
        })

        this.browser = chromiumBrowser
        return chromiumBrowser
      } finally {
        this.launching = undefined
      }
    })()

    return this.launching
  }

  // Relaunch straight away so readiness recovers without waiting for the next render request.
  private relaunch(): void {
    if (this.closing) return

    this.getBrowser().catch(error => {
      logger.error(error, '[playwright] failed to relaunch browser, retrying')
      this.relaunchTimer = setTimeout(() => this.relaunch(), RELAUNCH_RETRY_DELAY_MS)
    })
  }

  isReady(): boolean {
    return Boolean(this.browser?.isConnected())
  }

  async close(): Promise<void> {
    this.closing = true
    clearTimeout(this.relaunchTimer)
    if (!this.browser) return

    logger.info('[playwright] closing shared browser')
    await this.browser.close()
    this.browser = undefined
  }
}
