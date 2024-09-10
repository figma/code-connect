import { readFileSync } from 'fs'
import * as ts from 'typescript'
import path from 'path'
import {
  ComponentProperties,
  FigmaDocJSON,
  InjectedLayer,
  Result,
  SuccessResult,
} from '@figma/code-connect-shared/src/types'
import { getFullTemplate } from '@figma/code-connect-shared/src/get_full_template'
import { parseCodeConnect, ParseFn } from '../parser_common'

type ParseFileArgs = {
  /** The directory name where the example Code Connect files are located */
  dirName: string
  /** The Code Connect file to parse */
  file: string
  /** The Code Connect file parsing function to use */
  parseFn: ParseFn
  /** Optional array of extra files to add to the TS program */
  extraFiles?: string[]
}

/**
 * Parse a Code Connect file and return the parsed object
 */
export async function parseFile({
  dirName,
  file,
  parseFn,
  extraFiles = [],
}: ParseFileArgs): Promise<FigmaDocJSON[]> {
  const program = ts.createProgram(
    [
      path.join(dirName, 'examples', file),
      ...extraFiles.map((extraFile) => path.join(dirName, 'examples', extraFile)),
    ],
    {},
  )

  return await parseCodeConnect({
    program,
    file: path.join(dirName, 'examples', file),
    config: { parser: 'react' },
    absPath: path.join(dirName, 'examples'),
    parseOptions: {
      repoUrl: 'git@github.com:figma/code-connect.git',
      debug: false,
    },
    parseFn,
  })
}

type GetTemplateArgs = {
  dirName: string
  file: string
  parseFn: ParseFn
  extraFiles?: string[]
}

async function getTemplate({ dirName, file, parseFn, extraFiles = [] }: GetTemplateArgs) {
  return (await parseFile({ dirName, file, parseFn, extraFiles }))[0].template
}

type ExecuteTemplateArgs = {
  /** The Code Connect file to execute */
  template: string
  /** The properties to use when rendering the Code Connect file */
  properties: ComponentProperties
  /** Optional array of child nodes to inject into the Code Connect file */
  childNodes?: InjectedLayer[]
  /** Optional object of child instance documents */
  instanceFigmadocs?: Record<string, FigmaDocJSON[]>
}

let apiSource: string

/**
 * Execute a Code Connect file and return the result
 */
export async function executeTemplate(args: ExecuteTemplateArgs) {
  const fullTemplate = getFullTemplate({
    apiSource,
    nodeTreeToInject: {
      type: 'INSTANCE',
      guid: 'root',
      key: 'key-root',
      name: 'RootNode',
      symbolId: '',
      properties: args.properties || {},
      children: args.childNodes || [],
    },
    inlineInstancesEnabled: true,
    instanceFigmadocs: {},
    getInstanceFigmadocFromJSON: (instanceFigmadocsJSON, _guid) => {
      try {
        return instanceFigmadocsJSON[0]
      } catch {
        return null
      }
    },
    ...args,
  })

  const result: Result = new Function(fullTemplate)()
  return result
}

function expectSuccess(result: Result): asserts result is SuccessResult {}

/**
 * Returns a `getResult` function that can be used to render a Code Connect
 * file, assert that it was successfully rendered, and return the sections so we
 * can make assertions about them
 *
 * @param dirName The directory name where the example Code Connect files are
 * located
 * @param parseFn The Code Connect file parsing function to use
 * @param expectSuccessFn The function to use to assert that the result was
 * successful
 * @param extraFiles An array of extra files to add to the TS program
 */
export function makeGetResult(
  // This uses positional args because of a TS error related to the assertion part
  // of `expectSuccessFn: typeof expectSuccess` when trying to use object args
  dirName: string,
  parseFn: ParseFn,
  expectSuccessFn: typeof expectSuccess,
  extraFiles: string[] = [],
) {
  return async function getResult(
    file: string,
    props: Record<
      string,
      string | boolean | { type: 'BOOLEAN' | 'TEXT' | 'VARIANT'; value: string | boolean }
    > = {},
    childNodes: InjectedLayer[] = [],
  ) {
    const template = await getTemplate({ dirName, file, parseFn, extraFiles })
    const propsFigmaFormat = Object.fromEntries(
      Object.entries(props).map(([key, value]) =>
        typeof value === 'object'
          ? [key, { type: value.type, value: value.value }]
          : [
              key,
              {
                type: typeof value === 'boolean' ? ('BOOLEAN' as const) : ('TEXT' as const),
                value,
              },
            ],
      ),
    )

    const result = await executeTemplate({ template, properties: propsFigmaFormat, childNodes })

    expectSuccessFn(result)
    return result.data.sections
  }
}

export function expectDefined<T>(value: T | undefined): asserts value is T {
  expect(value).toBeDefined()
}

export function code(code: string) {
  return { type: 'CODE', code }
}

export function instance(guid: string, symbolId: string) {
  return { type: 'INSTANCE', guid, symbolId }
}

/**
 * Returns a `renderInstance` function that can be used to render a Code Connect
 * file with child instances
 *
 * @param parseFn The Code Connect file parsing function to use
 * @param dirName The directory name where the example Code Connect files are
 * located
 * @param extraFiles An array of extra files to add to the TS program
 */
export function makeRenderInstance(parseFn: ParseFn, dirName: string, extraFiles: string[] = []) {
  return async function (
    childTemplateName: string,
    file: string,
    extraProperties?: Record<string, any>,
  ) {
    const docs = await parseFile({ dirName, file, parseFn, extraFiles })
    const mainDoc = docs.find((doc) => doc.figmaNode === 'main')
    const childDoc = docs.find((doc) => doc.figmaNode === childTemplateName)

    expectDefined(mainDoc)
    expectDefined(childDoc)

    const result = await executeTemplate({
      template: mainDoc.template,
      properties: {
        Instance: { type: 'INSTANCE_SWAP', value: 'childSymbolId' },
        ...extraProperties,
      },
      childNodes: [
        {
          type: 'INSTANCE',
          key: 'childGuid',
          guid: 'childGuid',
          name: 'Child',
          symbolId: 'childSymbolId',
          properties: {
            String: { type: 'TEXT', value: 'test' },
          },
          children: [],
        },
      ],
      instanceFigmadocs: {
        'key-childGuid': [childDoc],
      },
    })

    expectSuccess(result)
    return result
  }
}

// Before running any tests, we transpile the template API into a string, so
// we can prepend it to the template. We do this in beforeAll so that it
// happens on every test run, so you can make changes to the API and rerun the
// tests while on watch mode, but so that it only happens once per run as it's
// relatively slow.
export function templateRenderingBeforeAll() {
  apiSource = ts
    .transpileModule(
      readFileSync(
        __dirname +
          '/../../../node_modules/@figma/code-connect-shared/raw/code_connect_js_api.raw_source.ts',
        'utf8',
      ),
      {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ESNext,
          removeComments: false,
        },
      },
    )
    // transpileModule adds this, which we don't want
    .outputText.replace('export {}', '')
}
