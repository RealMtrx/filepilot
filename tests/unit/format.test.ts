import { describe, expect, it } from 'vitest'

import {
  formatBytes,
  formatDuration,
  formatList,
  formatNumber,
  formatPercent,
} from '../../src/utils/format'

describe('formatBytes', () => {
  it('formats zero and small values', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(-512)).toBe('-512 B')
  })

  it('uses decimal units', () => {
    expect(formatBytes(1000)).toBe('1.0 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(1_048_576)).toBe('1.0 MB')
    expect(formatBytes(84_719_534_080)).toBe('84.7 GB')
    expect(formatBytes(148_200_000_000)).toBe('148.2 GB')
    expect(formatBytes(17_300_000_000)).toBe('17.3 GB')
  })

  it('keeps the requested precision at any scale', () => {
    expect(formatBytes(999_950_000_000_000)).toBe('1000.0 TB')
    expect(formatBytes(1_000_000_000_000_000)).toBe('1.0 PB')
    expect(formatBytes(512_000_000_000_000_000)).toBe('512.0 PB')
  })

  it('handles non-finite input safely', () => {
    expect(formatBytes(Number.NaN)).toBe('0 B')
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe('0 B')
  })
})

describe('formatNumber', () => {
  it('groups with commas', () => {
    expect(formatNumber(2481)).toBe('2,481')
    expect(formatNumber(1_000_000)).toBe('1,000,000')
    expect(formatNumber(0)).toBe('0')
    expect(formatNumber(-42)).toBe('-42')
  })
})

describe('formatDuration', () => {
  it('formats hours, minutes and seconds', () => {
    expect(formatDuration(0)).toBe('00:00:00')
    expect(formatDuration(102_000)).toBe('00:01:42')
    expect(formatDuration(61_000)).toBe('00:01:01')
    expect(formatDuration(3_600_000)).toBe('01:00:00')
    expect(formatDuration(3_661_000)).toBe('01:01:01')
  })

  it('never returns negative time', () => {
    expect(formatDuration(-5000)).toBe('00:00:00')
  })
})

describe('formatPercent', () => {
  it('formats ratios', () => {
    expect(formatPercent(0.81)).toBe('81%')
    expect(formatPercent(0.5, 1)).toBe('50.0%')
    expect(formatPercent(1)).toBe('100%')
    expect(formatPercent(0)).toBe('0%')
  })

  it('handles non-finite input', () => {
    expect(formatPercent(Number.NaN)).toBe('0%')
  })
})

describe('formatList', () => {
  it('joins values and truncates long lists', () => {
    expect(formatList(['a', 'b', 'c'])).toBe('a, b, c')
    expect(formatList(['a', 'b', 'c', 'd', 'e', 'f'])).toBe('a, b, c, d, e, +1 more')
    expect(formatList([], 2)).toBe('')
  })
})
