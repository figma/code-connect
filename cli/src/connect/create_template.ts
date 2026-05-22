import camelCase from 'just-camel-case'
import fs from 'fs'
import {
  type ComponentPropertyDefinition,
  type FigmaConnectionComponent,
} from './parser_executable_types'
import path from 'path'
import { getOutFileName } from './create_common'
import {
  exitWithFeedbackMessage,
  findComponentsInDocument,
  parseFileKey,
  parseNodeIds,
} from './helpers'
import { FigmaRestApi, getApiUrl, getHeaders } from './figma_rest_api'
import { exitWithError, logger } from '../common/logging'
import { ProjectInfo } from './project'
import { isFetchError, request } from '../common/fetch'
import { BaseCommand } from '../commands/connect_template'

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
      logger.info(`${filename}`)
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

interface CreateTemplateArgs {
  component: FigmaConnectionComponent
  normalizedName: string
  destinationDir: string
  destinationFile: string | undefined
}

function normalizePropName(name: string) {
  return name.replace(/#[0-9:]*/g, '')
}

function normalizePropValue(name: string) {
  return name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()
}

function generateCodePropName(name: string) {
  return camelCase(name.replace(/#[0-9:]+$/g, '').replace(/[^a-zA-Z0-9\s]/g, ''))
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

function isValidIdentifier(name: string): boolean {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name)
}

function generatePropDeclaration(
  propName: string,
  propDef: ComponentPropertyDefinition,
): string | null {
  const codePropName = generateCodePropName(propName)
  const figmaPropName = normalizePropName(propName)

  if (propDef.type === 'BOOLEAN') {
    return `const ${codePropName} = figma.selectedInstance.getBoolean("${figmaPropName}")`
  }
  if (propDef.type === 'TEXT') {
    return `const ${codePropName} = figma.selectedInstance.getString("${figmaPropName}")`
  }
  if (propDef.type === 'VARIANT') {
    const isBooleanVariant =
      propDef.variantOptions?.length === 2 && propDef.variantOptions.every(isBooleanKind)
    if (isBooleanVariant) {
      return `const ${codePropName} = figma.selectedInstance.getBoolean("${figmaPropName}")`
    } else {
      const options = (propDef.variantOptions || [])
        .map((v) => {
          const key = isValidIdentifier(v) ? v : `"${v}"`
          return `  ${key}: "${normalizePropValue(v)}"`
        })
        .join(',\n')
      return `const ${codePropName} = figma.selectedInstance.getEnum("${figmaPropName}", {\n${options},\n})`
    }
  }
  return null
}

function generateTemplateBody(component: FigmaConnectionComponent) {
  const defs = component.componentPropertyDefinitions || {}

  const declarations: string[] = []

  for (const [propName, propDef] of Object.entries(defs)) {
    const decl = generatePropDeclaration(propName, propDef)
    if (decl) {
      declarations.push(decl)
    }
  }

  return {
    declarations: declarations.join('\n'),
  }
}

export function createTemplateCodeConnect(args: CreateTemplateArgs): string {
  const { component, normalizedName, destinationDir, destinationFile } = args

  const filePath = getOutFileName({
    outFile: destinationFile,
    outDir: destinationDir,
    sourceFilename: normalizedName,
    extension: 'ts',
  })

  const { declarations } = generateTemplateBody(component)

  const codeConnect = [
    `// url=${component.figmaNodeUrl}`,
    `import figma from "figma"`,
    '',
    `/**`,
    ` * NEXT STEPS:`,
    ` * - Replace the \`example\` with the actual code snippet you want to show`,
    ` *   (e.g. figma.code\`<Button label="\${propertyValue}" />\`)`,
    ` * - Update the \`imports\` array with any lines of code that should be displayed`,
    ` *   at the top (e.g. imports: ['import { Button } from "./Button"'])`,
    ` */`,
    '',
    declarations || null,
    declarations ? '' : null,
    `export default {`,
    `  example: figma.code\`\`,`,
    `  imports: [],`,
    `  id: "${normalizedName}",`,
    `  metadata: {`,
    `    nestable: true,`,
    `  },`,
    `}`,
    '',
  ]
    .filter((line) => line !== null)
    .join('\n')

  if (fs.existsSync(filePath)) {
    exitWithError(`File ${filePath} already exists, skipping creation`)
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, codeConnect)

  return filePath
}
