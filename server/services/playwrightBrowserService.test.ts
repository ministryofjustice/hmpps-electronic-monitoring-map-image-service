import { chromium, type Browser } from 'playwright'
import PlaywrightBrowserService from './playwrightBrowserService'

// Silence logger during tests
const flushPromises = () =>
  new Promise<void>(resolve => {
    setImmediate(resolve)
  })

jest.mock('../../logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}))

jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn(),
  },
}))

describe('PlaywrightBrowserService', () => {
  const launchMock = chromium.launch as jest.Mock

  const createBrowser = (isConnected = true): Browser =>
    ({
      isConnected: jest.fn(() => isConnected),
      close: jest.fn(),
      on: jest.fn(),
    }) as unknown as Browser

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('launches chromium when no browser exists', async () => {
    const browser = createBrowser()
    launchMock.mockResolvedValue(browser)

    const service = new PlaywrightBrowserService()

    await expect(service.getBrowser()).resolves.toBe(browser)

    expect(launchMock).toHaveBeenCalledWith({
      executablePath: undefined,
      headless: true,
    })
  })

  it('reuses an existing connected browser', async () => {
    const browser = createBrowser()
    launchMock.mockResolvedValue(browser)

    const service = new PlaywrightBrowserService()

    await service.getBrowser()
    const secondBrowser = await service.getBrowser()

    expect(secondBrowser).toBe(browser)
    expect(launchMock).toHaveBeenCalledTimes(1)
  })

  it('two simultaneous calls only trigger one browser launch', async () => {
    const browser = createBrowser()
    launchMock.mockResolvedValue(browser)

    const service = new PlaywrightBrowserService()

    const [firstBrowser, secondBrowser] = await Promise.all([service.getBrowser(), service.getBrowser()])

    expect(firstBrowser).toBe(browser)
    expect(secondBrowser).toBe(browser)
    expect(launchMock).toHaveBeenCalledTimes(1)
  })

  it('reports ready when the browser is connected', async () => {
    const browser = createBrowser(true)
    launchMock.mockResolvedValue(browser)

    const service = new PlaywrightBrowserService()

    expect(service.isReady()).toBe(false)

    await service.getBrowser()

    expect(service.isReady()).toBe(true)
  })

  it('reports not ready when the browser is disconnected', async () => {
    const browser = createBrowser(false)
    launchMock.mockResolvedValue(browser)

    const service = new PlaywrightBrowserService()

    await service.getBrowser()

    expect(service.isReady()).toBe(false)
  })

  it('closes the browser and clears readiness', async () => {
    const browser = createBrowser()
    launchMock.mockResolvedValue(browser)

    const service = new PlaywrightBrowserService()

    await service.getBrowser()
    await service.close()

    expect(browser.close).toHaveBeenCalled()
    expect(service.isReady()).toBe(false)
  })

  it('rejects when chromium fails to launch', async () => {
    const launchError = new Error('Chromium failed to launch')
    launchMock.mockRejectedValue(launchError)

    const service = new PlaywrightBrowserService()

    await expect(service.getBrowser()).rejects.toThrow('Chromium failed to launch')
    expect(service.isReady()).toBe(false)
  })

  describe('when the browser disconnects', () => {
    const disconnect = (browser: Browser) => {
      const handler = (browser.on as jest.Mock).mock.calls.find(([event]) => event === 'disconnected')[1]
      handler()
    }

    it('relaunches the browser without waiting for a request', async () => {
      const first = createBrowser()
      const second = createBrowser()
      launchMock.mockResolvedValueOnce(first).mockResolvedValueOnce(second)
      const service = new PlaywrightBrowserService()
      await service.getBrowser()

      disconnect(first)
      await flushPromises()

      expect(launchMock).toHaveBeenCalledTimes(2)
      expect(service.isReady()).toBe(true)
    })

    it('retries the relaunch after a failure', async () => {
      jest.useFakeTimers()
      try {
        const first = createBrowser()
        const second = createBrowser()
        launchMock
          .mockResolvedValueOnce(first)
          .mockRejectedValueOnce(new Error('launch failed'))
          .mockResolvedValueOnce(second)
        const service = new PlaywrightBrowserService()
        await service.getBrowser()

        disconnect(first)
        await jest.advanceTimersByTimeAsync(5_000)

        expect(launchMock).toHaveBeenCalledTimes(3)
        expect(service.isReady()).toBe(true)
      } finally {
        jest.useRealTimers()
      }
    })

    it('does not relaunch after close', async () => {
      const browser = createBrowser()
      launchMock.mockResolvedValue(browser)
      const service = new PlaywrightBrowserService()
      await service.getBrowser()
      await service.close()

      disconnect(browser)
      await flushPromises()

      expect(launchMock).toHaveBeenCalledTimes(1)
    })
  })
})
