import { promises as fs } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { configDir, dataDir, type AppEnv } from '../../src/core/config/dirs'
import {
  ConfigStore,
  DEFAULT_CONFIG,
  deepMerge,
  validateConfig,
  type FilePilotConfig,
} from '../../src/core/config/store'
import { ConfigError } from '../../src/core/errors'
import { makeFile, makeTempDir, removeTemp } from '../helpers/fs'

let tempDir: string | null = null

afterEach(async () => {
  if (tempDir) {
    await removeTemp(tempDir)
    tempDir = null
  }
})

async function makeStore(): Promise<{ store: ConfigStore; dir: string }> {
  tempDir = await makeTempDir()
  return { store: new ConfigStore({ dir: tempDir }), dir: tempDir }
}

describe('config dirs', () => {
  it('uses APPDATA on Windows', () => {
    const env: AppEnv = {
      platform: 'win32',
      home: 'C:\\Users\\me',
      appData: 'C:\\Users\\me\\AppData\\Roaming',
      localAppData: 'C:\\Users\\me\\AppData\\Local',
    }
    expect(configDir(env)).toBe('C:\\Users\\me\\AppData\\Roaming\\filepilot')
    expect(dataDir(env)).toBe('C:\\Users\\me\\AppData\\Local\\filepilot')
  })

  it('falls back under home when APPDATA is missing', () => {
    const env: AppEnv = { platform: 'win32', home: 'C:\\Users\\me' }
    expect(configDir(env)).toBe('C:\\Users\\me\\AppData\\Roaming\\filepilot')
  })

  it('uses XDG dirs on Linux', () => {
    const env: AppEnv = {
      platform: 'linux',
      home: '/home/me',
      xdgConfigHome: '/home/me/.config',
      xdgDataHome: '/home/me/.local/share',
    }
    expect(configDir(env)).toBe('/home/me/.config/filepilot')
    expect(dataDir(env)).toBe('/home/me/.local/share/filepilot')
  })

  it('uses XDG fallbacks on Linux', () => {
    const env: AppEnv = { platform: 'linux', home: '/home/me' }
    expect(configDir(env)).toBe('/home/me/.config/filepilot')
    expect(dataDir(env)).toBe('/home/me/.local/share/filepilot')
  })

  it('uses Application Support on macOS', () => {
    const env: AppEnv = { platform: 'darwin', home: '/Users/me' }
    expect(configDir(env)).toBe('/Users/me/Library/Application Support/filepilot')
    expect(dataDir(env)).toBe('/Users/me/Library/Application Support/filepilot')
  })
})

describe('deepMerge', () => {
  it('merges nested objects', () => {
    const result = deepMerge({ a: { b: 1, c: 2 }, d: 3 }, { a: { c: 5 }, e: 6 })
    expect(result).toEqual({ a: { b: 1, c: 5 }, d: 3, e: 6 })
  })

  it('replaces arrays entirely', () => {
    const result = deepMerge({ list: [1, 2] }, { list: [3] })
    expect(result.list).toEqual([3])
  })

  it('ignores null/undefined patches', () => {
    expect(deepMerge({ a: 1 }, null)).toEqual({ a: 1 })
    expect(deepMerge({ a: 1 }, undefined)).toEqual({ a: 1 })
  })
})

describe('validateConfig', () => {
  it('returns defaults for empty input', () => {
    expect(validateConfig({})).toEqual(DEFAULT_CONFIG)
  })

  it('clamps out-of-range numbers', () => {
    const config = validateConfig({
      scan: { concurrency: 0 },
      duplicates: { fastHashBytes: 1 },
    })
    expect(config.scan.concurrency).toBe(1)
    expect(config.duplicates.fastHashBytes).toBe(1024)
  })

  it('rejects unknown report formats', () => {
    const config = validateConfig({ report: { defaultFormat: 'xml' } })
    expect(config.report.defaultFormat).toBe('terminal')
  })

  it('sanitizes ignore patterns', () => {
    const config = validateConfig({ scan: { extraIgnorePatterns: ['node_modules', 42, ''] } })
    expect(config.scan.extraIgnorePatterns).toEqual(['node_modules'])
  })
})

describe('ConfigStore', () => {
  it('loads defaults when no config file exists', async () => {
    const { store } = await makeStore()
    const config = await store.load()
    expect(config).toEqual(DEFAULT_CONFIG)
  })

  it('persists and reloads config', async () => {
    const { store, dir } = await makeStore()
    await store.update({ scan: { concurrency: 8 }, report: { defaultFormat: 'json' } })
    const reloaded = new ConfigStore({ dir })
    const config = await reloaded.load()
    expect(config.scan.concurrency).toBe(8)
    expect(config.report.defaultFormat).toBe('json')
    expect(config.duplicates.fastHashBytes).toBe(DEFAULT_CONFIG.duplicates.fastHashBytes)
  })

  it('writes readable JSON with a trailing newline', async () => {
    const { store, dir } = await makeStore()
    await store.update({ report: { defaultFormat: 'markdown' } })
    const raw = await fs.readFile(join(dir, 'config.json'), 'utf8')
    expect(raw).toContain('"markdown"')
    expect(raw.endsWith('\n')).toBe(true)
  })

  it('throws ConfigError for invalid JSON', async () => {
    const { store, dir } = await makeStore()
    await makeFile(dir, 'config.json', '{not json')
    await expect(store.load()).rejects.toBeInstanceOf(ConfigError)
  })

  it('throws ConfigError for non-object config', async () => {
    const { store, dir } = await makeStore()
    await makeFile(dir, 'config.json', '[1,2,3]')
    await expect(store.load()).rejects.toBeInstanceOf(ConfigError)
  })

  it('reset restores defaults on disk', async () => {
    const { store, dir } = await makeStore()
    await store.update({ scan: { concurrency: 2 } })
    const defaults = await store.reset()
    expect(defaults).toEqual(DEFAULT_CONFIG)
    const reloaded = new ConfigStore({ dir })
    expect(await reloaded.load()).toEqual(DEFAULT_CONFIG)
  })

  it('merges partial updates against current config', async () => {
    const { store } = await makeStore()
    const first = await store.update({ scan: { concurrency: 4 } })
    const second = await store.update({ scan: { followSymlinks: true } })
    expect(second.scan.concurrency).toBe(4)
    expect(second.scan.followSymlinks).toBe(true)
    expect(first.duplicates.algorithm).toBe('sha256')
    expect((first as FilePilotConfig).history.maxTransactions).toBe(
      DEFAULT_CONFIG.history.maxTransactions,
    )
  })
})
