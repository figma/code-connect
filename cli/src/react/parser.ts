import ts from 'typescript'
import { CodeConnectReactConfig, getRemoteFileUrl, mapImportPath } from '../connect/project'
import { error, highlight, logger, reset } from '../common/logging'
import {
  bfsFindNode,
  getTagName,
  stripQuotesFromNode,
  parsePropertyOfType,
  parseFunctionArgument,
  isOneOf,
} from '../typescript/compiler'
import { FIGMA_CONNECT_CALL, PropMappings, parsePropsObject } from '../connect/intrinsics'
import { CodeConnectJSON } from '../connect/figma_connect'
import { getParsedTemplateHelpersString } from './parser_template_helpers'
import {
  getPositionInSourceFile,
  InternalError,
  makeCreatePropPlaceholder,
  ParserContext,
  ParserError,
  visitPropReferencingNode,
  getReferencedPropsForTemplate,
  findDescendants,
  isFigmaConnectCall,
  parseLinks,
  parseVariant,
  parseImports,
  ParseOptions,
} from '../connect/parser_common'

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

function resolveModuleSpecifier(
  program: ts.Program,
  sourceFile: ts.SourceFile,
  importSpecifier: string,
): string | undefined {
  const compilerHost = ts.createCompilerHost(program.getCompilerOptions())
  const moduleResolutionHost: ts.ModuleResolutionHost = {
    fileExists: compilerHost.fileExists,
    readFile: compilerHost.readFile,
    directoryExists: compilerHost.directoryExists,
    getCurrentDirectory: compilerHost.getCurrentDirectory,
    getDirectories: compilerHost.getDirectories,
  }

  const resolvedModule = ts.resolveModuleName(
    importSpecifier,
    sourceFile.fileName,
    program.getCompilerOptions(),
    moduleResolutionHost,
  )

  return resolvedModule.resolvedModule?.resolvedFileName
}

// Traverse the source file and resolve imports
export function findAndResolveImports(program: ts.Program, sourceFile: ts.SourceFile) {
  const importSpecifierToFilePath: Record<string, string> = {}
  ts.forEachChild(sourceFile, (node) => {
    if (ts.isImportDeclaration(node)) {
      const importSpecifier = (node.moduleSpecifier as ts.StringLiteral).text
      const resolvedFileName = resolveModuleSpecifier(program, sourceFile, importSpecifier)

      if (resolvedFileName) {
        importSpecifierToFilePath[importSpecifier] = resolvedFileName
      }
    }
  })
  return importSpecifierToFilePath
}

/**
 * Finds all import statements in a file that matches the given identifiers
 *
 * @param parserContext Parser context
 * @param identifiers List of identifiers to find imports for
 * @returns
 */
function getSourceFilesOfImportedIdentifiers(parserContext: ParserContext, _identifiers: string[]) {
  const { sourceFile, resolvedImports } = parserContext
  const importDeclarations = getImportsOfModule(sourceFile)
  const imports: {
    statement: string
    file: string
  }[] = []

  const identifiers = _identifiers.map((identifier) => identifier.split('.')[0])

  for (const declaration of importDeclarations) {
    let statement = declaration.getText()
    // remove the quotation marks around the module specifier
    const moduleSpecifier = declaration.moduleSpecifier.getText().slice(1, -1)

    if (declaration.importClause) {
      // Default imports
      if (declaration.importClause.name) {
        const identifier = declaration.importClause.name.text

        if (identifiers.includes(identifier)) {
          imports.push({
            statement,
            file: resolvedImports[moduleSpecifier],
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
              file: resolvedImports[moduleSpecifier],
            })
          }
        } else if (ts.isNamespaceImport(namedBindings)) {
          // Namespace import (import * as name from 'module')
          const identifier = namedBindings.name.text
          if (identifiers.includes(identifier)) {
            imports.push({
              statement,
              file: resolvedImports[moduleSpecifier],
            })
          }
        }
      }
    }
  }

  return imports
}

function findCallExpression(node: ts.Node): ts.CallExpression {
  if (ts.isCallExpression(node)) {
    return node
  } else {
    return ts.forEachChild(node, findCallExpression) as ts.CallExpression
  }
}

/**
 * Traverses the AST and finds the first arrow function declaration
 * @param node
 * @returns
 */
function findDescendantArrowFunction(node: ts.Node): ts.ArrowFunction {
  if (ts.isArrowFunction(node)) {
    return node
  } else {
    return ts.forEachChild(node, findDescendantArrowFunction) as ts.ArrowFunction
  }
}

/**
 * Traverses the AST and finds the first function expression
 * (handles forwardRef:d component declarations)
 * @param node
 * @returns
 */
function findDescendantFunctionExpression(node: ts.Node): ts.FunctionExpression {
  if (ts.isFunctionExpression(node)) {
    return node
  } else {
    return ts.forEachChild(node, findDescendantFunctionExpression) as ts.FunctionExpression
  }
}

function getDeclarationFromSymbol(symbol: ts.Symbol) {
  if (!symbol.declarations || !symbol.declarations.length) {
    throw new Error(`No declarations found in symbol ${symbol.escapedName}`)
  }
  return symbol.declarations[0]
}

function resolveIdentifierSymbol(identifier: ts.Identifier, checker: ts.TypeChecker) {
  const componentSymbol = checker.getSymbolAtLocation(identifier)

  if (!componentSymbol) {
    throw new Error(`Symbol not found at location ${identifier.getText()}`)
  }

  const componentDeclaration = getDeclarationFromSymbol(componentSymbol)

  if (ts.isImportSpecifier(componentDeclaration) || ts.isImportClause(componentDeclaration)) {
    let importDeclaration = findParentImportDeclaration(componentDeclaration)

    if (!importDeclaration) {
      throw new Error('No import statement found for component')
    }

    // The component should be imported from another file, we need to follow the
    // aliased symbol to get the correct function definition
    if (componentSymbol.flags & ts.SymbolFlags.Alias) {
      return checker.getAliasedSymbol(componentSymbol)
    }
  }

  return componentSymbol
}

/**
 * This handles a number of cases for finding the function expression of an exported symbol:
 * - A function that is exported directly (function declaration)
 * - A function that is exported as a variable (arrow function)
 * - A function expression wrapped in a forwardRef
 * - A function expression wrapped in a memo call
 * @param declaration an exported function declaration
 * @param checker
 */
function findFunctionExpression(
  declaration: ts.Declaration,
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
) {
  let functionExpression: ts.FunctionExpression | ts.ArrowFunction

  // Example: export function Button() {}
  if (ts.isFunctionDeclaration(declaration)) {
    return declaration
  }

  // Example: export const Button = forwardRef(function Button() {})
  if ((functionExpression = findDescendantFunctionExpression(declaration))) {
    return functionExpression
  }

  // Example: export const Button = () => {}
  if ((functionExpression = findDescendantArrowFunction(declaration))) {
    return functionExpression
  }

  // Example: export const MemoButton = memo(Button)
  // Example: export const ButtonWithRef = forwardRef(Button)
  if (ts.isVariableDeclaration(declaration)) {
    let componentSymbol: ts.Symbol | undefined = undefined

    // Example: export const SomeAlias = Button
    if (declaration.initializer && ts.isIdentifier(declaration.initializer)) {
      componentSymbol = resolveIdentifierSymbol(declaration.initializer, checker)
    } else {
      const callExpression = findCallExpression(declaration)
      const component = callExpression.arguments[0]
      // follow the symbol to its declaration, then try to find the function expression again
      componentSymbol = checker.getSymbolAtLocation(component)
    }

    if (!componentSymbol) {
      throw new Error('No symbol found at location')
    }

    const componentDeclaration = getDeclarationFromSymbol(componentSymbol)
    return findFunctionExpression(componentDeclaration, checker, sourceFile)
  }

  throw new ParserError('Failed to find function expression for component', {
    sourceFile,
    node: declaration,
  })
}

export type ComponentTypeSignature = Record<string, string>

/**
 * Extracts the type signature from the interface of a React component as a map of
 * keys to strings representing the type of that property. Appends a '?' to the value
 * if it's optional. Example:
 * {
 *  name: string
 *  disabled: ?boolean
 * }
 * @param symbol the symbol of the function declaration of the component (in the source file)
 * @param sourceFile the source file with the component definition
 * @param checker
 * @returns
 */
export function extractComponentTypeSignature(
  symbol: ts.Symbol,
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
) {
  const declaration = getDeclarationFromSymbol(symbol)

  const ReactInterfaceNames = ['HTMLAttributes', 'Attributes', 'AriaAttributes', 'DOMAttributes']

  let propsType: ts.Type | null = null

  /**
   * Special case for forwardRef as type is passed as generic arg
   */
  if (ts.isVariableDeclaration(declaration)) {
    const callExpression = findCallExpression(declaration)

    if (
      (callExpression?.expression.getText() === 'forwardRef' ||
        callExpression?.expression.getText() === 'React.forwardRef') &&
      callExpression.typeArguments &&
      callExpression.typeArguments.length === 2
    ) {
      propsType = checker.getTypeAtLocation(callExpression.typeArguments[1])
    }
  }

  if (!propsType) {
    const functionExpression = findFunctionExpression(declaration, checker, sourceFile)
    propsType = checker.getTypeAtLocation(functionExpression.parameters[0])
  }

  if (!propsType) {
    throw new InternalError(
      `Failed to extract props from component declaration: ${declaration.getText()}`,
    )
  }

  const propsMap: ComponentTypeSignature = {}
  const props = propsType.getProperties()
  for (const prop of props) {
    // Skip props that are inherited from React types
    // NOTE: this is pretty naive, in the future we might want to
    // actually traverse the AST to determine if the types are declared
    // in the React namespace

    const parent = getDeclarationFromSymbol(prop).parent
    if (ts.isInterfaceDeclaration(parent)) {
      const parentInterfaceName = parent.name.getText()
      if (
        ReactInterfaceNames.includes(parentInterfaceName) ||
        (parent.heritageClauses && parent.heritageClauses[0].getText().includes('HTMLAttributes'))
      ) {
        continue
      }
    }

    if (!prop.valueDeclaration) {
      throw new Error(`No valueDeclaration for symbol ${prop.escapedName}`)
    }

    const propType = checker.getTypeOfSymbolAtLocation(prop, prop.valueDeclaration)
    let propTypeString = checker.typeToString(propType)

    if (propType.isUnion()) {
      // Get the types of the union
      const unionTypes = propType.types

      // Map each type to its string representation and join them with a comma
      propTypeString = unionTypes.map((type) => checker.typeToString(type)).join(' | ')
    }

    propsMap[prop.name] =
      prop.flags & ts.SymbolFlags.Optional ? `?${propTypeString}` : propTypeString
  }

  return propsMap
}

/**
 * Extract metadata about the referenced React component. Used by both the
 * Code Connect and Storybook commands.
 *
 * @param parserContext Parser context
 * @param componentSymbol The ts.Symbol from the metadata referencing the
 * component being documented
 * @param node The node being parsed. Used for error logging.
 * @returns Metadata object
 */
export async function parseComponentMetadata(
  node: ts.PropertyAccessExpression | ts.Identifier | ts.Expression,
  parserContext: ParserContext,
  silent?: boolean,
) {
  const { checker, sourceFile } = parserContext
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
      if (!silent) {
        logger.warn(
          `Import for ${node.getText()} could not be resolved, make sure that your \`include\` globs in \`figma.config.json\` matches the component source file (in addition to the Code Connect file). If you're using path aliases, make sure to include the same aliases in \`figma.config.json\` with the \`paths\` option.`,
        )
      }
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
 * Parses the render function passed to `figma.connect()`, extracting the code and
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

  const createPropPlaceholder = makeCreatePropPlaceholder({
    propMappings,
    referencedProps,
    sourceFile,
  })

  // Find all property access expressions in the function body and replace them
  // with a function call like `__PROP__("propName")`, so that we can easily
  // find them in the next step to convert them into
  // `${_fcc_renderReactProp(...)` in the template string.
  //
  // Doing it this way means we can normalize the different ways in which props
  // can be accessed using the compiler API, which is much easier than using a
  // regex, then in the next step we can use a simple regex to convert that into
  // the template string.
  if (propsParameter) {
    exp = ts.transform(exp, [
      (context) => (rootNode) => {
        function visit(node: ts.Node): ts.Node {
          const visitResult = visitPropReferencingNode({
            propsParameter,
            node,
            createPropPlaceholder,
            useJsx: true,
          })

          if (visitResult) {
            return visitResult
          }

          // object assignment using destructured reference, e.g `prop={{ key: value }}`
          // (`{{ key: props.value }}` syntax will be captured by the `props.` notation branch above)
          if (
            ts.isObjectBindingPattern(propsParameter.name) &&
            ts.isPropertyAssignment(node) &&
            ts.isIdentifier(node.initializer) &&
            propsParameter.name.elements.find((el) =>
              node.initializer.getText().startsWith(el.name.getText()),
            )
          ) {
            return ts.factory.createPropertyAssignment(
              node.name,
              createPropPlaceholder({ name: node.initializer.getText(), node }),
            )
          }
          // object assignment using destructured reference as a shorthand, e.g `prop={{ value }}`
          if (
            ts.isObjectBindingPattern(propsParameter.name) &&
            ts.isShorthandPropertyAssignment(node) &&
            propsParameter.name.elements.find((el) =>
              node.name.getText().startsWith(el.name.getText()),
            )
          ) {
            return ts.factory.createPropertyAssignment(
              node.name,
              createPropPlaceholder({ name: node.name.getText(), node }),
            )
          }

          // Replaces {...props} with all the prop mapped props we know about,
          // e.g. <Button {...props} /> becomes:
          // <Button prop1={__PROP__("prop1")} prop2={__PROP__("prop2")} />.
          if (
            ts.isJsxSpreadAttribute(node) &&
            ts.isIdentifier(node.expression) &&
            // example: (props) => (...)
            (node.expression.getText() === propsParameter.name.getText() ||
              // example: ({ prop1, prop2 ...props }) => (...)
              (ts.isObjectBindingPattern(propsParameter.name) &&
                propsParameter.name.elements.find(
                  (el) => el.dotDotDotToken && el.name.getText() === node.expression?.getText(),
                )))
          ) {
            // if we have an object binding pattern ({ prop1, prop2 ...props }),
            // exclude the props that are already destructured (prop1, prop2)
            const propsToExclude = ts.isObjectBindingPattern(propsParameter.name)
              ? propsParameter.name.elements
                  .filter((el) => !el.dotDotDotToken)
                  .map((el) => el.name.getText())
              : []
            const props = propMappings
              ? Object.keys(propMappings)
                  .filter((prop) => !propsToExclude.includes(prop))
                  .map((prop) => {
                    return ts.factory.createJsxAttribute(
                      ts.factory.createIdentifier(prop),
                      createPropPlaceholder({
                        name: prop,
                        node,
                        wrapInJsxExpression: true,
                      }) as ts.JsxExpression,
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
        return ts.visitNode(rootNode, visit) as
          | ts.ArrowFunction
          | ts.FunctionExpression
          | ts.FunctionDeclaration
      },
    ]).transformed[0] as typeof exp
  }

  const printer = ts.createPrinter()
  const block = findBlock(exp)
  let nestable = false
  let jsx = findJSXElement(exp)

  if (jsx && (!block || (block && block.statements.length <= 1))) {
    // The function body is a single JSX element
    exampleCode = printer.printNode(ts.EmitHint.Unspecified, jsx, sourceFile)
    nestable = true
  } else if (block) {
    // The function body has more stuff in it, so we wrap the body in a function
    // expression. Why not just print the exact function passed to `render`?
    // Because the parameters to that function are not actually referenced in
    // the rendered code snippet in Figma - they're mapped to values on the
    // Figma instance.
    const functionName = 'Example'
    const functionExpression = ts.factory.createFunctionExpression(
      undefined,
      undefined,
      ts.factory.createIdentifier(functionName),
      [],
      undefined,
      undefined,
      block,
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
    // We allow hyphens in prop names (unlike React) to support rendering HTML attributes
    / ([A-Za-z0-9\-]+)=\{__PROP__\("([A-Za-z0-9_\.]+)"\)\}/g,
    (_match, reactPropName, figmaPropName) => {
      return `\${_fcc_renderReactProp('${reactPropName}', ${figmaPropName})}`
    },
  )

  // Replace React children placeholders like `${__PROP__("propName")}` with
  // calls to _fcc_renderReactChildren, which renders them correctly (see
  // parser_template_helpers.ts)
  exampleCode = exampleCode.replace(
    /\{__PROP__\("([A-Za-z_\.]+)"\)\}/g,
    (_match, figmaPropName) => {
      return `\${_fcc_renderReactChildren(${figmaPropName})}`
    },
  )

  // Replace object values like `{ prop: __PROP__("propName") }` or `{
  // 'aria-prop': __PROP__("propName") }` with `{ prop: ${propName} }`. These
  // never need special treatment based on their type.
  exampleCode = exampleCode.replace(
    /([^\s]+):\s+__PROP__\("([A-Za-z_\.]+)"\)/g,
    (_match, objectKey, figmaPropName) => {
      return `${objectKey}: \${_fcc_renderPropValue(${figmaPropName})}`
    },
  )

  // Generate the template code
  // Inject React-specific template helper functions
  templateCode = getParsedTemplateHelpersString() + '\n\n'

  // Require the template API
  templateCode += `const figma = require('figma')\n\n`

  // Then we output `const propName = figma.properties.<kind>('propName')` calls
  // for each referenced prop, so these are accessible to the template code.
  templateCode += getReferencedPropsForTemplate({
    propMappings,
    referencedProps,
    exp,
    sourceFile,
  })

  // Escape backticks from the example code, as otherwise those would terminate the `figma.tsx` template literal
  exampleCode = exampleCode.replace(/`/g, '\\`')

  // Finally, output the example code
  templateCode += `export default figma.tsx\`${exampleCode}\`\n`

  // Find all JSX elements in the function body and extract their import
  // statements
  const jsxTags = findDescendants(
    exp,
    (element) => ts.isJsxElement(element) || ts.isJsxSelfClosingElement(element),
  ) as (ts.JsxElement | ts.JsxSelfClosingElement)[]

  const imports = getSourceFilesOfImportedIdentifiers(parserContext, jsxTags.map(getTagName))

  return {
    code: templateCode,
    imports,
    nestable,
  }
}

function followIdentifierToStringLiteralDeclaration(
  node: ts.Identifier | ts.StringLiteral,
  parserContext: ParserContext,
  errMessage: string,
) {
  const { checker } = parserContext
  let result = node

  if (node && ts.isIdentifier(node)) {
    const symbol = checker.getSymbolAtLocation(node)
    if (symbol) {
      const decl = symbol.valueDeclaration
      if (
        decl &&
        ts.isVariableDeclaration(decl) &&
        decl.initializer &&
        ts.isStringLiteral(decl.initializer)
      ) {
        result = decl.initializer
      }
    }
  }

  // If we followed the identifier to its declaration and it's not a string literal,
  // throw an error
  if (!result || !ts.isStringLiteral(result)) {
    throw new ParserError(errMessage, {
      node: result,
      sourceFile: parserContext.sourceFile,
    })
  }

  return result
}

function parseFigmaConnectArgs(node: ts.CallExpression, parserContext: ParserContext) {
  const required = true
  const first = parseFunctionArgument(
    node,
    parserContext,
    0,
    isOneOf([ts.isIdentifier, ts.isPropertyAccessExpression, ts.isStringLiteral]),
    required,
    `\`${FIGMA_CONNECT_CALL}\` must be called with a reference to a Component or a Figma Component URL as the first argument. Example usage:
  \`${FIGMA_CONNECT_CALL}(Button, 'https://www.figma.com/file/123?node-id=1-1')\``,
  )!

  let figmaNodeUrlArg: ts.StringLiteral
  let componentArg: ts.Identifier | ts.PropertyAccessExpression | undefined
  let configObjArgIndex

  // This function has two signatures. If the first arg is a string literal, it's the Figma node URL, and
  // it won't have a component reference.
  if (ts.isStringLiteral(first)) {
    figmaNodeUrlArg = first
    componentArg = undefined
    configObjArgIndex = 1
  } else {
    // If the first argument is not a string literal, it must be a component reference,
    // and the second argument must be the Figma node URL
    componentArg = first
    configObjArgIndex = 2

    const invalidTypeErrorMsg = `The second argument to ${FIGMA_CONNECT_CALL}() must be a string literal (the URL of the Figma node). Example usage:
    \`${FIGMA_CONNECT_CALL}(Button, 'https://www.figma.com/file/123?node-id=1-1')\``

    let arg = parseFunctionArgument(
      node,
      parserContext,
      1,
      isOneOf([ts.isIdentifier, ts.isStringLiteral]),
      required,
      invalidTypeErrorMsg,
    )!

    figmaNodeUrlArg = followIdentifierToStringLiteralDeclaration(
      arg,
      parserContext,
      invalidTypeErrorMsg,
    )
  }

  const configObjArg = parseFunctionArgument(
    node,
    parserContext,
    configObjArgIndex,
    ts.isObjectLiteralExpression,
    false /* not required */,
    `The third argument to ${FIGMA_CONNECT_CALL}() must be an object literal. Example usage:
    \`${FIGMA_CONNECT_CALL}(Button, 'https://www.figma.com/file/123?node-id=1-1', { render: () => <Button /> })\``,
  )

  return {
    componentArg,
    figmaNodeUrlArg,
    configObjArg,
  }
}

function parseConfigObjectArg(
  configArg: ts.ObjectLiteralExpression | undefined,
  parserContext: ParserContext,
) {
  if (!configArg) {
    return {
      propsArg: undefined,
      exampleArg: undefined,
      variantArg: undefined,
      importsArg: undefined,
      linksArg: undefined,
    }
  }

  const propsArg = parsePropertyOfType({
    objectLiteralNode: configArg,
    propertyName: 'props',
    predicate: ts.isObjectLiteralExpression,
    parserContext,
    required: false,
    errorMessage: `The 'props' property must be an object literal. Example usage:
      \`${FIGMA_CONNECT_CALL}(Button, 'https://www.figma.com/file/123?node-id=1-1', {
        props: {
          disabled: figma.boolean('Disabled'),
          text: figma.string('TextContent'),
        }
      })\``,
  })

  const exampleArg = parsePropertyOfType({
    objectLiteralNode: configArg,
    propertyName: 'example',
    predicate: isOneOf([ts.isArrowFunction, ts.isFunctionExpression]),
    parserContext,
    required: false,
    errorMessage: `The 'example' property must be an inline function or arrow function. Example usage:
    \`${FIGMA_CONNECT_CALL}(Button, 'https://www.figma.com/file/123?node-id=1-1', {
      example: () => <Button />
    })\``,
  })

  const variantArg = parsePropertyOfType({
    objectLiteralNode: configArg,
    propertyName: 'variant',
    predicate: ts.isObjectLiteralExpression,
    parserContext,
    required: false,
    errorMessage: `The 'variant' property must be an object literal. Example usage:
    \`${FIGMA_CONNECT_CALL}(Button, 'https://www.figma.com/file/123?node-id=1-1', {
      variant: {
        "Has Icon": true
      }
    })\``,
  })

  const linksArg = parsePropertyOfType({
    objectLiteralNode: configArg,
    propertyName: 'links',
    predicate: ts.isArrayLiteralExpression,
    parserContext,
    required: false,
    errorMessage: `The 'links' property must be an array literal. Example usage:
    \`${FIGMA_CONNECT_CALL}(Button, 'https://www.figma.com/file/123?node-id=1-1', {
      links: [
        { name: 'Storybook', url: 'https://storybook.com' }
      ]
    })\``,
  })

  const importsArg = parsePropertyOfType({
    objectLiteralNode: configArg,
    propertyName: 'imports',
    predicate: ts.isArrayLiteralExpression,
    parserContext,
    required: false,
    errorMessage: `The 'imports' property must be an array literal. Example usage:
    \`${FIGMA_CONNECT_CALL}(Button, 'https://www.figma.com/file/123?node-id=1-1', {
      imports: ['import { Button } from "./Button"']
    })\``,
  })

  return {
    propsArg,
    exampleArg,
    variantArg,
    linksArg,
    importsArg,
  }
}

export function getDefaultTemplate(
  componentMetadata: Awaited<ReturnType<typeof parseComponentMetadata>>,
) {
  const example = `<${componentMetadata.component} />`
  return `const figma = require("figma")\n\nexport default figma.tsx\`${example}\``
}

export async function parseReactDoc(
  node: ts.CallExpression,
  parserContext: ParserContext,
  { repoUrl, silent }: ParseOptions,
): Promise<CodeConnectJSON> {
  const { checker, sourceFile, config } = parserContext

  // Parse the arguments to the `figma.connect()` call
  const { componentArg, figmaNodeUrlArg, configObjArg } = parseFigmaConnectArgs(node, parserContext)

  const { propsArg, exampleArg, variantArg, linksArg, importsArg } = parseConfigObjectArg(
    configObjArg,
    parserContext,
  )

  let figmaNode = stripQuotesFromNode(figmaNodeUrlArg)
  // TODO This logic is duplicated in connect.ts transformDocFromParser due to some type issues
  if (config.documentUrlSubstitutions) {
    Object.entries(config.documentUrlSubstitutions).forEach(([from, to]) => {
      // @ts-expect-error
      figmaNode = figmaNode.replace(from, to)
    })
  }
  const metadata = componentArg
    ? await parseComponentMetadata(componentArg, parserContext, silent)
    : undefined

  const props = propsArg ? parsePropsObject(propsArg, parserContext) : undefined
  const render = exampleArg ? parseRenderFunction(exampleArg, parserContext, props) : undefined
  const variant = variantArg ? parseVariant(variantArg, sourceFile, checker) : undefined
  const links = linksArg ? parseLinks(linksArg, parserContext) : undefined

  let mappedImports: string[]
  if (importsArg) {
    mappedImports = parseImports(importsArg, parserContext)
  } else {
    // If no template function was provided, construct one and add the import
    // statement for the component
    let imports = render?.imports
      ? render.imports
      : metadata !== undefined
        ? getSourceFilesOfImportedIdentifiers(parserContext, [metadata.component])
        : []

    if (imports.length === 0 && metadata?.component) {
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

    mappedImports =
      imports.map((imp) => {
        if (config) {
          const mappedPath = mapImportPath(imp.file, config)
          if (mappedPath) {
            return imp.statement.replace(/['"]([\.\/a-zA-Z0-9_-]*)['"]/, `'${mappedPath}'`)
          }
        }
        return imp.statement
      }) ?? []
  }

  if (mappedImports.length === 0 && metadata?.component) {
    logger.warn(
      `The import statement for ${metadata.component} could not be automatically resolved, make sure the component is imported (if not colocating) and that the path mappings are correct in your figma.config.json`,
    )
  }

  let template
  if (render?.code) {
    template = render.code
  } else if (metadata) {
    template = getDefaultTemplate(metadata)
  } else {
    throw new ParserError(
      `${FIGMA_CONNECT_CALL}() requires either a component argument or an example function`,
      { sourceFile, node },
    )
  }

  return {
    figmaNode,
    label: 'React',
    language: 'typescript',
    component: metadata?.component,
    source: metadata?.source ? getRemoteFileUrl(metadata.source, repoUrl) : '',
    sourceLocation: metadata?.line !== undefined ? { line: metadata.line } : { line: -1 },
    variant,
    template,
    templateData: {
      // TODO: `props` here is currently only used for validation purposes,
      // we should eventually remove it from the JSON payload
      props,
      imports: mappedImports,
      // If there's no render function, the default example is always nestable
      nestable: render ? render.nestable : true,
    },
    links,
    metadata: {
      cliVersion: require('../../package.json').version,
    },
  }
}
