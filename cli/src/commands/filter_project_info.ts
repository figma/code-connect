import fs from 'fs'
import path from 'path'
import { ProjectInfo } from '../connect/project'
import { exitWithError } from '../common/logging'

/**
 * If --file is specified, filter projectInfo.files to only include that file.
 * Exits with an error if the file doesn't exist or isn't in the project's file list.
 */
export function filterProjectInfoByFile(
  projectInfo: ProjectInfo,
  file: string | undefined,
): ProjectInfo {
  if (!file) {
    return projectInfo
  }

  const absFile = path.resolve(file)

  if (!fs.existsSync(absFile)) {
    exitWithError(`File not found: ${absFile}`)
  }

  const matched = projectInfo.files.filter((f) => f === absFile)

  if (matched.length === 0) {
    exitWithError(
      `File ${absFile} was not found in the project's file list. ` +
        `Make sure it matches the include/exclude globs in your config.`,
    )
  }

  return {
    ...projectInfo,
    files: matched,
  }
}
