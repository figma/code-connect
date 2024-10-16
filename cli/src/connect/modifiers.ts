import * as ts from 'typescript'
import { ConnectedComponent } from './api'
import { ParserContext, ParserError } from './parser_common'
import { findJSXElement, parseRenderFunctionExpression } from '../react/parser'

export enum ModifierKind {
  GetProps = 'getProps',
  Render = 'render',
}

export interface ModifierBase {
  kind: ModifierKind
}

export interface GetPropsModifier extends ModifierBase {
  kind: ModifierKind.GetProps
}

export interface RenderModifier extends ModifierBase {
  kind: ModifierKind.Render
  args: {
    renderFn: {
      code: string
      imports: { statement: string; file: string }[]
      referencedProps: Set<string>
    }
  }
}

export type Modifier = GetPropsModifier | RenderModifier

type PickMatching<T, V> = {
  [K in keyof T as T[K] extends V ? K : never]: {
    match: (exp: ts.CallExpression) => exp is ts.CallExpression
    parse: (exp: ts.CallExpression, parser: ParserContext) => Modifier
  }
}
type ExtractMethods<T> = PickMatching<T, Function>

const Modifiers: {
  [key: string]: {
    match: (exp: ts.CallExpression) => exp is ts.CallExpression
    parse: (exp: ts.CallExpression, parser: ParserContext) => Modifier
  }
} = {
  ...getInstanceModifiers(),
}

function makeModifier(
  modifierName: string,
  modifier: (exp: ts.CallExpression, parser: ParserContext) => Modifier,
) {
  return {
    match: (exp: ts.CallExpression): exp is ts.CallExpression => {
      return (
        ts.isCallExpression(exp) &&
        ts.isPropertyAccessExpression(exp.expression) &&
        exp.expression.name.getText() === modifierName
      )
    },
    parse: modifier,
  }
}

function getInstanceModifiers(): ExtractMethods<ConnectedComponent> {
  return {
    getProps: makeModifier('getProps', () => {
      return {
        kind: ModifierKind.GetProps,
      }
    }),
    render: makeModifier('render', (exp, parserContext) => {
      const renderFunction = exp.arguments?.[0]
      if (
        renderFunction &&
        (ts.isArrowFunction(renderFunction) ||
          ts.isFunctionExpression(renderFunction) ||
          ts.isFunctionDeclaration(renderFunction)) &&
        findJSXElement(renderFunction)
      ) {
        const { code, imports, referencedProps } = parseRenderFunctionExpression(
          renderFunction,
          parserContext,
        )
        return {
          kind: ModifierKind.Render,
          args: {
            renderFn: {
              code,
              imports,
              referencedProps,
            },
          },
        }
      } else {
        throw new ParserError(
          'first argument to render() must be a render function that returns a single JSX element',
          {
            node: exp,
            sourceFile: parserContext.sourceFile,
          },
        )
      }
    }),
  }
}

export function parseModifier(exp: ts.CallExpression, parserContext: ParserContext): Modifier {
  for (const key in Modifiers) {
    if (Modifiers[key].match(exp)) {
      return Modifiers[key].parse(exp, parserContext)
    }
  }

  throw new ParserError(`Unknown modifier: ${exp.getText()}`, {
    node: exp,
    sourceFile: parserContext.sourceFile,
  })
}

export function modifierToString(modifier: Modifier) {
  switch (modifier.kind) {
    case ModifierKind.GetProps: {
      return '__getProps__()'
    }
    case ModifierKind.Render: {
      const { code, referencedProps } = modifier.args.renderFn
      return `__renderWithFn__(({${Array.from(referencedProps).join(',')}}) => ${code})`
    }
    default:
      throw new Error('Unknown modifier')
  }
}
