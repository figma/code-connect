import { BaseCommand, getAccessToken, getCodeConnectObjects, getDir } from '../../commands/connect'
import prompts from 'prompts'
import fs from 'fs'
import { exitWithFeedbackMessage, findComponentsInDocument, parseFileKey } from '../helpers'
import { FigmaRestApi, getApiUrl } from '../figma_rest_api'
import { logger, success, warn } from '../../common/logging'
import axios, { isAxiosError } from 'axios'
import {
  ReactProjectInfo,
  getReactProjectInfo,
  getGitRepoAbsolutePath,
  parseOrDetermineConfig,
  getProjectInfoFromConfig,
  CodeConnectConfig,
} from '../../connect/project'
import { parseFigmaNode } from '../validation'
import chalk from 'chalk'
import path from 'path'
import { CreateRequestPayload, CreateResponsePayload } from '../parser_executable_types'
import { normalizeComponentName } from '../create'
import { createReactCodeConnect } from '../../react/create'
import { CodeConnectJSON } from '../../common/figma_connect'
import boxen from 'boxen'
import { Searcher } from 'fast-fuzzy'
import { isFigmaConnectFile } from '../../react/parser'
import { createCodeConnectConfig } from './helpers'
import z from 'zod/lib'
import { handleMessages } from '../parser_executables'

type ConnectedComponentMappings = { componentName: string; path: string }[]

const NONE = '(None)'
const DELIMITERS_REGEX = /[\s-_]/g

async function fetchTopLevelComponentsFromFile({
  accessToken,
  figmaUrl,
}: {
  accessToken: string
  figmaUrl: string
}) {
  // TODO enter create flow if node-id specified
  const fileKey = parseFileKey(figmaUrl)

  const apiUrl = getApiUrl(figmaUrl ?? '') + `/code_connect/${fileKey}/cli_data`

  try {
    logger.info('Fetching component information from Figma...')
    const response = await axios.get(apiUrl, {
      headers: {
        'X-Figma-Token': accessToken,
        'Content-Type': 'application/json',
      },
    })

    if (response.status === 200) {
      return findComponentsInDocument(response.data.document).filter(
        ({ id }) =>
          id in response.data.componentSets || !response.data.components[id].componentSetId,
      )
    } else {
      logger.error(`Failed to fetch components from Figma with status: ${response.status}`)
      logger.debug('Failed to fetch components from Figma with Body:', response.data)
    }
  } catch (err) {
    if (isAxiosError(err)) {
      if (err.response) {
        logger.error(
          `Failed to fetch components from Figma (${err.code}): ${err.response?.status} ${err.response?.data?.err ?? err.response?.data?.message}`,
        )
      } else {
        logger.error(`Failed to fetch components from Figma: ${err.message}`)
      }
      logger.debug(JSON.stringify(err.response?.data))
    }
    exitWithFeedbackMessage(1)
  }
}

/**
 * Asks a Prompts question and adds spacing
 * @param question Prompts question
 * @returns Prompts answer
 */
async function askQuestion<T extends string = string>(
  question: prompts.PromptObject<T>,
): Promise<prompts.Answers<T>> {
  const answers = await prompts(question)
  logger.info('')
  return answers
}

/**
 * Asks a Prompts question and exits the process if user cancels
 * @param question Prompts question
 * @returns Prompts answer
 */
async function askQuestionOrExit<T extends string = string>(
  question: prompts.PromptObject<T>,
): Promise<prompts.Answers<T>> {
  const answers = await askQuestion(question)
  if (!Object.keys(answers).length) {
    return process.exit(0)
  }
  return answers
}

/**
 * Asks a Prompts question and shows an exit confirmation if user cancels.
 * This should be used for questions further along in the wizard.
 * @param question Prompts question
 * @returns Prompts answer
 */
async function askQuestionWithExitConfirmation<T extends string = string>(
  question: prompts.PromptObject<T>,
): Promise<prompts.Answers<T>> {
  while (true) {
    const answers = await askQuestion(question)

    if (Object.keys(answers).length) {
      return answers
    }

    const { shouldExit } = await askQuestion({
      type: 'select',
      name: 'shouldExit',
      message: 'Are you sure you want to exit?',
      choices: [
        {
          title: 'Yes',
          value: 'yes',
        },
        {
          title: 'No',
          value: 'no',
        },
      ],
    })
    // also exit if no answer provided (esc / ctrl+c)
    if (!shouldExit || shouldExit === 'yes') {
      process.exit(0)
    }
  }
}

function formatComponentTitle(componentName: string, path: string, pad: number) {
  const nameLabel = `${chalk.dim('Figma component:')} ${componentName.padEnd(pad, ' ')}`
  const linkedLabel = `↔️ ${path ?? '-'}`
  return `${nameLabel}  ${linkedLabel}`
}

function getComponentChoicesForPrompt(
  components: FigmaRestApi.Component[],
  linkedNodeIdsToPaths: Record<string, string>,
  connectedComponentsMappings: ConnectedComponentMappings,
): prompts.Choice[] {
  const longestNameLength = [...components, ...connectedComponentsMappings].reduce(
    (longest, component) =>
      Math.max(
        longest,
        'name' in component ? component.name.length : component.componentName.length,
      ),
    0,
  )

  const nameCompare = (a: FigmaRestApi.Component, b: FigmaRestApi.Component) =>
    a.name.localeCompare(b.name)

  const linkedComponents = components.filter((c) => !!linkedNodeIdsToPaths[c.id]).sort(nameCompare)
  const unlinkedComponents = components.filter((c) => !linkedNodeIdsToPaths[c.id]).sort(nameCompare)

  const formatComponentChoice = (c: FigmaRestApi.Component) => ({
    title: formatComponentTitle(c.name, linkedNodeIdsToPaths[c.id], longestNameLength),
    value: c.id,
    description: `${chalk.green('Edit link')}`,
  })

  return [
    ...linkedComponents.map(formatComponentChoice),
    ...unlinkedComponents.map(formatComponentChoice),
    ...connectedComponentsMappings.map((connectedComponent) => ({
      title: formatComponentTitle(
        connectedComponent.componentName,
        connectedComponent.path,
        longestNameLength,
      ),
      disabled: true,
    })),
  ]
}

function getUnconnectedComponentChoices(componentPaths: string[]) {
  return [
    {
      title: NONE,
      value: NONE,
    },
    ...componentPaths.map((path) => {
      return {
        title: path,
        value: path,
      }
    }),
  ]
}

type ManualLinkingArgs = {
  unconnectedComponents: FigmaRestApi.Component[]
  connectedComponentsMappings: ConnectedComponentMappings
  linkedNodeIdsToPaths: Record<string, string>
  componentPaths: string[]
  cmd: BaseCommand
}

async function runManualLinking({
  unconnectedComponents,
  linkedNodeIdsToPaths,
  componentPaths,
  connectedComponentsMappings,
}: ManualLinkingArgs) {
  while (true) {
    // Don't show exit confirmation as we're relying on esc behavior
    const { nodeId } = await prompts({
      type: 'select',
      name: 'nodeId',
      message: `Select a link to edit (Press ${chalk.green('esc')} when you're ready to continue on)`,
      choices: getComponentChoicesForPrompt(
        unconnectedComponents,
        linkedNodeIdsToPaths,
        connectedComponentsMappings,
      ),
      warn: 'This component already has a local Code Connect file.',
      hint: ' ',
    })
    if (!nodeId) {
      return
    }
    const pathChoices = getUnconnectedComponentChoices(componentPaths)
    const { pathToComponent } = await prompts({
      type: 'autocomplete',
      name: 'pathToComponent',
      message: 'Choose a path to your code component (type to filter results)',
      choices: pathChoices,
      // default suggest uses .startsWith(input) which isn't very useful for full paths
      suggest: (input, choices) =>
        Promise.resolve(choices.filter((i) => i.value.toUpperCase().includes(input.toUpperCase()))),
      // preselect if editing an existing choice
      initial:
        nodeId in linkedNodeIdsToPaths
          ? pathChoices.findIndex(({ value }) => value === linkedNodeIdsToPaths[nodeId])
          : 0,
    })
    if (pathToComponent) {
      if (pathToComponent === NONE) {
        delete linkedNodeIdsToPaths[nodeId]
      } else {
        linkedNodeIdsToPaths[nodeId] = pathToComponent
      }
    }
  }
}

async function runManualLinkingWithConfirmation(manualLinkingArgs: ManualLinkingArgs) {
  let outDir = manualLinkingArgs.cmd.outDir || null
  let hasAskedOutDirQuestion = false

  while (true) {
    await runManualLinking(manualLinkingArgs)

    if (!outDir && !hasAskedOutDirQuestion) {
      const { outputDirectory } = await askQuestionWithExitConfirmation({
        type: 'text',
        name: 'outputDirectory',
        message: `What directory should Code Connect files be created in? (Press ${chalk.green('enter')} to co-locate your files alongside your component files)`,
      })
      hasAskedOutDirQuestion = true
      outDir = outputDirectory
    }

    const linkedNodes = Object.keys(manualLinkingArgs.linkedNodeIdsToPaths)
    if (!linkedNodes.length) {
      const { confirmation } = await askQuestionOrExit({
        type: 'select',
        name: 'confirmation',
        message: `No Code Connect files linked. Are you sure you want to exit?`,
        choices: [
          {
            title: 'Back to edit',
            value: 'backToEdit',
          },
          {
            title: 'Exit',
            value: 'exit',
          },
        ],
      })
      if (confirmation === 'exit') {
        process.exit(0)
      }
    } else {
      const { confirmation } = await askQuestionWithExitConfirmation({
        type: 'select',
        name: 'confirmation',
        message: `You're ready to create ${chalk.green(linkedNodes.length)} Code Connect file${linkedNodes.length == 1 ? '' : 's'}. Continue?`,
        choices: [
          {
            title: 'Create files',
            value: 'create',
          },
          {
            title: 'Back to editing',
            value: 'backToEdit',
          },
        ],
      })
      if (confirmation !== 'backToEdit') {
        return outDir
      }
    }
  }
}

/**
 * Autolinks components/paths based on fuzzy matching of name and writes mappings to linkedNodeIdsToPaths.
 *
 * Matching is done by fast-fuzzy
 */
function autoLinkComponents({
  unconnectedComponents,
  linkedNodeIdsToPaths,
  componentPaths,
}: {
  unconnectedComponents: FigmaRestApi.Component[]
  linkedNodeIdsToPaths: Record<string, string>
  componentPaths: string[]
}) {
  const matchableNamesToNodeIdsMap = unconnectedComponents.reduce(
    (acc, curr) => {
      const matchableName = curr.name
      acc[matchableName] = curr.id
      return acc
    },
    {} as Record<string, string>,
  )

  const searchSpace = Object.keys(matchableNamesToNodeIdsMap)
  const searcher = new Searcher(searchSpace)

  componentPaths.forEach((componentPath) => {
    const { name } = path.parse(componentPath)
    const matchableName = name
    const results = searcher.search(matchableName, { returnMatchData: true })
    const bestMatch = results[0]
    if (bestMatch && bestMatch.score > 0.9 && bestMatch.item in matchableNamesToNodeIdsMap) {
      linkedNodeIdsToPaths[matchableNamesToNodeIdsMap[bestMatch.item]] = componentPath
    }
  })
}

// returns ES-style import path from given system path
function formatImportPath(systemPath: string) {
  // use forward slashes for import paths
  let formattedImportPath = systemPath.replaceAll(path.sep, '/')

  // prefix current dir paths with ./ (node path does not)
  formattedImportPath = formattedImportPath.startsWith('.')
    ? formattedImportPath
    : `./${formattedImportPath}`

  // assume not using ESM imports
  return formattedImportPath.replace(/\.(jsx|tsx)$/, '')
}

async function createCodeConnectFiles({
  linkedNodeIdsToPaths,
  figmaFileUrl,
  unconnectedComponentsMap,
  outDir: outDirArg,
}: {
  figmaFileUrl: string
  linkedNodeIdsToPaths: Record<string, string>
  unconnectedComponentsMap: Record<string, FigmaRestApi.Component>
  outDir: string | null
}) {
  for (const [nodeId, filePath] of Object.entries(linkedNodeIdsToPaths)) {
    const urlObj = new URL(figmaFileUrl)
    urlObj.search = ''
    urlObj.searchParams.append('node-id', nodeId)

    const { name } = path.parse(filePath)
    const componentName = name.split('.')[0]

    const outDir = outDirArg || path.dirname(filePath)
    const outFile = path.join(outDir, `${name}.figma.tsx`)

    const payload: CreateRequestPayload = {
      mode: 'CREATE',
      destinationDir: path.dirname(filePath),
      destinationFile: outFile,
      component: {
        figmaNodeUrl: urlObj.toString(),
        normalizedName: normalizeComponentName(name),
        ...unconnectedComponentsMap[nodeId],
      },
      config: {},
    }

    const result = await createReactCodeConnect(payload)
    const { hasErrors } = handleMessages(result.messages)

    if (!hasErrors) {
      logger.info(success(`Created ${outFile}`))
    }
  }
}

function convertRemoteFileUrlToRelativePath({
  remoteFileUrl,
  gitRootPath,
  componentDirectory,
}: {
  remoteFileUrl: string
  gitRootPath: string
  componentDirectory: string
}) {
  if (!gitRootPath) {
    return null
  }
  const pathWithinRepo = remoteFileUrl.replace(new RegExp(`.*?(tree|blob)/[^/]*`), '')

  if (!pathWithinRepo) {
    return null
  }
  const absPath = path.join(gitRootPath, pathWithinRepo)

  return path.relative(componentDirectory, absPath)
}

async function getUnconnectedComponentsAndConnectedComponentMappings(
  cmd: BaseCommand,
  figmaFileUrl: string,
  componentsFromFile: FigmaRestApi.Component[],
  componentDirectory: string,
  projectInfo: ReactProjectInfo,
) {
  const dir = getDir(cmd)
  const fileKey = parseFileKey(figmaFileUrl)

  const codeConnectObjects = await getCodeConnectObjects(dir, cmd, projectInfo, true)

  const connectedNodeIdsInFileToCodeConnectObjectMap = codeConnectObjects.reduce(
    (map, codeConnectJson) => {
      const parsedNode = parseFigmaNode(cmd, codeConnectJson, true)

      if (parsedNode && parsedNode.fileKey === fileKey) {
        map[parsedNode.nodeId] = codeConnectJson
      }

      return map
    },
    {} as Record<string, CodeConnectJSON>,
  )

  const unconnectedComponents: FigmaRestApi.Component[] = []
  const connectedComponentsMappings: ConnectedComponentMappings = []

  const gitRootPath = getGitRepoAbsolutePath(componentDirectory)

  componentsFromFile.map((c) => {
    if (c.id in connectedNodeIdsInFileToCodeConnectObjectMap) {
      const cc = connectedNodeIdsInFileToCodeConnectObjectMap[c.id]
      const relativePath = convertRemoteFileUrlToRelativePath({
        remoteFileUrl: cc.source!,
        gitRootPath,
        componentDirectory,
      })
      connectedComponentsMappings.push({
        componentName: c.name,
        path: relativePath ?? '(Unknown file)',
      })
    } else {
      unconnectedComponents.push(c)
    }
  })

  return {
    unconnectedComponents,
    connectedComponentsMappings,
  }
}

async function askForTopLevelDirectoryOrDetermineFromConfig({
  dir,
  hasConfigFile,
  config,
}: {
  dir: string
  hasConfigFile: boolean
  config: CodeConnectConfig
}) {
  let dirToSearchForFiles = dir

  while (true) {
    if (!hasConfigFile) {
      const { componentDirectory } = await askQuestionOrExit({
        type: 'text',
        message: `Which top-level directory contains the code to be connected to your Figma design system? (Press ${chalk.green('enter')} to use current directory)`,
        name: 'componentDirectory',
        format: (val) => val || process.cwd(),
        validate: (value) => {
          if (!value) {
            return true
          }
          const isValidDir = fs.existsSync(value) && fs.lstatSync(value).isDirectory()

          if (!isValidDir) return 'Please enter a valid directory path.'
          return true
        },
      })
      dirToSearchForFiles = componentDirectory
    }

    const projectInfo = getReactProjectInfo(
      (await getProjectInfoFromConfig(dirToSearchForFiles, config)) as ReactProjectInfo,
    )

    const componentPaths = projectInfo.files
      .filter((f: string) => !isFigmaConnectFile(projectInfo.tsProgram, f))
      .map((filePath) => path.relative(dirToSearchForFiles, filePath))

    if (!componentPaths.length) {
      if (hasConfigFile) {
        logger.error(
          'No jsx/tsx files found. Please update the include/exclude globs in your config file and try again.',
        )
        exitWithFeedbackMessage(1)
      } else {
        logger.error(
          'No jsx/tsx files could be found in that directory. Please enter a different directory.',
        )
      }
    } else {
      return {
        projectInfo,
        dirToSearchForFiles,
        componentPaths,
      }
    }
  }
}

export async function runWizard(cmd: BaseCommand) {
  logger.info(
    boxen(
      `${chalk.bold(`Welcome to ${chalk.green('Code Connect')}`)}\n\n` +
        `Follow a few simple steps to connect your Figma design system to your codebase.\n` +
        `When you're done, you'll be able to see your component code while inspecting in\n` +
        `Figma's Dev Mode.\n\n` +
        `Learn more at ${chalk.cyan('https://www.figma.com/developers/code-connect')}.\n\n` +
        `Please raise bugs or feedback at ${chalk.cyan('https://github.com/figma/code-connect/issues')}.\n\n` +
        `${chalk.red.bold('Note: ')}This process will create and modify Code Connect files. Make sure you've\n` +
        `committed necessary changes in your codebase first.`,
      {
        padding: 1,
        margin: 1,
        textAlignment: 'center',
      },
    ),
  )

  const dir = getDir(cmd)
  const { hasConfigFile, config } = await parseOrDetermineConfig(dir, cmd.config)

  if (config.parser !== 'react' && config.parser !== '__unit_test__') {
    logger.error(
      'This flow currently only supports React projects. Please use one of the other commands.',
    )
    exitWithFeedbackMessage(1)
  }

  let accessToken = getAccessToken(cmd)

  if (!accessToken) {
    const { accessTokenEntered } = await askQuestionOrExit({
      type: 'text',
      message: `No access token detected. Visit https://help.figma.com/hc/en-us/articles/8085703771159-Manage-personal-access-tokens
      for instructions on how to do this, ensuring you have both the File Content and Code Connect Write scopes \n\n  Please enter your access token:`,
      name: 'accessTokenEntered',
      validate: (value) => !!value || 'Please enter an access token.',
    })
    accessToken = accessTokenEntered
  }

  logger.info('')

  const { dirToSearchForFiles, projectInfo, componentPaths } =
    await askForTopLevelDirectoryOrDetermineFromConfig({
      dir,
      hasConfigFile,
      config,
    })

  const { figmaFileUrl } = await askQuestionOrExit({
    type: 'text',
    message: 'What is the URL of the Figma file containing your design system library?',
    name: 'figmaFileUrl',
  })

  const componentsFromFile = await fetchTopLevelComponentsFromFile({
    accessToken,
    figmaUrl: figmaFileUrl,
  })

  if (!componentsFromFile) {
    exitWithFeedbackMessage(1)
  }

  if (!hasConfigFile) {
    const { createConfigFile } = await askQuestionOrExit({
      type: 'select',
      name: 'createConfigFile',
      message:
        "It looks like you don't have a Code Connect config file. Would you like to generate one now from your provided answers?",
      choices: [
        {
          title: 'Yes',
          value: 'yes',
        },
        {
          title: 'No',
          value: 'no',
        },
      ],
    })
    if (createConfigFile === 'yes') {
      await createCodeConnectConfig({ dir, dirToSearchForFiles, config })
    }
  }

  const linkedNodeIdsToPaths = {}

  const { unconnectedComponents, connectedComponentsMappings } =
    await getUnconnectedComponentsAndConnectedComponentMappings(
      cmd,
      figmaFileUrl,
      componentsFromFile,
      dirToSearchForFiles,
      projectInfo,
    )

  autoLinkComponents({
    unconnectedComponents,
    linkedNodeIdsToPaths,
    componentPaths,
  })

  logger.info(
    boxen(
      `${chalk.bold(`Connecting your components`)}\n\n` +
        `${chalk.green(
          `${chalk.bold(Object.keys(linkedNodeIdsToPaths).length)} ${Object.keys(linkedNodeIdsToPaths).length === 1 ? 'component was automatically matched based on its name' : 'components were automatically matched based on their names'}`,
        )}\n` +
        `${chalk.yellow(`${chalk.bold(unconnectedComponents.length)} ${unconnectedComponents.length === 1 ? 'component has not been matched' : 'components have not been matched'}`)}\n\n` +
        `Match up Figma components with their code definitions. When you're finished, you\n` +
        `can specify the directory you want to create Code Connect files in.`,
      {
        padding: 1,
        margin: 1,
        textAlignment: 'center',
      },
    ),
  )

  const outDir = await runManualLinkingWithConfirmation({
    unconnectedComponents,
    connectedComponentsMappings,
    linkedNodeIdsToPaths,
    componentPaths,
    cmd,
  })

  const unconnectedComponentsMap = unconnectedComponents.reduce(
    (map, component) => {
      map[component.id] = component
      return map
    },
    {} as Record<string, FigmaRestApi.Component>,
  )

  await createCodeConnectFiles({
    linkedNodeIdsToPaths,
    unconnectedComponentsMap,
    figmaFileUrl,
    outDir,
  })
}
