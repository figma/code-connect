import ts, { JsxExpression } from 'typescript'
import { FIGMA_CONNECT_CALL, PropMappings, valueToString } from './intrinsics'
import { highlight, reset } from '../common/logging'
import { error } from 'console'
import {
  assertIsObjectLiteralExpression,
  assertIsStringLiteral,
  convertObjectLiteralToJs,
  parsePropertyOfType,
  stripQuotesFromNode,
} from '../typescript/compiler'
import { BaseCodeConnectConfig } from './project'
import { CodeConnectJSON } from './figma_connect'

interface ParserErrorContext {
  sourceFile: ts.SourceFile
  node: ts.Node | undefined
}

export function getPositionInSourceFile(node: ts.Node, sourceFile: ts.SourceFile) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
}

export class ParserError extends Error {
  sourceFilePosition: ts.LineAndCharacter | null
  sourceFileName: string

  constructor(message: string, context?: ParserErrorContext) {
    super(message)
    this.name = 'ParserError'
    this.sourceFileName = context?.sourceFile.fileName || ''
    this.sourceFilePosition =
      context && context.node
        ? getPositionInSourceFile(context.node, context.sourceFile) || null
        : null
  }

  toString() {
    let msg = `${highlight(error(this.name))}: ${this.message}\n`
    if (this.sourceFileName && this.sourceFilePosition) {
      msg += ` -> ${reset(this.sourceFileName)}:${this.sourceFilePosition.line}:${
        this.sourceFilePosition.character
      }\n`
    }
    return msg
  }

  toDebugString() {
    return this.toString() + `\n ${this.stack}`
  }
}

export class InternalError extends ParserError {
  constructor(message: string) {
    super(message)
    this.name = 'InternalError'
  }
}

export interface ParserContext {
  checker: ts.TypeChecker
  sourceFile: ts.SourceFile
  resolvedImports: Record<string, string>
  config: any
  absPath: string
}

/**
 * Factory to create a function that is used to create `__PROP__(propName)`
 * function nodes, which are used to replace prop references and ultimately
 * replaced.
 *
 * @returns Function to create `__PROP__(propName)` function nodes
 */
export function makeCreatePropPlaceholder({
  propMappings,
  referencedProps,
  sourceFile,
}: {
  /** The prop mappings object */
  propMappings?: PropMappings | undefined
  /** The set of referenced props in the current example */
  referencedProps: Set<string>
  /** The source file */
  sourceFile: ts.SourceFile
}) {
  return function ({
    name,
    node,
    wrapInJsxExpression = false,
  }: {
    /** The prop name */
    name: string
    /** The props node, used for error reporting */
    node: ts.Node
    /** Whether to wrap the placeholder in a JSX expression node */
    wrapInJsxExpression?: boolean
  }) {
    let propReferenceName = name
    // for nested prop references like `nested.prop`, we only want to look for
    // the prop mapping of `nested`, but include the full `nested.prop` in the
    // __PROP__ call
    if (name.includes('.')) {
      propReferenceName = name.split('.')[0]
    }

    // if prop mappings exist, check that the prop reference is in the mappings
    if (propMappings) {
      const mappedProp = propMappings[propReferenceName]
      if (!mappedProp) {
        throw new ParserError(
          `Could not find prop mapping for ${propReferenceName} in the props object`,
          {
            sourceFile,
            node,
          },
        )
      }
    }

    referencedProps.add(propReferenceName)
    const callExpression = ts.factory.createCallExpression(
      ts.factory.createIdentifier('__PROP__'),
      undefined,
      [ts.factory.createStringLiteral(name)],
    )

    if (wrapInJsxExpression) {
      return ts.factory.createJsxExpression(undefined, callExpression)
    } else {
      return callExpression
    }
  }
}

/**
 * TS AST visitor function for use with example functions, which replaces
 * references to the `props` argument in various forms in the example code with
 * `__PROP__(propName)` placeholders (created with a createPropPlaceholder
 * function).
 *
 * This is called when transforming the TS AST, and allows us to normalise the
 * different forms of supported prop references into a single representation,
 * which we can then handle consistently (currently we replace the placeholders,
 * using a regex).
 *
 * @returns Placeholder node, or undefined if the node is not a supported prop
 * reference (which results in no transformation)
 */
export function visitPropReferencingNode({
  propsParameter,
  node,
  createPropPlaceholder,
  useJsx,
}: {
  /** The props function parameter node */
  propsParameter: ts.ParameterDeclaration
  /** The node to visit */
  node: ts.Node
  /**
   * The function to create `__PROP__(propName)` function nodes, created by
   * `baseCreatePropPlaceholder`
   * */
  createPropPlaceholder: ReturnType<typeof makeCreatePropPlaceholder>
  /** Whether to support JSX syntax or not */
  useJsx?: boolean
}): ts.Expression | undefined {
  // `props.` notation
  if (
    ts.isIdentifier(propsParameter.name) &&
    ts.isPropertyAccessExpression(node) &&
    node.expression.getText().startsWith(propsParameter.name.getText())
  ) {
    // nested notation e.g `props.nested.prop`
    if (ts.isPropertyAccessExpression(node.expression)) {
      let current: ts.Node = node
      const parts: string[] = []

      // Build the property name by traversing up the chain
      while (ts.isPropertyAccessExpression(current)) {
        parts.unshift(current.name.getText())
        current = current.expression
      }

      // Join the parts together to form the full property name
      const name = parts.join('.')
      return createPropPlaceholder({ name, node })
    }
    const name = node.name.getText()
    return createPropPlaceholder({ name, node })
  }
  // `props[""]` notation
  if (
    ts.isIdentifier(propsParameter.name) &&
    ts.isElementAccessExpression(node) &&
    node.expression.getText().startsWith(propsParameter.name.getText()) &&
    ts.isStringLiteral(node.argumentExpression)
  ) {
    const name = stripQuotesFromNode(node.argumentExpression)
    return createPropPlaceholder({ name, node })
  }
  // object destructuring references
  if (ts.isObjectBindingPattern(propsParameter.name)) {
    const isValidNode = useJsx
      ? ts.isJsxExpression(node)
      : ts.isPropertyAccessExpression(node) || ts.isIdentifier(node)
    const target = useJsx ? (node as JsxExpression).expression : node

    if (
      isValidNode &&
      target &&
      propsParameter.name.elements.find((el) => target?.getText().startsWith(el.name.getText()))
    ) {
      const name = target.getText()
      return createPropPlaceholder({ name, node, wrapInJsxExpression: useJsx })
    }
  }

  return undefined
}

/**
 * Get template code to create variables referencing the props in the prop
 * mappings. This converts the prop mappings into JS calls like `const propName
 * = figma.properties.string('Prop Name')`, which can then be prepended to the
 * template code.
 *
 * @returns Template code string
 */
export function getReferencedPropsForTemplate({
  propMappings = {},
}: {
  /** The prop mappings object */
  propMappings: PropMappings | undefined
  /** The top level node, used for error reporting */
  exp: ts.Node
  /** The source file */
  sourceFile: ts.SourceFile
}) {
  let templateCode = ''

  if (Object.keys(propMappings).length > 0) {
    for (const prop in propMappings) {
      const propMapping = propMappings[prop]
      templateCode += `const ${prop} = ${valueToString(propMapping)}\n`
    }
    templateCode += `const __props = {}\n`
    Object.keys(propMappings).forEach((prop) => {
      // If trying to render prop resulted in an error (e.g. layer was not found
      // because it was invisible), don't include it in the __props object as
      // this will result in a runtime error.
      //
      // TODO Note that this can also happen if there is a typo in the prop name
      // of a nested prop, because we don't validate these at publish time,
      // which would be confusing. Perhaps we should have a way to show a
      // warning but not an error to the user.
      templateCode += `if (${prop} && ${prop}.type !== 'ERROR') {
  __props["${prop}"] = ${prop}
}\n`
    })
    templateCode += `\n`
  }

  return templateCode
}

/**
 * Checks if a file contains Code Connect by looking for the `figma.connect()` function call
 */
export function isFigmaConnectFile(
  program: ts.Program,
  file: string,
  extension: string | string[],
) {
  const allowedExtensions = Array.isArray(extension) ? extension : [extension]
  const fileExtension = file.split('.').pop()

  // If the file has no extension, we can't determine if it's a Code Connect file
  if (!fileExtension) {
    return false
  }

  // If the file extension is not in the list of supported extensions, it's not a Code Connect file
  if (!allowedExtensions.includes(fileExtension)) {
    return false
  }

  const sourceFile = program.getSourceFile(file)
  if (!sourceFile) {
    throw new InternalError(`Could not find source file for ${file}`)
  }

  return (
    findDescendants(sourceFile, (node: ts.Node) => {
      if (isFigmaConnectCall(node, sourceFile)) {
        return true
      }
      return false
    }).length > 0
  )
}

/**
 * Checks if an AST node is a `figma.connect()` call
 *
 * @param node AST node
 * @param sourceFile Source file
 * @returns True if the node is a `figma.connect()` call
 */
export function isFigmaConnectCall(
  node: ts.Node,
  sourceFile: ts.SourceFile,
): node is ts.CallExpression {
  return (
    ts.isCallExpression(node) && node.expression.getText(sourceFile).includes(FIGMA_CONNECT_CALL)
  )
}

export function findDescendants(node: ts.Node, cb: (node: ts.Node) => boolean): ts.Node[] {
  const matches: ts.Node[] = []
  function visit(node: ts.Node) {
    if (cb(node)) {
      matches.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(node)
  return matches
}

/**
 * Parses the `links` field of a `figma.connect()` call
 *
 * @param linksArray an ArrayLiteralExpression
 * @param parserContext Parser context
 * @returns An array of link objects
 */
export function parseLinks(linksArray: ts.ArrayLiteralExpression, parserContext: ParserContext) {
  const { sourceFile } = parserContext
  const links: { name: string; url: string }[] = []
  for (const element of linksArray.elements) {
    assertIsObjectLiteralExpression(
      element,
      sourceFile,
      `'links' must be an array literal with objects of the format { name: string, url: string }`,
    )
    const name = parsePropertyOfType({
      objectLiteralNode: element,
      propertyName: 'name',
      predicate: ts.isStringLiteral,
      parserContext,
      required: true,
      errorMessage: "The 'name' property must be a string literal",
    })
    const url = parsePropertyOfType({
      objectLiteralNode: element,
      propertyName: 'url',
      predicate: ts.isStringLiteral,
      parserContext,
      required: true,
      errorMessage: "The 'url' property must be a string literal",
    })

    if (name && url) {
      links.push({ name: stripQuotesFromNode(name), url: stripQuotesFromNode(url) })
    }
  }

  return links
}

export function parseVariant(
  variantMap: ts.ObjectLiteralExpression,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
) {
  return convertObjectLiteralToJs(variantMap, sourceFile, checker, (valueNode) => {
    if (
      !ts.isObjectLiteralElement(valueNode) &&
      !ts.isStringLiteral(valueNode) &&
      !ts.isNumericLiteral(valueNode) &&
      valueNode.kind !== ts.SyntaxKind.TrueKeyword &&
      valueNode.kind !== ts.SyntaxKind.FalseKeyword
    ) {
      throw new ParserError(`Invalid value for variant, got: ${valueNode.getText()}`, {
        node: valueNode,
        sourceFile,
      })
    }
  })
}

/**
 * Parses the `imports` field of a `figma.connect()` call
 *
 * @param importsArray an ArrayLiteralExpression
 * @param parserContext Parser context
 * @returns An array of link objects
 */
export function parseImports(
  importsArray: ts.ArrayLiteralExpression,
  parserContext: ParserContext,
) {
  const { sourceFile } = parserContext
  const imports: string[] = []
  for (const element of importsArray.elements) {
    assertIsStringLiteral(element, sourceFile, `'imports' must be an array literal with strings`)
    imports.push(stripQuotesFromNode(element))
  }

  return imports
}

export type ParseOptions = {
  repoUrl?: string
  debug?: boolean
  silent?: boolean
}

export type ParseFn = (
  node: ts.CallExpression,
  parserContext: ParserContext,
  { repoUrl, silent }: ParseOptions,
) => Promise<CodeConnectJSON>

export type ResolveImportsFn = (
  program: ts.Program,
  sourceFile: ts.SourceFile,
) => Record<string, string>

export async function parseCodeConnect<T extends BaseCodeConnectConfig>({
  program,
  file,
  config,
  absPath,
  parseFn,
  resolveImportsFn,
  parseOptions = {},
}: {
  program: ts.Program
  file: string
  config: T
  absPath: string
  parseFn: ParseFn
  resolveImportsFn?: ResolveImportsFn
  parseOptions?: ParseOptions
}): Promise<any[]> {
  const sourceFile = program.getSourceFile(file)
  if (!sourceFile) {
    throw new InternalError(`Could not find source file for ${file}`)
  }

  const parserContext = {
    checker: program.getTypeChecker(),
    sourceFile,
    resolvedImports: resolveImportsFn ? resolveImportsFn(program, sourceFile) : {},
    config,
    absPath,
  }
  const codeConnectObjects: CodeConnectJSON[] = []

  const nodes: ts.Node[] = [parserContext.sourceFile]
  while (nodes.length > 0) {
    const node = nodes.shift()!
    if (isFigmaConnectCall(node, parserContext.sourceFile)) {
      const doc = await parseFn(node, parserContext, parseOptions)
      if (doc) {
        codeConnectObjects.push(doc)
      }
    }
    nodes.push(...node.getChildren(parserContext.sourceFile))
  }

  if (codeConnectObjects.length === 0) {
    throw new ParserError(`Didn't find any calls to figma.connect()`, {
      sourceFile: parserContext.sourceFile,
      node: parserContext.sourceFile,
    })
  }

  return codeConnectObjects
}
