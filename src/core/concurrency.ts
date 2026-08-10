interface Task {
  fn: () => Promise<void>
  resolve: () => void
  reject: (err: unknown) => void
}

/**
 * Bounded asynchronous task queue with dynamic enqueueing.
 *
 * The scanner uses this to walk directory trees with controlled
 * concurrency: list a directory, enqueue stat/hash tasks, and have
 * those tasks enqueue further traversal tasks as they complete.
 */
export class TaskQueue {
  private readonly limit: number
  private readonly queue: Task[] = []
  private running = 0
  private idleWaiters: Array<() => void> = []

  constructor(limit: number) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new RangeError('TaskQueue concurrency limit must be a positive integer')
    }
    this.limit = limit
  }

  push<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        fn: () => fn().then(resolve, reject),
        resolve: () => undefined,
        reject: () => undefined,
      })
      this.schedule()
    })
  }

  get pending(): number {
    return this.queue.length
  }

  get active(): number {
    return this.running
  }

  /**
   * Resolves when the queue is empty and no tasks are running.
   * Note: tasks may be pushed again after this resolves; callers that
   * need a fully quiesced state must re-await after new pushes.
   */
  idle(): Promise<void> {
    if (this.running === 0 && this.queue.length === 0) {
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => {
      this.idleWaiters.push(resolve)
    })
  }

  private schedule(): void {
    while (this.running < this.limit && this.queue.length > 0) {
      const task = this.queue.shift()
      if (!task) break
      this.running += 1
      Promise.resolve()
        .then(task.fn)
        .catch(task.reject)
        .finally(() => {
          this.running -= 1
          this.schedule()
          this.notifyIfIdle()
        })
    }
  }

  private notifyIfIdle(): void {
    if (this.running === 0 && this.queue.length === 0) {
      const waiters = this.idleWaiters
      this.idleWaiters = []
      for (const waiter of waiters) waiter()
    }
  }
}

/**
 * Maps `items` through `worker` with at most `limit` concurrent
 * invocations, preserving input order in the result.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError('mapWithConcurrency limit must be a positive integer')
  }
  const results: R[] = new Array<R>(items.length)
  let cursor = 0
  const runnerCount = Math.min(limit, items.length)
  const runners: Array<Promise<void>> = new Array(runnerCount)
  for (let i = 0; i < runnerCount; i += 1) {
    runners[i] = (async () => {
      for (;;) {
        const index = cursor
        cursor += 1
        if (index >= items.length) return
        results[index] = await worker(items[index]!, index)
      }
    })()
  }
  await Promise.all(runners)
  return results
}
