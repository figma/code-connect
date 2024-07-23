import { BaseCommand, getAccessToken, getCodeConnectObjects, getDir } from '../../commands/connect'
import prompts from 'prompts'
import fs from 'fs'
import { exitWithFeedbackMessage, findComponentsInDocument, parseFileKey } from '../helpers'
import { FigmaRestApi, getApiUrl } from '../figma_rest_api'
import { exitWithError, logger, success, warn } from '../../common/logging'
import axios, { isAxiosError } from 'axios'
import {
  ReactProjectInfo,
  getReactProjectInfo,
  getGitRepoAbsolutePath,
  parseOrDetermineConfig,
  getProjectInfoFromConfig,
  CodeConnectConfig,
  ProjectInfo,
  CodeConnectExecutableParserConfig,
} from '../../connect/project'
import { parseFigmaNode } from '../validation'
import chalk from 'chalk'
import path from 'path'
import { CreateRequestPayload, CreateResponsePayload } from '../parser_executable_types'
import { normalizeComponentName } from '../create'
import { createReactCodeConnect } from '../../react/create'
import { CodeConnectJSON } from '../../common/figma_connect'
import boxen from 'boxen'
import { isFigmaConnectFile } from '../../react/parser'
import { createCodeConnectConfig, getIncludesGlob } from './helpers'
import stripAnsi from 'strip-ansi'
import { callParser, handleMessages } from '../parser_executables'
import ora from 'ora'
import { z } from 'zod'
import { fromError } from 'zod-validation-error'
import { autoLinkComponents } from './autolinking'

type ConnectedComponentMappings = { componentName: string; path: string }[]

const NONE = '(None)'
const DELIMITERS_REGEX = /[\s-_]/g

function clearQuestion(prompt: prompts.PromptObject<string>, answer: string) {
  const displayedAnswer =
    (Array.isArray(prompt.choices) && prompt.choices.find((c) => c.value === answer)?.title) ||
    answer
  const lengthOfDisplayedQuestion =
    stripAnsi(prompt.message as string).length + stripAnsi(displayedAnswer).length + 5 // 2 chars before, 3 chars between Q + A
  const rowsToRemove = Math.ceil(lengthOfDisplayedQuestion / process.stdout.columns)

  process.stdout.moveCursor(0, -rowsToRemove)
  process.stdout.clearScreenDown()
}

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
    const spinner = ora({
      text: 'Fetching component information from Figma...',
      color: 'green',
    }).start()
    const response = await (
      process.env.CODE_CONNECT_MOCK_DOC_RESPONSE
        ? Promise.resolve({
            status: 200,
            data: JSON.parse(fs.readFileSync(process.env.CODE_CONNECT_MOCK_DOC_RESPONSE, 'utf-8')),
          })
        : axios.get(apiUrl, {
            headers: {
              'X-Figma-Token': accessToken,
              'Content-Type': 'application/json',
            },
          })
    ).finally(() => {
      spinner.stop()
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
          `Failed to fetch components from Figma (${err.code}): ${err.response?.status} ${
            err.response?.data?.err ?? err.response?.data?.message
          }`,
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

function formatComponentTitle(componentName: string, path: string | null, pad: number) {
  const nameLabel = `${chalk.dim('Figma component:')} ${componentName.padEnd(pad, ' ')}`
  const linkedLabel = `↔️ ${path ?? '-'}`
  return `${nameLabel}  ${linkedLabel}`
}

export function getComponentChoicesForPrompt(
  components: FigmaRestApi.Component[],
  linkedNodeIdsToPaths: Record<string, string>,
  connectedComponentsMappings: ConnectedComponentMappings,
  dir: string,
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

  const formatComponentChoice = (c: FigmaRestApi.Component) => {
    const componentPath = linkedNodeIdsToPaths[c.id]
      ? path.relative(dir, linkedNodeIdsToPaths[c.id])
      : null
    return {
      title: formatComponentTitle(c.name, componentPath, longestNameLength),
      value: c.id,
      description: `${chalk.green('Edit link')}`,
    }
  }

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

function getUnconnectedComponentChoices(componentPaths: string[], dir: string) {
  return [
    {
      title: NONE,
      value: NONE,
    },
    ...componentPaths.map((absPath) => {
      return {
        title: path.relative(dir, absPath),
        value: absPath,
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
  cmd,
}: ManualLinkingArgs) {
  const dir = getDir(cmd)
  while (true) {
    // Don't show exit confirmation as we're relying on esc behavior
    const { nodeId } = await prompts(
      {
        type: 'select',
        name: 'nodeId',
        message: `Select a link to edit (Press ${chalk.green(
          'esc',
        )} when you're ready to continue on)`,
        choices: getComponentChoicesForPrompt(
          unconnectedComponents,
          linkedNodeIdsToPaths,
          connectedComponentsMappings,
          dir,
        ),
        warn: 'This component already has a local Code Connect file.',
        hint: ' ',
      },
      {
        onSubmit: clearQuestion,
      },
    )
    if (!nodeId) {
      return
    }
    const pathChoices = getUnconnectedComponentChoices(componentPaths, dir)
    const { pathToComponent } = await prompts(
      {
        type: 'autocomplete',
        name: 'pathToComponent',
        message: 'Choose a path to your code component (type to filter results)',
        choices: pathChoices,
        // default suggest uses .startsWith(input) which isn't very useful for full paths
        suggest: (input, choices) =>
          Promise.resolve(
            choices.filter((i) => i.value.toUpperCase().includes(input.toUpperCase())),
          ),
        // preselect if editing an existing choice
        initial:
          nodeId in linkedNodeIdsToPaths
            ? pathChoices.findIndex(({ value }) => value === linkedNodeIdsToPaths[nodeId])
            : 0,
      },
      {
        onSubmit: clearQuestion,
      },
    )
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
        message: `What directory should Code Connect files be created in? (Press ${chalk.green(
          'enter',
        )} to co-locate your files alongside your component files)`,
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
        message: `You're ready to create ${chalk.green(linkedNodes.length)} Code Connect file${
          linkedNodes.length == 1 ? '' : 's'
        }. Continue?`,
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
  projectInfo,
}: {
  figmaFileUrl: string
  linkedNodeIdsToPaths: Record<string, string>
  unconnectedComponentsMap: Record<string, FigmaRestApi.Component>
  outDir: string | null
  projectInfo: ProjectInfo
}) {
  for (const [nodeId, filePath] of Object.entries(linkedNodeIdsToPaths)) {
    const urlObj = new URL(figmaFileUrl)
    urlObj.search = ''
    urlObj.searchParams.append('node-id', nodeId)

    const { name } = path.parse(filePath)
    const componentName = name.split('.')[0]

    const outDir = outDirArg || path.dirname(filePath)

    const payload: CreateRequestPayload = {
      mode: 'CREATE',
      destinationDir: outDir,
      component: {
        figmaNodeUrl: urlObj.toString(),
        normalizedName: normalizeComponentName(name),
        ...unconnectedComponentsMap[nodeId],
      },
      config: projectInfo.config,
    }

    let result: z.infer<typeof CreateResponsePayload>

    if (projectInfo.config.parser === 'react') {
      result = await createReactCodeConnect(payload)
    } else {
      try {
        const stdout = await callParser(
          // We use `as` because the React parser makes the types difficult
          // TODO remove once React is an executable parser
          projectInfo.config as CodeConnectExecutableParserConfig,
          payload,
          projectInfo.absPath,
        )

        result = CreateResponsePayload.parse(stdout)
      } catch (e) {
        throw fromError(e)
      }
    }

    const { hasErrors } = handleMessages(result.messages)

    if (hasErrors) {
      exitWithError('Errors encountered calling parser, exiting')
    } else {
      result.createdFiles.forEach((file) => {
        logger.info(success(`Created ${file.filePath}`))
      })
    }
  }
}

export function convertRemoteFileUrlToRelativePath({
  remoteFileUrl,
  gitRootPath,
  dir,
}: {
  remoteFileUrl: string
  gitRootPath: string
  dir: string
}) {
  if (!gitRootPath) {
    return null
  }
  const pathWithinRepo = remoteFileUrl.replace(new RegExp(`.*?(tree|blob)/[^/]*`), '')

  if (!pathWithinRepo) {
    return null
  }
  const absPath = path.join(gitRootPath, pathWithinRepo)

  return path.relative(dir, absPath)
}

export async function getUnconnectedComponentsAndConnectedComponentMappings(
  cmd: BaseCommand,
  figmaFileUrl: string,
  componentsFromFile: FigmaRestApi.Component[],
  projectInfo: ProjectInfo<CodeConnectConfig> | ReactProjectInfo,
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

  const gitRootPath = getGitRepoAbsolutePath(dir)

  componentsFromFile.map((c) => {
    if (c.id in connectedNodeIdsInFileToCodeConnectObjectMap) {
      const cc = connectedNodeIdsInFileToCodeConnectObjectMap[c.id]
      const relativePath = convertRemoteFileUrlToRelativePath({
        remoteFileUrl: cc.source!,
        gitRootPath,
        dir,
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
  let componentDirectory: string | null = null

  while (true) {
    if (!hasConfigFile) {
      const { componentDirectory: componentDirectoryAnswer } = await askQuestionOrExit({
        type: 'text',
        message: `Which top-level directory contains the code to be connected to your Figma design system? (Press ${chalk.green(
          'enter',
        )} to use current directory)`,
        name: 'componentDirectory',
        format: (val) => val || process.cwd(), // should this be || dir?
        validate: (value) => {
          if (!value) {
            return true
          }
          const isValidDir = fs.existsSync(value) && fs.lstatSync(value).isDirectory()

          if (!isValidDir) return 'Please enter a valid directory path.'
          return true
        },
      })
      componentDirectory = componentDirectoryAnswer
    }

    const configToUse: CodeConnectConfig = componentDirectory
      ? {
          ...config,
          include: getIncludesGlob({
            dir,
            componentDirectory,
            config,
          }),
        }
      : config

    const spinner = ora({
      text: 'Parsing local files...',
      color: 'green',
      spinner: {
        // Don't show spinner as ts.createProgram blocks thread
        frames: [''],
      },
    }).start()

    let projectInfo = await getProjectInfoFromConfig(dir, configToUse)
    let componentPaths = projectInfo.files

    if (projectInfo.config.parser === 'react') {
      projectInfo = getReactProjectInfo(projectInfo as ReactProjectInfo)
      // TODO can we do similar filtering for non-react?
      componentPaths = componentPaths.filter(
        (f: string) => !isFigmaConnectFile((projectInfo as ReactProjectInfo).tsProgram, f),
      )
    }
    spinner.stop()

    if (!componentPaths.length) {
      if (hasConfigFile) {
        logger.error(
          'No files found. Please update the include/exclude globs in your config file and try again.',
        )
        exitWithFeedbackMessage(1)
      } else {
        logger.error(
          'No files for your project type could be found in that directory. Please enter a different directory.',
        )
      }
    } else {
      return {
        projectInfo,
        componentDirectory,
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
        `Please raise bugs or feedback at ${chalk.cyan(
          'https://github.com/figma/code-connect/issues',
        )}.\n\n` +
        `${chalk.red.bold(
          'Note: ',
        )}This process will create and modify Code Connect files. Make sure you've\n` +
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

  const { componentDirectory, projectInfo, componentPaths } =
    await askForTopLevelDirectoryOrDetermineFromConfig({
      dir,
      hasConfigFile,
      config,
    })

  const { figmaFileUrl } = await askQuestionOrExit({
    type: 'text',
    message: 'What is the URL of the Figma file containing your design system library?',
    name: 'figmaFileUrl',
    validate: (value: string) => !!parseFileKey(value) || 'Please enter a valid Figma file URL.',
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
      await createCodeConnectConfig({ dir, componentDirectory, config })
    }
  }

  const linkedNodeIdsToPaths = {}

  const { unconnectedComponents, connectedComponentsMappings } =
    await getUnconnectedComponentsAndConnectedComponentMappings(
      cmd,
      figmaFileUrl,
      componentsFromFile,
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
          `${chalk.bold(Object.keys(linkedNodeIdsToPaths).length)} ${
            Object.keys(linkedNodeIdsToPaths).length === 1
              ? 'component was automatically matched based on its name'
              : 'components were automatically matched based on their names'
          }`,
        )}\n` +
        `${chalk.yellow(
          `${chalk.bold(unconnectedComponents.length)} ${
            unconnectedComponents.length === 1
              ? 'component has not been matched'
              : 'components have not been matched'
          }`,
        )}\n\n` +
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
    projectInfo,
  })
}
