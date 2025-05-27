import { exec } from 'child_process'
import { readFileSync, rmSync } from 'fs'
import path from 'path'
import { promisify } from 'util'
import { tidyStdOutput } from '../../../__test__/utils'

describe('e2e test for `create` command', () => {
  const testParentPath = path.join(__dirname, 'e2e_create_command')
  function getTestPath(testName: string) {
    return path.join(testParentPath, testName)
  }

  async function runCreate(cwd: string, verbose = false) {
    return await promisify(exec)(
      `npx cross-env FIGMA_ACCESS_TOKEN=test CODE_CONNECT_MOCK_CREATE_API_RESPONSE=${testParentPath}/dummy_api_response.json npx tsx ../../../../../cli connect create --skip-update-check${
        verbose ? ' --verbose' : ''
      } https://www.figma.com/file/1234abcd/Test-File?node-id=1-39`,
      {
        cwd,
      },
    )
  }

  it('successfully creates a React component', async () => {
    const testPath = getTestPath('react')

    try {
      const result = await runCreate(testPath)

      expect(readFileSync(path.join(testPath, 'TestInstanceComponent.figma.tsx'), 'utf-8')).toEqual(
        readFileSync(path.join(testPath, 'expected_component'), 'utf-8'),
      )

      expect(tidyStdOutput(result.stderr)).toBe(
        `No config file found in ${testPath}, proceeding with default options
Using "react" parser as package.json containing a "react" dependency was found in ${testPath}. If this is incorrect, please check you are running Code Connect from your project root, or add a \`parser\` key to your config file. See https://github.com/figma/code-connect for more information.
Fetching component information from Figma...
Parsing response
Generating Code Connect files...
Code Connect files generated successfully:
${path.join(testPath, 'TestInstanceComponent.figma.tsx')}`,
      )
    } finally {
      rmSync(path.join(testPath, 'TestInstanceComponent.figma.tsx'), { force: true })
    }
  })

  describe('parser executables (create)', () => {
    const getPreamble = (
      testPath: string,
    ) => `Config file found, parsing ${testPath} using specified include globs
Fetching component information from Figma...
Parsing response
Generating Code Connect files...`

    const getSuccessPreamble = (testPath: string) => `${getPreamble(testPath)}
Running parser: node parser/unit_test_parser.js`

    it('successfully calls a first-party parser executable', async () => {
      const testPath = getTestPath('unit_test_parser')
      const result = await runCreate(testPath, true)

      expect(tidyStdOutput(result.stderr)).toBe(`${getSuccessPreamble(testPath)}
Received: ${JSON.stringify({
        mode: 'CREATE',
        destinationDir: testPath,
        component: {
          figmaNodeUrl: 'https://www.figma.com/file/1234abcd/Test-File?node-id=1-39',
          id: '1:39',
          name: 'Test Instance Component',
          normalizedName: 'TestInstanceComponent',
          type: 'COMPONENT_SET',
          componentPropertyDefinitions: {
            Color: {
              type: 'VARIANT',
              defaultValue: 'Default',
              variantOptions: ['Default', 'Red'],
            },
          },
        },
        config: {
          parser: '__unit_test__',
          include: ['*.test'],
          exclude: ['Excluded.test'],
        },
        verbose: true,
      })}
Success from parser!
Code Connect files generated successfully:
test_file`)
    })

    it('does not fail with an error if a parser executable returns a warning', async () => {
      const testPath = getTestPath('unit_test_parser_warning')
      const result = await runCreate(testPath, true)

      expect(tidyStdOutput(result.stderr)).toBe(`${getSuccessPreamble(testPath)}
Warning from parser!
Code Connect files generated successfully:
test_file`)
    })

    it('fails with an error if a parser executable returns an error', async () => {
      const testPath = getTestPath('unit_test_parser_error')
      try {
        await runCreate(testPath, true)
      } catch (e: any) {
        expect(e.code).toBe(1)
        expect(tidyStdOutput(e.stderr)).toBe(`${getSuccessPreamble(testPath)}
Error from parser!
Errors encountered calling parser, exiting`)
      }
    })

    it('returns an error if the first party parser does not exist', async () => {
      const testPath = getTestPath('invalid_parser')
      try {
        await runCreate(testPath, true)
      } catch (e: any) {
        expect(e.code).toBe(1)
        expect(tidyStdOutput(e.stderr)).toBe(`${getPreamble(testPath)}
Invalid parser specified: "does-not-exist". Valid parsers are: swift, compose, custom, __unit_test__.`)
      }
    })

    it('returns an error if the first party parser does not return a valid response', async () => {
      const testPath = getTestPath('unit_test_parser_invalid_response')
      try {
        await runCreate(testPath, true)
      } catch (e: any) {
        expect(e.code).toBe(1)
        expect(tidyStdOutput(e.stderr)).toBe(`${getSuccessPreamble(testPath)}
Failed to create: Validation error: Required at "createdFiles"
Please raise any bugs or feedback at https://github.com/figma/code-connect/issues.`)
      }
    })
  })
})
