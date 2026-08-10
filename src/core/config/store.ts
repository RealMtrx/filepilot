import { promises as fs } from 'node:fs'
import { join } from 'node:path'

import { ConfigError } from '../errors'
import { configDir as defaultConfigDir } from './dirs'

export interface ScanConfig {
  concurrency: number
  followSymlinks: boolean
  extraIgnorePatterns: string[]
}

export interface DuplicatesConfig {
  algorithm: 'sha256'
  fastHashBytes: number
  concurrency: number
}

export interface HistoryConfig {
  maxTransactions: number
}

export interface OrganizeConfig {
  createCategoryDirs: boolean
  skipHidden: boolean
  verifyBeforeMove: boolean
}

export interface ReportConfig {
  defaultFormat: 'terminal' | 'json' | 'markdown'
}

export interface FilePilotConfig {
  scan: ScanConfig
  duplicates: DuplicatesConfig
  history: HistoryConfig
  organize: OrganizeConfig
  report: ReportConfig
}

export const DEFAULT_CONFIG: FilePilotConfig = {
  scan: {
    concurrency: 16,
    followSymlinks: false,
    extraIgnorePatterns: [],
  },
  duplicates: {
    algorithm: 'sha256',
    fastHashBytes: 16 * 1024,
    concurrency: 8,
  },
  history: {
    maxTransactions: 50,
  },
  organize: {
    createCategoryDirs: true,
    skipHidden: true,
    verifyBeforeMove: true,
  },
  report: {
    defaultFormat: 'terminal',
  },
}

type JsonValue = unknown

function isRecord(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function deepMerge<T>(base: T, patch: JsonValue): T {
  if (patch === null || patch === undefined) return base
  if (!isRecord(patch) || typeof base !== 'object' || base === null || Array.isArray(base)) {
    return patch as T
  }
  const out: Record<string, JsonValue> = { ...(base as Record<string, JsonValue>) }
  for (const [key, value] of Object.entries(patch)) {
    out[key] = deepMerge(out[key], value)
  }
  return out as T
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

function sanitizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
}

function sanitizeBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

export function validateConfig(raw: JsonValue): FilePilotConfig {
  const merged = deepMerge(DEFAULT_CONFIG, raw) as FilePilotConfig
  const result: FilePilotConfig = {
    scan: {
      concurrency: clampInt(merged.scan.concurrency, 1, 256, DEFAULT_CONFIG.scan.concurrency),
      followSymlinks: sanitizeBool(merged.scan.followSymlinks, DEFAULT_CONFIG.scan.followSymlinks),
      extraIgnorePatterns: sanitizeStringArray(merged.scan.extraIgnorePatterns),
    },
    duplicates: {
      algorithm:
        merged.duplicates.algorithm === 'sha256' ? 'sha256' : DEFAULT_CONFIG.duplicates.algorithm,
      fastHashBytes: clampInt(
        merged.duplicates.fastHashBytes,
        1024,
        1024 * 1024,
        DEFAULT_CONFIG.duplicates.fastHashBytes,
      ),
      concurrency: clampInt(
        merged.duplicates.concurrency,
        1,
        64,
        DEFAULT_CONFIG.duplicates.concurrency,
      ),
    },
    history: {
      maxTransactions: clampInt(
        merged.history.maxTransactions,
        1,
        10000,
        DEFAULT_CONFIG.history.maxTransactions,
      ),
    },
    organize: {
      createCategoryDirs: sanitizeBool(
        merged.organize.createCategoryDirs,
        DEFAULT_CONFIG.organize.createCategoryDirs,
      ),
      skipHidden: sanitizeBool(merged.organize.skipHidden, DEFAULT_CONFIG.organize.skipHidden),
      verifyBeforeMove: sanitizeBool(
        merged.organize.verifyBeforeMove,
        DEFAULT_CONFIG.organize.verifyBeforeMove,
      ),
    },
    report: {
      defaultFormat: ['terminal', 'json', 'markdown'].includes(merged.report.defaultFormat)
        ? merged.report.defaultFormat
        : DEFAULT_CONFIG.report.defaultFormat,
    },
  }
  return result
}

export interface ConfigStoreOptions {
  dir?: string
  configFileName?: string
}

export class ConfigStore {
  private readonly dir: string
  private readonly filePath: string

  constructor(options: ConfigStoreOptions = {}) {
    this.dir = options.dir ?? defaultConfigDir()
    this.filePath = join(this.dir, options.configFileName ?? 'config.json')
  }

  get path(): string {
    return this.filePath
  }

  async load(): Promise<FilePilotConfig> {
    let content: string
    try {
      content = await fs.readFile(this.filePath, 'utf8')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return structuredClone(DEFAULT_CONFIG)
      }
      throw new ConfigError(`Failed to read config file: ${this.filePath}`, { cause: err })
    }
    let raw: JsonValue
    try {
      raw = JSON.parse(content) as JsonValue
    } catch (err) {
      throw new ConfigError(`Config file is not valid JSON: ${this.filePath}`, { cause: err })
    }
    if (!isRecord(raw)) {
      throw new ConfigError(`Config file must contain a JSON object: ${this.filePath}`)
    }
    return validateConfig(raw)
  }

  async save(config: FilePilotConfig): Promise<void> {
    const validated = validateConfig(config)
    await fs.mkdir(this.dir, { recursive: true })
    await fs.writeFile(this.filePath, `${JSON.stringify(validated, null, 2)}\n`, 'utf8')
  }

  async update(patch: JsonValue): Promise<FilePilotConfig> {
    const current = await this.load()
    const next = validateConfig(deepMerge(current, patch))
    await this.save(next)
    return next
  }

  async reset(): Promise<FilePilotConfig> {
    const defaults = structuredClone(DEFAULT_CONFIG)
    await this.save(defaults)
    return defaults
  }
}
