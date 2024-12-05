import { ComponentTypeSignature } from '../../react/parser'
import { FigmaRestApi } from '../figma_rest_api'
import { PropMapping } from '../parser_executable_types'
import { Searcher } from 'fast-fuzzy'
import { Intrinsic, IntrinsicKind, ValueMapping } from '../../connect/intrinsics'
import { isBooleanKind } from '../../react/create'
import { ComponentMatchResults, MatchableNamesMap, PropMatchResult } from './prop_mapping_helpers'

/**
 * These thresholds were come up with by running the benchmarking
 * and tweaking until high positives + acceptable false positives
 * were achieved. It's worth repeating this process whenever making
 * changes to the mapping algorithm.
 */
const MININUM_MATCH_SCORES = {
  fuzzy: {
    property: 0.65,
    variantValue: 0.8,
  },
  embeddings: {
    property: 0.84,
    variantValue: 0.87,
  },
}

/**
 * Used when we should output a placeholder for an unknown value in prop mapping.
 */
export const PROPERTY_PLACEHOLDER = 'PROPERTY_PLACEHOLDER'

export function generateValueMapping(
  propSignature: string,
  figmaPropDef: FigmaRestApi.ComponentPropertyDefinition,
): ValueMapping {
  const searchableCodeEnumOptions: Record<string, string | boolean | number> = {}
  propSignature.split(' | ').forEach((str) => {
    if (str.startsWith('"') && str.endsWith('"')) {
      const withoutQuotes = str.substring(1, str.length - 1)
      searchableCodeEnumOptions[withoutQuotes] = withoutQuotes
    } else if (str === 'true') {
      searchableCodeEnumOptions[str] = true
    } else if (str === 'false') {
      searchableCodeEnumOptions[str] = false
    } else if (!isNaN(Number(str))) {
      searchableCodeEnumOptions[str] = Number(str)
    }
  })
  const searcher = new Searcher(figmaPropDef.variantOptions)
  return Object.entries(searchableCodeEnumOptions).reduce(
    (valueMapping, [codeEnumValue, mappedValue]) => {
      const results = searcher.search(codeEnumValue, { returnMatchData: true })
      if (results.length && results[0].score > 0.5) {
        valueMapping[results[0].item] = mappedValue
      }
      return valueMapping
    },
    {} as ValueMapping,
  )
}

function signatureIsJsxLike(signature: string) {
  return (
    signature.includes('ElementType') ||
    signature.includes('ReactElement') ||
    signature.includes('ReactNode')
  )
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
  if (
    signatureIsJsxLike(propSignature) &&
    figmaPropDef.type === FigmaRestApi.ComponentPropertyType.InstanceSwap
  ) {
    return {
      kind: IntrinsicKind.Instance,
      args: {
        figmaPropName,
      },
    }
  }
  return null
}

function stripNodeIdFromPropertyName(propertyName: string) {
  return propertyName.replace(/#\d+:\d+/, '')
}

export enum MatchableNameTypes {
  Property,
  VariantValue,
  // ChildLayer, // TODO
}

const MATCHABLE_NAME_TYPES_PRIORITY = [
  MatchableNameTypes.Property,
  MatchableNameTypes.VariantValue,
] as const

export type MatchableName = {
  type: MatchableNameTypes
  name: string
  variantProperty?: string // Only for VariantValue
}

/**
 * Builds a map of all properties and enum values, indexed by name.
 * @param componentPropertyDefinitions
 * @returns A map of {name: values[]}. Each value is an array to avoid
 * collisions between properties / enum values
 */
export function buildMatchableNamesMap(
  componentPropertyDefinitions?: FigmaRestApi.Component['componentPropertyDefinitions'],
) {
  const matchableValues: MatchableNamesMap = {}

  function add(name: string, definition: MatchableName) {
    matchableValues[name] = matchableValues[name] || []
    matchableValues[name].push(definition)
  }

  Object.entries(componentPropertyDefinitions || {}).forEach(([propName, propDef]) => {
    const name = stripNodeIdFromPropertyName(propName)

    add(name, {
      type: MatchableNameTypes.Property,
      name: propName,
    })

    if (propDef.type === FigmaRestApi.ComponentPropertyType.Variant) {
      propDef.variantOptions?.forEach((variantValue) => {
        add(variantValue, {
          type: MatchableNameTypes.VariantValue,
          name: variantValue,
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
  componentMatchResults,
  matchableNamesMap,
}: {
  componentPropertyDefinitions: FigmaRestApi.Component['componentPropertyDefinitions']
  signature: ComponentTypeSignature
  componentMatchResults?: ComponentMatchResults
  matchableNamesMap: MatchableNamesMap
}): PropMapping {
  const propMapping: PropMapping = {}

  const searchSpace = Object.keys(matchableNamesMap)
  const searcher = new Searcher(searchSpace)

  let minimumMatchScores = MININUM_MATCH_SCORES.fuzzy

  const useEmbeddings = !!componentMatchResults
  if (useEmbeddings) {
    minimumMatchScores = MININUM_MATCH_SCORES.embeddings
  }

  function attemptGetIntrinsicForProp({
    propMatch,
    propSignature,
  }: {
    propMatch: PropMatchResult
    propSignature: string
  }) {
    const itemsInPriorityOrder = [...matchableNamesMap[propMatch.item]].sort(
      (a, b) =>
        MATCHABLE_NAME_TYPES_PRIORITY.indexOf(a.type) -
        MATCHABLE_NAME_TYPES_PRIORITY.indexOf(b.type),
    )

    for (const item of itemsInPriorityOrder) {
      /**
       * First, look for matching property names with compatible types
       */
      if (
        item.type === MatchableNameTypes.Property &&
        propMatch.score > minimumMatchScores.property
      ) {
        const intrinsic = generateIntrinsic({
          propSignature,
          figmaPropName: item.name,
          figmaPropDef: componentPropertyDefinitions[item.name],
        })
        if (intrinsic) {
          return intrinsic
        }
        /**
         * Then if no match AND a boolean prop, look for matching variant values, e.g:
         *
         * disabled: figma.enum('State', {
         *   Disabled: true,
         * })
         */
      } else if (
        item.type === MatchableNameTypes.VariantValue &&
        propSignature === 'false | true' &&
        propMatch.score > minimumMatchScores.variantValue
      ) {
        return {
          kind: IntrinsicKind.Enum,
          args: {
            figmaPropName: item.variantProperty,
            valueMapping: {
              [item.name]: true,
            },
          },
        } as Intrinsic
      }
    }

    return null
  }

  /**
   * Attempt to generate an intrinsic for a given property name by looking
   * for name matches with a minimum threshold
   *
   * Embeddings are priorized over fuzzy matching if present (they
   * may be missing if gated or missing permissions).
   */
  for (const [propName, propSignatureWithOptionalModifier] of Object.entries(signature)) {
    const propSignature = propSignatureWithOptionalModifier.startsWith('?')
      ? propSignatureWithOptionalModifier.substring(1)
      : propSignatureWithOptionalModifier

    let matches = searcher.search(propName, { returnMatchData: true }) as PropMatchResult[]

    if (useEmbeddings) {
      matches = componentMatchResults[propName]
    }

    if (matches.length === 0) {
      continue
    }

    for (const match of matches) {
      const intrinsic = attemptGetIntrinsicForProp({
        propMatch: match,
        propSignature,
      })
      if (intrinsic) {
        propMapping[propName] = intrinsic
        break
      }
    }
  }

  return propMapping
}
