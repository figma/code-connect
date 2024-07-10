import * as prettier from 'prettier'
import fs from 'fs'
import {
  CodeConnectConfig,
  DEFAULT_INCLUDE_GLOBS_BY_PARSER,
  getDefaultConfigPath,
} from '../project'
import { logger, success } from '../../common/logging'
import path from 'path'
import prompts from 'prompts'


/**
 *
 * Gets the default include globs for config.parser with componentDirectory prepended
 * @param args
 * @param args.dir project root path
 * @param args.componentDirectory optional path to where includes should be limited to
 * @param args.config CodeConnectConfig
 * @returns array of include globs
 */
export function getIncludesGlob({
  dir,
  componentDirectory,
  config,
}: {
  dir: string
  componentDirectory: string | null
  config: CodeConnectConfig
}) {
  if (componentDirectory) {
    // use unix separators for config file globs
    const pathToComponentsDir = path.relative(dir, componentDirectory).replaceAll(path.sep, '/')
    return DEFAULT_INCLUDE_GLOBS_BY_PARSER[config.parser].map(
      (defaultIncludeGlob) => `${pathToComponentsDir}/${defaultIncludeGlob}`,
    )
  }
  return DEFAULT_INCLUDE_GLOBS_BY_PARSER[config.parser]
}

export async function createCodeConnectConfig({
  dir,
  componentDirectory,
  config,
}: {
  dir: string
  componentDirectory: string | null
  config: CodeConnectConfig
}) {
  const includesGlob = getIncludesGlob({ dir, componentDirectory, config })
  const configJson = `
{
  "codeConnect": {
    "include": ["${includesGlob}"]
  }
}
  `
  const formatted = await prettier.format(configJson, {
    parser: 'json',
  })
  const filePath = getDefaultConfigPath(dir)

  fs.writeFileSync(filePath, formatted)

  logger.info(success(`Created ${filePath}`))
}
