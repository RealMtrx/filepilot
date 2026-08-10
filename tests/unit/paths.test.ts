import { describe, expect, it } from 'vitest'

import { PathValidationError } from '../../src/core/errors'
import {
  isAbsolutePath,
  isDotfileName,
  isDriveRoot,
  isPathInside,
  isProtectedSystemPath,
  normalizePath,
  validatePathCharacters,
} from '../../src/core/paths'

const winEnv = {
  SystemRoot: 'C:\\Windows',
  ProgramFiles: 'C:\\Program Files',
  'ProgramFiles(x86)': 'C:\\Program Files (x86)',
  ProgramData: 'C:\\ProgramData',
}

describe('normalizePath', () => {
  it('normalizes Windows paths with both separators', () => {
    expect(normalizePath('C:\\Users\\foo', 'win32')).toBe('C:\\Users\\foo')
    expect(normalizePath('C:/Users/foo', 'win32')).toBe('C:\\Users\\foo')
  })

  it('normalizes POSIX paths', () => {
    expect(normalizePath('/home/user/projects', 'linux')).toBe('/home/user/projects')
    expect(normalizePath('/home/user/../projects', 'linux')).toBe('/home/projects')
  })

  it('resolves relative paths to an absolute path', () => {
    const resolved = normalizePath('Downloads', 'linux')
    expect(resolved).toMatch(/\/Downloads$/)
  })

  it('rejects empty or whitespace-only input', () => {
    expect(() => normalizePath('', 'linux')).toThrow(PathValidationError)
    expect(() => normalizePath('   ', 'win32')).toThrow(PathValidationError)
  })
})

describe('isAbsolutePath', () => {
  it('detects Windows absolute paths', () => {
    expect(isAbsolutePath('C:\\Users\\foo', 'win32')).toBe(true)
    expect(isAbsolutePath('C:/foo', 'win32')).toBe(true)
    expect(isAbsolutePath('Users\\foo', 'win32')).toBe(false)
    expect(isAbsolutePath('\\foo', 'win32')).toBe(true)
  })

  it('detects POSIX absolute paths', () => {
    expect(isAbsolutePath('/home/user', 'linux')).toBe(true)
    expect(isAbsolutePath('home/user', 'linux')).toBe(false)
  })
})

describe('isDriveRoot', () => {
  it('detects Windows drive roots', () => {
    expect(isDriveRoot('C:\\', 'win32')).toBe(true)
    expect(isDriveRoot('C:/', 'win32')).toBe(true)
    expect(isDriveRoot('c:', 'win32')).toBe(true)
    expect(isDriveRoot('C:\\Users', 'win32')).toBe(false)
    expect(isDriveRoot('\\', 'win32')).toBe(true)
  })

  it('detects POSIX root', () => {
    expect(isDriveRoot('/', 'linux')).toBe(true)
    expect(isDriveRoot('/home', 'linux')).toBe(false)
    expect(isDriveRoot('/', 'darwin')).toBe(true)
  })
})

describe('isPathInside', () => {
  it('is case-insensitive on Windows', () => {
    expect(isPathInside('C:\\Users', 'C:\\Users\\foo\\bar', 'win32')).toBe(true)
    expect(isPathInside('C:\\Users', 'c:\\users\\FOO', 'win32')).toBe(true)
    expect(isPathInside('C:\\Users', 'C:\\Users', 'win32')).toBe(true)
  })

  it('does not confuse prefix-similar directories on Windows', () => {
    expect(isPathInside('C:\\Users', 'C:\\Users2\\foo', 'win32')).toBe(false)
    expect(isPathInside('C:\\Users', 'D:\\Users\\foo', 'win32')).toBe(false)
    expect(isPathInside('C:\\Users', 'C:\\Windows', 'win32')).toBe(false)
  })

  it('is case-sensitive on POSIX', () => {
    expect(isPathInside('/home/user', '/home/user/projects', 'linux')).toBe(true)
    expect(isPathInside('/home/user', '/home/user', 'linux')).toBe(true)
    expect(isPathInside('/home/user', '/home/user2', 'linux')).toBe(false)
    expect(isPathInside('/home/user', '/home/User/x', 'linux')).toBe(false)
    expect(isPathInside('/home', '/home/user', 'linux')).toBe(true)
  })

  it('handles macOS paths', () => {
    expect(isPathInside('/Users/me', '/Users/me/Downloads', 'darwin')).toBe(true)
    expect(isPathInside('/Users/me', '/usr/local', 'darwin')).toBe(false)
  })
})

describe('validatePathCharacters', () => {
  it('rejects null and control characters everywhere', () => {
    expect(() => validatePathCharacters('a\u0000b', 'linux')).toThrow(PathValidationError)
    expect(() => validatePathCharacters('a\u0001b', 'win32')).toThrow(PathValidationError)
  })

  it('rejects Windows-invalid characters on Windows only', () => {
    expect(() => validatePathCharacters('C:\\foo|bar', 'win32')).toThrow(PathValidationError)
    expect(() => validatePathCharacters('C:\\foo*bar', 'win32')).toThrow(PathValidationError)
    expect(() => validatePathCharacters('C:\\foo<bar', 'win32')).toThrow(PathValidationError)
    expect(() => validatePathCharacters('C:\\foo"bar', 'win32')).toThrow(PathValidationError)
    expect(() => validatePathCharacters('C:\\foo?bar', 'win32')).toThrow(PathValidationError)
  })

  it('allows the same characters on POSIX', () => {
    expect(validatePathCharacters('/home/foo|bar', 'linux')).toBe('/home/foo|bar')
    expect(validatePathCharacters('/home/foo*bar', 'darwin')).toBe('/home/foo*bar')
  })

  it('accepts valid Windows paths with drive colons', () => {
    expect(validatePathCharacters('C:\\Users\\foo', 'win32')).toBe('C:\\Users\\foo')
  })
})

describe('isDotfileName', () => {
  it('detects dotfiles', () => {
    expect(isDotfileName('.git')).toBe(true)
    expect(isDotfileName('.hidden')).toBe(true)
    expect(isDotfileName('visible.txt')).toBe(false)
    expect(isDotfileName('.')).toBe(false)
    expect(isDotfileName('..')).toBe(false)
  })
})

describe('isProtectedSystemPath', () => {
  it('protects Windows system directories', () => {
    expect(isProtectedSystemPath('C:\\Windows', 'win32', winEnv)).toBe(true)
    expect(isProtectedSystemPath('C:\\Windows\\System32', 'win32', winEnv)).toBe(true)
    expect(isProtectedSystemPath('c:\\windows\\system32', 'win32', winEnv)).toBe(true)
    expect(isProtectedSystemPath('C:\\Program Files\\App', 'win32', winEnv)).toBe(true)
    expect(isProtectedSystemPath('C:\\Program Files (x86)\\App', 'win32', winEnv)).toBe(true)
    expect(isProtectedSystemPath('C:\\ProgramData\\App', 'win32', winEnv)).toBe(true)
  })

  it('does not protect user directories on Windows', () => {
    expect(isProtectedSystemPath('C:\\Users\\foo', 'win32', winEnv)).toBe(false)
    expect(isProtectedSystemPath('C:\\Users', 'win32', winEnv)).toBe(false)
    expect(isProtectedSystemPath('C:\\Temp', 'win32', winEnv)).toBe(false)
  })

  it('protects Linux system directories but not home', () => {
    expect(isProtectedSystemPath('/etc', 'linux')).toBe(true)
    expect(isProtectedSystemPath('/etc/ssh', 'linux')).toBe(true)
    expect(isProtectedSystemPath('/usr', 'linux')).toBe(true)
    expect(isProtectedSystemPath('/usr/local', 'linux')).toBe(true)
    expect(isProtectedSystemPath('/var/log', 'linux')).toBe(true)
    expect(isProtectedSystemPath('/home/user', 'linux')).toBe(false)
    expect(isProtectedSystemPath('/opt', 'linux')).toBe(false)
    expect(isProtectedSystemPath('/home', 'linux')).toBe(false)
  })

  it('protects macOS system directories but not home', () => {
    expect(isProtectedSystemPath('/System', 'darwin')).toBe(true)
    expect(isProtectedSystemPath('/System/Library', 'darwin')).toBe(true)
    expect(isProtectedSystemPath('/Applications', 'darwin')).toBe(true)
    expect(isProtectedSystemPath('/usr', 'darwin')).toBe(true)
    expect(isProtectedSystemPath('/Users/me', 'darwin')).toBe(false)
    expect(isProtectedSystemPath('/Users', 'darwin')).toBe(false)
  })

  it('is a no-op on empty input', () => {
    expect(() => isProtectedSystemPath('', 'win32', winEnv)).toThrow(PathValidationError)
  })
})
