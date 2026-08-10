const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const

export function formatBytes(bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes) || bytes === 0) return '0 B'
  const abs = Math.abs(bytes)
  const unitIndex = Math.min(Math.floor(Math.log10(abs) / 3), BYTE_UNITS.length - 1)
  const value = abs / 10 ** (3 * unitIndex)
  const formatted = unitIndex === 0 ? String(Math.round(value)) : value.toFixed(decimals)
  return `${bytes < 0 ? '-' : ''}${formatted} ${BYTE_UNITS[unitIndex]}`
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return value.toLocaleString('en-US')
}

export function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}

export function formatPercent(ratio: number, decimals = 0): string {
  if (!Number.isFinite(ratio)) return '0%'
  return `${(ratio * 100).toFixed(decimals)}%`
}

export function formatList(values: readonly string[], max = 5): string {
  const shown = values.slice(0, max)
  const rest = values.length - shown.length
  const base = shown.join(', ')
  return rest > 0 ? `${base}, +${rest} more` : base
}
