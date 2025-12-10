import { readdirSync } from 'fs'
import { execSync } from 'child_process'

// Check if a file matching a search pattern exists, and return the first match if so
export function getFileIfExists(cwd: string, search: string): string {
  // "find" command is not available on Windows. Use a fs instead.
  if (process.platform === 'win32') {
    const pattern = search.replace(/\./g, '\\.').replace(/\*/g, '.*')
    const regex = new RegExp(`^${pattern}$`)

    const files = readdirSync(cwd)
    const match = files.find((file) => regex.test(file))

    return match ? `./${match}` : ''
  } else {
    return execSync(`find . -maxdepth 1 -name ${search}`, { cwd }).toString().trim().split('\n')[0]
  }
}
