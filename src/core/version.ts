import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const FALLBACK_VERSION = '0.0.0'

let cached: string | null = null

/**
 * Reads the package version by walking up from the current module
 * location. This stays correct whether the code runs from `src/`,
 * from the bundled `dist/` output, or from a globally installed copy.
 */
export function getVersion(): string {
  if (cached !== null) return cached
  cached = FALLBACK_VERSION
  try {
    let dir = dirname(fileURLToPath(import.meta.url))
    for (let depth = 0; depth < 8; depth += 1) {
      try {
        const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
          name?: unknown
          version?: unknown
        }
        if (pkg.name === 'filepilot' && typeof pkg.version === 'string') {
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
  return cached
}
