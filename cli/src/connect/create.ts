import {
  exitWithFeedbackMessage,
  findComponentsInDocument,
  parseFileKey,
  parseNodeIds,
} from './helpers'
import fs from 'fs'
import { FigmaRestApi, getApiUrl, getHeaders } from './figma_rest_api'
import { exitWithError, logger } from '../common/logging'
import { callParser, handleMessages } from './parser_executables'
import { CodeConnectExecutableParserConfig, ProjectInfo } from './project'
import { createReactCodeConnect } from '../react/create'
import { z } from 'zod'
import {
  CreateRequestPayload,
  CreateRequestPayloadMulti,
  CreateResponsePayload,
} from './parser_executable_types'
import { fromError } from 'zod-validation-error'
import { createHtmlCodeConnect } from '../html/create'
import { isFetchError, request } from '../common/fetch'
import { BaseCommand } from '../commands/connect'

interface GenerateDocsArgs {
  accessToken: string
  figmaNodeUrl: string
  outFile: string
  outDir: string
  projectInfo: ProjectInfo
  cmd: BaseCommand
}

export function normalizeComponentName(name: string) {
  // Convert the string to PascalCase and ensure first character is not a digit
  return name
    .replace(/[^a-zA-Z0-9]/g, ' ')
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')
    .replace(/^[0-9]/, '_$&')
}

export async function createCodeConnectFromUrl({
  accessToken,
  figmaNodeUrl,
  outFile,
  outDir,
  projectInfo,
  cmd,
}: GenerateDocsArgs) {
  try {
    const fileKey = parseFileKey(figmaNodeUrl)
    const nodeIds = parseNodeIds([figmaNodeUrl])

    const apiUrl =
      getApiUrl(figmaNodeUrl ?? '') + `/code_connect/${fileKey}/cli_data?ids=${nodeIds.join(',')}`

    if (nodeIds.length === 0) {
      exitWithError(
        `Invalid figma node URL: the provided url "${figmaNodeUrl}" does not contain a node-id`,
      )
    } else if (nodeIds.length > 1) {
      exitWithError(
        `Invalid figma node URL: the provided url "${figmaNodeUrl}" contains more than one node-id`,
      )
    }

    logger.info('Fetching component information from Figma...')
    const response = process.env.CODE_CONNECT_MOCK_CREATE_API_RESPONSE
      ? {
          response: { status: 200 },
          data: JSON.parse(
            fs.readFileSync(process.env.CODE_CONNECT_MOCK_CREATE_API_RESPONSE, 'utf-8'),
          ) as { document: FigmaRestApi.Node },
        }
      : await request.get<{ document: FigmaRestApi.Node }>(apiUrl, {
          headers: getHeaders(accessToken),
        })

    if (response.response.status === 200) {
      logger.info('Parsing response')
      const component = findComponentsInDocument(response.data.document, nodeIds)[0]
      if (component === undefined) {
        exitWithError('Could not find a component in the provided URL')
      }
      const normalizedName = normalizeComponentName(component.name)

      const componentPayload = {
        figmaNodeUrl,
        id: component.id,
        name: component.name,
        normalizedName,
        type: component.type,
        componentPropertyDefinitions: component.componentPropertyDefinitions,
      }

      logger.info('Generating Code Connect files...')

      let result: z.infer<typeof CreateResponsePayload>

      if (projectInfo.config.parser === 'react') {
        const payload: CreateRequestPayloadMulti = {
          mode: 'CREATE',
          destinationDir: outDir ?? process.env.INIT_CWD ?? process.cwd(),
          destinationFile: outFile,
          normalizedName,
          figmaConnections: [{ component: componentPayload }],
          config: projectInfo.config,
        }
        result = await createReactCodeConnect(payload)
      } else if (projectInfo.config.parser === 'html') {
        const payload: CreateRequestPayloadMulti = {
          mode: 'CREATE',
          destinationDir: outDir ?? process.env.INIT_CWD ?? process.cwd(),
          destinationFile: outFile,
          normalizedName,
          figmaConnections: [{ component: componentPayload }],
          config: projectInfo.config,
        }
        result = await createHtmlCodeConnect(payload)
      } else {
        try {
          const payload: CreateRequestPayload = {
            mode: 'CREATE',
            destinationDir: outDir ?? process.env.INIT_CWD ?? process.cwd(),
            destinationFile: outFile,
            component: componentPayload,
            config: projectInfo.config,
            verbose: cmd.verbose,
          }
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
      }

      logger.info('Code Connect files generated successfully:')
      result.createdFiles.forEach((file) => {
        logger.info(`${file.filePath}`)
      })
    } else {
      logger.error(
        `Failed to get node information from Figma with status: ${response.response.status}`,
      )
      logger.debug('Failed to get node information from Figma with Body:', response.data)
    }
  } catch (err) {
    if (isFetchError(err)) {
      if (err.response) {
        logger.error(
          `Failed to get node data from Figma (${err.response.status}): ${err.response.status} ${err.data?.err ?? err.data?.message}`,
        )
      } else {
        logger.error(`Failed to get node data from Figma: ${err.message}`)
      }
      logger.debug(JSON.stringify(err.data))
    } else {
      logger.error(`Failed to create: ${err}`)
    }
    exitWithFeedbackMessage(1)
  }
}
