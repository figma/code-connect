import * as ts from 'typescript'
import { InternalError, ParserContext, ParserError } from './parser_common'
import {
  assertIsArrayLiteralExpression,
  assertIsStringLiteral,
  stripQuotesFromNode,
} from '../typescript/compiler'
import { convertObjectLiteralToJs } from '../typescript/compiler'
import { assertIsObjectLiteralExpression } from '../typescript/compiler'
import { FigmaConnectAPI } from './api'
import {
  FCCValue,
  _fcc_function,
  _fcc_identifier,
  _fcc_jsxElement,
  _fcc_object,
  _fcc_templateString,
} from '../react/parser_template_helpers'
import htmlApi from '../html/index_html'
import reactApi from '../react/index_react'
import { Modifier, modifierToString, parseModifier } from './modifiers'

export const API_PREFIX = 'figma'
export const FIGMA_CONNECT_CALL = `${API_PREFIX}.connect`

export enum IntrinsicKind {
  Enum = 'enum',
  String = 'string',
  Boolean = 'boolean',
  Instance = 'instance',
  Children = 'children',
  NestedProps = 'nested-props',
  ClassName = 'className',
  TextContent = 'text-content',
}

export interface IntrinsicBase {
  kind: IntrinsicKind
  args: {}
  modifiers?: Modifier[]
}

export type ValueMappingKind = FCCValue | Intrinsic

export interface FigmaBoolean extends IntrinsicBase {
  kind: IntrinsicKind.Boolean
  args: {
    figmaPropName: string
    valueMapping?: Record<'true' | 'false', ValueMappingKind>
  }
}

export type ValueMapping = Record<string, ValueMappingKind>

export interface FigmaEnum extends IntrinsicBase {
  kind: IntrinsicKind.Enum
  args: {
    figmaPropName: string
    valueMapping: ValueMapping
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

export interface FigmaNestedProps extends IntrinsicBase {
  kind: IntrinsicKind.NestedProps
  args: {
    layer: string
    props: Record<string, Intrinsic>
  }
}

export interface FigmaClassName extends IntrinsicBase {
  kind: IntrinsicKind.ClassName
  args: {
    className: (string | Intrinsic)[]
  }
}

export interface FigmaTextContent extends IntrinsicBase {
  kind: IntrinsicKind.TextContent
  args: {
    layer: string
  }
}

export type Intrinsic =
  | FigmaBoolean
  | FigmaEnum
  | FigmaString
  | FigmaInstance
  | FigmaChildren
  | FigmaNestedProps
  | FigmaClassName
  | FigmaTextContent

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
function makeIntrinsic<K extends keyof typeof htmlApi | typeof reactApi>(
  intrinsicName: K,
  obj: (name: string) => any,
) {
  const name = `${API_PREFIX}.${intrinsicName}`
  Intrinsics[name] = {
    match: (exp: ts.CallExpression) => {
      return ts.isCallExpression(exp) && exp.getText().replace(/\s/g, '').startsWith(name)
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
        valueMapping = parsePropsObject(valueMappingArg, ctx) as Record<
          'true' | 'false',
          ValueMappingKind
        >
      }
      return {
        kind: IntrinsicKind.Boolean,
        args: {
          figmaPropName: stripQuotesFromNode(figmaPropNameIdentifier),
          valueMapping,
        },
      }
    },
  }
})

makeIntrinsic('enum', (name) => {
  return {
    parse: (exp: ts.CallExpression, ctx: ParserContext): FigmaEnum => {
      const { sourceFile } = ctx
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
          figmaPropName: stripQuotesFromNode(figmaPropNameIdentifier),
          valueMapping: parsePropsObject(valueMapping, ctx),
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
          figmaPropName: stripQuotesFromNode(figmaPropNameIdentifier),
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
          figmaPropName: stripQuotesFromNode(figmaPropNameIdentifier),
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
        layers.push(stripQuotesFromNode(layerName))
      } else if (ts.isArrayLiteralExpression(layerName) && layerName.elements.length > 0) {
        layerName.elements.forEach((el) => {
          assertIsStringLiteral(el, sourceFile)
          const name = stripQuotesFromNode(el)
          if (name.includes('*')) {
            throw new ParserError(
              `Wildcards can not be used with an array of strings. Use a single string literal instead.`,
              {
                node: layerName,
                sourceFile,
              },
            )
          }
          layers.push(stripQuotesFromNode(el))
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

makeIntrinsic('nestedProps', (name) => {
  return {
    parse: (exp: ts.CallExpression, ctx: ParserContext): FigmaNestedProps => {
      const { sourceFile } = ctx
      const layerName = exp.arguments?.[0]
      const mapping = exp.arguments?.[1]

      assertIsStringLiteral(
        layerName,
        sourceFile,
        `Invalid argument to ${name}, \`layerName\` should be a string literal`,
      )
      assertIsObjectLiteralExpression(
        mapping,
        sourceFile,
        `Invalid argument to ${name}, \`props\` should be an object literal`,
      )

      ts.forEachChild(mapping, (node) => {
        if (
          ts.isPropertyAssignment(node) &&
          ts.isCallExpression(node.initializer) &&
          node.initializer.getText().startsWith('figma.nestedProps')
        ) {
          throw new ParserError(
            `nestedProps can not be nested inside another nestedProps call, instead, pass the deeply nested layer name at the top level`,
          )
        }
      })

      return {
        kind: IntrinsicKind.NestedProps,
        args: {
          layer: stripQuotesFromNode(layerName),
          props: parsePropsObject(mapping, ctx),
        },
      }
    },
  }
})

makeIntrinsic('className', (name) => {
  return {
    parse: (exp: ts.CallExpression, ctx: ParserContext): FigmaClassName => {
      const { sourceFile } = ctx
      const classNameArg = exp.arguments?.[0]
      const className: (string | Intrinsic)[] = []
      assertIsArrayLiteralExpression(classNameArg, sourceFile, `${name} takes an array of strings`)

      classNameArg.elements.forEach((el) => {
        if (ts.isStringLiteral(el)) {
          className.push(stripQuotesFromNode(el))
        } else if (ts.isCallExpression(el)) {
          className.push(parseIntrinsic(el, ctx))
        }
      })

      return {
        kind: IntrinsicKind.ClassName,
        args: {
          className,
        },
      }
    },
  }
})

makeIntrinsic('textContent', (name) => {
  return {
    parse: (exp: ts.CallExpression, ctx: ParserContext): FigmaTextContent => {
      const { sourceFile } = ctx
      const layerNameArg = exp.arguments?.[0]
      assertIsStringLiteral(
        layerNameArg,
        sourceFile,
        `${name} takes a single argument which is the Figma layer name`,
      )

      return {
        kind: IntrinsicKind.TextContent,
        args: {
          layer: stripQuotesFromNode(layerNameArg),
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
      // Chained call expressions in TS are nested with the innermost call expression
      // being the first in the chain. We need to reverse the chain so that the intrinsic
      // is the first element in the array. The TS AST looks like this for a().b():
      // CallExpression [a().b()] ->
      //   PropertyAccessExpression [a().b] ->
      //     CallExpression [a()]

      let callChain = []
      let current: any = exp
      while (current) {
        if (ts.isCallExpression(current)) {
          callChain.push(current)
          current = current.expression
        } else if (ts.isPropertyAccessExpression(current)) {
          current = current.expression
        } else {
          current = null
        }
      }

      // If there's only one call expression just return the matching intrinsic
      callChain = callChain.reverse()
      if (callChain.length <= 1) {
        return Intrinsics[key].parse(exp, parserContext)
      }

      // The first call expression is the intrinsic itself, and any following call
      // expressions are modifiers
      const intrinsic = Intrinsics[key].parse(callChain.shift()!, parserContext)
      const modifiers = callChain.map((modifier) => parseModifier(modifier, parserContext))

      return {
        ...intrinsic,
        modifiers,
      }
    }
  }

  throw new ParserError(`Unknown intrinsic: ${exp.getText()}`, {
    node: exp,
    sourceFile: parserContext.sourceFile,
  })
}

/**
 * Replace newlines in enum values with \\n so that we don't output
 * broken JS with newlines inside the string
 */
function replaceNewlines(str: string) {
  return str.toString().replaceAll('\n', '\\n').replaceAll("'", "\\'")
}

export function valueToString(value: ValueMappingKind, childLayer?: string) {
  if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'undefined') {
    return `${value}`
  }

  if (typeof value === 'string') {
    return `'${replaceNewlines(value)}'`
  }

  if ('kind' in value) {
    // Mappings can be nested, e.g. an enum value can be figma.instance(...)
    return `${intrinsicToString(value as Intrinsic, childLayer)}`
  }

  // Convert objects to strings
  const str = typeof value.$value === 'string' ? value.$value : `${JSON.stringify(value.$value)}`
  const v = replaceNewlines(str)

  switch (value.$type) {
    case 'function':
      return `_fcc_function('${v}')`
    case 'identifier':
      return `_fcc_identifier('${v}')`
    case 'object':
      // Don't pass the object itself wrapped in quotes - this helper needs to instantiate the actual
      // object, as it may be used in the snippet code
      return `_fcc_object(${v})`
    case 'template-string':
      return `_fcc_templateString('${v}')`
    case 'jsx-element':
      return `_fcc_jsxElement('${v}')`
    default:
      throw new InternalError(`Unknown helper type: ${value}`)
  }
}

export function valueMappingToString(valueMapping: ValueMapping, childLayer?: string): string {
  // For enums (and booleans with a valueMapping provided), convert the
  // value mapping to an object.
  return (
    '{\n' +
    Object.entries(valueMapping)
      .map(([key, value]) => {
        return `"${key}": ${valueToString(value, childLayer)}`
      })
      .join(',\n') +
    '}'
  )
}

let nestedLayerCount = 0

export function intrinsicToString(
  { kind, args, modifiers = [] }: Intrinsic,
  childLayer?: string,
): string {
  const selector = childLayer ?? `figma.currentLayer`
  switch (kind) {
    case IntrinsicKind.String:
      return `${selector}.__properties__.string('${args.figmaPropName}')`
    case IntrinsicKind.Instance: {
      // Outputs:
      // `const propName = figma.properties.string('propName')`, or
      // `const propName = figma.properties.boolean('propName')`, or
      // `const propName = figma.properties.instance('propName')`
      if (modifiers.length > 0) {
        const instance = `${selector}.__properties__.__instance__('${args.figmaPropName}')`
        return [instance, ...modifiers.map(modifierToString)].join('.')
      }
      return `${selector}.__properties__.instance('${args.figmaPropName}')`
    }
    case IntrinsicKind.Boolean: {
      if (args.valueMapping) {
        const mappingString = valueMappingToString(args.valueMapping, childLayer)
        // Outputs: `const propName = figma.properties.boolean('propName', { ... mapping object from above ... })`
        return `${selector}.__properties__.boolean('${args.figmaPropName}', ${mappingString})`
      }
      return `${selector}.__properties__.boolean('${args.figmaPropName}')`
    }
    case IntrinsicKind.Enum: {
      const mappingString = valueMappingToString(args.valueMapping, childLayer)

      // Outputs: `const propName = figma.properties.enum('propName', { ... mapping object from above ... })`
      return `${selector}.__properties__.enum('${args.figmaPropName}', ${mappingString})`
    }
    case IntrinsicKind.Children: {
      // Outputs: `const propName = figma.properties.children(["Layer 1", "Layer 2"])`
      return `${selector}.__properties__.children([${args.layers.map((layerName) => `"${layerName}"`).join(',')}])`
    }
    case IntrinsicKind.ClassName: {
      // Outputs: `const propName = ['btn-base', figma.currentLayer.__properties__.enum('Size, { Large: 'btn-large' })].join(" ")`
      return `[${args.className.map((className) => (typeof className === 'string' ? `"${className}"` : `${intrinsicToString(className, childLayer)}`)).join(', ')}].filter(v => !!v).join(' ')`
    }
    case IntrinsicKind.TextContent: {
      return `${selector}.__findChildWithCriteria__({ name: '${args.layer}', type: "TEXT" }).__render__()`
    }
    case IntrinsicKind.NestedProps: {
      let body: string = ''
      // the actual layer name in figma could have a bunch of special characters in it,
      // and if we try to normalize it to a valid JS identifier, it could conflict with
      // other variables in the template code. So we generate a unique variable name
      // for each nested layer reference instead. The only reason it's wrapped in a funciton
      // currently is to keep the error checking out of global scope
      const nestedLayerRef = `nestedLayer${nestedLayerCount++}`
      body += `const ${nestedLayerRef} = figma.currentLayer.__find__("${args.layer}")\n`
      body += `return ${nestedLayerRef}.type === "ERROR" ? ${nestedLayerRef} : {
${Object.entries(args.props).map(
  ([key, intrinsic]) => `${key}: ${intrinsicToString(intrinsic, nestedLayerRef)}\n`,
)}
        }\n`
      return `(function () {${body}})()`
    }
    default:
      throw new InternalError(`Unknown intrinsic: ${kind}`)
  }
}

function expressionToFccEnumValue(
  valueNode: ts.Expression,
  parserContext: ParserContext,
): FCCValue {
  if (ts.isParenthesizedExpression(valueNode)) {
    return expressionToFccEnumValue(valueNode.expression, parserContext)
  }

  if (ts.isJsxElement(valueNode) || ts.isJsxSelfClosingElement(valueNode)) {
    return _fcc_jsxElement(valueNode.getText())
  }

  if (ts.isArrowFunction(valueNode) || ts.isFunctionExpression(valueNode)) {
    return _fcc_function(valueNode.getText())
  }

  if (ts.isObjectLiteralExpression(valueNode)) {
    // should recursively convert to FCC
    return _fcc_object(parsePropsObject(valueNode, parserContext))
  }

  if (ts.isTemplateLiteral(valueNode)) {
    const str = valueNode.getText().replaceAll('`', '')
    return _fcc_templateString(str)
  }

  if (ts.isPropertyAccessExpression(valueNode)) {
    return _fcc_identifier(valueNode.getText())
  }

  // Fall back to the default conversion in `convertObjectLiteralToJs`
  return undefined
}

/**
 * Parses the `props` field in a `figma.connect()` call, returning a mapping of
 * prop names to their respective intrinsic types
 *
 * @param objectLiteral An object literal expression
 * @param parserContext Parser context
 * @returns
 */
export function parsePropsObject(
  objectLiteral: ts.ObjectLiteralExpression,
  parserContext: ParserContext,
): PropMappings {
  const { sourceFile, checker } = parserContext
  return convertObjectLiteralToJs(objectLiteral, sourceFile, checker, (valueNode) => {
    if (ts.isCallExpression(valueNode)) {
      return parseIntrinsic(valueNode, parserContext)
    }
    return expressionToFccEnumValue(valueNode, parserContext)
  }) as PropMappings
}

export type PropMappings = Record<string, Intrinsic>
