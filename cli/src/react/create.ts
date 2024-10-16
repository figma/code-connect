import { camelCase } from 'lodash'
import * as prettier from 'prettier'
import fs from 'fs'
import z from 'zod'
import {
  ComponentPropertyDefinition,
  CreateRequestPayload,
  CreateResponsePayload,
  PropMapping,
} from '../connect/parser_executable_types'
import path from 'path'
import { normalizeComponentName } from '../connect/create'
import { Intrinsic, IntrinsicKind, ValueMappingKind } from '../connect/intrinsics'
import { getOutFileName } from '../connect/create_common'
import { ComponentTypeSignature } from './parser'

export function isBooleanKind(propValue: string) {
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
  const cleanedName = name
    // Remove any #node:id from the end of the string
    .replace(/#[0-9:]+$/g, '')
    // Remove any special characters
    .replace(/[^a-zA-Z0-9\s]/g, '')

  return camelCase(cleanedName)
}

function normalizePropValue(name: string) {
  // Convert the string to kebab-case
  return name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()
}

function generateExpressionValueMappingKind(valueMappingKind: ValueMappingKind) {
  if (valueMappingKind && typeof valueMappingKind === 'object' && 'kind' in valueMappingKind) {
    return generateExpressionFromIntrinsic(valueMappingKind)
  }
  if (typeof valueMappingKind === 'string') {
    return `"${valueMappingKind}"`
  }
  if (
    typeof valueMappingKind === 'number' ||
    typeof valueMappingKind === 'boolean' ||
    typeof valueMappingKind === 'undefined'
  ) {
    return `${valueMappingKind}`
  }
}

function generateExpressionValueMapping(valueMapping: Record<string, ValueMappingKind>) {
  return `{
  ${Object.entries(valueMapping)
    .map(([k, v]) => `"${k}": ${generateExpressionValueMappingKind(v)}`)
    .join(`,\n`)}
}`
}

// Not an exhaustive list of intrinsics but can add others as/when they're supported in prop mapping gen
export function generateExpressionFromIntrinsic({ kind, args }: Intrinsic): string | never {
  if (kind === IntrinsicKind.String) {
    return `figma.string("${args.figmaPropName}")`
  }
  if (kind === IntrinsicKind.Boolean) {
    return `figma.boolean("${args.figmaPropName}"${args.valueMapping ? `, ${generateExpressionValueMapping(args.valueMapping)}` : ''})`
  }
  if (kind === IntrinsicKind.Enum) {
    return `figma.enum("${args.figmaPropName}"${args.valueMapping ? `, ${generateExpressionValueMapping(args.valueMapping)}` : ''})`
  }
  if (kind === IntrinsicKind.Instance) {
    return `figma.instance("${args.figmaPropName}")`
  }
  if (kind === IntrinsicKind.Children) {
    return `figma.children(${args.layers.length > 1 ? `[${args.layers.map((layer) => `"${layer}"`).join(', ')}]` : `"${args.layers[0]}"`})`
  }
  if (kind === IntrinsicKind.TextContent) {
    return `figma.textContent("${args.layer}")`
  }
  // should never reach here as we create prop mappings.
  throw new Error(`kind ${kind} not supported for prop mapping`)
}

function generateSinglePropMappingFromFigmaProp(
  propName: string,
  propDef: ComponentPropertyDefinition,
) {
  const codePropName = generateCodePropName(propName)
  const figmaPropName = normalizePropName(propName)
  if (propDef.type === 'BOOLEAN') {
    return `"${codePropName}": figma.boolean('${figmaPropName}')`
  }
  if (propDef.type === 'TEXT') {
    return `"${codePropName}": figma.string('${figmaPropName}')`
  }
  if (propDef.type === 'VARIANT') {
    const isBooleanVariant =
      propDef.variantOptions?.length === 2 && propDef.variantOptions.every(isBooleanKind)
    if (isBooleanVariant) {
      return `"${codePropName}": figma.boolean('${figmaPropName}')`
    } else {
      return `"${codePropName}": figma.enum('${figmaPropName}', { \n${propDef.variantOptions
        ?.map((value) => `  "${value}": "${normalizePropValue(value)}"`)
        .join(',\n')}\n})`
    }
  }
  if (propDef.type === 'INSTANCE_SWAP') {
    return `"${codePropName}": figma.instance('${figmaPropName}')`
  }

  return null
}

export function getSetOfAllPropsReferencedInPropMapping(obj: Object) {
  const mappedProps: string[] = []
  Object.entries(obj).forEach(([k, v]) => {
    if (k === 'figmaPropName') {
      mappedProps.push(v)
    }
    if (typeof v === 'object') {
      mappedProps.push(...getSetOfAllPropsReferencedInPropMapping(v))
    }
  })
  return new Set(mappedProps)
}

function generatePropsFromMapping(
  component: CreateRequestPayload['component'],
  propMapping: PropMapping,
) {
  const mappedProps: string[] = []
  const unmappedProps: string[] = []

  for (const [propName, intrinsic] of Object.entries(propMapping)) {
    const expr = generateExpressionFromIntrinsic(intrinsic)
    if (expr) {
      mappedProps.push(`"${propName}": ${expr}`)
    }
  }

  const usedFigmaPropsSet = getSetOfAllPropsReferencedInPropMapping(propMapping)
  for (const [propName, propDef] of Object.entries(component.componentPropertyDefinitions || {})) {
    if (!usedFigmaPropsSet.has(propName)) {
      const propMapping = generateSinglePropMappingFromFigmaProp(propName, propDef)
      if (propMapping) {
        unmappedProps.push(propMapping)
      }
    }
  }

  return `{
${
  mappedProps.length
    ? `// These props were automatically mapped based on your linked code:
  ${mappedProps.join(',\n')},`
    : ''
}
  ${
    unmappedProps.length
      ? `// No matching props could be found for these Figma properties:
  ${unmappedProps
    .map((prop) => {
      // Comment out to make clear these are suggested. Singly-commented out lines for ease of uncommenting
      return `// ${prop.replace(/\n/g, '\n// ')}`
    })
    .join(',\n')}`
      : ''
  }
  }`
}

export function generateProps(component: CreateRequestPayload['component']) {
  const props: string[] = []
  if (
    !component.componentPropertyDefinitions ||
    Object.keys(component.componentPropertyDefinitions).length === 0
  ) {
    return `{}`
  }

  for (const [propName, propDef] of Object.entries(component.componentPropertyDefinitions)) {
    const propMapping = generateSinglePropMappingFromFigmaProp(propName, propDef)
    if (propMapping) {
      props.push(propMapping)
    }
  }
  return `{
  ${props.join(',\n  ')}
}`
}

function generateExample(
  component: string,
  signature?: ComponentTypeSignature,
  propMapping?: PropMapping,
) {
  if (!signature) {
    return `<${component} />`
  }
  const props = Object.entries(signature)
    .map(([propName, propDef]) => {
      // Children are rendered inside of the example body rather than in a prop
      if (propName === 'children') {
        return null
      } else if (propMapping && propMapping[propName]) {
        return `${propName}={props.${propName}}`
      } else if (!propDef.startsWith('?')) {
        return `${propName}={/* TODO */} `
      } else {
        return null
      }
    })
    .filter(Boolean)
    .join('\n')

  // const childProp = propMapping?['children'] ? `{props.${propMapping['children']}}` : null

  // Nest child props inside of the element
  if (signature['children'] && propMapping?.['children']) {
    return `<${component}
  ${props}>
  {props.children}
  </${component}>`
  } else {
    return `<${component}
  ${props}/>`
  }
}

// returns ES-style import path from given system path
function formatImportPath(systemPath: string) {
  // use forward slashes for import paths
  let formattedImportPath = systemPath.replaceAll(path.sep, '/')

  // prefix current dir paths with ./ (node path does not)
  if (!formattedImportPath.startsWith('.')) {
    formattedImportPath = `./${formattedImportPath}`
  }

  // assume not using ESM imports
  return formattedImportPath.replace(/\.(jsx|tsx)$/, '')
}

function getImportsPath({
  codeConnectFilePath,
  sourceFilepath,
  normalizedName,
}: {
  codeConnectFilePath: string
  sourceFilepath?: string
  normalizedName: string
}) {
  if (!sourceFilepath) {
    return `./${normalizedName}`
  }
  const codeConnectFolder = path.dirname(codeConnectFilePath)
  const pathToComponentFile = path.relative(codeConnectFolder, sourceFilepath)

  return formatImportPath(pathToComponentFile)
}

export async function createReactCodeConnect(
  payload: CreateRequestPayload,
): Promise<z.infer<typeof CreateResponsePayload>> {
  const { component, destinationFile, destinationDir, sourceFilepath, sourceExport, propMapping } =
    payload
  const { normalizedName, figmaNodeUrl } = component

  const sourceFilename = sourceFilepath
    ? path.parse(sourceFilepath).name.split('.')[0]
    : normalizedName

  const filePath = getOutFileName({
    outFile: destinationFile,
    outDir: destinationDir,
    sourceFilename,
    extension: 'tsx',
  })

  const importsPath = getImportsPath({
    codeConnectFilePath: filePath,
    sourceFilepath,
    normalizedName,
  })

  const hasAnyMappedProps = propMapping && Object.keys(propMapping).length > 0

  const importName =
    sourceFilepath && sourceExport
      ? sourceExport === 'default'
        ? normalizeComponentName(sourceFilename)
        : sourceExport
      : normalizedName

  let comment = ''

  if (propMapping && hasAnyMappedProps) {
    comment = `
 * \`props\` includes a mapping from your code props to Figma properties.
 * You should check this is correct, and update the \`example\` function
 * to return the code example you'd like to see in Figma`
  } else if (propMapping && !hasAnyMappedProps) {
    comment = `
 * None of your props could be automatically mapped to Figma properties.
 * You should update the \`props\` object to include a mapping from your
 * code props to Figma properties, and update the \`example\` function to
 * return the code example you'd like to see in Figma`
  } else {
    comment = `
 * \`props\` includes a mapping from Figma properties and variants to
 * suggested values. You should update this to match the props of your
 * code component, and update the \`example\` function to return the
 * code example you'd like to see in Figma`
  }

  const codeConnect = `
import React from 'react'
import ${sourceExport === 'default' ? importName : `{ ${importName} }`} from '${importsPath}'
import figma from '@figma/code-connect'

/**
 * -- This file was auto-generated by Code Connect --${comment}
 */

figma.connect(${importName}, "${figmaNodeUrl}", {
  props: ${propMapping ? generatePropsFromMapping(component, propMapping) : generateProps(component)},
  example: (props) => ${generateExample(importName, payload.reactTypeSignature, propMapping)},
})
`
  let formatted = prettier.format(codeConnect, {
    parser: 'typescript',
    semi: false,
    trailingComma: 'all',
  })

  if (fs.existsSync(filePath)) {
    return {
      createdFiles: [],
      messages: [{ message: `File ${filePath} already exists, skipping creation`, level: 'ERROR' }],
    }
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, formatted)

  return { createdFiles: [{ filePath }], messages: [] }
}
