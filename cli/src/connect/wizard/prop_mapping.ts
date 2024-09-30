import { ReactProjectInfo } from '../project'
import { ComponentTypeSignature } from '../../react/parser'
import { FigmaRestApi } from '../figma_rest_api'
import { PropMapping } from '../parser_executable_types'
import { MatchData, Searcher } from 'fast-fuzzy'
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
  propSignature,
  figmaPropName: figmaPropNameWithNodeId,
  figmaPropDef,
}: {
  propSignature: string
  figmaPropName: string
  figmaPropDef: FigmaRestApi.ComponentPropertyDefinition
}): Intrinsic | null {
  const figmaPropName = stripNodeIdFromPropertyName(figmaPropNameWithNodeId)
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
    const valueMapping = generateValueMapping(propSignature, figmaPropDef)
    // Only valuable if some values were mapped
    if (Object.keys(valueMapping).length > 0) {
      return {
        kind: IntrinsicKind.Enum,
        args: {
          figmaPropName,
          valueMapping,
        },
      }
    }
  }
  return null
}

function stripNodeIdFromPropertyName(propertyName: string) {
  return propertyName.replace(/#\d+:\d+/, '')
}

const DELIMITERS_REGEX = /[\s-_]/g

export enum MatchableNameTypes {
  Property,
  VariantValue,
  // ChildLayer, // TODO
}

type MatchableName = {
  type: MatchableNameTypes
  name: string
  variantProperty?: string // Only for VariantValue
}

/**
 * Builds a map of all properties and enum values, indexed by matchable name.
 * @param componentPropertyDefinitions
 * @returns A map of {name: values[]}. Each value is an array to avoid
 * collisions between properties / enum values
 */
export function buildMatchableNamesMap(
  componentPropertyDefinitions?: FigmaRestApi.Component['componentPropertyDefinitions'],
) {
  const matchableValues: Record<string, MatchableName[]> = {}

  function add(matchableStr: string, definition: MatchableName) {
    matchableValues[matchableStr] = matchableValues[matchableStr] || []
    matchableValues[matchableStr].push(definition)
  }

  Object.entries(componentPropertyDefinitions || {}).forEach(([propName, propDef]) => {
    const matchableStr = stripNodeIdFromPropertyName(propName).replace(DELIMITERS_REGEX, '')

    add(matchableStr, {
      type: MatchableNameTypes.Property,
      name: propName,
    })

    if (propDef.type === FigmaRestApi.ComponentPropertyType.Variant) {
      propDef.variantOptions?.forEach((variantOption) => {
        const variantMatchableStr = variantOption.replace(DELIMITERS_REGEX, '')

        add(variantMatchableStr, {
          type: MatchableNameTypes.VariantValue,
          name: variantOption,
          variantProperty: propName,
        })
      })
    }
  })

  return matchableValues
}

export function generatePropMapping({
  componentPropertyDefinitions,
  signature,
}: {
  componentPropertyDefinitions: FigmaRestApi.Component['componentPropertyDefinitions']
  signature: ComponentTypeSignature
}): PropMapping {
  const propMapping: PropMapping = {}

  const matchableNames = buildMatchableNamesMap(componentPropertyDefinitions)

  const searchSpace = Object.keys(matchableNames)
  const searcher = new Searcher(searchSpace)

  function findBestMatch(
    matchData: MatchData<string>[],
    { score, where }: { score: number; where: (item: MatchableName) => boolean },
  ) {
    for (const nameMatches of matchData) {
      if (nameMatches.score < score) {
        return null
      }
      const items = matchableNames[nameMatches.item]
      const match = items.find(where)
      if (match) {
        return match
      }
    }
    return null
  }

  for (const [propName, propSignatureWithOptionalModifier] of Object.entries(signature)) {
    const propSignature = propSignatureWithOptionalModifier.startsWith('?')
      ? propSignatureWithOptionalModifier.substring(1)
      : propSignatureWithOptionalModifier

    const results = searcher.search(propName, { returnMatchData: true })

    if (results.length === 0) {
      continue
    }

    /**
     * First, look for matching property names with compatible types
     */
    const matchingProperty = findBestMatch(results, {
      score: PROP_MINIMUM_MATCH_THRESHOLD,
      where: (item) => item.type === MatchableNameTypes.Property,
    })
    if (matchingProperty) {
      const { name: figmaPropName } = matchingProperty

      const intrinsic = generateIntrinsic({
        propSignature,
        figmaPropName,
        figmaPropDef: componentPropertyDefinitions[figmaPropName],
      })
      if (intrinsic) {
        propMapping[propName] = intrinsic
      }
    }

    /**
     * Then if no match AND a boolean prop, look for matching variant values, e.g:
     *
     * disabled: figma.enum('State', {
     *   Disabled: true,
     * })
     */
    if (!propMapping[propName] && propSignature === 'false | true') {
      const matchingProperty = findBestMatch(results, {
        score: PROP_MINIMUM_MATCH_THRESHOLD,
        where: (item) => item.type === MatchableNameTypes.VariantValue,
      })
      if (matchingProperty) {
        const { name: variantValue, variantProperty } = matchingProperty
        if (!variantProperty) {
          throw new Error('Expected variant property') // satisfying TS
        }
        propMapping[propName] = {
          kind: IntrinsicKind.Enum,
          args: {
            figmaPropName: variantProperty,
            valueMapping: {
              [variantValue]: true,
            },
          },
        }
      }
    }
  }

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
}): {
  propMapping: PropMapping | undefined
  signature: ComponentTypeSignature | undefined
} {
  let signature: ComponentTypeSignature

  try {
    signature = extractSignature({
      nameToFind: exportName,
      sourceFilePath: filepath,
      projectInfo,
    })
    if (cmd.verbose && Object.keys(signature).length === 0) {
      logger.warn(`No TS signature found for "${exportName}" in ${filepath}`)
    }
  } catch (e) {
    if (cmd.verbose) {
      logger.warn(`Could not extract TS signature for "${exportName}" in ${filepath}`)
    }
    return {
      propMapping: undefined,
      signature: undefined,
    }
  }

  return {
    propMapping: generatePropMapping({
      componentPropertyDefinitions,
      signature,
    }),
    signature: signature,
  }
}
