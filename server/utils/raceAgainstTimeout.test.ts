import raceAgainstTimeout from './raceAgainstTimeout'

describe('raceAgainstTimeout', () => {
  const createTimeoutError = () => new Error('timed out')

  it('returns the result of a task that finishes in time', async () => {
    await expect(raceAgainstTimeout(1000, createTimeoutError, async () => 'result')).resolves.toBe('result')
  })

  it('rejects with the task error when the task fails in time', async () => {
    await expect(
      raceAgainstTimeout(1000, createTimeoutError, async () => {
        throw new Error('task failed')
      }),
    ).rejects.toThrow('task failed')
  })

  it('rejects with the timeout error when the task takes too long', async () => {
    await expect(raceAgainstTimeout(20, createTimeoutError, () => new Promise(() => {}))).rejects.toThrow('timed out')
  })

  it('marks the signal as aborted when the timeout fires', async () => {
    let taskSignal: AbortSignal | undefined

    await expect(
      raceAgainstTimeout(20, createTimeoutError, signal => {
        taskSignal = signal
        return new Promise(() => {})
      }),
    ).rejects.toThrow('timed out')

    expect(taskSignal?.aborted).toBe(true)
  })

  it('leaves the signal unaborted when the task finishes in time', async () => {
    let taskSignal: AbortSignal | undefined

    await raceAgainstTimeout(1000, createTimeoutError, async signal => {
      taskSignal = signal
    })

    expect(taskSignal?.aborted).toBe(false)
  })
})
