import fs from 'fs'
import findUp from 'find-up'
import path from 'path'

export function findTsConfigPath(dir: string): string | undefined {
  let tsConfigPath: string | undefined = undefined

  findUp.sync(
    (currentDir) => {
      const pathToTry = path.join(currentDir, 'tsconfig.json')

      if (fs.existsSync(pathToTry)) {
        tsConfigPath = pathToTry
        return findUp.stop
      }
    },
    { cwd: dir },
  )

  return tsConfigPath
}
