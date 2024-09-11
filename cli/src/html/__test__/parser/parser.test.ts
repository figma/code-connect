import { CodeConnectHtmlConfig } from '../../../connect/project'
import ts from 'typescript'
import path from 'path'
import { parseCodeConnect } from '../../../connect/parser_common'
import { parseHtmlDoc } from '../../parser'

async function testParse(
  file: string,
  extraFiles: string[] = [],
  config?: Omit<CodeConnectHtmlConfig, 'parser'>,
) {
  const program = ts.createProgram(
    [
      path.join(__dirname, 'examples', file),
      ...extraFiles.map((file) => path.join(__dirname, file)),
    ],
    {},
  )
  return await parseCodeConnect({
    program,
    file: path.join(__dirname, 'examples', file),
    config: { ...config, parser: 'html' },
    parseFn: parseHtmlDoc,
    absPath: __dirname,
    parseOptions: {
      repoUrl: 'git@github.com:figma/code-connect.git',
      debug: false,
    },
  })
}

describe('HTML Parser', () => {
  it('throws an error if there is no config object', async () => {
    expect(async () => await testParse('NoConfigObject.figma.ts')).rejects.toThrow(
      `The second argument to figma.connect() must be an object literal. Example usage:
\`figma.connect('https://www.figma.com/file/123?node-id=1-1', {
  example: () => html\`<button />\`
})\``,
    )
  })

  it('throws an error if there is no example', async () => {
    expect(async () => await testParse('NoExample.figma.ts')).rejects.toThrow(
      `The 'example' property must be an arrow function which returns a html tagged template string. Example usage:
\`figma.connect('https://www.figma.com/file/123?node-id=1-1', {
  example: (props) => html\`<my-button />\`
})\``,
    )
  })

  it('throws an error if the example function returns a plain tagged template', async () => {
    expect(async () => await testParse('WrongSignatureNoHtmlTag.figma.ts')).rejects.toThrow(
      'Expected only a tagged template literal as the body of the render function',
    )
  })

  it('throws an error if the example function returns JSX', async () => {
    expect(async () => await testParse('WrongSignatureJsx.figma.tsx')).rejects.toThrow(
      'Expected only a tagged template literal as the body of the render function',
    )
  })

  it('throws an error if the example function is a regular function with extra code', async () => {
    expect(
      async () => await testParse('RegularFunctionExampleWithExtraCode.figma.ts'),
    ).rejects.toThrow('Expected only a tagged template literal as the body of the render function')
  })

  it('handles imports', async () => {
    const result = await testParse('CustomImports.figma.ts', [])

    expect(result).toMatchObject([
      {
        templateData: {
          imports: ['import "@ui/Button"'],
        },
      },
    ])
  })
})
