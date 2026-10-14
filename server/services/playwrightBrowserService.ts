import { chromium, type Browser } from 'playwright'
import logger from '../../logger'
import config from '../config'

export default class PlaywrightBrowserService {
  private browser?: Browser

  private launching?: Promise<Browser>

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

  isReady(): boolean {
    return Boolean(this.browser?.isConnected())
  }

  async close(): Promise<void> {
    if (!this.browser) return

    logger.info('[playwright] closing shared browser')
    await this.browser.close()
    this.browser = undefined
  }
}
