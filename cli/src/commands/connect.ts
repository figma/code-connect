import * as commander from 'commander'
import fs from 'fs'
import { handlePreview } from './preview_utils'
import { upload } from '../connect/upload'
import { validateDocs } from '../connect/validation'
import { createCodeConnectFromUrl } from '../connect/create'
import {
  CodeConnectConfig,
  CodeConnectExecutableParserConfig,
  CodeConnectParserlessConfig,
  CodeConnectReactConfig,
  ProjectInfo,
  getProjectInfo,
  getReactProjectInfo,
  getRemoteFileUrl,
  getTsProgram,
} from '../connect/project'
import { LogLevel, error, exitWithError, highlight, logger, success } from '../common/logging'
import { CodeConnectJSON } from '../connect/figma_connect'
import { convertStorybookFiles } from '../storybook/convert'
import { delete_docs } from '../connect/delete_docs'
import { runWizard } from '../connect/wizard/run_wizard'
import { callParser, handleMessages } from '../connect/parser_executables'
import { fromError } from 'zod-validation-error'
import { ParseRequestPayload, ParseResponsePayload } from '../connect/parser_executable_types'
import z from 'zod'
import path from 'path'
import { withUpdateCheck } from '../common/updates'
import { applyDocumentUrlSubstitutions, exitWithFeedbackMessage } from '../connect/helpers'
import { filterProjectInfoByFile } from './filter_project_info'
import { parseHtmlDoc } from '../html/parser'
import {
  InternalError,
  isFigmaConnectFile,
  parseCodeConnect,
  ParseFn,
  ParserError,
  ResolveImportsFn,
} from '../connect/parser_common'
import { findAndResolveImports, parseReactDoc } from '../react/parser'
import { getInferredLanguageForRaw } from '../connect/label_language_mapping'
import {
  groupCodeConnectObjectsByFigmaUrl,
  writeTemplateFile,
  writeVariantTemplateFile,
} from '../connect/migration_helpers'
import {
  getBatchMigrationGroups,
  writeBatchTemplateFiles,
} from '../connect/migration_batch_helpers'
import { CodePropertiesError, isRawTemplate, parseRawFile } from '../connect/raw_templates'
import { parseBatchFile } from '../connect/batch_templates'
import { convertRemoteFileUrlToRelativePath } from '../connect/wizard/run_wizard'
import { getGitRepoAbsolutePath } from '../connect/project'

export type BaseCommand = commander.Command & {
  token: string
  verbose: boolean
  outFile: string
  outDir: string
  config: string
  dryRun: boolean
  dir: string
  file: string[]
  jsonFile: string
  skipUpdateCheck: boolean
  exitOnUnreadableFiles: boolean
  apiUrl?: string
  includeProps?: boolean
  batch?: BatchMigrationMode
}

type BatchMigrationMode = 'auto' | 'all' | 'none'

function addBaseCommand(command: commander.Command, name: string, description: string) {
  return command
    .command(name)
    .description(description)
    .usage('[options]')
    .option('-r --dir <dir>', 'directory to parse')
    .option(
      '-f --file <file...>',
      'paths to one or more Code Connect files to process (space-separated)',
    )
    .option('-t --token <token>', 'figma access token')
    .option('-v --verbose', 'enable verbose logging for debugging')
    .option('-o --outFile <file>', 'specify a file to output generated Code Connect')
    .option('-o --outDir <dir>', 'specify a directory to output generated Code Connect')
    .option('-c --config <path>', 'path to a figma config file')
    .option('-a --api-url <url>', 'custom Figma API URL to use instead of https://api.figma.com/v1')
    .option('--skip-update-check', 'skips checking for an updated version of the Figma CLI')
    .option(
      '--exit-on-unreadable-files',
      'exit if any Code Connect files cannot be parsed. We recommend using this option for CI/CD.',
    )
    .option('--dry-run', 'tests publishing without actually publishing')
    .addHelpText(
      'before',
      'For feedback or bugs, please raise an issue: https://github.com/figma/code-connect/issues',
    )
}

export function addConnectCommandToProgram(program: commander.Command) {
  // Main command, invoked with `figma connect`
  const connectCommand = addBaseCommand(program, 'connect', 'Figma Code Connect').action(
    withUpdateCheck(runWizard),
  )

  // Make shared base flags work on either side of the subcommand name —
  // `figma connect -v publish` and `figma connect publish -v` both honour -v.
  connectCommand.hook('preAction', (_thisCommand, actionCommand) => {
    Object.assign(actionCommand.opts(), actionCommand.optsWithGlobals())
  })

  // Sub-commands, invoked with e.g. `figma connect publish`
  addBaseCommand(
    connectCommand,
    'publish',
    'Run Code Connect locally to find any files that have figma connections and publish them to Figma. ' +
      'By default this looks for a config file named "figma.config.json", and uses the `include` and `exclude` fields to determine which files to parse. ' +
      'If no config file is found, this parses the current directory. An optional `--dir` flag can be used to specify a directory to parse.',
  )
    .option('--skip-validation', 'skip validation of Code Connect docs')
    .option('-l --label <label>', 'label to apply to the published files')
    .option(
      '-b --batch-size <batch_size>',
      'optional batch size (in number of documents) to use when uploading. Use this if you hit "request too large" errors. See README for more information.',
    )
    .option(
      '--include-template-files',
      '(Deprecated) No longer needed - template files are included by default. Will be removed in a future version.',
    )
    .option(
      '--force',
      'overwrite existing UI-created Code Connect mappings if they conflict with the files being published',
    )
    .action(withUpdateCheck(handlePublish))

  addBaseCommand(
    connectCommand,
    'unpublish',
    'Run to find any files that have figma connections and unpublish them from Figma. ' +
      'By default this looks for a config file named "figma.config.json", and uses the `include` and `exclude` fields to determine which files to parse. ' +
      'If no config file is found, this parses the current directory. An optional `--dir` flag can be used to specify a directory to parse. ' +
      'Alternatively, use `--node` and `--label` to unpublish a specific component.',
  )
    .option(
      '--node <link_to_node>',
      'specify the node to unpublish. This will unpublish for the specified label.',
    )
    .option('-l --label <label>', 'label to unpublish for')
    .action(withUpdateCheck(handleUnpublish))

  addBaseCommand(
    connectCommand,
    'parse',
    'Run Code Connect locally to find any files that have figma connections, then converts them to JSON and outputs to stdout.',
  )
    .option('-l --label <label>', 'label to apply to the parsed files')
    .option(
      '--include-template-files',
      '(Deprecated) No longer needed - template files are included by default. Will be removed in a future version.',
    )
    .action(withUpdateCheck(handleParse))

  addBaseCommand(
    connectCommand,
    'create',
    'Generate a Code Connect file with boilerplate in the current directory for a Figma node URL',
  )
    .argument('<figma-node-url>', 'Figma node URL to create the Code Connect file from')
    .action(withUpdateCheck(handleCreate))

  addBaseCommand(
    connectCommand,
    'migrate',
    'Parse Code Connect files and migrate their templates into .figma.ts or .figma.js files that can be published directly without parsing.',
  )
    .option(
      '--include-props',
      'preserve __props metadata blocks in migrated templates (removed by default). Use if your templates use the React .getProps() or .render() modifiers, or read executeTemplate().metadata.__props from the migrated components',
    )
    .option(
      '--javascript',
      'output migrated templates as JavaScript (.figma.js) instead of TypeScript (.figma.ts)',
    )
    .addOption(
      new commander.Option(
        '--batch <mode>',
        'batch migration mode: auto attempts files with 10 or more Code Connect docs; all attempts every source file; none disables batch migration',
      )
        .choices(['auto', 'all', 'none'])
        .default('auto'),
    )
    .action(withUpdateCheck(handleMigrate))

  addBaseCommand(
    connectCommand,
    'preview',
    'Preview how Code Connect snippets will render in the Figma inspect panel',
  )
    .argument(
      '[files...]',
      'Code Connect files to preview (e.g., Button.figma.tsx). Leave empty to preview all files.',
    )
    .option('--output <format>', 'Output format: table (default) or json', 'table')
    .action(withUpdateCheck(handlePreview))
}

export function getAccessToken(cmd: BaseCommand) {
  return cmd.token ?? process.env.FIGMA_ACCESS_TOKEN
}

export function getAccessTokenOrExit(cmd: BaseCommand) {
  const token = getAccessToken(cmd)

  if (!token) {
    exitWithError(
      `Couldn't find a Figma access token. Please provide one with \`--token <access_token>\` or set the FIGMA_ACCESS_TOKEN environment variable`,
    )
  }

  return token
}

export function getDir(cmd: BaseCommand) {
  return cmd.dir ?? process.cwd()
}

export function setupHandler(cmd: BaseCommand) {
  if (cmd.verbose) {
    logger.setLogLevel(LogLevel.Debug)
  }
}

type ParserDoc = z.infer<typeof ParseResponsePayload>['docs'][0]

function transformDocFromParser(
  doc: ParserDoc,
  remoteUrl: string,
  config: CodeConnectConfig,
): ParserDoc {
  let source = doc.source
  if (source) {
    try {
      const url = new URL(source)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('Invalid URL scheme')
      }
    } catch (e) {
      source = getRemoteFileUrl(source, remoteUrl, config.defaultBranch)
    }
  }

  // TODO This logic is duplicated in parser.ts parseDoc due to some type issues
  let figmaNode = doc.figmaNode
  if (config.documentUrlSubstitutions) {
    figmaNode = applyDocumentUrlSubstitutions(figmaNode, config.documentUrlSubstitutions)
  }

  return {
    ...doc,
    source,
    figmaNode,
  }
}

export async function getCodeConnectObjects(
  cmd: BaseCommand & { label?: string },
  projectInfo: ProjectInfo,
  silent = false,
  isForMigration = false,
): Promise<CodeConnectJSON[]> {
  if (cmd.jsonFile) {
    try {
      const docsFromJson = JSON.parse(fs.readFileSync(cmd.jsonFile, 'utf8'))
      // Strip internal fields from JSON input
      return docsFromJson.map((doc: CodeConnectJSON) => {
        const { _codeConnectFilePath, ...cleanDoc } = doc
        return cleanDoc as CodeConnectJSON
      })
    } catch (e) {
      logger.error('Failed to parse JSON file:', e)
    }
  }

  let codeConnectObjects: CodeConnectJSON[] = []

  // Parserless template files (.figma.ts/.figma.js with a leading url/component/source
  // directive) are handled directly below by parseRawFile and never need a native parser.
  // Identify them up front so we can decide whether the native parser is needed at all.
  const rawTemplateFiles = projectInfo.files.filter((f: string) => {
    // Suffix may be used by HTML / custom parsers
    const isPotentialRawTemplate =
      f.endsWith('.figma.js') ||
      f.endsWith('.figma.template.js') ||
      f.endsWith('.figma.ts') ||
      f.endsWith('.figma.template.ts')
    if (!isPotentialRawTemplate) return false
    try {
      return isRawTemplate(fs.readFileSync(f, 'utf-8'))
    } catch {
      return false
    }
  })

  // A project is "template-only" when it has at least one matched file and every
  // matched file is a parserless template. Such projects never need the native
  // parser, so skip invoking it. This avoids spawning a native build (e.g.
  // `swift run figma-swift`) that does no useful work and can fail outright — for
  // example a Swift package on macOS 12 whose `Figma` dependency requires macOS 13.
  // The native parser only ever produces docs from native source files
  // (.swift/.kt/.tsx etc.), which are disjoint from raw templates, so skipping it
  // here drops no docs.
  //
  // An empty file set is deliberately NOT treated as template-only: we leave the
  // existing behavior intact (the configured parser still runs), so e.g. a Swift
  // config that matches no files surfaces the same parser output as before.
  const rawTemplateFileSet = new Set(rawTemplateFiles)
  const isTemplateOnlyProject =
    rawTemplateFiles.length > 0 && projectInfo.files.every((f) => rawTemplateFileSet.has(f))

  if (isTemplateOnlyProject) {
    // Verbose-only: this is a diagnostic detail and must not alter normal output.
    if (projectInfo.config.parser && cmd.verbose) {
      logger.info('All Code Connect files are templates; skipping the native parser.')
    }
  } else if (projectInfo.config.parser === 'react') {
    codeConnectObjects = await getReactCodeConnectObjects(
      projectInfo as ProjectInfo<CodeConnectReactConfig>,
      cmd,
      silent,
      isForMigration,
    )
  } else if (projectInfo.config.parser === 'html') {
    codeConnectObjects = await getCodeConnectObjectsFromParseFn({
      parseFn: parseHtmlDoc,
      fileExtension: 'ts',
      projectInfo,
      cmd,
      silent,
      isForMigration,
    })
  } else if (projectInfo.config.parser) {
    const payload: ParseRequestPayload = {
      mode: 'PARSE',
      paths: projectInfo.files,
      config: { ...projectInfo.config, skipTemplateHelpers: isForMigration },
      verbose: cmd.verbose,
    }

    try {
      const stdout = await callParser(
        // We use `as` because the React parser makes the types difficult
        // TODO remove once React is an executable parser
        projectInfo.config as CodeConnectExecutableParserConfig,
        payload,
        projectInfo.absPath,
      )

      const parsed = ParseResponsePayload.parse(stdout)

      const { hasErrors } = handleMessages(parsed.messages)

      if (hasErrors) {
        exitWithError('Errors encountered calling parser, exiting')
      }

      codeConnectObjects = parsed.docs.map((doc) => ({
        ...transformDocFromParser(doc, projectInfo.remoteUrl, projectInfo.config),
        metadata: {
          cliVersion: require('../../package.json').version,
        },
      }))
    } catch (e) {
      if (cmd.verbose) {
        console.trace(e)

        // Don't say to enable verbose if the user has already enabled it.
        exitWithError(`Error calling parser: ${e}.`)
      } else {
        exitWithError(
          `Error returned from parser: ${fromError(e)}. Try re-running the command with --verbose for more information.`,
        )
      }
    }
  }

  if (rawTemplateFiles.length > 0) {
    // Resolve the label before parsing so language inference works correctly
    const resolvedLabel = cmd.label || projectInfo.config.label

    const rawTemplateDocs: CodeConnectJSON[] = []
    for (const file of rawTemplateFiles) {
      try {
        const doc = parseRawFile(file, resolvedLabel, projectInfo.config, projectInfo.absPath)
        // Store the Code Connect file path for migration purposes
        doc._codeConnectFilePath = file

        if (!silent || cmd.verbose) {
          logger.info(success(file))
        }
        rawTemplateDocs.push(doc)
      } catch (e) {
        // A url-less file containing `codeProperties` is not Code Connect (e.g.
        // Make's code component property definitions). Log and skip it instead
        // of failing — never exit, not even with --exit-on-unreadable-files.
        if (e instanceof CodePropertiesError) {
          if (!silent || cmd.verbose) {
            logger.info(e.message)
          }
          continue
        }
        if (!silent || cmd.verbose) {
          logger.error(`❌ ${file}`)
          if (cmd.verbose) {
            console.trace(e)
          } else {
            logger.error(e instanceof Error ? e.message : String(e))
          }
        }
        if (cmd.exitOnUnreadableFiles) {
          logger.info('Exiting due to unreadable files')
          process.exit(1)
        }
      }
    }

    codeConnectObjects = codeConnectObjects.concat(rawTemplateDocs)
  }

  // Process batch files (.figma.batch.json)
  const batchFiles = projectInfo.files.filter((f: string) => f.endsWith('.figma.batch.json'))

  if (batchFiles.length > 0) {
    const resolvedLabel = cmd.label || projectInfo.config.label

    for (const file of batchFiles) {
      try {
        const docs = parseBatchFile(file, resolvedLabel, projectInfo.config, projectInfo.absPath)
        docs.forEach((doc) => {
          doc._codeConnectFilePath = file
        })
        codeConnectObjects = codeConnectObjects.concat(docs)
        if (!silent || cmd.verbose) {
          logger.info(success(`${file} (${docs.length} components)`))
        }
      } catch (e) {
        logger.error(`${file}: ${e}`)
        if (cmd.exitOnUnreadableFiles) {
          process.exit(1)
        }
      }
    }
  }

  if (cmd.label || projectInfo.config.label) {
    logger.info(`Using label "${cmd.label || projectInfo.config.label}"`)
    codeConnectObjects.forEach((doc) => {
      doc.label = cmd.label || projectInfo.config.label || doc.label
    })
  }

  if (projectInfo.config.language) {
    logger.info(`Using language "${projectInfo.config.language}"`)
    codeConnectObjects.forEach((doc) => {
      doc.language = projectInfo.config.language || doc.language
    })
  }

  return codeConnectObjects
}

type GetCodeConnectObjectsArgs = {
  parseFn: ParseFn
  resolveImportsFn?: ResolveImportsFn
  fileExtension: string | string[]
  projectInfo: ProjectInfo<CodeConnectConfig>
  cmd: BaseCommand
  silent?: boolean
  isForMigration?: boolean
}

// React/Storybook and HTML parsers are handled as special cases for now, they
// do not use the parser executable model but instead directly call a function
// in the code base. We may want to transition them to that model in future.
async function getCodeConnectObjectsFromParseFn({
  /** The function used to parse a source file into a Code Connect object */
  parseFn,
  /** Optional function used to resolve imports in a source file */
  resolveImportsFn,
  /** The file extension to filter for when checking if files should be parsed */
  fileExtension,
  /** Project info */
  projectInfo,
  /** The commander command object */
  cmd,
  /** Silences console output */
  silent = false,
  /** Whether this parse is for the migrate command */
  isForMigration = false,
}: GetCodeConnectObjectsArgs) {
  const codeConnectObjects: CodeConnectJSON[] = []

  const tsProgram = getTsProgram(projectInfo)
  const { files, remoteUrl, config, absPath } = projectInfo

  for (const file of files.filter((f: string) => isFigmaConnectFile(tsProgram, f, fileExtension))) {
    try {
      const docs = await parseCodeConnect({
        program: tsProgram,
        file,
        config,
        parseFn,
        resolveImportsFn,
        absPath,
        parseOptions: {
          repoUrl: remoteUrl,
          debug: cmd.verbose,
          silent,
          isForMigration,
        },
      })

      codeConnectObjects.push(...docs)
      if (!silent || cmd.verbose) {
        logger.info(success(file))
      }
    } catch (e) {
      if (!silent || cmd.verbose) {
        logger.error(`❌ ${file}`)
        if (e instanceof ParserError) {
          if (cmd.verbose) {
            console.trace(e)
          } else {
            logger.error(e.toString())
          }
          if (cmd.exitOnUnreadableFiles) {
            logger.info('Exiting due to unreadable files')
            process.exit(1)
          }
        } else {
          if (cmd.verbose) {
            console.trace(e)
          } else {
            logger.error(new InternalError(String(e)).toString())
          }
        }
      }
    }
  }

  return codeConnectObjects
}

async function getReactCodeConnectObjects(
  projectInfo: ProjectInfo<CodeConnectReactConfig>,
  cmd: BaseCommand,
  silent = false,
  isForMigration = false,
) {
  const codeConnectObjects = await getCodeConnectObjectsFromParseFn({
    parseFn: parseReactDoc,
    resolveImportsFn: findAndResolveImports,
    fileExtension: ['tsx', 'jsx'],
    projectInfo,
    cmd,
    silent,
    isForMigration,
  })

  const storybookCodeConnectObjects = await convertStorybookFiles({
    projectInfo: getReactProjectInfo(projectInfo),
    isForMigration,
  })

  const allCodeConnectObjects = codeConnectObjects.concat(storybookCodeConnectObjects)

  return allCodeConnectObjects
}

async function handlePublish(
  cmd: BaseCommand & {
    skipValidation: boolean
    label: string
    batchSize: string
    includeTemplateFiles?: boolean
    force?: boolean
  },
) {
  setupHandler(cmd)

  // Show deprecation warning if the flag is used
  if (cmd.includeTemplateFiles !== undefined) {
    logger.warn(
      '[Deprecated] The --include-template-files flag is no longer needed because template files are now included by default. ' +
        "Please don't use this flag - it will be removed in a future version.",
    )
  }

  let dir = getDir(cmd)
  const projectInfo = filterProjectInfoByFile(await getProjectInfo(dir, cmd.config), cmd.file)

  const codeConnectObjects = await getCodeConnectObjects(cmd, projectInfo)

  if (codeConnectObjects.length === 0) {
    logger.warn(
      `No Code Connect files found in ${dir} - Make sure you have configured \`include\` and \`exclude\` in your figma.config.json file correctly, or that you are running in a directory that contains Code Connect files.`,
    )
    process.exit(0)
  }

  if (cmd.dryRun) {
    logger.info(`Files that would be published:`)
    logger.info(codeConnectObjects.map((o) => `- ${o.component} (${o.figmaNode})`).join('\n'))
  }

  const accessToken = getAccessTokenOrExit(cmd)

  if (cmd.skipValidation) {
    logger.info('Validation skipped')
  } else {
    logger.info('Validating Code Connect files...')
    var start = new Date().getTime()
    const valid = await validateDocs(
      cmd,
      accessToken,
      codeConnectObjects,
      cmd.apiUrl || projectInfo.config.apiUrl,
    )
    if (!valid) {
      exitWithFeedbackMessage(1)
    } else {
      var end = new Date().getTime()
      var time = end - start
      logger.info(`All Code Connect files are valid (${time}ms)`)
    }
  }

  if (cmd.dryRun) {
    logger.info(`Dry run complete`)
    process.exit(0)
  }

  let batchSize
  if (cmd.batchSize) {
    batchSize = parseInt(cmd.batchSize, 10)
    if (isNaN(batchSize)) {
      logger.error('Error: failed to parse batch-size. batch-size passed must be a number')
      exitWithFeedbackMessage(1)
    }
  }

  upload({
    accessToken,
    docs: codeConnectObjects,
    batchSize: batchSize,
    verbose: cmd.verbose,
    apiUrl: cmd.apiUrl || projectInfo.config.apiUrl,
    force: cmd.force,
  })
}

async function handleUnpublish(cmd: BaseCommand & { node: string; label: string }) {
  setupHandler(cmd)

  let dir = getDir(cmd)

  if (cmd.dryRun) {
    logger.info(`Files that would be unpublished:`)
  }

  let nodesToDeleteRelevantInfo

  const projectInfo = filterProjectInfoByFile(await getProjectInfo(dir, cmd.config), cmd.file)

  if (cmd.node) {
    if (!cmd.label) {
      exitWithError('Label is required when specifying a node')
    }
    nodesToDeleteRelevantInfo = [{ figmaNode: cmd.node, label: cmd.label }]
  } else {
    const codeConnectObjects = await getCodeConnectObjects(cmd, projectInfo)

    nodesToDeleteRelevantInfo = codeConnectObjects.map((doc) => ({
      figmaNode: doc.figmaNode,
      label: cmd.label || projectInfo.config.label || doc.label,
    }))

    if (cmd.label || projectInfo.config.label) {
      logger.info(`Using label ${cmd.label || projectInfo.config.label}`)
    }

    if (cmd.dryRun) {
      logger.info(`Dry run complete`)
      process.exit(0)
    }
  }

  const accessToken = getAccessTokenOrExit(cmd)

  delete_docs({
    accessToken,
    docs: nodesToDeleteRelevantInfo,
    apiUrl: cmd.apiUrl || projectInfo.config.apiUrl,
  })
}

async function handleParse(cmd: BaseCommand & { label: string; includeTemplateFiles?: boolean }) {
  setupHandler(cmd)

  // Show deprecation warning if the flag is used
  if (cmd.includeTemplateFiles !== undefined) {
    logger.warn(
      '[Deprecated] The --include-template-files flag is no longer needed because template files are now included by default. ' +
        "Please don't use this flag - it will be removed in a future version.",
    )
  }

  const dir = cmd.dir ?? process.cwd()
  const projectInfo = filterProjectInfoByFile(await getProjectInfo(dir, cmd.config), cmd.file)

  const codeConnectObjects = await getCodeConnectObjects(cmd, projectInfo)

  if (cmd.dryRun) {
    logger.info(`Dry run complete`)
    process.exit(0)
  }

  if (cmd.outFile) {
    fs.writeFileSync(cmd.outFile, JSON.stringify(codeConnectObjects, null, 2))
    logger.info(`Wrote Code Connect JSON to ${highlight(cmd.outFile)}`)
  } else {
    // don't format the output, so it can be piped to other commands
    console.log(JSON.stringify(codeConnectObjects, undefined, 2))
  }
}

async function handleCreate(nodeUrl: string, cmd: BaseCommand) {
  setupHandler(cmd)

  const dir = cmd.dir ?? process.cwd()
  const projectInfo = await getProjectInfo(dir, cmd.config)

  if (cmd.dryRun) {
    process.exit(0)
  }

  const accessToken = getAccessTokenOrExit(cmd)

  return createCodeConnectFromUrl({
    accessToken,
    // We remove \s to allow users to paste URLs inside quotes - the terminal
    // paste will add backslashes, which the quotes preserve, but expected user
    // behaviour would be to strip the quotes
    figmaNodeUrl: nodeUrl.replace(/\\/g, ''),
    outFile: cmd.outFile,
    outDir: cmd.outDir,
    projectInfo,
    cmd,
  })
}
/**
 * Migrate native parser Code Connect files to parserless. For each found doc:
 * - Replace helpers with figma.* versions
 * - Migrate v1 syntax to v2 (equivalent but more readable)
 * - Format as valid parserless file w/ url="" comment
 * - Name collisions are skipped, unless file is from migration (in which case add "_1")
 */
async function handleMigrate(cmd: BaseCommand & { javascript?: boolean }) {
  setupHandler(cmd)

  const dir = cmd.dir ?? process.cwd()
  let projectInfo = filterProjectInfoByFile(await getProjectInfo(dir, cmd.config), cmd.file)
  const documentUrlSubstitutions = projectInfo.config.documentUrlSubstitutions

  // Clear documentUrlSubstitutions so we preserve original URLs in migrated templates
  projectInfo = {
    ...projectInfo,
    config: {
      ...projectInfo.config,
      documentUrlSubstitutions: {},
    },
  }

  // Parse the files to get Code Connect objects
  const allCodeConnectObjects = await getCodeConnectObjects(cmd, projectInfo, false, true)

  const allCodeConnectObjectsByFigmaUrl = groupCodeConnectObjectsByFigmaUrl(allCodeConnectObjects)
  const groupCount = Object.keys(allCodeConnectObjectsByFigmaUrl).length
  if (groupCount === 0) {
    exitWithError('No Code Connect objects found to migrate')
  }

  logger.info(`Found ${groupCount} component(s) to migrate`)
  let migratedCount = 0
  let batchMigratedCount = 0
  let skippedCount = 0
  const errors: string[] = []
  const batchMigrationWarnings: Array<{
    path: string
    connectionCount: number
    reason: string
  }> = []

  const filePathsCreated = new Set<string>()
  const gitRootPath = getGitRepoAbsolutePath(dir)
  const useTypeScript = !cmd.javascript
  const batchMigratedDocs = new Set<CodeConnectJSON>()
  const batchDocsByPath = getBatchMigrationGroups(allCodeConnectObjects, {
    batchAll: cmd.batch === 'all',
    disabled: cmd.batch === 'none',
  })

  for (const [batchPath, docs] of batchDocsByPath) {
    const result = writeBatchTemplateFiles(docs, cmd.outDir, dir, {
      localSourcePath: batchPath,
      filePathsCreated,
      includeProps: cmd.includeProps,
      useTypeScript,
    })

    if (result.skipped) {
      batchMigrationWarnings.push({
        path: batchPath,
        connectionCount: docs.length,
        reason: result.reason || 'unable to create batch files',
      })
    } else {
      logger.info(
        `${success('✓')} Migrated ${result.componentCount} component(s) to batch ${highlight(result.batchPath || batchPath)}`,
      )
      migratedCount += result.componentCount
      batchMigratedCount += result.componentCount
      docs.forEach((doc) => batchMigratedDocs.add(doc))
    }
  }

  const regularCodeConnectObjects = allCodeConnectObjects.filter(
    (doc) => !batchMigratedDocs.has(doc),
  )
  const codeConnectObjectsByFigmaUrl = groupCodeConnectObjectsByFigmaUrl(regularCodeConnectObjects)

  for (const [figmaUrl, group] of Object.entries(codeConnectObjectsByFigmaUrl)) {
    try {
      const hasVariants = group.variants.length > 0
      const representativeDoc = group.main ?? group.variants[0]
      if (!representativeDoc?.template) {
        logger.warn(`Skipping ${figmaUrl}: no template found`)
        skippedCount++
        continue
      }

      // Determine local source path for output location
      let localSourcePath: string | undefined

      if (representativeDoc._codeConnectFilePath) {
        // Use the Code Connect file path directly (preferred)
        localSourcePath = representativeDoc._codeConnectFilePath
      } else if (representativeDoc?.source && gitRootPath) {
        // Fallback: Convert remote file URL to local path
        const relativePath = convertRemoteFileUrlToRelativePath({
          remoteFileUrl: representativeDoc.source,
          gitRootPath,
          dir,
        })
        if (relativePath) {
          localSourcePath = path.resolve(dir, relativePath)
        }
      }

      const { outputPath, skipped } = hasVariants
        ? writeVariantTemplateFile(group, figmaUrl, cmd.outDir, dir, {
            localSourcePath,
            filePathsCreated,
            useTypeScript,
            includeProps: cmd.includeProps,
          })
        : writeTemplateFile(representativeDoc, cmd.outDir, dir, {
            localSourcePath,
            filePathsCreated,
            includeProps: cmd.includeProps,
            useTypeScript,
          })

      if (skipped) {
        logger.warn(`Skipping ${outputPath}: file already exists`)
        skippedCount++
      } else {
        logger.info(
          `${success('✓')} Migrated${hasVariants ? ' (with variants)' : ''} to ${highlight(outputPath)}`,
        )
        migratedCount++
      }
    } catch (error) {
      const errorMsg = `Failed to migrate ${figmaUrl}: ${error}`
      logger.error(errorMsg)
      errors.push(errorMsg)
    }
  }

  if (migratedCount > 0) {
    if (cmd.outDir) {
      const configFilePath = path.join(cmd.outDir, 'figma.config.json')
      if (fs.existsSync(configFilePath)) {
        logger.warn(`Config file already exists at ${highlight(configFilePath)}`)
      } else {
        const { language: docLanguage, label } = allCodeConnectObjects[0]

        const language = getInferredLanguageForRaw(label, docLanguage)
        const config: CodeConnectParserlessConfig = {
          parser: undefined,
          include: [
            useTypeScript ? '**/*.figma.ts' : '**/*.figma.js',
            ...(batchMigratedCount > 0 ? ['**/*.figma.batch.json'] : []),
          ],
          language,
          label,
          ...(documentUrlSubstitutions && Object.keys(documentUrlSubstitutions).length > 0
            ? { documentUrlSubstitutions }
            : {}),
        }
        fs.writeFileSync(configFilePath, JSON.stringify({ codeConnect: config }, null, 2))
        logger.info(`${success('✓')} Wrote Figma config to ${highlight(configFilePath)}`)
      }
    }
  }

  if (batchMigrationWarnings.length > 0) {
    console.log('')
    logger.warn('Unable to migrate the following files to batch files:')
    batchMigrationWarnings.forEach((warning) => {
      logger.warn(
        `- ${highlight(warning.path)} (${warning.connectionCount} connections): ${formatBatchMigrationWarningReason(warning.reason)}`,
      )
    })
    console.log('')
    logger.warn(
      "If you'd like to create batch files for these, we recommend using a coding agent. See example prompt: https://developers.figma.com/docs/code-connect/template-files/#migration-script",
    )
  }

  // Summary
  console.log('')
  logger.info(
    `Migration complete: ${success(`${migratedCount} migrated`)}, ${skippedCount} skipped`,
  )

  if (errors.length > 0) {
    console.log('')
    logger.error(`Encountered ${errors.length} error(s):`)
    errors.forEach((err) => logger.error(`  ${err}`))
    process.exit(1)
  }

  if (migratedCount === 0) {
    exitWithError('No files were migrated')
  }
}

function formatBatchMigrationWarningReason(reason: string) {
  const strippedReason = reason.replace(/^Cannot batch:\s*/i, '')
  return strippedReason.replace(/^(\s*)(\S)/, (_match, prefix: string, firstChar: string) => {
    return `${prefix}${firstChar.toUpperCase()}`
  })
}
