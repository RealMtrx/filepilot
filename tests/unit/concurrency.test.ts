import { describe, expect, it } from 'vitest'

import { TaskQueue, mapWithConcurrency } from '../../src/core/concurrency'

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

describe('mapWithConcurrency', () => {
  it('returns results in input order', async () => {
    const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => n * 10)
    expect(results).toEqual([10, 20, 30, 40, 50])
  })

  it('respects the concurrency limit', async () => {
    let active = 0
    let maxActive = 0
    await mapWithConcurrency(
      Array.from({ length: 10 }, (_, i) => i),
      3,
      async () => {
        active += 1
        maxActive = Math.max(maxActive, active)
        await delay(10)
        active -= 1
      },
    )
    expect(maxActive).toBeLessThanOrEqual(3)
    expect(maxActive).toBeGreaterThan(1)
  })

  it('handles empty input', async () => {
    const results = await mapWithConcurrency([], 4, async (n: number) => n)
    expect(results).toEqual([])
  })

  it('propagates worker errors', async () => {
    const boom = new Error('boom')
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw boom
        return n
      }),
    ).rejects.toBe(boom)
  })

  it('rejects invalid limits', async () => {
    await expect(mapWithConcurrency([1], 0, async (n) => n)).rejects.toThrow(RangeError)
    await expect(mapWithConcurrency([1], 1.5, async (n) => n)).rejects.toThrow(RangeError)
  })
})

describe('TaskQueue', () => {
  it('runs tasks with bounded concurrency', async () => {
    const queue = new TaskQueue(2)
    let active = 0
    let maxActive = 0
    const tasks = Array.from({ length: 8 }, () =>
      queue.push(async () => {
        active += 1
        maxActive = Math.max(maxActive, active)
        await delay(10)
        active -= 1
      }),
    )
    await Promise.all(tasks)
    expect(maxActive).toBeLessThanOrEqual(2)
  })

  it('resolves idle when the queue is quiesced', async () => {
    const queue = new TaskQueue(2)
    queue.push(async () => delay(5))
    queue.push(async () => delay(5))
    queue.push(async () => delay(5))
    await queue.idle()
    expect(queue.active).toBe(0)
    expect(queue.pending).toBe(0)
  })

  it('idle resolves immediately when nothing is queued', async () => {
    const queue = new TaskQueue(2)
    await queue.idle()
  })

  it('propagates task errors', async () => {
    const queue = new TaskQueue(1)
    const boom = new Error('task failed')
    await expect(queue.push(async () => Promise.reject(boom))).rejects.toBe(boom)
  })

  it('continues scheduling after a task error', async () => {
    const queue = new TaskQueue(1)
    const boom = new Error('task failed')
    const failed = queue.push(async () => Promise.reject(boom))
    await expect(failed).rejects.toBe(boom)
    const ok = await queue.push(async () => 42)
    expect(ok).toBe(42)
  })

  it('rejects invalid limits', () => {
    expect(() => new TaskQueue(0)).toThrow(RangeError)
    expect(() => new TaskQueue(1.5)).toThrow(RangeError)
  })

  it('supports push-then-idle traversal loops', async () => {
    const queue = new TaskQueue(4)
    const visited: number[] = []
    const seeds = [1, 2, 3]
    for (const seed of seeds) {
      queue.push(async () => {
        visited.push(seed)
      })
    }
    await queue.idle()
    expect(visited.sort()).toEqual([1, 2, 3])
  })
})
