import { promisify } from 'util'
import { exec } from 'child_process'
import { tidyStdOutput } from '../../../__test__/utils'
import path from 'path'

describe('e2e test for `parse` command (raw)', () => {
  const cliVersion = require('../../../../package.json').version

  it('successfully parses raw template file', async () => {
    const testPath = path.join(__dirname, 'e2e_parse_command/raw')
    const expectedFile = path.join(testPath, 'test-component.figma.template.js')

    const result = await promisify(exec)(
      `npx tsx ../../../cli connect parse --skip-update-check --dir ${testPath}`,
      {
        cwd: __dirname,
      },
    )

    expect(tidyStdOutput(result.stderr)).toBe(
      `Config file found, parsing ${testPath} using specified include globs\n${expectedFile}`,
    )

    const json = JSON.parse(result.stdout)

    expect(json).toMatchObject([
      {
        figmaNode: 'https://figma.com/design/abc?node=1:1',
        label: 'Code',
        language: 'plaintext',
        sourceLocation: { line: -1 },
        template: `const figma = require('figma')
const text = figma.currentLayer.__properties__.string('Text')

export default figma.code\`def python_code():
  return \${text}\`
`,
        templateData: { nestable: true, isParserless: true },
        metadata: {
          cliVersion,
        },
      },
    ])
  })

  it('successfully parses TypeScript raw template file', async () => {
    const testPath = path.join(__dirname, 'e2e_parse_command/raw_ts')
    const expectedFile = path.join(testPath, 'test-component.figma.template.ts')

    const result = await promisify(exec)(
      `npx tsx ../../../cli connect parse --skip-update-check --dir ${testPath}`,
      {
        cwd: __dirname,
      },
    )

    expect(tidyStdOutput(result.stderr)).toBe(
      `Config file found, parsing ${testPath} using specified include globs\n${expectedFile}`,
    )

    const json = JSON.parse(result.stdout)

    expect(json).toMatchObject([
      {
        figmaNode: 'https://figma.com/design/abc?node=1:1',
        label: 'Code',
        language: 'plaintext',
        sourceLocation: { line: -1 },
        templateData: { nestable: true, isParserless: true },
        metadata: { cliVersion },
      },
    ])

    // Type annotation should be stripped, core template content should be present
    const template: string = json[0].template
    expect(template).not.toContain(': string')
    expect(template).toContain("const figma = require('figma')")
    expect(template).toContain('export default figma.code')
  })

  it('successfully parses TypeScript raw template file with ESM import figma from "figma"', async () => {
    const testPath = path.join(__dirname, 'e2e_parse_command/raw_ts_esm_import')
    const expectedFile = path.join(testPath, 'test-component.figma.template.ts')

    const result = await promisify(exec)(
      `npx tsx ../../../cli connect parse --skip-update-check --dir ${testPath}`,
      {
        cwd: __dirname,
      },
    )

    expect(tidyStdOutput(result.stderr)).toBe(
      `Config file found, parsing ${testPath} using specified include globs\n${expectedFile}`,
    )

    const json = JSON.parse(result.stdout)

    expect(json).toMatchObject([
      {
        figmaNode: 'https://figma.com/design/abc?node=1:1',
        label: 'Code',
        language: 'plaintext',
        sourceLocation: { line: -1 },
        templateData: { nestable: true, isParserless: true },
        metadata: { cliVersion },
      },
    ])

    // ESM import should be converted to require, type annotation should be stripped
    const template: string = json[0].template
    expect(template).not.toContain(': string')
    expect(template).not.toContain("import figma from 'figma'")
    expect(template).toContain("const figma = require('figma')")
    expect(template).toContain('export default figma.code')
  })

  it('shows a helpful error and skips the file when a TypeScript raw template file contains module imports', async () => {
    const testPath = path.join(__dirname, 'e2e_parse_command/raw_ts_with_imports')

    // Without --exit-on-unreadable-files the bad file is skipped gracefully (exit 0)
    const result = await promisify(exec)(
      `npx tsx ../../../cli connect parse --skip-update-check --dir ${testPath}`,
      {
        cwd: __dirname,
      },
    )

    expect(result.stderr).toContain('TypeScript template files only support importing from')
    expect(result.stderr).toContain('import { formatLabel }')
    expect(result.stderr).toContain(
      'Use "const figma = require(\'figma\')" or "import figma from \'figma\'"',
    )
    // File was skipped, so output is an empty array
    expect(JSON.parse(result.stdout)).toEqual([])
  })

  it('exits with code 1 when --exit-on-unreadable-files is set and a template file has a parse error', async () => {
    const testPath = path.join(__dirname, 'e2e_parse_command/raw_ts_with_imports')

    try {
      await promisify(exec)(
        `npx tsx ../../../cli connect parse --skip-update-check --exit-on-unreadable-files --dir ${testPath}`,
        {
          cwd: __dirname,
        },
      )
      fail('Expected command to exit with error')
    } catch (e: any) {
      expect(e.code).toBe(1)
      expect(e.stderr).toContain('Exiting due to unreadable files')
      expect(e.stderr).toContain('TypeScript template files only support importing from')
    }
  })

  it('successfully applies documentUrlSubstitutions to raw template file', async () => {
    const testPath = path.join(__dirname, 'e2e_parse_command/raw_with_substitutions')
    const expectedFile = path.join(testPath, 'test-component.figma.template.js')

    const result = await promisify(exec)(
      `npx tsx ../../../cli connect parse --skip-update-check --dir ${testPath}`,
      {
        cwd: __dirname,
      },
    )

    expect(tidyStdOutput(result.stderr)).toBe(
      `Config file found, parsing ${testPath} using specified include globs\n${expectedFile}`,
    )

    const json = JSON.parse(result.stdout)

    expect(json).toMatchObject([
      {
        // URL should be substituted from https://figma.com/design/SOURCE-FILE to https://figma.com/design/TARGET-FILE
        figmaNode: 'https://figma.com/design/TARGET-FILE?node-id=1:1',
        label: 'Code',
        language: 'plaintext',
        sourceLocation: { line: -1 },
        template: `const figma = require('figma')
const text = figma.currentLayer.__properties__.string('Text')

export default figma.code\`def python_code():
  return \${text}\`
`,
        templateData: { nestable: true, isParserless: true },
        metadata: {
          cliVersion,
        },
      },
    ])
  })
})
