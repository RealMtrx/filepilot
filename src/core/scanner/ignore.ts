export interface IgnoreRule {
  readonly pattern: string
  readonly negated: boolean
  readonly dirOnly: boolean
  readonly anchored: boolean
  readonly regex: RegExp
}

const REGEX_SPECIAL = /[.+^${}()|[\]\\]/

function escapeRegexChar(ch: string): string {
  return REGEX_SPECIAL.test(ch) ? `\\${ch}` : ch
}

/**
 * Converts a simplified gitignore-style pattern into a matching rule.
 *
 * Supported syntax:
 * - `*`      matches any characters except `/`
 * - `**`     matches any characters including `/`
 * - `?`      matches a single character except `/`
 * - `[...]`  character classes
 * - trailing `/` restricts the rule to directories
 * - leading `!` negates the rule (last matching rule wins)
 * - patterns containing `/` are anchored to the scan root
 * - `#` starts a comment
 */
export function parseIgnorePattern(raw: string): IgnoreRule | null {
  let pattern = raw.trim()
  if (pattern.length === 0 || pattern.startsWith('#')) return null

  const negated = pattern.startsWith('!')
  if (negated) pattern = pattern.slice(1)
  if (pattern.length === 0) return null

  const dirOnly = pattern.endsWith('/')
  if (dirOnly) pattern = pattern.slice(0, -1)
  if (pattern.length === 0) return null

  const anchored = pattern.startsWith('/') || pattern.includes('/')
  if (anchored && pattern.startsWith('/')) pattern = pattern.slice(1)

  let source = ''
  let i = 0
  while (i < pattern.length) {
    const ch = pattern[i]!
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        i += 2
        if (pattern[i] === '/') {
          i += 1
          source += '(.*/)?'
        } else {
          source += '.*'
        }
      } else {
        source += '[^/]*'
        i += 1
      }
      continue
    }
    if (ch === '?') {
      source += '[^/]'
      i += 1
      continue
    }
    if (ch === '[') {
      const end = pattern.indexOf(']', i + 1)
      if (end === -1) {
        source += '\\['
        i += 1
      } else {
        const charClass = pattern.slice(i + 1, end).replace(/\\/g, '\\\\')
        source += `[${charClass}]`
        i = end + 1
      }
      continue
    }
    source += escapeRegexChar(ch)
    i += 1
  }

  return {
    pattern: raw,
    negated,
    dirOnly,
    anchored,
    regex: new RegExp(anchored ? `^${source}(/.*)?$` : `^${source}$`),
  }
}

/**
 * Gitignore-style matcher. `relativePath` must use `/` separators and be
 * relative to the scan root. The last matching rule wins, so `!` patterns
 * can re-include previously ignored paths.
 */
export class IgnoreMatcher {
  private readonly rules: IgnoreRule[]

  constructor(patterns: readonly string[]) {
    this.rules = patterns
      .map(parseIgnorePattern)
      .filter((rule): rule is IgnoreRule => rule !== null)
  }

  get ruleCount(): number {
    return this.rules.length
  }

  isIgnored(relativePath: string, isDir: boolean): boolean {
    let ignored = false
    for (const rule of this.rules) {
      if (rule.dirOnly && !isDir) continue
      let matched = false
      if (rule.anchored) {
        matched = rule.regex.test(relativePath)
      } else {
        const segments = relativePath.split('/')
        for (let start = 0; start < segments.length; start += 1) {
          if (rule.regex.test(segments.slice(start).join('/'))) {
            matched = true
            break
          }
        }
      }
      if (matched) ignored = !rule.negated
    }
    return ignored
  }
}
