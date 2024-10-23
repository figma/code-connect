import { readFileSync } from 'fs'
import {
  bfsFindNode,
  convertObjectLiteralToJs,
  getDefaultExport,
  parsePropertyOfType,
} from '../typescript/compiler'
import {
  parseComponentMetadata,
  parseJSXRenderFunction,
  getDefaultTemplate,
  findAndResolveImports,
} from '../react/parser'
import {
  CodeConnectReactConfig,
  ReactProjectInfo,
  getRemoteFileUrl,
  getStorybookUrl,
} from '../connect/project'
import { logger } from '../common/logging'
import { CodeConnectJSON } from '../connect/figma_connect'
import ts from 'typescript'
import { FigmaConnectMeta } from '../connect/api'
import { minimatch } from 'minimatch'
import { parsePropsObject } from '../connect/intrinsics'
import { InternalError, ParserContext, ParserError } from '../connect/parser_common'

interface ConvertStorybookFilesArgs {
  /**
   * Optionally override the glob used to find stories. This is currently not
   * exposed in the config, but is used by the tests
   */
  storiesGlob?: string

  /**
   * Information about the project
   */
  projectInfo: ReactProjectInfo
}

/**
 * Converts all Storyboook files in a directory into Code Connect objects. If a file
 * cannot be converted (e.g. unsupported syntax), it is ignored and an error is
 * logged.
 *
 * @param args
 * @returns An array of Code Connect objects
 */
export async function convertStorybookFiles({
  projectInfo,
  storiesGlob = '**/*.stories.tsx',
}: ConvertStorybookFilesArgs): Promise<CodeConnectJSON[]> {
  const { remoteUrl, config, files, tsProgram } = projectInfo

  const storyFiles = files.filter((file) => minimatch(file, storiesGlob, { matchBase: true }))
  logger.debug(`Story files found:\n${storyFiles.map((f) => `- ${f}`).join('\n')}`)

  return Promise.all(
    storyFiles.map((path) =>
      convertStorybookFile({ path, tsProgram, config, remoteUrl, absPath: projectInfo.absPath }),
    ),
  )
    .then((f) => f.filter((x): x is NonNullable<typeof x> => Boolean(x)))
    .then((f) => f.flat())
}

interface FigmaStoryMetadata {
  type: string
  url: string
}

interface ConvertStorybookFileArgs {
  path: string
  tsProgram: ts.Program
  remoteUrl: string
  config: CodeConnectReactConfig
  absPath: string
}

type MappedPropType = 'FigmaString' | 'FigmaBoolean' | 'Mapped'
type MappedProps = Map<string, { figmaName: string; type: MappedPropType }> | undefined

async function convertStorybookFile({
  path,
  tsProgram,
  remoteUrl,
  config,
  absPath,
}: ConvertStorybookFileArgs): Promise<CodeConnectJSON[] | undefined> {
  const checker = tsProgram.getTypeChecker()
  const sourceFile = tsProgram.getSourceFile(path)

  if (!sourceFile) {
    throw new InternalError(`Source file not found: ${path}`)
  }

  const parserContext: ParserContext = {
    checker,
    config,
    sourceFile,
    absPath,
    resolvedImports: findAndResolveImports(tsProgram, sourceFile),
  }

  let source = readFileSync(path).toString()
  // Replace backticks with ' as csf-tools can't parse dynamic titles
  source = source.replace(/title: `(.*)`/g, (_, title) => {
    return `title: '${title}'`
  })

  logger.debug(`Parsing story ${path}`)

  try {
    // We need to get the default export, which contains the story file meta,
    // from the TS Program rather than using `babelNodeToTsSourceFile(csf._metaNode)`,
    // because we need access to the full Program to parse it for prop types etc.
    const storyFileMetaNode = getDefaultExport(sourceFile)
    if (!storyFileMetaNode) {
      return
    }

    const parseResult = parseStoryMetadata(storyFileMetaNode, parserContext)

    if (!parseResult) {
      logger.debug(`Could not parse story metadata for ${path}`)
      return
    }

    const { figmaStoryMetadata, componentDeclaration, propMappings, examples } = parseResult

    const componentMetadata = await parseComponentMetadata(componentDeclaration, parserContext)

    const codeConnectObjects: CodeConnectJSON[] = []
    const baseCodeConnect: CodeConnectJSON = {
      figmaNode: figmaStoryMetadata.url,
      source: config?.storybook?.url
        ? getStorybookUrl(componentMetadata.source, config.storybook.url)
        : getRemoteFileUrl(componentMetadata.source, remoteUrl),
      sourceLocation: { line: componentMetadata.line },
      template: '',
      templateData: {
        props: propMappings,
        imports: [],
      },
      component: componentMetadata.component,
      label: 'Storybook',
      language: 'typescript',
      metadata: {
        cliVersion: require('../../package.json').version,
      },
    }

    // If there are no examples, just return a default Code Connect object
    if (!examples) {
      codeConnectObjects.push({
        ...baseCodeConnect,
        template: getDefaultTemplate(componentMetadata),
      })
      return codeConnectObjects
    }

    for (const statement of sourceFile.statements) {
      // Find any exported function or variable declarations, which correspond to stories
      if (!(ts.isFunctionDeclaration(statement) || ts.isVariableStatement(statement))) {
        continue
      }

      const name = ts.isFunctionDeclaration(statement)
        ? statement.name?.text
        : statement.declarationList.declarations?.[0].name.getText(sourceFile)

      const example = examples?.find((example) => example.example === name)
      // This story is not in the examples array, so skip it
      if (examples && !example) {
        continue
      }

      let statementToParse: ts.ArrowFunction | ts.FunctionDeclaration | undefined

      if (ts.isFunctionDeclaration(statement)) {
        statementToParse = statement
      } else {
        const initializer = statement.declarationList.declarations[0].initializer
        if (initializer && ts.isArrowFunction(initializer)) {
          statementToParse = initializer
        } else if (initializer && ts.isObjectLiteralExpression(initializer)) {
          // Handle stories like `export const Primary = { render: () => <Button /> }`
          const renderProperty = parsePropertyOfType({
            objectLiteralNode: initializer,
            propertyName: 'render',
            predicate: ts.isArrowFunction,
            parserContext,
            required: true,
          })

          if (renderProperty) {
            statementToParse = renderProperty
          }
        }
      }

      if (!statementToParse) {
        throw new ParserError(
          'Expected function declaration, arrow function or render function in story',
          {
            sourceFile,
            node: statement,
          },
        )
      }

      let render = parseJSXRenderFunction(statementToParse, parserContext, propMappings)

      if (!render) {
        continue
      }

      const template = render.code ?? `<${componentMetadata.component} />`

      // TODO handle JSDoc on stories
      codeConnectObjects.push({
        ...baseCodeConnect,
        template,
        variant: example?.variant,
      })
    }

    return codeConnectObjects
  } catch (e) {
    logger.error(`Error parsing story ${path}: ${e}`)
    throw e
  }
}

/**
 * Get the TS Node representing the component declaration from the story file
 *
 * @param objectLiteralNode Object literal containing the story file metadata
 * @returns TS Node representing the component declaration or undefined
 */
function getComponentDeclaration(
  objectLiteralNode: ts.ObjectLiteralExpression,
): ts.Expression | undefined {
  for (const property of objectLiteralNode.properties) {
    if (!ts.isPropertyAssignment(property)) continue
    const propertyName = property.name
    if (ts.isIdentifier(propertyName) && propertyName.text === 'component') {
      return property.initializer
    }
  }
  return undefined
}

/**
 * Validate and returns Figma metadata from the default export of the storybook
 * file
 *
 * @param storyFileMetaNode TS Node containing the story file metadata, i.e. the
 * default export of the file
 * @param sourceFile TS SourceFile representing a single story
 * @returns Figma metadata
 * @throws Error if no Figma metadata is found
 */
function parseStoryMetadata(storyFileMetaNode: ts.Node, parserContext: ParserContext) {
  const { sourceFile, checker } = parserContext
  // Find the first object expression under tsSourceFile.statements[0],
  // which contains the story file metadata. We do it this way to allow syntax
  // like `export default ({ ... meta ... } as ComponentMeta<...>)`
  const objectLiteralNode = bfsFindNode(storyFileMetaNode, sourceFile, (node) =>
    ts.isObjectLiteralExpression(node),
  )

  if (!objectLiteralNode || !ts.isObjectLiteralExpression(objectLiteralNode)) {
    logger.debug(`No object literal found in story metadata`)
    return
  }

  const componentDeclaration = getComponentDeclaration(objectLiteralNode)
  if (!componentDeclaration) {
    logger.debug(`No component declaration found in story metadata`)
    return
  }

  const parametersNode = parsePropertyOfType({
    objectLiteralNode: objectLiteralNode,
    propertyName: 'parameters',
    predicate: ts.isObjectLiteralExpression,
    parserContext,
    required: false,
  })

  // If there's no parameters object, this file shouldn't be imported
  if (!parametersNode) {
    logger.debug(`No parameters object found in story metadata`)
    return
  }

  const designNode = parsePropertyOfType({
    objectLiteralNode: parametersNode,
    propertyName: 'design',
    predicate: ts.isObjectLiteralExpression,
    parserContext,
    required: false,
  })

  // If there's no design object, this file shouldn't be imported
  if (!designNode) {
    logger.debug(`No design object found in story metadata`)
    return
  }

  const typeNode = parsePropertyOfType({
    objectLiteralNode: designNode,
    propertyName: 'type',
    predicate: ts.isStringLiteral,
    parserContext,
    errorMessage: '"type" property not found in "design" object in story metadata',
    required: false,
  })

  // If the design is not a Figma design, this file shouldn't be imported
  if (!typeNode || typeNode.text !== 'figma') {
    logger.debug(`Design type is not figma`)
    return
  }

  const urlNode = parsePropertyOfType({
    objectLiteralNode: designNode,
    propertyName: 'url',
    predicate: ts.isStringLiteral,
    parserContext,
    errorMessage: '"url" property not found in "design" object in story metadata',
    required: true,
  })

  const figmaStoryMetadata: FigmaStoryMetadata = {
    type: typeNode.text,
    url: urlNode.text,
  }

  const propMappingNode = parsePropertyOfType({
    objectLiteralNode: designNode,
    propertyName: 'props',
    predicate: ts.isObjectLiteralExpression,
    parserContext,
    required: false,
  })

  const examplesNode = parsePropertyOfType({
    objectLiteralNode: designNode,
    propertyName: 'examples',
    predicate: ts.isArrayLiteralExpression,
    parserContext,
    required: false,
  })

  let propMappings: {} | undefined
  let mappedProps: MappedProps

  if (propMappingNode) {
    mappedProps = new Map()
    propMappings = parsePropsObject(propMappingNode, parserContext)
  }

  type Example = {
    example: string
    variant?: FigmaConnectMeta['variant']
  }
  let examples: Example[] | undefined

  if (examplesNode) {
    examples = examplesNode.elements.map((exampleNode) => {
      if (ts.isStringLiteral(exampleNode) || ts.isIdentifier(exampleNode)) {
        return { example: exampleNode.text }
      }

      if (!ts.isObjectLiteralExpression(exampleNode)) {
        throw new ParserError(
          `Expected object literal in examples array, got: ${ts.SyntaxKind[exampleNode.kind]}`,
          {
            sourceFile,
            node: exampleNode,
          },
        )
      }

      return convertObjectLiteralToJs(exampleNode, sourceFile, checker) as Example
    })
  }

  return { figmaStoryMetadata, componentDeclaration, propMappings, mappedProps, examples }
}
