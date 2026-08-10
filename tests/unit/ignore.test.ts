import { describe, expect, it } from 'vitest'

import { IgnoreMatcher, parseIgnorePattern } from '../../src/core/scanner/ignore'

describe('parseIgnorePattern', () => {
  it('returns null for empty, comment and pure-negation patterns', () => {
    expect(parseIgnorePattern('')).toBeNull()
    expect(parseIgnorePattern('   ')).toBeNull()
    expect(parseIgnorePattern('# comment')).toBeNull()
    expect(parseIgnorePattern('!')).toBeNull()
  })

  it('detects negation and directory-only rules', () => {
    expect(parseIgnorePattern('!keep.txt')?.negated).toBe(true)
    expect(parseIgnorePattern('build/')?.dirOnly).toBe(true)
    expect(parseIgnorePattern('*.tmp')?.dirOnly).toBe(false)
  })

  it('detects anchored rules', () => {
    expect(parseIgnorePattern('/node_modules')?.anchored).toBe(true)
    expect(parseIgnorePattern('a/b')?.anchored).toBe(true)
    expect(parseIgnorePattern('*.tmp')?.anchored).toBe(false)
  })
})

describe('IgnoreMatcher', () => {
  it('ignores a named entry at any depth', () => {
    const matcher = new IgnoreMatcher(['node_modules'])
    expect(matcher.isIgnored('node_modules', true)).toBe(true)
    expect(matcher.isIgnored('a/node_modules', true)).toBe(true)
    expect(matcher.isIgnored('a/b/node_modules', true)).toBe(true)
    expect(matcher.isIgnored('a/node_modules_cache', true)).toBe(false)
  })

  it('matches wildcard extensions at any depth', () => {
    const matcher = new IgnoreMatcher(['*.tmp'])
    expect(matcher.isIgnored('file.tmp', false)).toBe(true)
    expect(matcher.isIgnored('a/b/c.tmp', false)).toBe(true)
    expect(matcher.isIgnored('a.tmp.bak', false)).toBe(false)
    expect(matcher.isIgnored('a/b.tmp/c', false)).toBe(false)
  })

  it('restricts directory-only patterns', () => {
    const matcher = new IgnoreMatcher(['build/'])
    expect(matcher.isIgnored('build', true)).toBe(true)
    expect(matcher.isIgnored('build', false)).toBe(false)
    expect(matcher.isIgnored('a/build', true)).toBe(true)
  })

  it('anchors patterns containing slashes to the root', () => {
    const matcher = new IgnoreMatcher(['/node_modules'])
    expect(matcher.isIgnored('node_modules', true)).toBe(true)
    expect(matcher.isIgnored('a/node_modules', true)).toBe(false)
  })

  it('matches double-star globs', () => {
    const matcher = new IgnoreMatcher(['**/cache'])
    expect(matcher.isIgnored('cache', true)).toBe(true)
    expect(matcher.isIgnored('a/cache', true)).toBe(true)
    expect(matcher.isIgnored('a/b/cache', true)).toBe(true)
  })

  it('supports single-char wildcards', () => {
    const matcher = new IgnoreMatcher(['file?.txt'])
    expect(matcher.isIgnored('file1.txt', false)).toBe(true)
    expect(matcher.isIgnored('file12.txt', false)).toBe(false)
    expect(matcher.isIgnored('a/fileX.txt', false)).toBe(true)
  })

  it('supports character classes', () => {
    const matcher = new IgnoreMatcher(['[abc].log'])
    expect(matcher.isIgnored('a.log', false)).toBe(true)
    expect(matcher.isIgnored('d.log', false)).toBe(false)
  })

  it('lets the last matching rule win with negations', () => {
    const matcher = new IgnoreMatcher(['*.txt', '!keep.txt'])
    expect(matcher.isIgnored('other.txt', false)).toBe(true)
    expect(matcher.isIgnored('keep.txt', false)).toBe(false)
    expect(matcher.isIgnored('a/b/keep.txt', false)).toBe(false)
  })

  it('ignores everything unless a rule matches', () => {
    const matcher = new IgnoreMatcher([])
    expect(matcher.isIgnored('anything', false)).toBe(false)
  })

  it('matches dot-directories', () => {
    const matcher = new IgnoreMatcher(['.git'])
    expect(matcher.isIgnored('.git', true)).toBe(true)
    expect(matcher.isIgnored('project/.git', true)).toBe(true)
  })

  it('handles nested directory patterns', () => {
    const matcher = new IgnoreMatcher(['dist/out/'])
    expect(matcher.isIgnored('dist/out', true)).toBe(true)
    expect(matcher.isIgnored('a/dist/out', true)).toBe(false)
    expect(matcher.isIgnored('dist/out/deeper', true)).toBe(true)
  })
})
