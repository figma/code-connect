import * as commander from 'commander'
import fs from 'fs'
import { upload } from '../connect/upload'
import { validateDocs } from '../connect/validation'
import { createCodeConnectFromUrl } from '../connect/create'
import {
  CodeConnectConfig,
  CodeConnectExecutableParserConfig,
  CodeConnectReactConfig,
  ProjectInfo,
  getProjectInfo,
  getReactProjectInfo,
  getRemoteFileUrl,
  getTsProgram,
} from '../connect/project'
import { LogLevel, exitWithError, highlight, logger, success } from '../common/logging'
import { CodeConnectJSON } from '../connect/figma_connect'
import { convertStorybookFiles } from '../storybook/convert'
import { delete_docs } from '../connect/delete_docs'
import { runWizard } from '../connect/wizard/run_wizard'
import { callParser, handleMessages } from '../connect/parser_executables'
import { fromError } from 'zod-validation-error'
import { ParseRequestPayload, ParseResponsePayload } from '../connect/parser_executable_types'
import z from 'zod'
import { withUpdateCheck } from '../common/updates'
import { exitWithFeedbackMessage } from '../connect/helpers'
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

export type BaseCommand = commander.Command & {
  token: string
  verbose: boolean
  outFile: string
  outDir: string
  config: string
  dryRun: boolean
  dir: string
  jsonFile: string
  skipUpdateCheck: boolean
  exitOnUnreadableFiles: boolean
}

function addBaseCommand(command: commander.Command, name: string, description: string) {
  return command
    .command(name)
    .description(description)
    .usage('[options]')
    .option('-r --dir <dir>', 'directory to parse')
    .option('-t --token <token>', 'figma access token')
    .option('-v --verbose', 'enable verbose logging for debugging')
    .option('-o --outFile <file>', 'specify a file to output generated Code Connect')
    .option('-o --outDir <dir>', 'specify a directory to output generated Code Connect')
    .option('-c --config <path>', 'path to a figma config file')
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
    .action(withUpdateCheck(handlePublish))

  addBaseCommand(
    connectCommand,
    'unpublish',
    'Run to find any files that have figma connections and unpublish them from Figma. ' +
      'By default this looks for a config file named "figma.config.json", and uses the `include` and `exclude` fields to determine which files to parse. ' +
      'If no config file is found, this parses the current directory. An optional `--dir` flag can be used to specify a directory to parse.',
  )
    .option(
      '--node <link_to_node>',
      'specify the node to unpublish. This will unpublish for both React and Storybook.',
    )
    .option('-l --label <label>', 'label to unpublish for')
    .action(withUpdateCheck(handleUnpublish))

  addBaseCommand(
    connectCommand,
    'parse',
    'Run Code Connect locally to find any files that have figma connections, then converts them to JSON and outputs to stdout.',
  )
    .option('-l --label <label>', 'label to apply to the parsed files')
    .action(withUpdateCheck(handleParse))

  addBaseCommand(
    connectCommand,
    'create',
    'Generate a Code Connect file with boilerplate in the current directory for a Figma node URL',
  )
    .argument('<figma-node-url>', 'Figma node URL to create the Code Connect file from')
    .action(withUpdateCheck(handleCreate))
}

export function getAccessToken(cmd: BaseCommand) {
  return cmd.token ?? process.env.FIGMA_ACCESS_TOKEN
}

function getAccessTokenOrExit(cmd: BaseCommand) {
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

function setupHandler(cmd: BaseCommand) {
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
      source = getRemoteFileUrl(source, remoteUrl)
    }
  }

  // TODO This logic is duplicated in parser.ts parseDoc due to some type issues
  let figmaNode = doc.figmaNode
  if (config.documentUrlSubstitutions) {
    Object.entries(config.documentUrlSubstitutions).forEach(([from, to]) => {
      figmaNode = figmaNode.replace(from, to)
    })
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
): Promise<CodeConnectJSON[]> {
  if (cmd.jsonFile) {
    try {
      return JSON.parse(fs.readFileSync(cmd.jsonFile, 'utf8'))
    } catch (e) {
      logger.error('Failed to parse JSON file:', e)
    }
  }

  let codeConnectObjects: CodeConnectJSON[] = []

  if (projectInfo.config.parser === 'react') {
    codeConnectObjects = await getReactCodeConnectObjects(
      projectInfo as ProjectInfo<CodeConnectReactConfig>,
      cmd,
      silent,
    )
  } else if (projectInfo.config.parser === 'html') {
    codeConnectObjects = await getCodeConnectObjectsFromParseFn({
      parseFn: parseHtmlDoc,
      fileExtension: 'ts',
      projectInfo,
      cmd,
      silent,
    })
  } else {
    const payload: ParseRequestPayload = {
      mode: 'PARSE',
      paths: projectInfo.files,
      config: projectInfo.config,
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
      // zod-validation-error formats the error message into a readable format
      exitWithError(
        `Error returned from parser: ${fromError(e)}. Try re-running the command with --verbose for more information.`,
      )
    }
  }

  if (cmd.label || projectInfo.config.label) {
    logger.info(`Using label "${cmd.label || projectInfo.config.label}"`)
    codeConnectObjects.forEach((doc) => {
      doc.label = cmd.label || projectInfo.config.label || doc.label
    })
  }

  return codeConnectObjects
}

type GetCodeConnectObjectsArgs = {
  parseFn: ParseFn
  resolveImportsFn?: ResolveImportsFn
  fileExtension: string
  projectInfo: ProjectInfo<CodeConnectConfig>
  cmd: BaseCommand
  silent?: boolean
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
) {
  const codeConnectObjects = await getCodeConnectObjectsFromParseFn({
    parseFn: parseReactDoc,
    resolveImportsFn: findAndResolveImports,
    fileExtension: 'tsx',
    projectInfo,
    cmd,
    silent,
  })

  const storybookCodeConnectObjects = await convertStorybookFiles({
    projectInfo: getReactProjectInfo(projectInfo),
  })

  const allCodeConnectObjects = codeConnectObjects.concat(storybookCodeConnectObjects)

  return allCodeConnectObjects
}

async function handlePublish(
  cmd: BaseCommand & {
    skipValidation: boolean
    label: string
    batchSize: string
  },
) {
  setupHandler(cmd)

  let dir = getDir(cmd)
  const projectInfo = await getProjectInfo(dir, cmd.config)

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
    const valid = await validateDocs(cmd, accessToken, codeConnectObjects)
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

  upload({ accessToken, docs: codeConnectObjects, batchSize: batchSize, verbose: cmd.verbose })
}

async function handleUnpublish(cmd: BaseCommand & { node: string; label: string }) {
  setupHandler(cmd)

  let dir = getDir(cmd)

  if (cmd.dryRun) {
    logger.info(`Files that would be unpublished:`)
  }

  let nodesToDeleteRelevantInfo

  if (cmd.node) {
    nodesToDeleteRelevantInfo = [
      { figmaNode: cmd.node, label: 'React' },
      { figmaNode: cmd.node, label: 'Storybook' },
    ]
  } else {
    const projectInfo = await getProjectInfo(dir, cmd.config)

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
  })
}

async function handleParse(cmd: BaseCommand & { label: string }) {
  setupHandler(cmd)

  const dir = cmd.dir ?? process.cwd()
  const projectInfo = await getProjectInfo(dir, cmd.config)

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
  })
}
