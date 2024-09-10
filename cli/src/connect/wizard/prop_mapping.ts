import { ReactProjectInfo } from '../project'
import { ComponentTypeSignature } from '../../react/parser'
import { FigmaRestApi } from '../figma_rest_api'
import { PropMapping } from '../parser_executable_types'
import { Searcher } from 'fast-fuzzy'
import { BaseCommand } from '../../commands/connect'
import { logger } from '../../common/logging'
import { Intrinsic, IntrinsicKind, ValueMapping, ValueMappingKind } from '../../connect/intrinsics'
import { extractSignature } from './signature_extraction'
import { isBooleanKind } from '../../react/create'

/**
 * Used when we should output a placeholder for an unknown value in prop mapping.
 */
export const PROPERTY_PLACEHOLDER = 'PROPERTY_PLACEHOLDER'

const PROP_MINIMUM_MATCH_THRESHOLD = 0.8

export function generateValueMapping(
  propSignature: string,
  figmaPropDef: FigmaRestApi.ComponentPropertyDefinition,
): ValueMapping {
  const codeEnumOptions = propSignature.split(' | ').map((str) => str.substring(1, str.length - 1)) // remove quote marks
  const searcher = new Searcher(figmaPropDef.variantOptions)
  return codeEnumOptions.reduce((valueMapping, codeEnumValue) => {
    const results = searcher.search(codeEnumValue, { returnMatchData: true })
    if (results.length && results[0].score > 0.5) {
      valueMapping[results[0].item] = codeEnumValue
    }
    return valueMapping
  }, {} as ValueMapping)
}

/**
 * Attempts to create a mapping between a code prop and figma prop.
 * These props have been matched by name and aren't guaranteed to
 * actually be related, so we return null if no suitable mapping
 */
function generateIntrinsic({
  propSignature: propSignatureWithOptionalModifier,
  figmaPropName,
  figmaPropDef,
}: {
  propSignature: string
  figmaPropName: string
  figmaPropDef: FigmaRestApi.ComponentPropertyDefinition
}): Intrinsic | null {
  const propSignature = propSignatureWithOptionalModifier.startsWith('?')
    ? propSignatureWithOptionalModifier.substring(1)
    : propSignatureWithOptionalModifier
  if (propSignature === 'string' && figmaPropDef.type === FigmaRestApi.ComponentPropertyType.Text) {
    return {
      kind: IntrinsicKind.String,
      args: {
        figmaPropName,
      },
    }
  }
  if (
    propSignature === 'false | true' &&
    (figmaPropDef.type === FigmaRestApi.ComponentPropertyType.Boolean ||
      (figmaPropDef.type === FigmaRestApi.ComponentPropertyType.Variant &&
        figmaPropDef.variantOptions?.length === 2 &&
        figmaPropDef.variantOptions?.every(isBooleanKind)))
  ) {
    return {
      kind: IntrinsicKind.Boolean,
      args: {
        figmaPropName,
      },
    }
  }
  if (
    propSignature.includes(' | ') &&
    figmaPropDef.type === FigmaRestApi.ComponentPropertyType.Variant
  ) {
    return {
      kind: IntrinsicKind.Enum,
      args: {
        figmaPropName,
        valueMapping: generateValueMapping(propSignature, figmaPropDef),
      },
    }
  }
  return null
}

export function generatePropMapping({
  componentPropertyDefinitions,
  signature,
}: {
  componentPropertyDefinitions: FigmaRestApi.Component['componentPropertyDefinitions']
  signature: ComponentTypeSignature
}): PropMapping {
  const propMapping: PropMapping = {}

  // Remove whitespace for closer matches with code props
  const matchableFigmaProperties = Object.keys(componentPropertyDefinitions || {}).reduce(
    (acc, propName) => {
      const withoutWhitespace = propName.replace(/\s/g, '')
      acc[withoutWhitespace] = propName
      return acc
    },
    {} as Record<string, string>,
  )

  const searchSpace = Object.keys(matchableFigmaProperties)
  const searcher = new Searcher(searchSpace)

  Object.entries(signature).forEach(([propName, propSignature]) => {
    const results = searcher.search(propName, { returnMatchData: true })

    if (results.length > 0) {
      const { item, score } = results[0]
      const figmaPropName = matchableFigmaProperties[item]
      const figmaPropDef = componentPropertyDefinitions[figmaPropName]

      if (score > PROP_MINIMUM_MATCH_THRESHOLD) {
        const intrinsic = generateIntrinsic({ propSignature, figmaPropName, figmaPropDef })
        if (intrinsic) {
          propMapping[propName] = intrinsic
        }
      }
    }
  })

  return propMapping
}

export function extractSignatureAndGeneratePropMapping({
  exportName,
  filepath,
  projectInfo,
  componentPropertyDefinitions,
  cmd,
}: {
  exportName: string
  filepath: string
  projectInfo: ReactProjectInfo
  componentPropertyDefinitions: FigmaRestApi.Component['componentPropertyDefinitions']
  cmd: BaseCommand
}): PropMapping | undefined {
  let signature: ComponentTypeSignature

  try {
    signature = extractSignature({
      nameToFind: exportName,
      sourceFilePath: filepath,
      projectInfo,
    })
  } catch (e) {
    if (cmd.verbose) {
      logger.warn(`Could not extract signature for "${exportName}" in ${filepath}`)
    }
    return undefined
  }

  return generatePropMapping({
    componentPropertyDefinitions,
    signature,
  })
}
