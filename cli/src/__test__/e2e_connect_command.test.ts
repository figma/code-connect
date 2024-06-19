import { promisify } from 'util'
import { exec, execSync } from 'child_process'
import { LONG_TEST_TIMEOUT_MS, tidyStdOutput } from './utils'
import path from 'path'

describe('e2e test for `connect` command', () => {
  const cliVersion = require('../../package.json').version

  it(
    'successfully parses both React and Storybook files',
    async () => {
      const testPath = path.join(__dirname, 'e2e_connect_command/react_storybook')

      const result = await promisify(exec)(`npx tsx ../cli connect parse --dir ${testPath}`, {
        cwd: __dirname,
      })

      expect(tidyStdOutput(result.stderr)).toBe(
        `No config file found in ${testPath}, proceeding with default options
Using "react" parser as package.json containing a "react" dependency was found in ${testPath}. If this is incorrect, please check you are running Code Connect from your project root, or add a \`parser\` key to your config file. See https://github.com/figma/code-connect for more information.
${path.join(testPath, 'ReactApiComponent.figmadoc.tsx')}`,
      )
      const json = JSON.parse(result.stdout)

      expect(json).toMatchObject([
        {
          figmaNode: 'ui/button',
          label: 'React',
          language: 'typescript',
          component: 'ReactApiComponent',
          source:
            'https://github.com/figma/code-connect/blob/main/cli/src/__test__/e2e_connect_command/react_storybook/ReactApiComponent.tsx',
          sourceLocation: { line: 13 },
          template: `const figma = require(\"figma\")

export default figma.tsx\`<ReactApiComponent />\``,
          templateData: {
            imports: ["import { ReactApiComponent } from './ReactApiComponent'"],
          },
          metadata: {
            cliVersion,
          },
        },
        {
          figmaNode: 'https://figma.com/test',
          source:
            'https://github.com/figma/code-connect/blob/main/cli/src/__test__/e2e_connect_command/react_storybook/StorybookComponent.tsx',
          sourceLocation: { line: 7 },
          templateData: { imports: [] },
          component: 'StorybookComponent',
          label: 'Storybook',
          language: 'typescript',
          metadata: {
            cliVersion,
          },
        },
      ])

      expect(json[1].template.startsWith('function _fcc_renderReactProp')).toBe(true)
      // We don't care about checking the contents of the function as this can change
      expect(
        json[1].template.endsWith(
          "const figma = require('figma')\n\nexport default figma.tsx`<StorybookComponent disabled={false}>Hello</StorybookComponent>`\n",
        ),
      ).toBe(true)
    },
    LONG_TEST_TIMEOUT_MS,
  )

  describe('parser executables (connect)', () => {
    function expectSuccess(testName: string, result: { stdout: string }) {
      const testPath = path.join(__dirname, `e2e_connect_command/${testName}`)
      const json = JSON.parse(result.stdout)

      expect(json).toMatchObject([
        {
          figmaNode: `${path.join(testPath, 'Test.test')}`,
          template:
            '{"config":{"parser":"__unit_test__","include":["*.test"],"exclude":["Excluded.test"]},"mode":"PARSE"}',
          label: 'Test',
          source: `https://github.com/figma/code-connect/blob/main/cli/src/__test__/e2e_connect_command/${testName}/Test.test`,
        },
        {
          figmaNode: `${path.join(testPath, 'OtherFile.test')}`,
          template:
            '{"config":{"parser":"__unit_test__","include":["*.test"],"exclude":["Excluded.test"]},"mode":"PARSE"}',
          label: 'Test',
          source: `https://github.com/figma/code-connect/blob/main/cli/src/__test__/e2e_connect_command/${testName}/OtherFile.test`,
        },
      ])
    }

    it(
      'successfully calls a first party parser executable',
      async () => {
        const result = await promisify(exec)(
          `npx tsx ../cli connect parse --dir ./e2e_connect_command/unit_test_parser --verbose`,
          {
            cwd: __dirname,
          },
        )

        expect(tidyStdOutput(result.stderr)).toBe(
          `Config file found, parsing ./e2e_connect_command/unit_test_parser using specified include globs
Running parser: node parser/unit_test_parser.js
Debug message from parser!
Success from parser!`,
        )

        expectSuccess('unit_test_parser', result)
      },
      LONG_TEST_TIMEOUT_MS,
    )

    it('does not fail with an error if a parser executable returns a warning', async () => {
      const result = await promisify(exec)(
        `npx tsx ../cli connect parse --dir ./e2e_connect_command/unit_test_parser_warning`,
        {
          cwd: __dirname,
        },
      )

      expect(tidyStdOutput(result.stderr)).toBe(
        `Config file found, parsing ./e2e_connect_command/unit_test_parser_warning using specified include globs
Warning from parser!`,
      )

      expectSuccess('unit_test_parser_warning', result)
    })

    it('fails with an error if a parser executable returns an error', async () => {
      try {
        await promisify(exec)(
          `npx tsx ../cli connect parse --dir ./e2e_connect_command/unit_test_parser_error`,
          {
            cwd: __dirname,
          },
        )
      } catch (e: any) {
        expect(e.code).toBe(1)
        expect(tidyStdOutput(e.stderr)).toBe(
          `Config file found, parsing ./e2e_connect_command/unit_test_parser_error using specified include globs
Error from parser!
Errors encountered calling parser, exiting`,
        )
      }
    })

    it('returns an error if the first party parser does not exist', async () => {
      try {
        await promisify(exec)(
          `npx tsx ../cli connect parse --dir ./e2e_connect_command/invalid_parser`,
          {
            cwd: __dirname,
          },
        )
      } catch (e: any) {
        expect(e.code).toBe(1)
        expect(tidyStdOutput(e.stderr)).toBe(
          `Config file found, parsing ./e2e_connect_command/invalid_parser using specified include globs
Invalid parser specified: "does-not-exist". Valid parsers are: swift, compose, __unit_test__.`,
        )
      }
    })

    it('returns an error if the first party parser does not return a valid response', async () => {
      try {
        await promisify(exec)(
          `npx tsx ../cli connect parse --dir ./e2e_connect_command/unit_test_parser_invalid_response`,
          {
            cwd: __dirname,
          },
        )
      } catch (e: any) {
        expect(e.code).toBe(1)
        expect(tidyStdOutput(e.stderr)).toBe(
          `Config file found, parsing ./e2e_connect_command/unit_test_parser_invalid_response using specified include globs
Error returned from parser: Validation error: Required at "docs[0].figmaNode"; Required at "docs[0].template"; Required at "docs[0].templateData"; Required at "docs[0].language"; Required at "docs[0].label"`,
        )
      }
    })
  })

  // TODO Add test for SwiftUI - both kinds of setup
})

// TODO E2E test for publish?
