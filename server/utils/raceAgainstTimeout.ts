// Starts a task and waits for it, but gives up and throws an error if it takes longer than timeoutMs.
// Giving up doesn't stop the task. Promises can't be cancelled, so it keeps running in the background.
// To let it notice this, the task is passed an AbortSignal, which becomes aborted (signal.aborted is true)
// once we've given up.
const raceAgainstTimeout = async <T>(
  timeoutMs: number,
  createTimeoutError: () => Error,
  task: (signal: AbortSignal) => Promise<T>,
): Promise<T> => {
  const abortController = new AbortController()

  // 1. A promise that fails after timeoutMs. It never succeeds.
  let timer: NodeJS.Timeout | undefined
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      abortController.abort()
      reject(createTimeoutError())
    }, timeoutMs)
  })

  // 2. Start the task.
  const taskPromise = task(abortController.signal)

  // 3. Wait for whichever finishes first, then stop the timer.
  // If the timeout wins and the task fails later, nothing crashes: Promise.race stays subscribed to the task,
  // so Node treats the failure as handled.
  try {
    return await Promise.race([taskPromise, timeoutPromise])
  } finally {
    clearTimeout(timer)
  }
}

export default raceAgainstTimeout
