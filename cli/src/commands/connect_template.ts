/**
 * Slim Code Connect entry point template-files-only support.
 */
import * as commander from 'commander'
import fs from 'fs'
import { upload } from '../connect/upload'
import { validateDocs } from '../connect/validation'
import { ProjectInfo, getProjectInfo } from '../connect/project'
import { LogLevel, exitWithError, highlight, logger, success } from '../common/logging'
import { CodeConnectJSON } from '../connect/figma_connect'
import { delete_docs } from '../connect/delete_docs'
import { exitWithFeedbackMessage } from '../connect/helpers'
import { CodePropertiesError, isRawTemplate, parseRawFile } from '../connect/raw_templates'
import { parseBatchFile } from '../connect/batch_templates'
import { filterProjectInfoByFile } from './filter_project_info'
import { createCodeConnectFromUrl } from '../connect/create_template'

export type BaseCommand = commander.Command & {
  token: string
  useOAuth: boolean
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
}

function getAccessTokenOrExit(cmd: BaseCommand): string {
  const token = cmd.token
  if (!token) {
    exitWithError(
      cmd.useOAuth
        ? `Couldn't find a Figma OAuth token. Please re-authenticate.`
        : `Couldn't find a Figma access token. Please set the FIGMA_ACCESS_TOKEN environment variable`,
    )
  }
  return token
}

function setupHandler(cmd: BaseCommand) {
  if (cmd.verbose) {
    logger.setLogLevel(LogLevel.Debug)
  }
}

function getDir(cmd: BaseCommand) {
  return cmd.dir ?? process.cwd()
}

/**
 * Returns Code Connect objects from template files (.figma.ts / .figma.js)
 * only. Native parser paths (react, html, executable) are intentionally
 * omitted — this entry point is for parserless/template-file workflows.
 */
async function getCodeConnectObjects(
  cmd: BaseCommand & { label?: string },
  projectInfo: ProjectInfo,
  silent = false,
): Promise<CodeConnectJSON[]> {
  const rawTemplateFiles = projectInfo.files.filter((f: string) => {
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

  let codeConnectObjects: CodeConnectJSON[] = []

  if (rawTemplateFiles.length > 0) {
    const resolvedLabel = cmd.label || projectInfo.config.label
    const rawTemplateDocs: CodeConnectJSON[] = []
    for (const file of rawTemplateFiles) {
      try {
        const doc = parseRawFile(file, resolvedLabel, projectInfo.config, projectInfo.absPath)
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

async function handlePublish(
  cmd: BaseCommand & {
    skipValidation: boolean
    label: string
    batchSize: string
    force?: boolean
  },
) {
  setupHandler(cmd)

  let dir = getDir(cmd)
  const projectInfo = filterProjectInfoByFile(await getProjectInfo(dir, cmd.config, true), cmd.file)
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
    const start = new Date().getTime()
    const valid = await validateDocs(
      cmd,
      accessToken,
      codeConnectObjects,
      cmd.apiUrl || projectInfo.config.apiUrl,
      cmd.useOAuth,
    )
    if (!valid) {
      exitWithFeedbackMessage(1)
    } else {
      const end = new Date().getTime()
      const time = end - start
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
    useOAuth: cmd.useOAuth,
    docs: codeConnectObjects,
    batchSize,
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

  const projectInfo = filterProjectInfoByFile(await getProjectInfo(dir, cmd.config, true), cmd.file)

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
    useOAuth: cmd.useOAuth,
    docs: nodesToDeleteRelevantInfo,
    apiUrl: cmd.apiUrl || projectInfo.config.apiUrl,
  })
}

async function handleParse(cmd: BaseCommand & { label: string }) {
  setupHandler(cmd)

  const dir = cmd.dir ?? process.cwd()
  const projectInfo = filterProjectInfoByFile(await getProjectInfo(dir, cmd.config, true), cmd.file)
  const codeConnectObjects = await getCodeConnectObjects(cmd, projectInfo)

  if (cmd.dryRun) {
    logger.info(`Dry run complete`)
    process.exit(0)
  }

  if (cmd.outFile) {
    fs.writeFileSync(cmd.outFile, JSON.stringify(codeConnectObjects, null, 2))
    logger.info(`Wrote Code Connect JSON to ${highlight(cmd.outFile)}`)
  } else {
    console.log(JSON.stringify(codeConnectObjects, undefined, 2))
  }
}

async function handleCreate(nodeUrl: string, cmd: BaseCommand) {
  setupHandler(cmd)

  const dir = getDir(cmd)
  const projectInfo = await getProjectInfo(dir, cmd.config, true)

  const accessToken = getAccessTokenOrExit(cmd)

  return createCodeConnectFromUrl({
    accessToken,
    figmaNodeUrl: nodeUrl.replace(/\\/g, ''),
    outFile: cmd.outFile,
    outDir: cmd.outDir,
    projectInfo,
    cmd,
  })
}

interface ProgramOptions {
  /** Override how the auth token is retrieved. Return undefined to fall back to FIGMA_ACCESS_TOKEN. */
  getToken?: () => string | undefined
}

/**
 * Registers Code Connect commands on a commander program, restricted to
 * template-file workflows only. Intended for use by CLIs that support
 * Code Connect during a migration period but do not need native parsers.
 *
 * Note: does NOT use addBaseCommand internally because that function registers
 * both `-o --outFile` and `-o --outDir` with the same `-o` short flag.
 * commander@12+ (used by @figma/cli) throws a conflict error on duplicate flags.
 */
export function addCodeConnectCommandsToProgram(
  program: commander.Command,
  programOptions: ProgramOptions = {},
) {
  function addBase(parent: commander.Command, name: string, description: string) {
    return parent
      .command(name)
      .description(description)
      .usage('[options]')
      .option('-r --dir <dir>', 'directory to parse')
      .option(
        '-f --file <file...>',
        'paths to one or more Code Connect files to process (space-separated)',
      )
      .option('--outFile <file>', 'specify a file to output generated Code Connect')
      .option('--outDir <dir>', 'specify a directory to output generated Code Connect')
      .option('-c --config <path>', 'path to a figma config file')
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

  function wrapHandler<T extends BaseCommand>(handler: (cmd: T) => Promise<void>) {
    return (options: unknown, cmd: commander.Command) => {
      const globalOpts = cmd.optsWithGlobals<{ logLevel?: string; apiBaseUrl?: string }>()

      // Attempt to get a token from the provided getter (e.g. OAuth store).
      // If it returns undefined or throws (e.g. no OAuth token stored in CI),
      // fall back to FIGMA_ACCESS_TOKEN and use PAT headers.
      let oauthToken: string | undefined
      try {
        oauthToken = programOptions.getToken?.()
      } catch {
        // getToken threw (e.g. no OAuth token stored); fall back to PAT below
      }
      const token = oauthToken ?? process.env.FIGMA_ACCESS_TOKEN
      const useOAuth = oauthToken !== undefined

      return handler({
        ...(options as object),
        token,
        useOAuth,
        verbose: globalOpts.logLevel === 'debug',
        apiUrl: globalOpts.apiBaseUrl,
      } as unknown as T).catch((err: Error) => {
        // Commander v12 catches rejected action promises internally and exits 0.
        // Commander v11 left them as unhandled rejections, and Node.js 15+ would
        // exit 1 for those — so exit code 1 on handler errors was previously
        // accidental. This catch makes it explicit and version-independent.
        logger.error(err.message)
        process.exitCode = 1
      })
    }
  }

  const connectCommand = program
    .command('connect')
    .description('Code Connect commands')
    .addHelpText(
      'before',
      'For feedback or bugs, please raise an issue: https://github.com/figma/code-connect/issues',
    )
  connectCommand.action(() => connectCommand.help())

  addBase(
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
      '--force',
      'overwrite existing UI-created Code Connect mappings if they conflict with the files being published',
    )
    .action(wrapHandler(handlePublish))

  addBase(
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
    .action(wrapHandler(handleUnpublish))

  addBase(
    connectCommand,
    'parse',
    'Run Code Connect locally to find any files that have figma connections, then converts them to JSON and outputs to stdout.',
  )
    .option('-l --label <label>', 'label to apply to the parsed files')
    .action(wrapHandler(handleParse))

  addBase(
    connectCommand,
    'create',
    'Generate a Code Connect file with boilerplate in the current directory for a Figma node URL',
  )
    .argument('<figma-node-url>', 'Figma node URL to create the Code Connect file from')
    .action((nodeUrl: string, options: unknown, cmd: commander.Command) =>
      wrapHandler<BaseCommand>((mergedCmd) => handleCreate(nodeUrl, mergedCmd))(options, cmd),
    )
}
