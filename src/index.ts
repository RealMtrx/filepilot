export { TaskQueue, mapWithConcurrency } from './core/concurrency'
export {
  ConfigStore,
  DEFAULT_CONFIG,
  deepMerge,
  validateConfig,
  type FilePilotConfig,
  type ScanConfig,
  type DuplicatesConfig,
  type HistoryConfig,
  type OrganizeConfig,
  type ReportConfig,
} from './core/config/store'
export { configDir, dataDir, currentAppEnv, type AppEnv } from './core/config/dirs'
export {
  FilePilotError,
  PathValidationError,
  PermissionError,
  ConfigError,
  HistoryError,
  RuleError,
  OrganizeError,
  OrganizeConflictError,
  ScanError,
  isFilePilotError,
  toErrorMessage,
  formatError,
  type FilePilotErrorOptions,
} from './core/errors'
export {
  isDotfileName,
  isAbsolutePath,
  isDriveRoot,
  isPathInside,
  isProtectedSystemPath,
  normalizePath,
  pathEnvFor,
  systemProtectedPaths,
  validatePathCharacters,
  type PathEnv,
  type Platform,
} from './core/paths'
export { getVersion } from './core/version'
export {
  formatBytes,
  formatDuration,
  formatList,
  formatNumber,
  formatPercent,
} from './utils/format'
