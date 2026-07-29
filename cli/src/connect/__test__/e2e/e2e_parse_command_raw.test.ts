import { promisify } from 'util'
import { exec } from 'child_process'
import { tidyStdOutput } from '../../../__test__/utils'
import path from 'path'
import fs from 'fs'
import os from 'os'

describe('e2e test for `parse` command (raw)', () => {
  const cliVersion = require('../../../../package.json').version

  function createParserlessOnlyProject(config?: Record<string, any>) {
    const testPath = fs.mkdtempSync(path.join(os.tmpdir(), 'code-connect-parserless-'))
    const templateFile = path.join(testPath, 'test-component.figma.ts')

    if (config) {
      fs.writeFileSync(
        path.join(testPath, 'figma.config.json'),
        JSON.stringify({ codeConnect: config }),
      )
    }

    fs.writeFileSync(
      templateFile,
      `// url=https://figma.com/design/parserless?node-id=1:1
import figma from 'figma'
const label: string = figma.selectedInstance.getString('Label')

export default figma.code\`<Button label="\${label}" />\`
`,
    )

    const ignoredNodeModulesDir = path.join(testPath, 'node_modules', 'ignored-package')
    fs.mkdirSync(ignoredNodeModulesDir, { recursive: true })
    fs.writeFileSync(
      path.join(ignoredNodeModulesDir, 'ignored.figma.ts'),
      `// url=https://figma.com/design/parserless?node-id=2:2
import figma from 'figma'

export default figma.code\`<Ignored />\`
`,
    )

    return { testPath, templateFile }
  }

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

  it('successfully parses a parserless template project with no parser in the config', async () => {
    const { testPath, templateFile } = createParserlessOnlyProject({
      include: ['**/*.figma.ts'],
      label: 'React',
      language: 'jsx',
    })

    try {
      const result = await promisify(exec)(
        `npx tsx ../../../cli connect parse --skip-update-check --dir ${testPath}`,
        {
          cwd: __dirname,
        },
      )

      expect(tidyStdOutput(result.stderr)).toBe(
        `Can't determine parser from project. Proceeding without a parser.\nConfig file found, parsing ${testPath} using specified include globs\n${templateFile}\nUsing label "React"\nUsing language "jsx"`,
      )

      const json = JSON.parse(result.stdout)

      expect(json).toHaveLength(1)
      expect(json).toMatchObject([
        {
          figmaNode: 'https://figma.com/design/parserless?node-id=1:1',
          label: 'React',
          language: 'jsx',
          sourceLocation: { line: -1 },
          templateData: { nestable: true, isParserless: true },
          metadata: { cliVersion },
        },
      ])
      expect(json[0].template).toContain("const figma = require('figma')")
      expect(json[0].template).toContain('export default figma.code')
    } finally {
      fs.rmSync(testPath, { recursive: true, force: true })
    }
  })

  it('successfully parses a parserless template project with no config', async () => {
    const { testPath, templateFile } = createParserlessOnlyProject()

    try {
      const result = await promisify(exec)(
        `npx tsx ../../../cli connect parse --skip-update-check --dir ${testPath}`,
        {
          cwd: __dirname,
        },
      )

      expect(tidyStdOutput(result.stderr)).toBe(
        `No config file found in ${testPath}, proceeding with default options\nCan't determine parser from project. Proceeding without a parser.\n${templateFile}`,
      )

      const json = JSON.parse(result.stdout)

      expect(json).toHaveLength(1)
      expect(json).toMatchObject([
        {
          figmaNode: 'https://figma.com/design/parserless?node-id=1:1',
          label: 'Code',
          language: 'plaintext',
          sourceLocation: { line: -1 },
          templateData: { nestable: true, isParserless: true },
          metadata: { cliVersion },
        },
      ])
      expect(json[0].template).toContain("const figma = require('figma')")
      expect(json[0].template).toContain('export default figma.code')
    } finally {
      fs.rmSync(testPath, { recursive: true, force: true })
    }
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

  it('logs and skips (never fails) a url-less .figma.ts file that contains codeProperties', async () => {
    const testPath = path.join(__dirname, 'e2e_parse_command/raw_ts_no_url')

    // A .figma.ts file with no // url= directive that contains the string
    // `codeProperties` is not Code Connect (e.g. Make stores code component
    // property definitions this way). The CLI must log and skip it, and must NOT
    // fail — even with --exit-on-unreadable-files.
    const result = await promisify(exec)(
      `npx tsx ../../../cli connect parse --skip-update-check --exit-on-unreadable-files --dir ${testPath}`,
      {
        cwd: __dirname,
      },
    )

    // The file is logged and skipped, not treated as an unreadable file.
    expect(result.stderr).toContain('Skipping')
    expect(result.stderr).toContain('codeProperties')
    expect(result.stderr).not.toContain('❌')
    expect(result.stderr).not.toContain('Exiting due to unreadable files')

    // Nothing was parsed, so the output is an empty array.
    expect(JSON.parse(result.stdout)).toEqual([])
  })

  it('ignores a .figma.ts file that has no // url= / // component= / // source= directive', async () => {
    const testPath = path.join(__dirname, 'e2e_parse_command/raw_ts_no_directives')

    // A .figma.ts file with none of the directives is not detected as a Code
    // Connect raw template at all, so it is ignored entirely — no parse, no
    // warning, no error — even with --exit-on-unreadable-files.
    const result = await promisify(exec)(
      `npx tsx ../../../cli connect parse --skip-update-check --exit-on-unreadable-files --dir ${testPath}`,
      {
        cwd: __dirname,
      },
    )

    expect(result.stderr).not.toContain('Skipping')
    expect(result.stderr).not.toContain('❌')
    expect(result.stderr).not.toContain('Exiting due to unreadable files')
    expect(result.stderr).not.toContain('Missing required url field')

    // Nothing was parsed, so the output is an empty array.
    expect(JSON.parse(result.stdout)).toEqual([])
  })

  it('successfully parses a TypeScript raw template file with relative helper imports', async () => {
    const testPath = path.join(__dirname, 'e2e_parse_command/raw_ts_with_imports')
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
    expect(json).toHaveLength(1)
    // The helper body is inlined into the self-contained bundle, `figma` stays
    // external, and the entry's default export is re-exposed for the runtime.
    expect(json[0].template).toContain('function formatLabel')
    expect(json[0].template).toContain('__figmaRequire("figma")')
    expect(json[0].template).toMatch(/export default \w+$/m)
    // Bundled paths are relative, never absolute (which leak usernames).
    expect(json[0].template).not.toContain(testPath)
  })

  it('successfully parses a JavaScript raw template file with relative helper imports', async () => {
    const testPath = path.join(__dirname, 'e2e_parse_command/raw_js_with_imports')
    const expectedFile = path.join(testPath, 'test-component.figma.js')

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
    expect(json).toHaveLength(1)
    const { template } = json[0]
    // Both helpers' definitions are inlined into the self-contained bundle,
    // keyed by relative paths only (never absolute, which leak usernames).
    expect(template).toContain('hello world')
    expect(template).toMatch(/export default \w+$/m)
    expect(template).not.toContain(testPath)

    // The emitted template must run standalone under the runtime contract: a
    // `require('figma')` binding, with the last `export default` (the entry's)
    // becoming `return`, matching share/code-connect-snippet/get_full_template.
    const figmaStub = {
      code: (strings: TemplateStringsArray, ...values: unknown[]) =>
        strings.reduce((acc, s, i) => acc + s + (i < values.length ? values[i] : ''), ''),
    }
    const runtimeRequire = (name: string) => {
      if (name === 'figma') return figmaStub
      throw new Error(`unexpected require: ${name}`)
    }
    const exportDefaultIndex = template.lastIndexOf('export default')
    const runnableTemplate =
      exportDefaultIndex === -1
        ? template
        : template.slice(0, exportDefaultIndex) +
          'return' +
          template.slice(exportDefaultIndex + 'export default'.length)
    const run = new Function(
      'RUNTIME_REQUIRE',
      `const require = RUNTIME_REQUIRE
       return (function () {
         ${runnableTemplate}
       })()`,
    )
    const data = run(runtimeRequire)
    expect(data.id).toBe('Button')
    expect(data.example).toBe('<Button>hello world 5</Button>')
  })

  it('exits with code 1 when --exit-on-unreadable-files is set and a template file has an unsupported external import', async () => {
    const testPath = fs.mkdtempSync(path.join(os.tmpdir(), 'code-connect-raw-ts-external-import-'))

    fs.writeFileSync(
      path.join(testPath, 'figma.config.json'),
      JSON.stringify({
        codeConnect: {
          parser: 'react',
          include: ['*.figma.ts'],
        },
      }),
    )

    fs.writeFileSync(
      path.join(testPath, 'test-component.figma.ts'),
      `// url=https://figma.com/design/parserless?node-id=1:1
import figma from 'figma'
import { compact } from 'lodash'
export default figma.code\`<Button values="\${compact(['a']).join(',')}" />\`
`,
    )

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
      expect(e.stderr).toContain(
        "TypeScript template files only support importing from 'figma' and relative helper files.",
      )
    } finally {
      fs.rmSync(testPath, { recursive: true, force: true })
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
