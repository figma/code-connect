import { exitWithError } from '../common/logging'
import { getFileIfExists } from './get_file_if_exists'
import path from 'path'

// Get the enclosing directory of the gradle wrapper
export async function getGradleWrapperPath(cwd: string, gradleWrapperPath?: string) {
  const gradlePath = gradleWrapperPath || getFileIfExists(cwd, 'gradlew')
  if (!gradlePath) {
    exitWithError(
      'Could not find the location of the gradlew in your project. You can specify the location of your gradlew file with the `gradleWrapperPath` config option.',
    )
  }

  return path.dirname(gradlePath)
}

// Get the path for the executable
export function getGradleWrapperExecutablePath(gradleWrapperDir: string) {
  return gradleWrapperDir === '.' ? './gradlew' : path.join(gradleWrapperDir, 'gradlew')
}
