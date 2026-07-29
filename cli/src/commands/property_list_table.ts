import chalk from 'chalk'
import { FigmaRestApi } from '../connect/figma_rest_api'
import type { AvailableProperty } from '../connect/property_combinations'

const purple = chalk.ansi256(93)
const gray = chalk.ansi256(243)

export interface PropertyListItem {
  filePath: string
  nodeId: string
  availableProperties: AvailableProperty[]
}

function formatPropertyType(type: FigmaRestApi.ComponentPropertyType): string {
  switch (type) {
    case 'BOOLEAN':
      return 'Boolean'
    case 'INSTANCE_SWAP':
      return 'Instance Swap'
    case 'TEXT':
      return 'Text'
    case 'VARIANT':
      return 'Variant'
    default:
      return type
  }
}

function optionsOf(property: AvailableProperty): string {
  if (property.variantOptions?.length) return property.variantOptions.join(' | ')
  if (property.type === 'BOOLEAN') return 'true | false'
  return ''
}

function defaultValueOf(property: AvailableProperty): string {
  if (property.default === undefined) return ''
  return typeof property.default === 'string' ? `"${property.default}"` : String(property.default)
}

/**
 * Print each component's property vocabulary (name, type, options, default).
 */
export function displayPropertyList(items: PropertyListItem[]): void {
  for (const { filePath, nodeId, availableProperties } of items) {
    console.log('')
    console.log(`${purple('●')} ${chalk.bold(filePath)} ${gray(`(${nodeId})`)}`)
    if (availableProperties.length === 0) {
      console.log(`  ${gray('(no properties found)')}`)
      continue
    }

    const rows = availableProperties.map((property) => ({
      name: property.name,
      type: formatPropertyType(property.type),
      options: optionsOf(property),
      defaultValue: defaultValueOf(property),
    }))
    const nameW = Math.max('Name'.length, ...rows.map((property) => property.name.length))
    const typeW = Math.max('Type'.length, ...rows.map((property) => property.type.length))
    const optsW = Math.max('Options'.length, ...rows.map((property) => property.options.length))
    const defaultW = Math.max(
      'Default'.length,
      ...rows.map((property) => property.defaultValue.length),
    )

    console.log(
      `  ${chalk.bold('Name'.padEnd(nameW))}  ${chalk.bold('Type'.padEnd(typeW))}  ` +
        `${chalk.bold('Options'.padEnd(optsW))}  ${chalk.bold('Default'.padEnd(defaultW))}`,
    )
    console.log(
      `  ${gray('-'.repeat(nameW))}  ${gray('-'.repeat(typeW))}  ` +
        `${gray('-'.repeat(optsW))}  ${gray('-'.repeat(defaultW))}`,
    )
    for (const row of rows) {
      console.log(
        `  ${chalk.bold(row.name.padEnd(nameW))}  ${gray(row.type.padEnd(typeW))}  ` +
          `${row.options.padEnd(optsW)}  ${row.defaultValue.padEnd(defaultW)}`,
      )
    }
  }
}
