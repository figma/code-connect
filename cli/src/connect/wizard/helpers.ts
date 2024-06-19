import * as prettier from 'prettier'
import fs from 'fs'
import {
  CodeConnectConfig,
  DEFAULT_INCLUDE_GLOBS_BY_PARSER,
  getDefaultConfigPath,
} from '../project'
import { logger, success } from '../../common/logging'
import path from 'path'

export async function createCodeConnectConfig({
  dir,
  dirToSearchForFiles,
  config,
}: {
  dir: string
  dirToSearchForFiles: string
  config: CodeConnectConfig
}) {
  // use unix separators for config file globs
  const pathToComponentsDir = path.relative(dir, dirToSearchForFiles).replaceAll(path.sep, '/')

  const includesGlob = pathToComponentsDir
    ? `${pathToComponentsDir}/${DEFAULT_INCLUDE_GLOBS_BY_PARSER[config.parser]}`
    : DEFAULT_INCLUDE_GLOBS_BY_PARSER[config.parser]

  const filePath = getDefaultConfigPath(dir)
  const configJson = `
{
  "codeConnect": {
    "include": ["${includesGlob}"]
  }
}
  `
  let formatted = await prettier.format(configJson, {
    parser: 'json',
  })
  fs.writeFileSync(filePath, formatted)

  logger.info(success(`Created ${filePath}`))
}
