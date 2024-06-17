import * as commander from 'commander'
import { InternalError, ParserError, isFigmaConnectFile, parse } from '../react/parser'
import fs from 'fs'
import { upload } from '../connect/upload'
import { validateDocs } from '../connect/validation'
import { createCodeConnectFromUrl } from '../connect/create'
import {
  CodeConnectExecutableParserConfig,
  CodeConnectReactConfig,
  ProjectInfo,
  getProjectInfo,
  getReactProjectInfo,
  getRemoteFileUrl,
} from '../connect/project'
import { LogLevel, exitWithError, highlight, logger, success } from '../common/logging'
import { CodeConnectJSON } from '../common/figma_connect'
import { convertStorybookFiles } from '../storybook/convert'
import { delete_docs } from '../connect/delete_docs'
import { runWizard } from '../connect/wizard/run_wizard'
import { callParser, handleMessages } from '../connect/parser_executables'
import { fromError } from 'zod-validation-error'
import { ParseRequestPayload, ParseResponsePayload } from '../connect/parser_executable_types'
import z from 'zod'
import { withUpdateCheck } from '../common/updates'

export type BaseCommand = commander.Command & {
  token: string
  verbose: boolean
  outFile: string
  outDir: string
  config: string
  dryRun: boolean
  dir: string
  jsonFile: string
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
    .option('--dry-run', 'tests publishing without actually publishing')
}

export function addConnectCommandToProgram(program: commander.Command) {
  // Main command, invoked with `figma connect`
  const connectCommand = addBaseCommand(program, 'connect', 'Figma Code Connect')

  // Sub-commands, invoked with e.g. `figma connect publish`
  addBaseCommand(
    connectCommand,
    'publish',
    'Run Code Connect locally to find any files that have figma connections and publish them to Figma. ' +
      'By default this looks for a config file named "figma.config.json", and uses the `include` and `exclude` fields to determine which files to parse. ' +
      'If no config file is found, this parses the current directory. An optional `--dir` flag can be used to specify a directory to parse.',
  )
    .option('--skip-validation', 'skip validation of Code Connect docs')
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
    .action(withUpdateCheck(handleUnpublish))

  addBaseCommand(
    connectCommand,
    'parse',
    'Run Code Connect locally to find any files that have figma connections, then converts them to JSON and outputs to stdout.',
  ).action(withUpdateCheck(handleParse))

  addBaseCommand(
    connectCommand,
    'create',
    'Generate a Code Connect file with boilerplate in the current directory for a Figma node URL',
  )
    .argument('<figma-node-url>', 'Figma node URL to create the Code Connect file from')
    .action(withUpdateCheck(handleCreate))
}

export function getAccessToken(cmd: BaseCommand) {
  const token = cmd.token ?? process.env.FIGMA_ACCESS_TOKEN

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

function transformDocFromParser(doc: ParserDoc, remoteUrl: string): ParserDoc {
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

  return {
    ...doc,
    source,
  }
}

export async function getCodeConnectObjects(
  dir: string,
  cmd: BaseCommand,
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

  if (projectInfo.config.parser === 'react') {
    return getReactCodeConnectObjects(
      dir,
      projectInfo as ProjectInfo<CodeConnectReactConfig>,
      cmd,
      silent,
    )
  }

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

    return parsed.docs.map((doc) => ({
      ...transformDocFromParser(doc, projectInfo.remoteUrl),
      metadata: {
        cliVersion: require('../../package.json').version,
      },
    }))
  } catch (e) {
    // zod-validation-error formats the error message into a readable format
    exitWithError(`Error returned from parser: ${fromError(e)}`)
  }
}

// The React/Storybook parser is handled as a special case for now. Other
// parsers uses the separate parser executable model and React will be
// transitioned to that at some point, but for now the old code path is used
async function getReactCodeConnectObjects(
  dir: string,
  projectInfo: ProjectInfo<CodeConnectReactConfig>,
  cmd: BaseCommand,
  silent = false,
) {
  const codeConnectObjects: CodeConnectJSON[] = []
  const reactProjectInfo = getReactProjectInfo(projectInfo)

  const { files, remoteUrl, config, tsProgram } = reactProjectInfo

  for (const file of files.filter((f: string) => isFigmaConnectFile(tsProgram, f))) {
    try {
      const docs = await parse(
        tsProgram,
        file,
        config,
        reactProjectInfo.absPath,
        remoteUrl,
        cmd.verbose,
      )
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

  const storybookCodeConnectObjects = await convertStorybookFiles({
    projectInfo: getReactProjectInfo(projectInfo),
  })

  const allCodeConnectObjects = codeConnectObjects.concat(storybookCodeConnectObjects)

  return allCodeConnectObjects
}

async function handlePublish(cmd: BaseCommand & { skipValidation: boolean }) {
  setupHandler(cmd)

  let dir = getDir(cmd)
  const projectInfo = await getProjectInfo(dir, cmd.config)

  const codeConnectObjects = await getCodeConnectObjects(dir, cmd, projectInfo)

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

  const accessToken = getAccessToken(cmd)

  if (cmd.skipValidation) {
    logger.info('Validation skipped')
  } else {
    logger.info('Validating Code Connect files...')
    var start = new Date().getTime()
    const valid = await validateDocs(cmd, accessToken, codeConnectObjects)
    if (!valid) {
      process.exit(1)
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

  upload({ accessToken, docs: codeConnectObjects })
}

async function handleUnpublish(cmd: BaseCommand & { node: string }) {
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

    const codeConnectObjects = await getCodeConnectObjects(dir, cmd, projectInfo)

    nodesToDeleteRelevantInfo = codeConnectObjects.map((doc) => ({
      figmaNode: doc.figmaNode,
      label: doc.label,
    }))

    if (cmd.dryRun) {
      logger.info(`Dry run complete`)
      process.exit(0)
    }
  }

  const accessToken = getAccessToken(cmd)

  delete_docs({
    accessToken,
    docs: nodesToDeleteRelevantInfo,
  })
}

async function handleParse(cmd: BaseCommand) {
  setupHandler(cmd)

  const dir = cmd.dir ?? process.cwd()
  const projectInfo = await getProjectInfo(dir, cmd.config)

  const codeConnectObjects = await getCodeConnectObjects(dir, cmd, projectInfo)

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

  const accessToken = getAccessToken(cmd)

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
