import { promisify } from 'util'
import { exec } from 'child_process'
import { tidyStdOutput } from '../../../__test__/utils'
import path from 'path'

describe('e2e test for `parse` command custom parsers', () => {
  function expectSuccess(testName: string, result: { stdout: string }) {
    const testPath = path.join(__dirname, `e2e_parse_command/${testName}`)
    const json = JSON.parse(result.stdout)

    expect(json).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          figmaNode: `${path.join(testPath, 'Test.test')}`,
          template:
            '{"config":{"parser":"custom","parserCommand":"node parser/custom_parser.js","include":["*.test"],"exclude":["Excluded.test"]},"mode":"PARSE"}',
          label: 'Test',
          source: expect.stringMatching(
            /https:\/\/github\.com\/figma\/[a-z-/]+\/cli\/src\/connect\/__test__\/e2e\/e2e_parse_command\/\w+\/Test\.test/,
          ),
        }),
        expect.objectContaining({
          figmaNode: `${path.join(testPath, 'OtherFile.test')}`,
          template:
            '{"config":{"parser":"custom","parserCommand":"node parser/custom_parser.js","include":["*.test"],"exclude":["Excluded.test"]},"mode":"PARSE"}',
          label: 'Test',
          source: expect.stringMatching(
            /https:\/\/github\.com\/figma\/[a-z-/]+\/cli\/src\/connect\/__test__\/e2e\/e2e_parse_command\/\w+\/OtherFile\.test/,
          ),
        }),
      ]),
    )
  }

  it('successfully calls a custom parser executable', async () => {
    const result = await promisify(exec)(
      `npx tsx ../../../cli connect parse --skip-update-check --dir ./e2e_parse_command/custom_parser --verbose`,
      {
        cwd: __dirname,
      },
    )

    expect(tidyStdOutput(result.stderr)).toBe(
      `Config file found, parsing ./e2e_parse_command/custom_parser using specified include globs
Using custom parser command: node parser/custom_parser.js
Running parser: node parser/custom_parser.js
Debug message from parser!
Success from parser!`,
    )

    expectSuccess('custom_parser', result)
  })

  it('does not fail with an error if a parser executable returns a warning', async () => {
    const result = await promisify(exec)(
      `npx tsx ../../../cli connect parse --skip-update-check --dir ./e2e_parse_command/custom_parser_warning`,
      {
        cwd: __dirname,
      },
    )

    expect(tidyStdOutput(result.stderr)).toBe(
      `Config file found, parsing ./e2e_parse_command/custom_parser_warning using specified include globs
Using custom parser command: node parser/custom_parser.js
Warning from parser!`,
    )

    expectSuccess('custom_parser_warning', result)
  })

  it('fails with an error if a parser executable returns an error', async () => {
    try {
      await promisify(exec)(
        `npx tsx ../../../cli connect parse --skip-update-check --dir ./e2e_parse_command/custom_parser_error`,
        {
          cwd: __dirname,
        },
      )
    } catch (e: any) {
      expect(e.code).toBe(1)
      expect(tidyStdOutput(e.stderr)).toBe(
        `Config file found, parsing ./e2e_parse_command/custom_parser_error using specified include globs
Using custom parser command: node parser/custom_parser.js
Error from parser!
Errors encountered calling parser, exiting`,
      )
    }
  })

  it('returns an error if the first party parser does not return a valid response', async () => {
    try {
      await promisify(exec)(
        `npx tsx ../../../cli connect parse --skip-update-check --dir ./e2e_parse_command/custom_parser_invalid_response`,
        {
          cwd: __dirname,
        },
      )
    } catch (e: any) {
      expect(e.code).toBe(1)
      expect(tidyStdOutput(e.stderr)).toBe(
        `Config file found, parsing ./e2e_parse_command/custom_parser_invalid_response using specified include globs
Using custom parser command: node parser/custom_parser.js
Error returned from parser: Validation error: Required at "docs[0].figmaNode"; Required at "docs[0].template"; Required at "docs[0].templateData"; Required at "docs[0].language"; Required at "docs[0].label". Try re-running the command with --verbose for more information.`,
      )
    }
  })

  it('fails with an error if no include provided in the config', async () => {
    try {
      await promisify(exec)(
        `npx tsx ../../../cli connect parse --skip-update-check --dir ./e2e_parse_command/custom_parser_error_no_include`,
        {
          cwd: __dirname,
        },
      )
    } catch (e: any) {
      expect(e.code).toBe(1)
      expect(tidyStdOutput(e.stderr)).toBe(
        `Config file found, but no include globs specified. Parsing ./e2e_parse_command/custom_parser_error_no_include
Include globs must specified in config file for custom parsers`,
      )
    }
  })

  it('fails with an error if empty include provided in the config', async () => {
    try {
      await promisify(exec)(
        `npx tsx ../../../cli connect parse --skip-update-check --dir ./e2e_parse_command/custom_parser_error_empty_include`,
        {
          cwd: __dirname,
        },
      )
    } catch (e: any) {
      expect(e.code).toBe(1)
      expect(tidyStdOutput(e.stderr)).toBe(
        `Config file found, parsing ./e2e_parse_command/custom_parser_error_empty_include using specified include globs
Include globs must specified in config file for custom parsers`,
      )
    }
  })

  it('fails with an error if no parserCommand is provided in the config', async () => {
    try {
      await promisify(exec)(
        `npx tsx ../../../cli connect parse --skip-update-check --dir ./e2e_parse_command/custom_parser_error_no_parsercommand`,
        {
          cwd: __dirname,
        },
      )
    } catch (e: any) {
      expect(e.code).toBe(1)
      expect(tidyStdOutput(e.stderr)).toBe(
        `Config file found, parsing ./e2e_parse_command/custom_parser_error_no_parsercommand using specified include globs
No \`parserCommand\` specified in config. A command is required when using the \`custom\` parser.`,
      )
    }
  })
})
