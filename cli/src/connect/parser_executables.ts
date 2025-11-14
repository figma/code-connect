import { z } from 'zod'
import { exitWithError, logger } from '../common/logging'
import {
  CodeConnectCustomExecutableParserConfig,
  CodeConnectExecutableParserConfig,
  CodeConnectExecutableParser,
  CodeConnectParser,
} from './project'
import {
  ParserExecutableMessages,
  ParserRequestPayload,
  ParseResponsePayload,
  CreateResponsePayload,
} from './parser_executable_types'
import { spawn } from 'cross-spawn'
import { getSwiftParserDir } from '../parser_scripts/get_swift_parser_dir'
import fs from 'fs'
import path from 'path'
import {
  getGradleWrapperExecutablePath,
  getGradleWrapperPath,
} from '../parser_scripts/get_gradlew_path'
import { getComposeErrorSuggestion } from '../parser_scripts/compose_errors'

const temporaryInputFilePath = 'tmp/figma-code-connect-parser-io.json.tmp'
const temporaryOutputDirectoryPath = 'tmp/parser-output'

type ParserInfo = {
  command: (
    cwd: string,
    config: CodeConnectExecutableParserConfig | CodeConnectCustomExecutableParserConfig,
    mode: ParserRequestPayload['mode'],
  ) => Promise<string>
  temporaryInputFilePath?: string
  temporaryOutputDirectoryPath?: string
}

const FIRST_PARTY_PARSERS: Record<CodeConnectExecutableParser, ParserInfo> = {
  swift: {
    command: async (cwd, config) => {
      return `swift run --package-path ${await getSwiftParserDir(
        cwd,
        (config as any).xcodeprojPath,
        (config as any).swiftPackagePath,
        (config as any).sourcePackagesPath,
      )} figma-swift`
    },
  },
  compose: {
    command: async (cwd, config, mode) => {
      const gradlewPath = await getGradleWrapperPath(cwd, (config as any).gradleWrapperPath)
      const gradleExecutableInvocation = getGradleWrapperExecutablePath(gradlewPath)
      const verboseFlags = (config as any).verbose ? ' --stacktrace' : ''
      if (mode === 'CREATE') {
        return `${gradleExecutableInvocation} -p ${gradlewPath} createCodeConnect -PfilePath=${temporaryInputFilePath}${verboseFlags} -PoutputDir=${temporaryOutputDirectoryPath}`
      } else {
        return `${gradleExecutableInvocation} -p ${gradlewPath} parseCodeConnect -PfilePath=${temporaryInputFilePath}${verboseFlags} -PoutputDir=${temporaryOutputDirectoryPath}`
      }
    },
    temporaryInputFilePath: temporaryInputFilePath,
    temporaryOutputDirectoryPath: temporaryOutputDirectoryPath,
  },
  custom: {
    command: async (cwd, config) => {
      if (!('parserCommand' in config)) {
        exitWithError(
          'No `parserCommand` specified in config. A command is required when using the `custom` parser.',
        )
      }
      logger.info('Using custom parser command: ' + config.parserCommand)
      return config.parserCommand
    },
  },
  __unit_test__: {
    command: async () => 'node parser/unit_test_parser.js',
  },
}

function getParser(config: CodeConnectExecutableParserConfig): ParserInfo | never {
  const parser = FIRST_PARTY_PARSERS[config.parser]

  if (!parser) {
    exitWithError(
      `Invalid parser specified: "${config.parser}". Valid parsers are: ${Object.keys(
        FIRST_PARTY_PARSERS,
      ).join(', ')}.`,
    )
  }

  return parser
}

export async function callParser(
  config: CodeConnectExecutableParserConfig,
  payload: ParserRequestPayload,
  cwd: string,
) {
  return new Promise<object>(async (resolve, reject) => {
    try {
      const parser = getParser(config)
      const configWithVerbose = {
        ...config,
        verbose: (payload as any).verbose,
      }

      const command = await parser.command(cwd, configWithVerbose, payload.mode)

      // Create temporary input file if it exists
      if (parser.temporaryInputFilePath) {
        fs.mkdirSync(path.dirname(parser.temporaryInputFilePath), { recursive: true })
        fs.writeFileSync(parser.temporaryInputFilePath, JSON.stringify(payload))
      }

      // Create temporary output directory if it exists
      if (parser.temporaryOutputDirectoryPath) {
        fs.mkdirSync(parser.temporaryOutputDirectoryPath, { recursive: true })
      }

      logger.debug(`Running parser: ${command}`)
      const commandSplit = command.split(' ')

      const child = spawn(commandSplit[0], commandSplit.slice(1), {
        cwd,
      })

      let stdout = ''
      let stderr = ''

      child.stdout.on('data', (data) => {
        stdout += data.toString()
      })

      // This handles any stderr output from the parser.
      //
      // Parsers should not generally write to stderr, and should instead return
      // an array of messages at the end of execution, but there are cases where
      // you might want to log output immediately rather than at the end of the
      // run - e.g. if the parser can take a while to compile first time, you
      // might want to inform the user immediately that it is compiling.
      //
      // To log output, the parser should write a JSON object to stderr with the
      // same structure as the `messages` response object, e.g. `{ "level":
      // "INFO", "message": "Compiling parser..." }`.
      //
      // Non-JSON output will be logged as debug messages, as this is likely to
      // be e.g. compiler output which the user doesn't need to see ordinarily.
      child.stderr.on('data', (data) => {
        const message = data.toString()
        const trimmedMessage = message.trim()
        try {
          const parsed = JSON.parse(trimmedMessage)
          handleMessages([parsed])
        } catch (e) {
          stderr += message
          logger.debug(trimmedMessage)
        }
      })

      child.on('close', (code) => {
        if (code !== 0) {
          const errorSuggestion = determineErrorSuggestionFromStderr(stderr, config.parser)
          if (errorSuggestion) {
            reject(new Error(`Parser exited with code ${code}: ${errorSuggestion}`))
          } else {
            reject(new Error(`Parser exited with code ${code}`))
          }
        } else {
          // List the files in the temporary output directory if it exists and log them
          if (parser.temporaryOutputDirectoryPath) {
            try {
              const outputDir = parser.temporaryOutputDirectoryPath
              if (fs.existsSync(outputDir)) {
                const files = fs.readdirSync(outputDir)
                logger.debug(
                  `Files in temporary output directory (${outputDir}): ${files.length > 0 ? files.join(', ') : '[empty]'}`,
                )

                // Combine all JSON files in the output directory into a single JSON object.
                // For PARSE responses: Each file has a "docs" array and a "messages" array.
                // For CREATE responses: Each file has a "createdFiles" array and a "messages" array.
                // The combined output will have a single array of the appropriate type and a single "messages" array.

                // Filter for .json files only
                const jsonFiles = files.filter((f) => f.endsWith('.json'))
                let allMessages: z.infer<typeof ParserExecutableMessages> = []
                const uniqueDocsMap = new Map<
                  string,
                  z.infer<typeof ParseResponsePayload>['docs'][number]
                >()
                let allCreatedFiles: z.infer<typeof CreateResponsePayload>['createdFiles'] = []

                for (const file of jsonFiles) {
                  const filePath = path.join(outputDir, file)
                  try {
                    const content = fs.readFileSync(filePath, 'utf8')
                    const parsed = JSON.parse(content)
                    if (Array.isArray(parsed.docs)) {
                      // Deduplicate docs based on figmaNode + template
                      // The template contains the actual code example and is unique per component.
                      // This allows multiple different code components to map to the same Figma node,
                      // while preventing the same component from being duplicated in multi-module projects.
                      for (const doc of parsed.docs) {
                        const dedupeKey = JSON.stringify({
                          figmaNode: doc.figmaNode,
                          template: doc.template,
                        })
                        if (!uniqueDocsMap.has(dedupeKey)) {
                          uniqueDocsMap.set(dedupeKey, doc)
                        }
                      }
                    }
                    if (Array.isArray(parsed.createdFiles)) {
                      allCreatedFiles = allCreatedFiles.concat(parsed.createdFiles)
                    }
                    if (Array.isArray(parsed.messages)) {
                      allMessages = allMessages.concat(parsed.messages)
                    }
                  } catch (err) {
                    logger.warn(`Failed to parse output file ${file}: ${err}`)
                  }
                }

                const allDocs = Array.from(uniqueDocsMap.values())

                // Return the appropriate response based on the mode
                if (payload.mode === 'CREATE') {
                  resolve({
                    createdFiles: allCreatedFiles,
                    messages: allMessages,
                  })
                } else {
                  resolve({
                    docs: allDocs,
                    messages: allMessages,
                  })
                }
              } else {
                logger.debug(`Temporary output directory (${outputDir}) does not exist.`)
              }
            } catch (err) {
              logger.warn(`Failed to list files in temporary output directory: ${err}`)
            }
          } else {
            // Assume the output is in the stdout
            resolve(JSON.parse(stdout))
          }
        }

        if (parser.temporaryInputFilePath) {
          // Retain temp file and directory when verbose mode is enabled
          if (!(payload as any).verbose) {
            fs.unlinkSync(parser.temporaryInputFilePath)
            // Delete parent directory if empty after removing temp file
            const parentDir = path.dirname(parser.temporaryInputFilePath)
            if (fs.readdirSync(parentDir).length === 0) {
              fs.rmdirSync(parentDir)
            }
          }
        }
      })

      child.on('error', (e) => {
        reject(e)
      })
      if (!parser.temporaryInputFilePath) {
        child.stdin.write(JSON.stringify(payload))
        child.stdin.end()
      }
    } catch (e) {
      if ((payload as any).verbose) {
        console.trace(e)

        // Don't say to enable verbose if the user has already enabled it.
        exitWithError(`Error calling parser: ${e}.`)
      } else {
        exitWithError(
          `Error calling parser: ${e}. Try re-running the command with --verbose for more information.`,
        )
      }
    }
  })
}

export function handleMessages(messages: z.infer<typeof ParserExecutableMessages>) {
  let hasErrors = false

  messages.forEach((message) => {
    switch (message.level) {
      case 'DEBUG':
        logger.debug(message.message)
        break
      case 'INFO':
        logger.info(message.message)
        break
      case 'WARN':
        logger.warn(message.message)
        break
      case 'ERROR':
        logger.error(message.message)
        hasErrors = true
        break
    }
  })

  return { hasErrors }
}

// This function is used to determine if there is a suggestion for the error based on the output
// to stderr. Certain parsers return the same error code for different types of errors such as
// errors from invoking the gradle wrapper for Compose.
// In the future we should consider exposing a different API for having the parser return a suggestion directly.
function determineErrorSuggestionFromStderr(
  stderr: string,
  parser: CodeConnectParser,
): string | null {
  if (parser === 'compose') {
    return getComposeErrorSuggestion(stderr)
  }
  return null
}
