import { promisify } from 'util'
import { exec } from 'child_process'
import path from 'path'

const PARSER_REMOVAL_NOTICE_FRAGMENT =
  'Framework-specific parsers are no longer supported in Code Connect CLI v2'

function runParse(fixture: string) {
  return promisify(exec)(
    `npx cross-env CODE_CONNECT_TEST_ALLOW_PARSERS=0 npx tsx ../../../cli connect parse --skip-update-check --dir ${path.join(
      __dirname,
      'e2e_parse_command',
      fixture,
    )}`,
    { cwd: __dirname },
  )
}

function runUnpublish(fixture: string) {
  return promisify(exec)(
    `npx cross-env CODE_CONNECT_TEST_ALLOW_PARSERS=0 npx tsx ../../../cli connect unpublish --dry-run --skip-update-check --dir ${path.join(
      __dirname,
      'e2e_parse_command',
      fixture,
    )}`,
    { cwd: __dirname },
  )
}

describe('e2e test for parser removal', () => {
  it('rejects parser-based Code Connect before parsing', async () => {
    await expect(runParse('react_storybook')).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringMatching(
        /Framework-specific parsers are no longer supported[\s\S]*npm install --save-dev @figma\/code-connect@1/,
      ),
    })
  })

  it('allows projects containing only parserless template files', async () => {
    const result = await runParse('raw')

    expect(result.stderr).not.toContain(PARSER_REMOVAL_NOTICE_FRAGMENT)
  })

  it('rejects migrated projects whose parser configuration still matches source files', async () => {
    const error = await runParse('migrated_html').catch((error) => error)

    expect(error.code).toBe(1)
    expect(error.stderr).toContain('These matched files were not recognized as template files:')
    expect(error.stderr).toContain(`  - ${path.join('src', 'button.component.ts')}`)
    expect(error.stderr).toContain(`  - ${path.join('src', 'utils.ts')}`)
    expect(error.stderr).not.toContain('button.figma.template.ts')
  })

  it('reports empty matches without claiming that parser-based files were found', async () => {
    const error = await runParse('empty_include').catch((error) => error)

    expect(error).toMatchObject({
      code: 1,
      stderr: expect.stringContaining('No files matched your include/exclude patterns.'),
    })
    expect(error.stderr).not.toContain(PARSER_REMOVAL_NOTICE_FRAGMENT)
  })

  it('rejects partially migrated projects', async () => {
    await expect(runParse('partially_migrated_html')).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining(PARSER_REMOVAL_NOTICE_FRAGMENT),
    })
  })

  it('allows parser-based Code Connect to be unpublished', async () => {
    const result = await runUnpublish('react_storybook')

    expect(result.stderr).not.toContain(PARSER_REMOVAL_NOTICE_FRAGMENT)
  })
})
