import { homedir } from 'node:os'

import { pathEnvFor } from '../paths'

export interface AppEnv {
  platform: NodeJS.Platform
  home: string
  appData?: string
  localAppData?: string
  xdgConfigHome?: string
  xdgDataHome?: string
}

export function currentAppEnv(): AppEnv {
  return {
    platform: process.platform,
    home: homedir(),
    appData: process.env.APPDATA,
    localAppData: process.env.LOCALAPPDATA,
    xdgConfigHome: process.env.XDG_CONFIG_HOME,
    xdgDataHome: process.env.XDG_DATA_HOME,
  }
}

function join(platform: NodeJS.Platform, ...parts: string[]): string {
  return pathEnvFor(platform).path.join(...parts)
}

export function configDir(env: AppEnv = currentAppEnv()): string {
  if (env.platform === 'win32') {
    return join(
      env.platform,
      env.appData ?? join(env.platform, env.home, 'AppData', 'Roaming'),
      'filepilot',
    )
  }
  if (env.platform === 'darwin') {
    return join(env.platform, env.home, 'Library', 'Application Support', 'filepilot')
  }
  return join(
    env.platform,
    env.xdgConfigHome ?? join(env.platform, env.home, '.config'),
    'filepilot',
  )
}

export function dataDir(env: AppEnv = currentAppEnv()): string {
  if (env.platform === 'win32') {
    return join(
      env.platform,
      env.localAppData ?? join(env.platform, env.home, 'AppData', 'Local'),
      'filepilot',
    )
  }
  if (env.platform === 'darwin') {
    return join(env.platform, env.home, 'Library', 'Application Support', 'filepilot')
  }
  return join(
    env.platform,
    env.xdgDataHome ?? join(env.platform, env.home, '.local', 'share'),
    'filepilot',
  )
}
