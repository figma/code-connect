import fs from 'fs'
import path from 'path'
import { ProjectInfo } from '../connect/project'
import { exitWithError } from '../common/logging'

/**
 * If --file is specified, filter projectInfo.files to only include those files.
 * Exits with an error if any file doesn't exist or isn't in the project's file list.
 */
export function filterProjectInfoByFile(
  projectInfo: ProjectInfo,
  files: string[] | string | undefined,
): ProjectInfo {
  if (!files || (Array.isArray(files) && files.length === 0)) {
    return projectInfo
  }

  const inputs = Array.isArray(files) ? files : [files]
  const absFiles = inputs.map((f) => path.resolve(f))

  for (const absFile of absFiles) {
    if (!fs.existsSync(absFile)) {
      exitWithError(`File not found: ${absFile}`)
    }
  }

  const projectFileSet = new Set(projectInfo.files)
  const missing = absFiles.filter((f) => !projectFileSet.has(f))

  if (missing.length > 0) {
    exitWithError(
      `The following file(s) were not found in the project's file list:\n` +
        missing.map((f) => `  - ${f}`).join('\n') +
        `\nMake sure they match the include/exclude globs in your config.`,
    )
  }

  const requestedSet = new Set(absFiles)
  return {
    ...projectInfo,
    files: projectInfo.files.filter((f) => requestedSet.has(f)),
  }
}
