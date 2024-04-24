import * as ts from 'typescript'
import { InternalError, ParserContext, ParserError } from './parser'
import { assertIsStringLiteral, stripQuotes } from './compiler'
import { convertObjectLiteralToJs } from './compiler'
import { assertIsObjectLiteralExpression } from './compiler'
import { FigmaConnectAPI } from './api'

export const API_PREFIX = 'figma'
export const FIGMA_CONNECT_CALL = `${API_PREFIX}.connect`

export enum IntrinsicKind {
  Enum = 'enum',
  String = 'string',
  Boolean = 'boolean',
  Instance = 'instance',
  Children = 'children',
}

export interface IntrinsicBase {
  kind: IntrinsicKind
  args: {}
}

export type ValueMappingKind = string | boolean | number | undefined | JSX.Element | Intrinsic

export interface FigmaBoolean extends IntrinsicBase {
  kind: IntrinsicKind.Boolean
  args: {
    figmaPropName: string
    valueMapping?: Record<'true' | 'false', ValueMappingKind>
  }
}

export interface FigmaEnum extends IntrinsicBase {
  kind: IntrinsicKind.Enum
  args: {
    figmaPropName: string
    valueMapping: Record<string, ValueMappingKind>
  }
}

export interface FigmaString extends IntrinsicBase {
  kind: IntrinsicKind.String
  args: {
    figmaPropName: string
  }
}

export interface FigmaInstance extends IntrinsicBase {
  kind: IntrinsicKind.Instance
  args: {
    figmaPropName: string
  }
}

export interface FigmaChildren extends IntrinsicBase {
  kind: IntrinsicKind.Children
  args: {
    layers: string[]
  }
}

export type Intrinsic = FigmaBoolean | FigmaEnum | FigmaString | FigmaInstance | FigmaChildren

const Intrinsics: {
  [key: string]: {
    match: (exp: ts.CallExpression) => exp is ts.CallExpression
    parse: (exp: ts.CallExpression, parser: ParserContext) => Intrinsic
  }
} = {}

/**
 * These functions are used to convert "intrinsic" parser types (which are calls to helper functions
 * like `Figma.boolean() in code)` to an object representing that intrinsic that we can serialize to JSON.
 *
 * Each call to `makeIntrinsic` should take a function from the {@link FigmaConnectAPI},
 * ensuring that the name of the intrinsic that we're parsing matches the name of the function
 *
 * @param staticFunctionMember
 * @param obj
 */
function makeIntrinsic<K extends keyof FigmaConnectAPI>(
  intrinsicName: K,
  obj: (name: string) => any,
) {
  const name = `${API_PREFIX}.${intrinsicName}`
  Intrinsics[name] = {
    match: (exp: ts.CallExpression) => {
      return ts.isCallExpression(exp) && exp.getText().startsWith(name)
    },
    ...obj(name),
  }
}

makeIntrinsic('boolean', (name) => {
  return {
    parse: (exp: ts.CallExpression, ctx: ParserContext): FigmaBoolean => {
      const figmaPropNameIdentifier = exp.arguments?.[0]
      assertIsStringLiteral(
        figmaPropNameIdentifier,
        ctx.sourceFile,
        `${name} takes at least one argument, which is the Figma property name`,
      )
      const valueMappingArg = exp.arguments?.[1]
      let valueMapping
      if (valueMappingArg) {
        assertIsObjectLiteralExpression(
          valueMappingArg,
          ctx.sourceFile,
          `${name} second argument should be an object literal, that sets values for 'true' and 'false'`,
        )
        valueMapping = convertObjectLiteralToJs(
          valueMappingArg,
          ctx.sourceFile,
          ctx.checker,
          (valueNode) => {
            if (ts.isCallExpression(valueNode)) {
              return parseIntrinsic(valueNode, ctx)
            }
          },
        )
      }
      return {
        kind: IntrinsicKind.Boolean,
        args: {
          figmaPropName: stripQuotes(figmaPropNameIdentifier),
          valueMapping,
        },
      }
    },
  }
})

makeIntrinsic('enum', (name) => {
  return {
    parse: (exp: ts.CallExpression, ctx: ParserContext): FigmaEnum => {
      const { sourceFile, checker } = ctx
      const figmaPropNameIdentifier = exp.arguments?.[0]
      assertIsStringLiteral(
        figmaPropNameIdentifier,
        sourceFile,
        `${name} takes at least one argument, which is the Figma property name`,
      )
      const valueMapping = exp.arguments?.[1]
      assertIsObjectLiteralExpression(
        valueMapping,
        sourceFile,
        `${name} second argument should be an object literal, that maps Figma prop values to code`,
      )
      return {
        kind: IntrinsicKind.Enum,
        args: {
          figmaPropName: stripQuotes(figmaPropNameIdentifier),
          valueMapping: convertObjectLiteralToJs(valueMapping, sourceFile, checker, (valueNode) => {
            if (ts.isCallExpression(valueNode)) {
              return parseIntrinsic(valueNode, ctx)
            }
          }),
        },
      }
    },
  }
})

makeIntrinsic('string', (name) => {
  return {
    parse: (exp: ts.CallExpression, ctx: ParserContext): FigmaString => {
      const { sourceFile } = ctx
      const figmaPropNameIdentifier = exp.arguments?.[0]
      assertIsStringLiteral(
        figmaPropNameIdentifier,
        sourceFile,
        `${name} takes at least one argument, which is the Figma property name`,
      )
      return {
        kind: IntrinsicKind.String,
        args: {
          figmaPropName: stripQuotes(figmaPropNameIdentifier),
        },
      }
    },
  }
})

makeIntrinsic('instance', (name) => {
  return {
    parse: (exp: ts.CallExpression, ctx: ParserContext): FigmaInstance => {
      const { sourceFile } = ctx
      const figmaPropNameIdentifier = exp.arguments?.[0]
      assertIsStringLiteral(
        figmaPropNameIdentifier,
        sourceFile,
        `${name} takes at least one argument, which is the Figma property name`,
      )
      return {
        kind: IntrinsicKind.Instance,
        args: {
          figmaPropName: stripQuotes(figmaPropNameIdentifier),
        },
      }
    },
  }
})

makeIntrinsic('children', (name) => {
  return {
    parse: (exp: ts.CallExpression, ctx: ParserContext): FigmaChildren => {
      const { sourceFile } = ctx
      const layerName = exp.arguments?.[0]
      const layers: string[] = []
      if (ts.isStringLiteral(layerName)) {
        layers.push(stripQuotes(layerName))
      } else if (ts.isArrayLiteralExpression(layerName) && layerName.elements.length > 0) {
        layerName.elements.forEach((el) => {
          assertIsStringLiteral(el, sourceFile)
          layers.push(stripQuotes(el))
        })
      } else {
        throw new ParserError(
          `Invalid argument to ${name}, should be a string literal or an array of strings`,
          {
            node: layerName,
            sourceFile,
          },
        )
      }

      return {
        kind: IntrinsicKind.Children,
        args: {
          layers,
        },
      }
    },
  }
})

/**
 * Parses a call expression to an intrinsic
 *
 * @param exp Expression to parse
 * @param parserContext parser context
 * @returns
 */
export function parseIntrinsic(exp: ts.CallExpression, parserContext: ParserContext): Intrinsic {
  for (const key in Intrinsics) {
    if (Intrinsics[key].match(exp)) {
      return Intrinsics[key].parse(exp, parserContext)
    }
  }

  throw new ParserError(`Unknown intrinsic: ${exp.getText()}`, {
    node: exp,
    sourceFile: parserContext.sourceFile,
  })
}

export function valueMappingToString(valueMapping: Record<string, ValueMappingKind>): string {
  // For enums (and booleans with a valueMapping provided), convert the
  // value mapping to an object.
  return (
    '{\n' +
    Object.entries(valueMapping)
      .map(([key, value]) => {
        if (typeof value === 'object' && 'kind' in value) {
          // Mappings can be nested, e.g. an enum value can be figma.instance(...)
          return `"${key}": ${intrinsicToString(value as Intrinsic)}`
        } else if (typeof value === 'boolean' || typeof value === 'undefined') {
          return `"${key}": ${value}`
        } else {
          return `"${key}": '${value}'`
        }
      })
      .join(',\n') +
    '}'
  )
}

export function intrinsicToString({ kind, args }: Intrinsic): string {
  switch (kind) {
    case IntrinsicKind.String:
    case IntrinsicKind.Instance: {
      // Outputs:
      // `const propName = figma.properties.string('propName')`, or
      // `const propName = figma.properties.boolean('propName')`, or
      // `const propName = figma.properties.instance('propName')`
      return `figma.properties.${kind}('${args.figmaPropName}')`
    }
    case IntrinsicKind.Boolean: {
      if (args.valueMapping) {
        const mappingString = valueMappingToString(args.valueMapping)
        // Outputs: `const propName = figma.properties.boolean('propName', { ... mapping object from above ... })`
        return `figma.properties.boolean('${args.figmaPropName}', ${mappingString})`
      }
      return `figma.properties.boolean('${args.figmaPropName}')`
    }
    case IntrinsicKind.Enum: {
      const mappingString = valueMappingToString(args.valueMapping)

      // Outputs: `const propName = figma.properties.enum('propName', { ... mapping object from above ... })`
      return `figma.properties.enum('${args.figmaPropName}', ${mappingString})`
    }
    case IntrinsicKind.Children: {
      // Outputs: `const propName = figma.properties.children(["Layer 1", "Layer 2"])`
      return `figma.properties.children([${args.layers.map((layerName) => `"${layerName}"`).join(',')}])`
    }
    default:
      throw new InternalError(`Unknown intrinsic: ${kind}`)
  }
}
