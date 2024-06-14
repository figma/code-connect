import * as commander from 'commander'
import { InternalError, ParserError, isFigmaConnectFile, parse } from '../react/parser'
import fs from 'fs'
import { upload } from '../connect/upload'
import { validateDocs } from '../connect/validation'
import { createCodeConnectFromUrl } from '../connect/create'
import { ProjectInfo, getProjectInfo } from '../common/project'
import { LogLevel, error, highlight, logger, success } from '../common/logging'
import { CodeConnectJSON } from '../common/figma_connect'
import { convertStorybookFiles } from '../storybook/convert'
import { delete_docs } from '../connect/delete_docs'

type BaseCommand = commander.Command & {
  token: string
  verbose: boolean
  outfile: string
  config: string
  dryRun: boolean
  dir: string
}

function addBaseCommand(command: commander.Command, name: string, description: string) {
  return command
    .command(name)
    .description(description)
    .usage('[options]')
    .option('-r --dir <dir>', 'directory to parse')
    .option('-t --token <token>', 'figma access token')
    .option('-v --verbose', 'enable verbose logging for debugging')
    .option('-o --outfile <file>', 'output to JSON file')
    .option('-c --config <path>', 'path to a figma config file')
    .option('--dry-run', 'tests publishing without actually publishing')
}

export function addConnectCommandToProgram(program: commander.Command) {
  // Main command, invoked with `figma connect`
  const connectCommand = addBaseCommand(
    program,
    'connect',
    'Start the Code Connect Wizard (not implemented yet)',
  )

  // Sub-commands, invoked with e.g. `figma connect publish`
  addBaseCommand(
    connectCommand,
    'publish',
    'Run Code Connect locally to find any files that include calls to `figma.connect()` and publishes those to Figma. ' +
      'By default this looks for a config file named "figma.config.json", and uses the `include` and `exclude` fields to determine which files to parse. ' +
      'If no config file is found, this parses the current directory. An optional `--dir` flag can be used to specify a directory to parse.',
  )
    .option('--skip-validation', 'skip validation of Code Connect docs')
    .action(handlePublish)

  addBaseCommand(
    connectCommand,
    'unpublish',
    'Run to find any files that include calls to `figma.connect()` and unpublish them from Figma. ' +
      'By default this looks for a config file named "figma.config.json", and uses the `include` and `exclude` fields to determine which files to parse. ' +
      'If no config file is found, this parses the current directory. An optional `--dir` flag can be used to specify a directory to parse.',
  )
    .option(
      '--node <link_to_node>',
      'specify the node to unpublish. This will unpublish for both React and Storybook.',
    )
    .action(handleUnpublish)

  addBaseCommand(
    connectCommand,
    'parse',
    'Run Code Connect locally to find any files that include calls to `figma.connect()`, then converts to JSON and outputs to stdout.',
  ).action(handleParse)

  addBaseCommand(
    connectCommand,
    'create',
    'Generate a Code Connect file with boilerplate in the current directory for a Figma node URL',
  )
    .argument('<figma-node-url>', 'Figma node URL to create the Code Connect file from')
    .action(handleCreate)
}

function getAccessToken(cmd: BaseCommand) {
  return cmd.token ?? process.env.FIGMA_ACCESS_TOKEN
}

function setupHandler(cmd: BaseCommand) {
  if (cmd.verbose) {
    logger.setLogLevel(LogLevel.Debug)
  }
}

async function getCodeConnectObjects(dir: string, cmd: BaseCommand, projectInfo: ProjectInfo) {
  const codeConnectObjects: CodeConnectJSON[] = []
  const { files, remoteUrl, config, tsProgram } = projectInfo

  const figmaNodeToFile = new Map()
  for (const file of files.filter((f: string) => isFigmaConnectFile(tsProgram, f))) {
    try {
      const docs = await parse(tsProgram, file, remoteUrl, config, cmd.verbose)
      for (const doc of docs) {
        figmaNodeToFile.set(doc.figmaNode, file)
      }
      codeConnectObjects.push(...docs)
      logger.info(success(file))
    } catch (e) {
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

  return codeConnectObjects
}

async function handlePublish(cmd: BaseCommand & { skipValidation: boolean }) {
  setupHandler(cmd)

  let dir = cmd.dir ?? process.cwd()
  const projectInfo = getProjectInfo(dir, cmd.config)

  if (cmd.dryRun) {
    logger.info(`Files that would be published:`)
  }

  const codeConnectObjects = await getCodeConnectObjects(dir, cmd, projectInfo)
  const storybookCodeConnectObjects = await convertStorybookFiles({
    projectInfo,
  })

  const allCodeConnectFiles = codeConnectObjects.concat(storybookCodeConnectObjects)
  if (allCodeConnectFiles.length === 0) {
    logger.warn(
      `No Code Connect files found in ${dir} - Make sure you have configured \`include\` and \`exclude\` in your figma.config.json file correctly, or that you are running in a directory that contains Code Connect files.`,
    )
    process.exit(0)
  }

  const accessToken = getAccessToken(cmd)
  if (!accessToken) {
    logger.error(
      `Couldn't find a Figma access token. Please provide one with \`--token <access_token>\` or set the FIGMA_ACCESS_TOKEN environment variable`,
    )
    process.exit(1)
  }

  if (cmd.skipValidation) {
    logger.info('Validation skipped')
  } else {
    logger.info('Validating Code Connect files...')
    var start = new Date().getTime()
    const valid = await validateDocs(accessToken, allCodeConnectFiles)
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

  upload({ accessToken, docs: allCodeConnectFiles })
}

async function handleUnpublish(cmd: BaseCommand & { node: string }) {
  setupHandler(cmd)

  let dir = cmd.dir ?? process.cwd()

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
    const projectInfo = getProjectInfo(dir, cmd.config)

    const codeConnectObjects = await getCodeConnectObjects(dir, cmd, projectInfo)
    const storybookCodeConnectObjects = await convertStorybookFiles({
      projectInfo,
    })

    const allCodeConnectFiles = codeConnectObjects.concat(storybookCodeConnectObjects)

    nodesToDeleteRelevantInfo = allCodeConnectFiles.map((doc) => ({
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

  // if we're not doing a dry run, we don't want to output logs
  if (!cmd.dryRun) {
    logger.setLogLevel(LogLevel.Error)
  }

  let dir = cmd.dir ?? process.cwd()
  const projectInfo = getProjectInfo(dir, cmd.config)

  const codeConnectObjects = await getCodeConnectObjects(dir, cmd, projectInfo)
  const storybookCodeConnectObjects = await convertStorybookFiles({
    projectInfo,
  })

  const allCodeConnectFiles = codeConnectObjects.concat(storybookCodeConnectObjects)

  if (cmd.dryRun) {
    logger.info(`Dry run complete`)
    process.exit(0)
  }

  if (cmd.outfile) {
    fs.writeFileSync(cmd.outfile, JSON.stringify(codeConnectObjects, null, 2))
    logger.info(`Wrote Code Connect JSON to ${highlight(cmd.outfile)}`)
  } else {
    // don't format the output, so it can be piped to other commands
    console.log(JSON.stringify(allCodeConnectFiles, undefined, 2))
  }
}

function handleCreate(nodeUrl: string, cmd: BaseCommand) {
  setupHandler(cmd)

  if (cmd.dryRun) {
    process.exit(0)
  }

  const accessToken = getAccessToken(cmd)
  if (!accessToken) {
    logger.error(
      `Couldn't find a Figma access token. Please provide one with \`--token <access_token>\` or set the FIGMA_ACCESS_TOKEN environment variable`,
    )
    process.exit(1)
  }

  return createCodeConnectFromUrl({
    accessToken,
    // We remove \s to allow users to paste URLs inside quotes - the terminal
    // paste will add backslashes, which the quotes preserve, but expected user
    // behaviour would be to strip the quotes
    figmaNodeUrl: nodeUrl.replace(/\\/g, ''),
    outFile: cmd.outfile,
  })
}
