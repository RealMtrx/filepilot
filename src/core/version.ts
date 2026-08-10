import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

declare const __FILEPILOT_VERSION__: string | undefined

const FALLBACK_VERSION = '0.0.0'

let cached: string | null = null

/** The version is baked in at build time by tsup. */
const BAKED_VERSION =
  typeof __FILEPILOT_VERSION__ === 'string' && __FILEPILOT_VERSION__ !== ''
    ? __FILEPILOT_VERSION__
    : null

/**
 * Returns the package version. Prefers the version baked in at build
 * time; when running from source (tests, development), falls back to
 * walking up from the module location to find package.json.
 */
export function getVersion(): string {
  if (cached !== null) return cached
  cached = BAKED_VERSION ?? FALLBACK_VERSION
  if (cached === FALLBACK_VERSION) {
    try {
      let dir = dirname(fileURLToPath(import.meta.url))
      for (let depth = 0; depth < 8; depth += 1) {
        try {
          const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
            version?: unknown
          }
          if (typeof pkg.version === 'string' && pkg.version !== '') {
            cached = pkg.version
            break
          }
        } catch {
          // Not this directory; keep walking up.
        }
        const parent = dirname(dir)
        if (parent === dir) break
        dir = parent
      }
    } catch {
      // Keep the fallback version.
    }
  }
  return cached
}
