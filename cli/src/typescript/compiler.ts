import ts, { isTaggedTemplateExpression } from 'typescript'
import { ParserContext, ParserError } from '../connect/parser_common'

/**
 * Get the default export from a TypeScript source file
 *
 * @param sourceFile TypeScript source file
 * @returns The default export Expression, or undefined if there is no default export
 */
export function getDefaultExport(sourceFile: ts.SourceFile): ts.Expression | undefined {
  for (const statement of sourceFile.statements) {
    if (ts.isExportAssignment(statement) && ts.isIdentifier(statement.expression)) {
      // The default export is a reference to another variable
      const identifierName = statement.expression.text
      // Find the variable declaration that matches the identifier
      for (const stmt of sourceFile.statements) {
        if (ts.isVariableStatement(stmt)) {
          for (const declaration of stmt.declarationList.declarations) {
            if (ts.isIdentifier(declaration.name) && declaration.name.text === identifierName) {
              // Return the initializer of the variable declaration
              return declaration.initializer
            }
          }
        }
      }
    } else if (ts.isExportAssignment(statement)) {
      // The default export is not a reference to another variable
      return statement.expression
    }
  }
}
/**
 * Perform a breadth-first search to find the first node matching a predicate
 *
 * @param node Node to start the search from
 * @param tsSourceFile SourceFile associated with the node
 * @param predicate Predicate to match
 * @returns The first node matching the predicate, or undefined if no node is found
 */
export function bfsFindNode(
  node: ts.Node,
  tsSourceFile: ts.SourceFile,
  predicate: (node: ts.Node) => boolean,
): ts.Node | undefined {
  const queue = [node]
  while (queue.length > 0) {
    node = queue.shift()!
    if (predicate(node)) {
      return node
    }

    if (node && node.getChildCount(tsSourceFile) > 0) {
      queue.push(...node.getChildren(tsSourceFile))
    }
  }
}

/**
 * Gets a property with the specified name and type (via predicate) from an object literal node
 *
 * @param objectLiteralNode The object literal node potentially containing the property
 * @param propertyName The name of the property to get
 * @param predicate Optional predicate to match
 * @param required Whether the property is required. Defaults to false.
 * If true, an error will be thrown if the property is not found
 * @param errorMessage Optional error message to throw if the property is not found
 * @returns The property, or undefined if the property is not found
 */
export function parsePropertyOfType<T extends ts.Node>(params: {
  objectLiteralNode: ts.ObjectLiteralExpression
  propertyName: string
  predicate: (node: ts.Node) => node is T
  parserContext: ParserContext
  required?: true
  errorMessage?: string
}): T

export function parsePropertyOfType<T extends ts.Node>(params: {
  objectLiteralNode: ts.ObjectLiteralExpression
  propertyName: string
  predicate: (node: ts.Node) => node is T
  parserContext: ParserContext
  required?: false
  errorMessage?: string
}): T | undefined

export function parsePropertyOfType<T extends ts.Node>(params: {
  objectLiteralNode: ts.ObjectLiteralExpression
  propertyName: string
  predicate: (node: ts.Node) => node is T
  parserContext: ParserContext
  required?: boolean
  errorMessage?: string
}): T | undefined

export function parsePropertyOfType<T extends ts.Node>({
  objectLiteralNode,
  propertyName,
  predicate,
  parserContext,
  required = false,
  errorMessage,
}: {
  objectLiteralNode: ts.ObjectLiteralExpression
  propertyName: string
  predicate: (node: ts.Node) => node is T
  parserContext: ParserContext
  required?: boolean
  errorMessage?: string
}): T | undefined {
  const { sourceFile, checker } = parserContext
  const node = objectLiteralNode.properties.find(
    (property) => property.name?.getText() === propertyName,
  )

  if (!node) {
    if (!required) {
      return undefined
    } else {
      throw new ParserError(errorMessage ?? `Expected property '${propertyName}' to be present`, {
        sourceFile,
        node: objectLiteralNode,
      })
    }
  }

  let initializer: ts.Expression | undefined

  if (ts.isPropertyAssignment(node)) {
    if (ts.isIdentifier(node.initializer)) {
      const symbol = checker.getSymbolAtLocation(node.initializer)
      if (symbol) {
        const decl = symbol.valueDeclaration
        if (decl && ts.isVariableDeclaration(decl) && decl.initializer) {
          initializer = decl.initializer
        }
      }
    } else {
      initializer = node.initializer
    }
  }

  if (ts.isShorthandPropertyAssignment(node)) {
    const symbol = checker.getShorthandAssignmentValueSymbol(node)
    if (!symbol || !symbol.valueDeclaration || !ts.isVariableDeclaration(symbol.valueDeclaration)) {
      throw new ParserError('Expected shorthand property to be declared in the same file', {
        sourceFile,
        node,
      })
    }
    initializer = symbol.valueDeclaration.initializer
  }

  if (!initializer) {
    throw new ParserError(`Expected property ${propertyName} to be a property assignment`, {
      sourceFile,
      node,
    })
  }

  // Unwrap `as Type` or `satisfies Type` expressions
  if (ts.isAsExpression(initializer) || ts.isSatisfiesExpression(initializer)) {
    initializer = initializer.expression
  }

  if (!predicate(initializer)) {
    throw new ParserError(
      errorMessage ??
        `Unexpected shape of property ${propertyName}, got node type: ${ts.SyntaxKind[initializer.kind]}`,
      {
        sourceFile,
        node: initializer,
      },
    )
  }

  return initializer
}

type TypeGuard<A, B extends A> = (a: A) => a is B
type GuardType<T> = T extends (o: any) => o is infer U ? U : never

/**
 * Combines several type guards into one.
 *
 * The returned function checks if any of the type guards in the list matches the argument,
 * and infers the type based on the matching type guard.
 *
 * @param guards A list of type guards
 */
export function isOneOf<T extends TypeGuard<any, any>>(
  guards: T[],
): [T] extends [TypeGuard<infer A, any>] ? (a: A) => a is GuardType<T> : never
export function isOneOf<T extends TypeGuard<any, any>>(guards: T[]) {
  return function (arg: T) {
    return guards.some(function (predicate) {
      return predicate(arg)
    })
  }
}

/**
 * Gets a function argument with the specified index from a call expression node
 *
 * @param fn The call expression node potentially containing the argument
 * @param parserContext The parser context
 * @param index The index of the argument to get
 * @param predicate Predicate to match
 * @param required Whether the argument is required. Defaults to false.
 * @param errorMessage Optional error message to throw if the argument is not found
 * @returns
 */
export function parseFunctionArgument<T extends ts.Node>(
  fn: ts.CallExpression,
  parserContext: ParserContext,
  index: number,
  predicate: (node: ts.Node) => node is T,
  required = false,
  errorMessage?: string,
): T | undefined {
  const { sourceFile } = parserContext

  if (fn.arguments.length <= index && !required) {
    return undefined
  }

  if (fn.arguments.length <= index) {
    throw new ParserError(
      errorMessage ?? `Expected function to have at least ${index + 1} arguments`,
      {
        sourceFile,
        node: fn,
      },
    )
  }

  const arg = fn.arguments[index]
  if (!arg || !predicate(arg)) {
    throw new ParserError(errorMessage ?? `Unexpected shape of argument ${index}`, {
      sourceFile,
      node: fn.arguments[index],
    })
  }

  return arg
}

export function assertIsPropertyAssignment(
  node: ts.Node,
  sourceFile: ts.SourceFile,
): asserts node is ts.PropertyAssignment {
  if (!ts.isPropertyAssignment(node)) {
    throw new ParserError(`Expected a property assignment, got ${ts.SyntaxKind[node.kind]}`, {
      node,
      sourceFile,
    })
  }
}

export function assertIsStringLiteral(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  msg?: string,
): asserts node is ts.StringLiteral {
  if (!ts.isStringLiteral(node)) {
    throw new ParserError(msg ?? `Expected a string literal, got ${ts.SyntaxKind[node.kind]}`, {
      node,
      sourceFile,
    })
  }
}

export function assertIsArrayLiteralExpression(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  msg?: string,
): asserts node is ts.ArrayLiteralExpression {
  if (!ts.isArrayLiteralExpression(node)) {
    throw new ParserError(msg ?? `Expected an array literal, got ${ts.SyntaxKind[node.kind]}`, {
      node,
      sourceFile,
    })
  }
}

export function assertIsObjectLiteralExpression(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  msg?: string,
): asserts node is ts.ObjectLiteralExpression {
  if (!ts.isObjectLiteralExpression(node)) {
    throw new ParserError(msg ?? `Expected an object literal, got ${ts.SyntaxKind[node.kind]}`, {
      node,
      sourceFile,
    })
  }
}

export function assertIsIdentifier(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  msg?: string,
): asserts node is ts.Identifier {
  if (!ts.isIdentifier(node)) {
    throw new ParserError(msg ?? `Expected an identifier, got ${ts.SyntaxKind[node.kind]}`, {
      node,
      sourceFile,
    })
  }
}

function convertValueNodeToJs(
  valueNode: ts.Expression,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  extraConversionFn?: (node: ts.Expression) => any,
): any {
  if (ts.isObjectLiteralExpression(valueNode)) {
    // A prop mapping to an object literal, which maps each figma value to a code value
    return convertObjectLiteralToJs(valueNode, sourceFile, checker, extraConversionFn)
  } else {
    // A prop mapping to anything else, which will be passed as a literal value
    if (ts.isStringLiteral(valueNode)) {
      // Accessing `text` directly prevents the value being wrapped in quotes
      return valueNode.text
    } else if (valueNode.kind === ts.SyntaxKind.TrueKeyword) {
      return true
    } else if (valueNode.kind === ts.SyntaxKind.FalseKeyword) {
      return false
      // undefined is not a keyword in TypeScript, but actually translates to an identifier
      // (even though confusingly ts.SyntaxKind.UndefinedKeyword exists)
    } else if (ts.isIdentifier(valueNode) && valueNode.text === 'undefined') {
      return undefined
    } else if (valueNode.kind === ts.SyntaxKind.NullKeyword) {
      return null
    } else if (valueNode.kind === ts.SyntaxKind.NumericLiteral) {
      return parseFloat(valueNode.getText())
    } else if (isTaggedTemplateExpression(valueNode)) {
      // Return the content of the template string without the backticks
      return valueNode.template.getText().replace(/^`/, '').replace(/`$/, '')
    } else {
      return valueNode.getText()
    }
  }
}

/**
 * Convert an object literal node to a JavaScript object
 *
 * @param objectLiteral The object literal node to convert
 * @param sourceFile The source file containing the object literal
 * @param extraConversionFn Optional function to convert a node to a value. This
 * runs before the default conversion. If this returns undefined, the default
 * conversion will be used. (This does mean there's no way to return undefined)
 * @returns The JavaScript object version of the object literal
 */
export function convertObjectLiteralToJs(
  objectLiteral: ts.ObjectLiteralExpression,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  extraConversionFn?: (node: ts.Expression) => any,
) {
  const obj = {} as Record<string, any>
  const properties = [...objectLiteral.properties]

  while (properties.length > 0) {
    const prop = properties.shift()!

    // If the value is a spread assignment, we need to resolve the object it's spreading
    // and add its properties to the current object
    if (ts.isSpreadAssignment(prop)) {
      const declaration = bfsFindNode(sourceFile, sourceFile, (node) => {
        return ts.isVariableDeclaration(node) && node.name.getText() === prop.expression.getText()
      }) as ts.VariableDeclaration
      if (!declaration.initializer || !ts.isObjectLiteralExpression(declaration.initializer)) {
        throw new ParserError('Expected spread object to be an object literal', {
          sourceFile,
          node: prop,
        })
      }

      for (const prop of declaration.initializer.properties) {
        properties.push(prop)
      }
      continue
    }

    assertIsPropertyAssignment(prop, sourceFile)
    if (!ts.isIdentifier(prop.name) && !ts.isStringLiteral(prop.name)) {
      throw new ParserError('Expected property key to be an identifier or String Literal', {
        sourceFile,
        node: prop,
      })
    }
    const key = prop.name.text
    const valueNode = prop.initializer

    const extraConversionResult = extraConversionFn && extraConversionFn(valueNode)

    if (extraConversionResult !== undefined) {
      obj[key] = extraConversionResult
    } else {
      obj[key] = convertValueNodeToJs(valueNode, sourceFile, checker, extraConversionFn)
    }
  }

  return obj
}

/**
 * Convert an Array literal node to a JavaScript array
 *
 * @param arrayLiteral The array literal node to convert
 * @param sourceFile The source file containing the array literal
 * @param extraConversionFn Optional function to convert a node to a value. This
 * runs before the default conversion. If this returns undefined, the default
 * conversion will be used. (This does mean there's no way to return undefined)
 * @returns The JavaScript object version of the object literal
 */
export function convertArrayLiteralToJs(
  arrayLiteral: ts.ArrayLiteralExpression,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  extraConversionFn?: (node: ts.Expression) => any,
) {
  return arrayLiteral.elements.map((element) => {
    const extraConversionResult = extraConversionFn && extraConversionFn(element)
    if (extraConversionResult !== undefined) {
      return extraConversionResult
    } else {
      return convertValueNodeToJs(element, sourceFile, checker, extraConversionFn)
    }
  })
}

export function getTagName(element: ts.JsxElement | ts.JsxSelfClosingElement) {
  if (ts.isJsxSelfClosingElement(element)) {
    return element.tagName.getText()
  } else {
    return element.openingElement.tagName.getText()
  }
}

export function stripQuotesFromNode(node: ts.StringLiteral) {
  return stripQuotes(node.text)
}

function stripQuotes(text: string) {
  if (text.startsWith('"') || text.startsWith("'")) {
    return text.substring(1, text.length - 1)
  }
  return text
}

export function isUndefinedType(node: ts.Node, checker: ts.TypeChecker): boolean {
  const type = checker.getTypeAtLocation(node)
  return (type.getFlags() & ts.TypeFlags.Undefined) !== 0
}
