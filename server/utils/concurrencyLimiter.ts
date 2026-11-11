type QueuedRequest = { start: () => void }

// Limits how many tasks run at the same time to maxConcurrent. Further tasks wait in a first-in, first-out queue of up to maxQueueSize,
// each for at most the wait time given to runWhenSlotFree(). Tasks that can't get a slot are rejected with the busy error.
export default class ConcurrencyLimiter {
  private slotsInUse = 0

  private readonly queue: QueuedRequest[] = []

  constructor(
    private readonly maxConcurrent: number,
    private readonly maxQueueSize: number,
    private readonly createBusyError: () => Error,
  ) {}

  // Waits for a slot, runs the task, then frees the slot whether the task succeeds or fails.
  async runWhenSlotFree<T>(maxWaitMs: number, task: () => Promise<T>): Promise<T> {
    await this.waitForSlot(maxWaitMs)

    try {
      return await task()
    } finally {
      this.release()
    }
  }

  // Takes a free slot straight away, otherwise queues the request or rejects it.
  private waitForSlot(maxWaitMs: number): Promise<void> {
    if (this.hasFreeSlot()) {
      this.slotsInUse += 1
      return Promise.resolve()
    }

    if (maxWaitMs <= 0 || this.isQueueFull()) {
      return Promise.reject(this.createBusyError())
    }

    return this.joinQueue(maxWaitMs)
  }

  private hasFreeSlot(): boolean {
    return this.slotsInUse < this.maxConcurrent
  }

  private isQueueFull(): boolean {
    return this.queue.length >= this.maxQueueSize
  }

  // Resolves when a slot is passed to this request, or rejects with the busy error if it waits longer than maxWaitMs.
  private joinQueue(maxWaitMs: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const queuedRequest: QueuedRequest = {
        start: () => {
          clearTimeout(timer)
          resolve()
        },
      }
      const timer = setTimeout(() => {
        this.leaveQueue(queuedRequest)
        reject(this.createBusyError())
      }, maxWaitMs)

      this.queue.push(queuedRequest)
    })
  }

  // Used when a queued request gives up waiting.
  private leaveQueue(queuedRequest: QueuedRequest): void {
    const position = this.queue.indexOf(queuedRequest)
    if (position !== -1) this.queue.splice(position, 1)
  }

  // The slot passes straight to the next queued request, so the slotsInUse count only drops when the queue is empty.
  private release(): void {
    const nextInQueue = this.queue.shift()

    if (nextInQueue) {
      nextInQueue.start()
    } else {
      this.slotsInUse -= 1
    }
  }
}
