import { execSync } from 'child_process'

// Check if a file matching a search pattern exists, and return the first match if so
export function getFileIfExists(cwd: string, search: string) {
  return execSync(`find . -maxdepth 1 -name ${search}`, { cwd }).toString().trim().split('\n')[0]
}
