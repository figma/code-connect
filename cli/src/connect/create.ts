import { findComponentsInDocument, parseFileKey, parseNodeIds } from './helpers'
import axios, { isAxiosError } from 'axios'
import fs from 'fs'
import { getApiUrl, getHeaders } from './figma_rest_api'
import { camelCase } from 'lodash'
import { exitWithError, logger } from '../common/logging'
import { callParser, handleMessages } from './parser_executables'
import { CodeConnectExecutableParserConfig, ProjectInfo } from './project'
import { createReactCodeConnect } from '../react/create'
import { z } from 'zod'
import { CreateRequestPayload, CreateResponsePayload } from './parser_executable_types'
import { fromError } from 'zod-validation-error'

interface GenerateDocsArgs {
  accessToken: string
  figmaNodeUrl: string
  outFile: string
  outDir: string
  projectInfo: ProjectInfo
}

function isBooleanKind(propValue: string) {
  const normalized = propValue.toLowerCase()
  return (
    normalized === 'true' ||
    normalized === 'false' ||
    normalized === 'yes' ||
    normalized === 'no' ||
    normalized === 'on' ||
    normalized === 'off'
  )
}

function normalizePropName(name: string) {
  return name.replace(/#[0-9:]*/g, '')
}

function generateCodePropName(name: string) {
  return camelCase(name.replace(/[^a-zA-Z]/g, ''))
}

function normalizePropValue(name: string) {
  // Convert the string to kebab-case
  return name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()
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
}: GenerateDocsArgs) {
  const fileKey = parseFileKey(figmaNodeUrl)
  const nodeIds = parseNodeIds([figmaNodeUrl])

  const apiUrl = getApiUrl(figmaNodeUrl ?? '') + `/files/${fileKey}?ids=${nodeIds.join(',')}`

  try {
    logger.info('Fetching component information from Figma...')
    const response = process.env.CODE_CONNECT_MOCK_CREATE_API_RESPONSE
      ? {
          status: 200,
          data: JSON.parse(
            fs.readFileSync(process.env.CODE_CONNECT_MOCK_CREATE_API_RESPONSE, 'utf-8'),
          ),
        }
      : await axios.get(apiUrl, {
          headers: getHeaders(accessToken),
        })

    if (response.status === 200) {
      logger.info('Parsing response')
      const component = findComponentsInDocument(response.data.document, nodeIds)[0]
      const normalizedName = normalizeComponentName(component.name)

      const payload: CreateRequestPayload = {
        mode: 'CREATE',
        destinationDir: outDir ?? process.env.INIT_CWD ?? process.cwd(),
        destinationFile: outFile,
        component: {
          figmaNodeUrl,
          id: component.id,
          name: component.name,
          normalizedName,
          type: component.type,
          componentPropertyDefinitions: component.componentPropertyDefinitions,
        },
        config: projectInfo.config,
      }

      logger.info('Generating Code Connect files...')

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
      }

      logger.info('Code Connect files generated successfully:')
      result.createdFiles.forEach((file) => {
        logger.info(`${file.filePath}`)
      })
    } else {
      logger.error(`Failed to get node information from Figma with status: ${response.status}`)
      logger.debug('Failed to get node information from Figma with Body:', response.data)
    }
  } catch (err) {
    if (isAxiosError(err)) {
      if (err.response) {
        logger.error(
          `Failed to get node data from Figma (${err.code}): ${err.response?.status} ${err.response?.data?.err ?? err.response?.data?.message}`,
        )
      } else {
        logger.error(`Failed to get node data from Figma: ${err.message}`)
      }
      logger.debug(JSON.stringify(err.response?.data))
    } else {
      logger.error(`Failed to create: ${err}`)
    }
    process.exit(1)
  }
}
