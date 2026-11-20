import { exitWithError } from '../common/logging'
import { FigmaRestApi } from '../connect/figma_rest_api'
import {
  normalizePropKey,
  toAvailableProperties,
  type AvailableProperty,
} from '../connect/property_combinations'

type Selector = { name: string; argument: string }

function parseSelector(argument: string, flag: string): Selector {
  const name = normalizePropKey(argument)
  if (!name) exitWithError(`Property names after ${flag} must not be empty`)
  return { name, argument }
}

/** A shared selection may name different properties on different components. */
export class PreviewPropertySelection {
  private selectors: Selector[]
  private matched = new Set<Selector>()

  constructor(
    names: string[],
    readonly flag = '--all',
  ) {
    this.selectors = names.map((name) => parseSelector(name, flag))
  }

  forNode(
    filePath: string,
    nodeId: string,
    defs: Record<string, FigmaRestApi.ComponentPropertyDefinition>,
  ): AvailableProperty[] {
    const available = toAvailableProperties(defs)
    const selected = new Set<AvailableProperty>()
    for (const selector of this.selectors) {
      const matches = available.filter(
        (prop) => prop.name.toLowerCase() === selector.name.toLowerCase(),
      )
      if (matches.length === 0) continue
      this.matched.add(selector)
      if (matches.length > 1) {
        exitWithError(
          `Property "${selector.argument}" in ${filePath} (node ${nodeId}) matches multiple properties; ` +
            'use --inspect to check the available names and select an unambiguous property.',
        )
      }
      const prop = matches[0]
      if (
        prop.type !== FigmaRestApi.ComponentPropertyType.Boolean &&
        prop.type !== FigmaRestApi.ComponentPropertyType.Variant
      ) {
        exitWithError(
          `Property "${selector.argument}" in ${filePath} (node ${nodeId}) is ${prop.type}; ` +
            `${this.flag} can vary only BOOLEAN and VARIANT properties.`,
        )
      }
      selected.add(prop)
    }
    return [...selected]
  }

  validate(): void {
    const unused = this.selectors.filter((selector) => !this.matched.has(selector))
    if (unused.length > 0) {
      exitWithError(
        `Properties selected with ${this.flag} matched nothing across the selected components: ${unused
          .map((selector) => selector.argument)
          .join(', ')}`,
      )
    }
  }
}
