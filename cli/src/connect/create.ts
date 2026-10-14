import {
  exitWithFeedbackMessage,
  findComponentsInDocument,
  parseFileKey,
  parseNodeIds,
} from './helpers'
import fs from 'fs'
import { FigmaRestApi, getApiUrl, getHeaders } from './figma_rest_api'
import { exitWithError, logger } from '../common/logging'
import { ProjectInfo } from './project'
import { createTemplateCodeConnect } from './create_template'
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
      getApiUrl(figmaNodeUrl ?? '', cmd.apiUrl || projectInfo.config.apiUrl) +
      `/code_connect/${fileKey}/cli_data?ids=${nodeIds.join(',')}`

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

      const filename = createTemplateCodeConnect({
        component: componentPayload,
        normalizedName,
        destinationDir: outDir ?? process.env.INIT_CWD ?? process.cwd(),
        destinationFile: outFile,
      })

      logger.info('Code Connect file generated successfully:')
      logger.info(filename)
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
