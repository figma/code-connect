import { promisify } from 'util'
import { exec } from 'child_process'
import { tidyStdOutput } from '../../../__test__/utils'
import path from 'path'

describe('e2e test for `parse` command (parser executables)', () => {
  function expectSuccess(testName: string, result: { stdout: string }) {
    const testPath = path.join(__dirname, `e2e_parse_command/${testName}`)
    const json = JSON.parse(result.stdout)

    expect(json).toMatchObject([
      {
        figmaNode: `${path.join(testPath, 'Test.test')}`,
        template:
          '{"config":{"parser":"__unit_test__","include":["*.test"],"exclude":["Excluded.test"]},"mode":"PARSE"}',
        label: 'Test',
        source: `https://github.com/figma/code-connect/blob/main/cli/src/connect/__test__/e2e/e2e_parse_command/${testName}/Test.test`,
      },
      {
        figmaNode: `${path.join(testPath, 'OtherFile.test')}`,
        template:
          '{"config":{"parser":"__unit_test__","include":["*.test"],"exclude":["Excluded.test"]},"mode":"PARSE"}',
        label: 'Test',
        source: `https://github.com/figma/code-connect/blob/main/cli/src/connect/__test__/e2e/e2e_parse_command/${testName}/OtherFile.test`,
      },
    ])
  }

  it('successfully calls a first party parser executable', async () => {
    const result = await promisify(exec)(
      `npx tsx ../../../cli connect parse --skip-update-check --dir ./e2e_parse_command/unit_test_parser --verbose`,
      {
        cwd: __dirname,
      },
    )

    expect(tidyStdOutput(result.stderr)).toBe(
      `Config file found, parsing ./e2e_parse_command/unit_test_parser using specified include globs
Running parser: node parser/unit_test_parser.js
Debug message from parser!
Success from parser!`,
    )

    expectSuccess('unit_test_parser', result)
  })

  it('does not fail with an error if a parser executable returns a warning', async () => {
    const result = await promisify(exec)(
      `npx tsx ../../../cli connect parse --skip-update-check --dir ./e2e_parse_command/unit_test_parser_warning`,
      {
        cwd: __dirname,
      },
    )

    expect(tidyStdOutput(result.stderr)).toBe(
      `Config file found, parsing ./e2e_parse_command/unit_test_parser_warning using specified include globs
Warning from parser!`,
    )

    expectSuccess('unit_test_parser_warning', result)
  })

  it('fails with an error if a parser executable returns an error', async () => {
    try {
      await promisify(exec)(
        `npx tsx ../../../cli connect parse --skip-update-check --dir ./e2e_parse_command/unit_test_parser_error`,
        {
          cwd: __dirname,
        },
      )
    } catch (e: any) {
      expect(e.code).toBe(1)
      expect(tidyStdOutput(e.stderr)).toBe(
        `Config file found, parsing ./e2e_parse_command/unit_test_parser_error using specified include globs
Error from parser!
Errors encountered calling parser, exiting`,
      )
    }
  })

  it('returns an error if the first party parser does not exist', async () => {
    try {
      await promisify(exec)(
        `npx tsx ../../../cli connect parse --skip-update-check --dir ./e2e_parse_command/invalid_parser`,
        {
          cwd: __dirname,
        },
      )
    } catch (e: any) {
      expect(e.code).toBe(1)
      expect(tidyStdOutput(e.stderr)).toBe(
        `Config file found, parsing ./e2e_parse_command/invalid_parser using specified include globs
Invalid parser specified: "does-not-exist". Valid parsers are: swift, compose, custom, __unit_test__.`,
      )
    }
  })

  it('returns an error if the first party parser does not return a valid response', async () => {
    try {
      await promisify(exec)(
        `npx tsx ../../../cli connect parse --skip-update-check --dir ./e2e_parse_command/unit_test_parser_invalid_response`,
        {
          cwd: __dirname,
        },
      )
    } catch (e: any) {
      expect(e.code).toBe(1)
      expect(tidyStdOutput(e.stderr)).toBe(
        `Config file found, parsing ./e2e_parse_command/unit_test_parser_invalid_response using specified include globs
Error returned from parser: Validation error: Required at "docs[0].figmaNode"; Required at "docs[0].template"; Required at "docs[0].templateData"; Required at "docs[0].language"; Required at "docs[0].label". Try re-running the command with --verbose for more information.`,
      )
    }
  })
})
