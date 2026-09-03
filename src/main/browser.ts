import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** Finds a browser already installed on the employee's computer. */
export function resolveBrowser(customPath?: string) {
  const candidates = [
    customPath,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    ...(process.platform === 'win32' ? [
      join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe')
    ] : []),
    ...(process.platform === 'darwin' ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'] : [])
  ].filter((path): path is string => Boolean(path))

  const executable = candidates.find(existsSync)
  if (!executable) throw new Error('Chrome or Microsoft Edge could not be found. Install either browser, or set its executable path in Settings.')
  return executable
}
