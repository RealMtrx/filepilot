import { describe, expect, it } from 'vitest'

import {
  ConfigError,
  FilePilotError,
  formatError,
  isFilePilotError,
  OrganizeConflictError,
  PathValidationError,
  PermissionError,
  toErrorMessage,
} from '../../src/core/errors'

describe('FilePilotError hierarchy', () => {
  it('carries a default code and correct name', () => {
    const err = new FilePilotError('boom')
    expect(err.message).toBe('boom')
    expect(err.code).toBe('FILEPILOT_ERROR')
    expect(err.name).toBe('FilePilotError')
  })

  it('supports custom codes and paths', () => {
    const err = new PathValidationError('bad path', { path: '/tmp/x' })
    expect(err.code).toBe('PATH_VALIDATION_ERROR')
    expect(err.path).toBe('/tmp/x')
  })

  it('subclasses preserve their own codes', () => {
    expect(new PermissionError('nope').code).toBe('PERMISSION_ERROR')
    expect(new ConfigError('nope').code).toBe('CONFIG_ERROR')
    expect(new OrganizeConflictError('conflict').code).toBe('ORGANIZE_CONFLICT')
    expect(new OrganizeConflictError('conflict')).toBeInstanceOf(FilePilotError)
  })

  it('attaches cause when provided', () => {
    const cause = new Error('root cause')
    const err = new FilePilotError('wrapped', { cause })
    expect(err.cause).toBe(cause)
  })
})

describe('error helpers', () => {
  it('isFilePilotError distinguishes our errors', () => {
    expect(isFilePilotError(new FilePilotError('x'))).toBe(true)
    expect(isFilePilotError(new Error('x'))).toBe(false)
    expect(isFilePilotError('string')).toBe(false)
    expect(isFilePilotError(undefined)).toBe(false)
  })

  it('toErrorMessage handles FilePilotError, Error and raw values', () => {
    expect(toErrorMessage(new FilePilotError('known'))).toBe('known')
    expect(toErrorMessage(new Error('plain'))).toBe('plain')
    expect(toErrorMessage('raw')).toBe('raw')
    expect(toErrorMessage(42)).toBe('42')
  })

  it('formatError includes code and path', () => {
    expect(formatError(new PathValidationError('bad', { path: 'C:\\x' }))).toContain(
      '[PATH_VALIDATION_ERROR]',
    )
    expect(formatError(new PathValidationError('bad', { path: 'C:\\x' }))).toContain('C:\\x')
    expect(formatError(new Error('plain'))).toBe('plain')
  })
})
