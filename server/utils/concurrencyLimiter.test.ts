import ConcurrencyLimiter from './concurrencyLimiter'

const busy = () => new Error('busy')

// A task that keeps its slot until the test calls finish().
// Promise.withResolvers() returns a promise and the function that completes it, letting the test finish the task on demand.
const createSlowTask = () => {
  const { promise, resolve } = Promise.withResolvers<void>()
  return { run: () => promise, finish: resolve }
}

describe('ConcurrencyLimiter', () => {
  it('starts a queued request once a slot is freed', async () => {
    const limiter = new ConcurrencyLimiter(1, 1, busy)
    const slow = createSlowTask()
    const started: string[] = []

    const runningRequest = limiter.runWhenSlotFree(1000, async () => {
      started.push('running')
      await slow.run()
    })
    const queuedRequest = limiter.runWhenSlotFree(1000, async () => {
      started.push('queued')
    })
    await Promise.resolve()

    expect(started).toEqual(['running'])

    slow.finish()
    await Promise.all([runningRequest, queuedRequest])

    expect(started).toEqual(['running', 'queued'])
  })

  it('rejects straight away when the caller will not wait', async () => {
    const limiter = new ConcurrencyLimiter(1, 5, busy)
    const slow = createSlowTask()
    const runningRequest = limiter.runWhenSlotFree(1000, slow.run)

    // A wait of 0 means do not queue, so this is rejected even though the queue has room
    await expect(limiter.runWhenSlotFree(0, async () => {})).rejects.toThrow('busy')

    slow.finish()
    await runningRequest
  })

  it('rejects when the queue is full', async () => {
    const limiter = new ConcurrencyLimiter(1, 1, busy)
    const slow = createSlowTask()
    const runningRequest = limiter.runWhenSlotFree(1000, slow.run)
    const queuedRequest = limiter.runWhenSlotFree(1000, async () => {})

    await expect(limiter.runWhenSlotFree(1000, async () => {})).rejects.toThrow('busy')

    slow.finish()
    await Promise.all([runningRequest, queuedRequest])
  })

  it('rejects a queued request that has waited too long and does not run its task', async () => {
    const limiter = new ConcurrencyLimiter(1, 1, busy)
    const slow = createSlowTask()
    const timedOutTask = jest.fn()
    const runningRequest = limiter.runWhenSlotFree(1000, slow.run)

    // Joins the queue, but the slot is not freed within its 10ms wait, so it is rejected
    await expect(limiter.runWhenSlotFree(10, timedOutTask)).rejects.toThrow('busy')

    slow.finish()
    await runningRequest
    expect(timedOutTask).not.toHaveBeenCalled()
  })

  it('frees the slot when a task fails', async () => {
    const limiter = new ConcurrencyLimiter(1, 0, busy)

    // The only slot is used by a task that fails
    await expect(limiter.runWhenSlotFree(0, () => Promise.reject(new Error('failed')))).rejects.toThrow('failed')
    // A later request with no wait only succeeds if that slot was freed
    await expect(limiter.runWhenSlotFree(0, async () => 'ok')).resolves.toBe('ok')
  })
})
