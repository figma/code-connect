import ts from 'typescript'
import * as prettier from 'prettier'
import { FigmaConnectConfig, getRemoteFileUrl, resolveImportPath } from './project'
import { error, highlight, logger, reset } from './logging'
import {
  assertIsObjectLiteralExpression,
  convertObjectLiteralToJs,
  bfsFindNode,
  getTagName,
  stripQuotes,
  parsePropertyOfType,
  parseFunctionArgument,
  isOneOf,
} from './compiler'
import {
  FIGMA_CONNECT_CALL,
  Intrinsic,
  IntrinsicKind,
  ValueMappingKind,
  intrinsicToString,
  parseIntrinsic,
} from './intrinsics'
import { FigmaConnectJSON } from './figma_connect'
import { FigmaConnectMeta } from './api'
import { getParsedTemplateHelpersString } from './parser_template_helpers'

interface ParserErrorContext {
  sourceFile: ts.SourceFile
  node: ts.Node | undefined
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
      msg += ` -> ${reset(this.sourceFileName)}:${this.sourceFilePosition.line}:${this.sourceFilePosition.character}\n`
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
  config: FigmaConnectConfig | undefined
}

/**
 * Traverses the AST and returns the first JSX element it finds
 * @param node AST node
 * @returns
 */
function findJSXElement(
  node: ts.Node,
): ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxFragment | undefined {
  if (ts.isJsxElement(node) || ts.isJsxFragment(node) || ts.isJsxSelfClosingElement(node)) {
    return node
  } else {
    return ts.forEachChild(node, findJSXElement)
  }
}

function findBlock(node: ts.Node): ts.Block | undefined {
  if (ts.isBlock(node)) {
    return node
  } else {
    return ts.forEachChild(node, findBlock)
  }
}

function findDescendants(node: ts.Node, cb: (node: ts.Node) => boolean): ts.Node[] {
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

function getPositionInSourceFile(node: ts.Node, sourceFile: ts.SourceFile) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
}

/**
 * Walks up the AST from an assignment to find the import declaration
 */
function findParentImportDeclaration(
  declaration: ts.Declaration,
): ts.ImportDeclaration | undefined {
  let current = declaration
  while (current) {
    if (ts.isImportDeclaration(current)) {
      return current
    }
    current = current.parent as ts.Declaration
  }
}

function getImportsOfModule(sourceFile: ts.SourceFile): ts.ImportDeclaration[] {
  const imports: ts.ImportDeclaration[] = []

  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node)) {
      imports.push(node)
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)

  return imports
}

/**
 * Finds all import statements in a file that matches the given identifiers
 *
 * @param parserContext Parser context
 * @param identifiers List of identifiers to find imports for
 * @returns
 */
function getImportsForIdentifiers({ sourceFile }: ParserContext, _identifiers: string[]) {
  const importDeclarations = getImportsOfModule(sourceFile)
  const imports: {
    statement: string
    file: string
  }[] = []

  const identifiers = _identifiers.map((identifier) => identifier.split('.')[0])

  for (const declaration of importDeclarations) {
    let statement = declaration.getText()
    const file = declaration.getSourceFile()

    if (declaration.importClause) {
      // Default imports
      if (declaration.importClause.name) {
        const identifier = declaration.importClause.name.text
        if (identifiers.includes(identifier)) {
          imports.push({
            statement,
            file: file.fileName,
          })
        }
      }

      if (declaration.importClause.namedBindings) {
        const namedBindings = declaration.importClause.namedBindings

        if (ts.isNamedImports(namedBindings)) {
          // Named imports (import { x, y } from 'module')
          // filter out any unused imports from the statement the identifier belongs to
          const elements = namedBindings.elements
            .map((specifier) => specifier.name.text)
            .filter((name) => identifiers.includes(name))

          if (elements.length > 0) {
            imports.push({
              statement: statement.replace(/{.*}/s, `{ ${elements.join(', ')} }`),
              file: file.fileName,
            })
          }
        } else if (ts.isNamespaceImport(namedBindings)) {
          // Namespace import (import * as name from 'module')
          const identifier = namedBindings.name.text
          if (identifiers.includes(identifier)) {
            imports.push({
              statement,
              file: file.fileName,
            })
          }
        }
      }
    }
  }

  return imports
}

/**
 * Parsers the `props` field of a `Figma.connect()` call, returning a mapping of
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
  })
}

export type PropMappings = Record<string, Intrinsic>

/**
 * Extract metadata about the referenced React component. Used by both the
 * Figmadoc and Storybook commands.
 *
 * @param parserContext Parser context
 * @param componentSymbol The ts.Symbol from the metadata referencing the
 * component being documented
 * @param node The node being parsed. Used for error logging.
 * @returns Metadata object
 */
export async function parseComponentMetadata(
  node: ts.PropertyAccessExpression | ts.Identifier | ts.Expression,
  { checker, sourceFile }: ParserContext,
) {
  let componentSymbol = checker.getSymbolAtLocation(node)
  let componentSourceFile = sourceFile
  let component = ''
  let componentDeclaration

  // Hacky fix for namespaced components, this probably doesn't work for storybook
  if (ts.isPropertyAccessExpression(node)) {
    componentSymbol = checker.getSymbolAtLocation(node.expression)
    if (!componentSymbol) {
      throw new ParserError(`Could not find symbol for component ${node.expression.getText()}`, {
        sourceFile,
        node,
      })
    }
  }

  // Component declared in a different file
  if (
    componentSymbol &&
    componentSymbol.declarations &&
    (ts.isImportSpecifier(componentSymbol.declarations[0]) ||
      ts.isImportClause(componentSymbol.declarations[0]))
  ) {
    let importDeclaration = findParentImportDeclaration(componentSymbol.declarations[0])
    if (!importDeclaration) {
      throw new ParserError(
        'No import statement found for component, make sure the component is imported',
        {
          sourceFile,
          node,
        },
      )
    }

    // The component should be imported from another file, we need to follow the
    // aliased symbol to get the correct function definition
    if (componentSymbol.flags & ts.SymbolFlags.Alias) {
      componentSymbol = checker.getAliasedSymbol(componentSymbol)
    }

    if (!componentSymbol || !componentSymbol.declarations) {
      logger.warn(
        `Import for ${node.getText()} could not be resolved, make sure that your \`include\` globs in \`figma.config.json\` matches the component source file (in addition to the Code Connect file). If you're using path aliases, make sure to include the same aliases in \`figma.config.json\` with the \`paths\` option.`,
      )
      return {
        source: '',
        line: 0,
        component: node.getText(),
      }
    }

    // If we haven't found the component declaration by now, it's likely because it's
    // assigned to an object/namespace, for example: `export const Button = { Primary: () => <button /> }`,
    // so we need to find the function declaration by traversing the AST in that file.
    if (!ts.isFunctionDeclaration(componentSymbol.declarations[0])) {
      const sourceFile = componentSymbol.declarations[0].getSourceFile()
      bfsFindNode(sourceFile, sourceFile, (node) => {
        if (
          (ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) &&
          node.name &&
          componentSymbol?.name &&
          node.name.getText() === componentSymbol.name
        ) {
          componentSymbol = checker.getSymbolAtLocation(node.name)
          return true
        }
        return false
      })
    }

    componentDeclaration = componentSymbol.declarations[0]
    componentSourceFile = componentDeclaration.getSourceFile()
  } else {
    componentDeclaration = componentSymbol?.declarations?.[0]
  }

  const source = componentSourceFile.fileName
  if (!source) {
    throw new InternalError(
      `Could not find source file for component ${component} - is this file included in the directory passed to \`figma connect <dir>\`?`,
    )
  }

  if (!componentDeclaration) {
    throw new ParserError(`Could not find declaration for component ${component}`, {
      sourceFile,
      node,
    })
  }

  const line = getPositionInSourceFile(componentDeclaration, componentSourceFile).line
  if (line === undefined) {
    throw new InternalError(
      `Could not determine line number for component ${componentDeclaration.getStart(sourceFile)}`,
    )
  }

  return {
    source,
    line,
    component: node.getText(),
  }
}

/**
 * Checks if an AST node is a `Figma.connect()` call
 *
 * @param node AST node
 * @param sourceFile Source file
 * @returns True if the node is a `Figma.connect()` call
 */
function isFigmaConnectCall(node: ts.Node, sourceFile: ts.SourceFile): node is ts.CallExpression {
  return (
    ts.isCallExpression(node) && node.expression.getText(sourceFile).includes(FIGMA_CONNECT_CALL)
  )
}

/**
 * Checks if a file contains figmadoc by looking for the `Figma.connect()` function call
 *
 * @param program
 * @param file
 * @returns
 */
export function isFigmaConnectFile(program: ts.Program, file: string) {
  // We don't support Figmadoc in JSX and this throws an error if we let it proceed
  if (!file.endsWith('.tsx')) {
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
 * Parses the `links` field of a `Figma.connect()` call
 *
 * @param linksArray an ArrayLiteralExpression
 * @param parserContext Parser context
 * @returns An array of link objects
 */
function parseLinks(linksArray: ts.ArrayLiteralExpression, parserContext: ParserContext) {
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
      links.push({ name: stripQuotes(name), url: stripQuotes(url) })
    }
  }

  return links
}

function parseVariant(
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
 * Parses the render function passed to `Figma.connect()`, extracting the code and
 * any import statements matching the JSX elements used in the function body
 *
 * @param exp A function or arrow function expression
 * @param parserContext Parser context
 * @param propMappings Prop mappings object as returned by parseProps
 *
 * @returns The code of the render function and a list of imports
 */
export function parseRenderFunction(
  exp: ts.ArrowFunction | ts.FunctionExpression | ts.FunctionDeclaration,
  parserContext: ParserContext,
  propMappings?: PropMappings,
) {
  const { sourceFile } = parserContext

  let jsx = findJSXElement(exp)
  let exampleCode: string

  if (exp.parameters.length > 1) {
    throw new ParserError(
      `Expected a single props parameter for the render function, got ${exp.parameters.length} parameters`,
      { sourceFile, node: exp },
    )
  }

  const propsParameter = exp.parameters[0]

  // Keep track of any props which are referenced in the example so that we can
  // insert the appropriate `figma.properties` call in the JS template
  const referencedProps = new Set<string>()

  function createPropPlaceholder(name: string, node: ts.Node, wrapInJsxExpression = false) {
    const mappedProp = propMappings && propMappings[name]
    if (!mappedProp) {
      throw new ParserError(`Could not find prop mapping for ${name} in the props object`, {
        sourceFile,
        node,
      })
    }

    referencedProps.add(name)
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

  // Find all property access expressions in the function body and replace them
  // with a function call like `__PROP__("propName")`, so that we can easily
  // find them in the next step to convert them into
  // `${_fcc_renderReactProp(...)` in the template string.
  //
  // Doing it this way means we can  normalize the different ways in which props
  // can be accessed using the compiler API, which is much easier than using a
  // regex, then in the next step we can use a simple regex to convert that into
  // the template string.
  if (propsParameter && jsx) {
    jsx = ts.transform(jsx, [
      (context) => (rootNode) => {
        function visit(node: ts.Node): ts.Node {
          // `props.` notation
          if (
            ts.isIdentifier(propsParameter.name) &&
            ts.isPropertyAccessExpression(node) &&
            node.expression.getText().startsWith(propsParameter.name.getText())
          ) {
            const name = node.name.getText()
            return createPropPlaceholder(name, node)
          }
          // `props[""]` notation
          if (
            ts.isIdentifier(propsParameter.name) &&
            ts.isElementAccessExpression(node) &&
            node.expression.getText().startsWith(propsParameter.name.getText()) &&
            ts.isStringLiteral(node.argumentExpression)
          ) {
            const name = stripQuotes(node.argumentExpression)
            return createPropPlaceholder(name, node)
          }
          // object destructuring references
          if (
            ts.isObjectBindingPattern(propsParameter.name) &&
            ts.isJsxExpression(node) &&
            node.expression &&
            propsParameter.name.elements.find(
              (el) => el.name.getText() === node.expression?.getText(),
            )
          ) {
            const name = node.expression.getText()
            return createPropPlaceholder(name, node, true)
          }
          // Replaces {...props} with all the prop mapped props we know about,
          // e.g. <Button {...props} /> becomes:
          // <Button prop1={__PROP__("prop1")} prop2={__PROP__("prop2")} />.
          if (
            ts.isJsxSpreadAttribute(node) &&
            ts.isIdentifier(node.expression) &&
            node.expression.getText() === propsParameter.name.getText()
          ) {
            const props = propMappings
              ? Object.keys(propMappings).map((prop) => {
                  return ts.factory.createJsxAttribute(
                    ts.factory.createIdentifier(prop),
                    createPropPlaceholder(prop, node, true) as ts.JsxExpression,
                  )
                })
              : []

            if (propMappings) {
              for (const key of Object.keys(propMappings)) {
                referencedProps.add(key)
              }
            }

            return props as any
          }

          return ts.visitEachChild(node, visit, context)
        }
        return ts.visitNode(rootNode, visit) as ts.JsxElement
      },
    ]).transformed[0] as typeof jsx
  }

  const printer = ts.createPrinter()
  const block = findBlock(exp)
  let nestable = false

  if (jsx && (!block || (block && block.statements.length <= 1))) {
    // The function body is a single JSX element
    exampleCode = printer.printNode(ts.EmitHint.Unspecified, jsx, sourceFile)
    nestable = true
  } else if (block) {
    // The function body has more stuff in it, so we wrap it in a function
    // expression that returns the JSX element. Why not just print the exact function passed
    // to `render`? Because the parameters to that function are not actually referenced in the
    // rendered code snippet in Figma - they're mapped to values on the Figma instance.
    const functionName = 'Example'
    const functionExpression = ts.factory.createFunctionExpression(
      undefined,
      undefined,
      ts.factory.createIdentifier(functionName),
      [],
      undefined,
      undefined,
      ts.factory.createBlock(
        [
          ...block.statements.filter((s) => !ts.isReturnStatement(s)),
          ts.factory.createReturnStatement(jsx),
        ],
        true,
      ),
    )
    const printer = ts.createPrinter()
    exampleCode = printer.printNode(ts.EmitHint.Unspecified, functionExpression, sourceFile)
  } else {
    throw new ParserError(
      `Expected a single JSX element or a block statement in the render function, got ${exp.getText()}`,
      { sourceFile, node: exp },
    )
  }

  let templateCode = ''

  // Replace React prop placeholders we inserted above (like
  // `reactPropName={__PROP__("figmaPropName")}`) with calls to
  // _fcc_renderReactProp, which renders them correctly (see
  // parser_template_helpers.ts)
  exampleCode = exampleCode.replace(
    // match " reactPropName={__PROP__("figmaPropName")}" and extract the names
    / ([A-Za-z0-9]+)=\{__PROP__\("([A-Za-z0-9]+)"\)\}/g,
    (_match, reactPropName, figmaPropName) => {
      return `\${_fcc_renderReactProp('${reactPropName}', ${figmaPropName})}`
    },
  )

  // Replace React children placeholders like `${__PROP__("propName")}` with
  // `${propName}`. These never need special treatment based on their type.
  exampleCode = exampleCode.replace(/\{__PROP__\("([A-Za-z]+)"\)\}/g, '${$1}')

  // Generate the template code
  // Inject React-specific template helper functions
  templateCode = getParsedTemplateHelpersString() + '\n\n'

  // Require the template API
  templateCode += `const figma = require('figma')\n\n`

  // Then we output `const propName = figma.properties.<kind>('propName')` calls
  // for each referenced prop, so these are accessible to the template code.
  if (propMappings && referencedProps.size > 0) {
    referencedProps.forEach((prop) => {
      const propMapping = propMappings[prop]
      if (!propMapping) {
        throw new ParserError(`Could not find prop mapping for ${prop}`, {
          sourceFile,
          node: exp,
        })
      }
      templateCode += `const ${prop} = ${intrinsicToString(propMapping)}\n`
    })
    templateCode += '\n'
  }

  // Finally, output the example code
  templateCode += `export default figma.tsx\`${exampleCode}\`\n`

  // Find all JSX elements in the function body and extract their import
  // statements
  const jsxTags = (
    findDescendants(
      exp,
      (element) => ts.isJsxElement(element) || ts.isJsxSelfClosingElement(element),
    ) as (ts.JsxElement | ts.JsxSelfClosingElement)[]
  ).map(getTagName)
  const imports = getImportsForIdentifiers(parserContext, jsxTags)

  return {
    code: templateCode,
    imports,
    nestable,
  }
}

/**
 * This wrapper function ensures that property names are type checked in case
 * we make changes to the `Figma.connect()` interface.
 */
function makeConfigPropertyParser<T extends ts.Node>({
  key,
  predicate,
  errorMessage,
}: {
  key: keyof FigmaConnectMeta
  predicate: (node: ts.Node) => node is T
  errorMessage?: string
}) {
  return (configArg: ts.ObjectLiteralExpression, parserContext: ParserContext) => {
    if (!configArg) {
      return undefined
    }
    return parsePropertyOfType({
      objectLiteralNode: configArg,
      propertyName: key,
      predicate,
      parserContext,
      required: false,
      errorMessage,
    })
  }
}

function makeFunctionArgumentParser<T extends ts.Node>({
  index,
  predicate,
  required,
  errorMessage,
}: {
  index: number
  predicate: (node: ts.Node) => node is T
  required: boolean
  errorMessage?: string
}) {
  return (node: ts.CallExpression, parserContext: ParserContext) => {
    return parseFunctionArgument(node, parserContext, index, predicate, required, errorMessage)
  }
}

function makeArgParser() {
  return {
    parseComponent: makeFunctionArgumentParser({
      index: 0,
      predicate: isOneOf([ts.isIdentifier, ts.isPropertyAccessExpression]),
      required: true,
      errorMessage: `\`${FIGMA_CONNECT_CALL}\` must be called with a reference to a Component as the first argument. Example usage:
\`${FIGMA_CONNECT_CALL}(Button, 'https://www.figma.com/file/123?node-id=1-1')\``,
    }),

    parseFigmaNodeUrl: (node: ts.CallExpression, parserContext: ParserContext) => {
      const { checker } = parserContext
      const invalidTypeErrorMsg = `The second argument to ${FIGMA_CONNECT_CALL}() must be a string literal (the URL of the Figma node). Example usage:
      \`${FIGMA_CONNECT_CALL}(Button, 'https://www.figma.com/file/123?node-id=1-1')\``
      const index = 1
      const required = true

      let arg = parseFunctionArgument(
        node,
        parserContext,
        index,
        isOneOf([ts.isIdentifier, ts.isStringLiteral]),
        required,
        invalidTypeErrorMsg,
      )

      if (arg && ts.isIdentifier(arg)) {
        const symbol = checker.getSymbolAtLocation(arg)
        if (symbol) {
          const decl = symbol.valueDeclaration
          if (
            decl &&
            ts.isVariableDeclaration(decl) &&
            decl.initializer &&
            ts.isStringLiteral(decl.initializer)
          ) {
            arg = decl.initializer
          }
        }
      }

      // If we followed the identifier to its declaration and it's not a string literal,
      // throw an error
      if (!arg || !ts.isStringLiteral(arg)) {
        throw new ParserError(invalidTypeErrorMsg, {
          node: arg,
          sourceFile: parserContext.sourceFile,
        })
      }

      return arg
    },

    parseConfig: makeFunctionArgumentParser({
      index: 2,
      predicate: ts.isObjectLiteralExpression,
      required: false,
      errorMessage: `The third argument to ${FIGMA_CONNECT_CALL}() must be an object literal. Example usage:
      \`${FIGMA_CONNECT_CALL}(Button, 'https://www.figma.com/file/123?node-id=1-1', { render: () => <Button /> })\``,
    }),

    parseProps: makeConfigPropertyParser({
      key: 'props',
      predicate: ts.isObjectLiteralExpression,
      errorMessage: `The 'props' property must be an object literal. Example usage:
\`${FIGMA_CONNECT_CALL}(Button, 'https://www.figma.com/file/123?node-id=1-1', {
  props: {
    disabled: Figma.boolean('Disabled'),
    text: Figma.string('TextContent'),
  }
})\``,
    }),

    parseExample: makeConfigPropertyParser({
      key: 'example',
      predicate: isOneOf([ts.isArrowFunction, ts.isFunctionExpression]),
      errorMessage: `The 'example' property must be an inline function or arrow function. Example usage:
\`${FIGMA_CONNECT_CALL}(Button, 'https://www.figma.com/file/123?node-id=1-1', {
  render: () => <Button />
})\``,
    }),

    parseVariant: makeConfigPropertyParser({
      key: 'variant',
      predicate: ts.isObjectLiteralExpression,
      errorMessage: `The 'variant' property must be an object literal. Example usage:
\`${FIGMA_CONNECT_CALL}(Button, 'https://www.figma.com/file/123?node-id=1-1', {
  variant: {
    "Has Icon": true
  }
})\``,
    }),

    parseLinks: makeConfigPropertyParser({
      key: 'links',
      predicate: ts.isArrayLiteralExpression,
      errorMessage: `The 'links' property must be an array literal. Example usage:
\`${FIGMA_CONNECT_CALL}(Button, 'https://www.figma.com/file/123?node-id=1-1', {
  links: [
    { name: 'Storybook', url: 'https://storybook.com' }
  ]
})\``,
    }),
  }
}

export function getDefaultTemplate(
  componentMetadata: Awaited<ReturnType<typeof parseComponentMetadata>>,
) {
  const example = `<${componentMetadata.component} />`
  return `const figma = require("figma")\n\nexport default figma.tsx\`${example}\``
}

async function parseDoc(
  node: ts.CallExpression,
  parserContext: ParserContext,
  repoUrl?: string,
): Promise<FigmaConnectJSON> {
  const { checker, sourceFile, config } = parserContext

  // Parse the arguments to the `Figma.connect()` call
  const args = makeArgParser()
  // The ones with ! are definitely defined because their parser fn has required: true,
  // but I couldn't work out how to model that in TypeScript
  const componentArg = args.parseComponent(node, parserContext)!
  const figmaNodeUrlArg = args.parseFigmaNodeUrl(node, parserContext)!
  const configObjArg = args.parseConfig(node, parserContext)
  const propsArg = configObjArg && args.parseProps(configObjArg, parserContext)
  const exampleArg = configObjArg && args.parseExample(configObjArg, parserContext)
  const variantArg = configObjArg && args.parseVariant(configObjArg, parserContext)
  const linksArg = configObjArg && args.parseLinks(configObjArg, parserContext)

  let figmaNode = stripQuotes(figmaNodeUrlArg)
  if (config?.documentUrlSubstitutions) {
    Object.entries(config.documentUrlSubstitutions).forEach(([from, to]) => {
      figmaNode = figmaNode.replace(from, to)
    })
  }
  const metadata = await parseComponentMetadata(componentArg, parserContext)

  const props = propsArg ? parsePropsObject(propsArg, parserContext) : undefined
  const render = exampleArg ? parseRenderFunction(exampleArg, parserContext, props) : undefined
  const variant = variantArg ? parseVariant(variantArg, sourceFile, checker) : undefined
  const links = linksArg ? parseLinks(linksArg, parserContext) : undefined

  // If no template function was provided, construct one and add the import
  // statement for the component
  let imports = render?.imports ?? getImportsForIdentifiers(parserContext, [metadata.component])
  const template = render?.code ?? getDefaultTemplate(metadata)
  if (imports.length === 0) {
    // If no imports were found, it might mean that the component is not imported, or
    // that the `figma.connect` call is in the same file as the component. In the latter
    // case - we'll want to generate one
    const fileName = metadata.source.split('/').pop()?.split('.')[0]
    imports = [
      {
        statement: `import { ${metadata.component} } from './${fileName}'`,
        file: sourceFile.fileName,
      },
    ]
  }

  const resolvedImports: string[] =
    imports.map((imp) => {
      if (config) {
        const resolvedPath = resolveImportPath(imp.file, config)
        if (resolvedPath) {
          return imp.statement.replace(/['"]([\.\/a-zA-Z0-9]*)['"]/, `'${resolvedPath}'`)
        }
      }
      return imp.statement
    }) ?? []

  if (resolvedImports.length === 0) {
    logger.warn(
      `The import statement for ${metadata.component} could not be automatically resolved, make sure the component is imported (if not colocating) and that the path mappings are correct in your figma.config.json`,
    )
  }

  return {
    figmaNode,
    label: 'React',
    language: 'typescript',
    component: metadata.component,
    source: getRemoteFileUrl(metadata.source, repoUrl),
    sourceLocation: { line: metadata.line },
    variant,
    template,
    templateData: {
      // TODO: `props` here is currently only used for validation purposes,
      // we should eventually remove it from the JSON payload
      props,
      imports: resolvedImports,
      // If there's no render function, the default example is always nestable
      nestable: render ? render.nestable : true,
    },
    links,
    metadata: {
      cliVersion: require('../../package.json').version,
    },
  }
}

export async function parse(
  program: ts.Program,
  file: string,
  repoUrl?: string,
  config?: FigmaConnectConfig,
  debug?: boolean,
): Promise<any[]> {
  const sourceFile = program.getSourceFile(file)
  if (!sourceFile) {
    throw new InternalError(`Could not find source file for ${file}`)
  }

  const parserContext = {
    checker: program.getTypeChecker(),
    sourceFile,
    config,
  }

  const figmadocs: FigmaConnectJSON[] = []

  const nodes: ts.Node[] = [parserContext.sourceFile]
  while (nodes.length > 0) {
    const node = nodes.shift()!
    if (isFigmaConnectCall(node, parserContext.sourceFile)) {
      const doc = await parseDoc(node, parserContext, repoUrl)
      if (doc) {
        figmadocs.push(doc)
      }
    }
    nodes.push(...node.getChildren(parserContext.sourceFile))
  }

  if (figmadocs.length === 0) {
    throw new ParserError(`Didn't find any calls to Figmadoc()`, {
      sourceFile: parserContext.sourceFile,
      node: parserContext.sourceFile,
    })
  }

  return figmadocs
}
