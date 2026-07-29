import { promisify } from 'util'
import { exec } from 'child_process'
import path from 'path'

const DEPRECATION_NOTICE_FRAGMENT = "We've detected framework-specific Code Connect in your project"

function runParse(fixture: string) {
  return promisify(exec)(
    `npx tsx ../../../cli connect parse --dir ${path.join(__dirname, 'e2e_parse_command', fixture)}`,
    { cwd: __dirname },
  )
}

describe('e2e test for parser deprecation warning', () => {
  it('shows deprecation notice when the native parser produces Code Connect', async () => {
    const result = await runParse('react_storybook')

    expect(result.stderr).toContain(DEPRECATION_NOTICE_FRAGMENT)
  })

  it('skips deprecation notice when project only contains parserless template files', async () => {
    const result = await runParse('raw')

    expect(result.stderr).not.toContain(DEPRECATION_NOTICE_FRAGMENT)
  })

  // A migrated project keeps its `parser` config and ordinary source files, so
  // the include globs still match non-template files. Those are not Code
  // Connect, so they must not trigger the notice.
  it('skips deprecation notice for a migrated project whose globs match ordinary source files', async () => {
    const result = await runParse('migrated_html')

    expect(result.stderr).not.toContain(DEPRECATION_NOTICE_FRAGMENT)
  })

  it('shows deprecation notice for a partially migrated project', async () => {
    const result = await runParse('partially_migrated_html')

    expect(result.stderr).toContain(DEPRECATION_NOTICE_FRAGMENT)
  })
})
