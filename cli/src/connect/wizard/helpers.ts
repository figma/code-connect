import * as prettier from 'prettier'
import fs from 'fs'
import {
  CodeConnectConfig,
  CodeConnectParser,
  DEFAULT_INCLUDE_GLOBS_BY_PARSER,
  DEFAULT_LABEL_PER_PARSER,
  ProjectInfo,
  ReactProjectInfo,
  getDefaultConfigPath,
  getEnvPath,
} from '../project'
import { exitWithError, logger, success } from '../../common/logging'
import path from 'path'
import prompts, { Choice } from 'prompts'
import { BaseCommand } from '../../commands/connect'
import { isFigmaConnectFile } from '../parser_common'
import { parseFileKey } from '../helpers'

export function maybePrefillWizardQuestionsForTesting() {
  if (process.env.JEST_WORKER_ID && process.env.WIZARD_ANSWERS_TO_PREFILL) {
    const unescapedJson = JSON.parse(process.env.WIZARD_ANSWERS_TO_PREFILL.replace(/\\"/g, '"'))
    prompts.inject(unescapedJson)
  }
}

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
    if (config.parser === 'custom') {
      return []
    }
    return DEFAULT_INCLUDE_GLOBS_BY_PARSER[config.parser].map(
      (defaultIncludeGlob) => `${pathToComponentsDir}/${defaultIncludeGlob}`,
    )
  }
  return DEFAULT_INCLUDE_GLOBS_BY_PARSER[config.parser]
}

export async function createEnvFile({ dir, accessToken }: { dir: string; accessToken?: string }) {
  // Create .env file
  const filePath = getDefaultConfigPath(dir)
  fs.writeFileSync(getEnvPath(dir), `FIGMA_ACCESS_TOKEN="${accessToken}"`)
  logger.info(success(`Created ${filePath}`))
}

export function addTokenToEnvFile({ dir, accessToken }: { dir: string; accessToken?: string }) {
  const filePath = getDefaultConfigPath(dir)
  fs.appendFileSync(getEnvPath(dir), `\nFIGMA_ACCESS_TOKEN="${accessToken}"`)
  logger.info(success(`Appended access token to ${filePath}`))
}

export async function createCodeConnectConfig({
  dir,
  componentDirectory,
  config,
  figmaUrl,
}: {
  dir: string
  componentDirectory: string | null
  config: CodeConnectConfig
  figmaUrl: string
}) {
  const label = DEFAULT_LABEL_PER_PARSER[config.parser as CodeConnectParser]
  const includesGlob = getIncludesGlob({ dir, componentDirectory, config })

  const configJson = label
    ? `{
  "codeConnect": {
    "include": ["${includesGlob}"],
    "label": "${label}",
    "interactiveSetupFigmaFileUrl": "${figmaUrl}",
}
}`
    : `{
  "codeConnect": {
    "include": ["${includesGlob}"],
    "interactiveSetupFigmaFileUrl": "${figmaUrl}",
  }
}`

  const formatted = await prettier.format(configJson, {
    parser: 'json',
  })
  const filePath = getDefaultConfigPath(dir)

  fs.writeFileSync(filePath, formatted)

  logger.info(success(`Created ${filePath}`))
}

const FILEPATH_EXPORT_DELIMITER = '~'

export function parseFilepathExport(filepathExport: string) {
  const delimiterLastIndex = filepathExport.lastIndexOf(FILEPATH_EXPORT_DELIMITER)

  if (delimiterLastIndex === -1) {
    return {
      filepath: filepathExport,
      exportName: null,
    }
  }
  return {
    filepath: filepathExport.substring(0, delimiterLastIndex),
    exportName: filepathExport.substring(delimiterLastIndex + 1),
  }
}

export function getFilepathExport(filepath: string, exp: string) {
  return `${filepath}${FILEPATH_EXPORT_DELIMITER}${exp}`
}

/**
 * Formats an array of filepathExports into a map of filepaths->exports
 *
 * @param filepathExports an array of components in the format `${filepath}~${componentName}
 * @returns a map of filepaths to an array of their exports. Array is empty if no exports found
 */
export function getComponentOptionsMap(filepathExports: string[]) {
  return filepathExports.reduce(
    (acc, filepathExport) => {
      const { filepath, exportName } = parseFilepathExport(filepathExport)
      acc[filepath] = acc[filepath] || []
      if (exportName) {
        acc[filepath].push({
          title: exportName,
          value: getFilepathExport(filepath, exportName),
        })
      }
      return acc
    },
    {} as Record<string, Choice[]>,
  )
}

/**
 * Parses a ProjectInfo for any TS exports (or filepaths if not a TS project)
 *
 * @param projectInfo
 * @returns an array of components in the format `${filepath}~${componentName}
 */
export function getFilepathExportsFromFiles(projectInfo: ProjectInfo, cmd: BaseCommand) {
  return projectInfo.files.reduce((options, filepath) => {
    if (projectInfo.config.parser === 'react') {
      const { tsProgram } = projectInfo as ReactProjectInfo
      if (!isFigmaConnectFile(tsProgram, filepath, 'tsx')) {
        const checker = tsProgram.getTypeChecker()
        const sourceFile = tsProgram.getSourceFile(filepath)
        if (!sourceFile) {
          if (cmd.verbose) {
            logger.warn(`Could not parse file for TypeScript: ${filepath}`)
          }
        } else {
          try {
            const sourceFileSymbol = checker.getSymbolAtLocation(sourceFile)!
            const exports = checker.getExportsOfModule(sourceFileSymbol)

            exports.forEach((exp) => {
              options.push(getFilepathExport(filepath, exp.getName()))
            })
          } catch (e) {
            if (cmd.verbose) {
              logger.warn(`Could not parse exports of file: ${filepath}`)
            }
            // ignore invalid files
          }
        }
      }
    } else {
      options.push(filepath)
    }
    return options
  }, [] as string[])
}

export function isValidFigmaUrl(url: string) {
  try {
    const { hostname } = new URL(url)
    if (
      !hostname.includes('figma.com')
    ) {
      return false
    }

    return !!parseFileKey(url)
  } catch (e) {
    return false
  }
}
