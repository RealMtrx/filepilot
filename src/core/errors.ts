export interface FilePilotErrorOptions {
  code?: string
  cause?: unknown
  path?: string
}

export class FilePilotError extends Error {
  readonly code: string
  readonly path?: string

  constructor(message: string, options: FilePilotErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined)
    this.name = new.target.name
    this.code = options.code ?? 'FILEPILOT_ERROR'
    this.path = options.path
  }
}

export class PathValidationError extends FilePilotError {
  constructor(message: string, options: FilePilotErrorOptions = {}) {
    super(message, { ...options, code: options.code ?? 'PATH_VALIDATION_ERROR' })
  }
}

export class PermissionError extends FilePilotError {
  constructor(message: string, options: FilePilotErrorOptions = {}) {
    super(message, { ...options, code: options.code ?? 'PERMISSION_ERROR' })
  }
}

export class ConfigError extends FilePilotError {
  constructor(message: string, options: FilePilotErrorOptions = {}) {
    super(message, { ...options, code: options.code ?? 'CONFIG_ERROR' })
  }
}

export class HistoryError extends FilePilotError {
  constructor(message: string, options: FilePilotErrorOptions = {}) {
    super(message, { ...options, code: options.code ?? 'HISTORY_ERROR' })
  }
}

export class RuleError extends FilePilotError {
  constructor(message: string, options: FilePilotErrorOptions = {}) {
    super(message, { ...options, code: options.code ?? 'RULE_ERROR' })
  }
}

export class OrganizeError extends FilePilotError {
  constructor(message: string, options: FilePilotErrorOptions = {}) {
    super(message, { ...options, code: options.code ?? 'ORGANIZE_ERROR' })
  }
}

export class OrganizeConflictError extends OrganizeError {
  constructor(message: string, options: FilePilotErrorOptions = {}) {
    super(message, { ...options, code: options.code ?? 'ORGANIZE_CONFLICT' })
  }
}

export class ScanError extends FilePilotError {
  constructor(message: string, options: FilePilotErrorOptions = {}) {
    super(message, { ...options, code: options.code ?? 'SCAN_ERROR' })
  }
}

export class AbortedError extends FilePilotError {
  constructor(message = 'Operation aborted by user') {
    super(message, { code: 'ABORTED' })
  }
}

export class ScanAbortedError extends AbortedError {
  constructor(message = 'Scan aborted by user') {
    super(message)
  }
}

export function isFilePilotError(err: unknown): err is FilePilotError {
  return err instanceof FilePilotError
}

export function toErrorMessage(err: unknown): string {
  if (isFilePilotError(err)) return err.message
  if (err instanceof Error) return err.message
  return String(err)
}

export function formatError(err: unknown): string {
  if (isFilePilotError(err)) {
    const prefix = `[${err.code}]`
    return err.path ? `${prefix} ${err.message} (${err.path})` : `${prefix} ${err.message}`
  }
  return toErrorMessage(err)
}
