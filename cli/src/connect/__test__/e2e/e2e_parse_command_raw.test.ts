import { promisify } from 'util'
import { exec } from 'child_process'
import { tidyStdOutput } from '../../../__test__/utils'
import path from 'path'

describe('e2e test for `parse` command (raw)', () => {
  const cliVersion = require('../../../../package.json').version

  it('successfully parses raw template file', async () => {
    const testPath = path.join(__dirname, 'e2e_parse_command/raw')

    const result = await promisify(exec)(
      `npx tsx ../../../cli connect parse --skip-update-check --dir ${testPath} --include-template-files`,
      {
        cwd: __dirname,
      },
    )

    expect(tidyStdOutput(result.stderr)).toBe(
      `Config file found, parsing ${testPath} using specified include globs`,
    )

    const json = JSON.parse(result.stdout)

    expect(json).toMatchObject([
      {
        figmaNode: 'https://figma.com/design/abc?node=1:1',
        label: 'Code',
        language: 'raw',
        source: '',
        sourceLocation: { line: -1 },
        template: `const figma = require('figma')
const text = figma.currentLayer.__properties__.string('Text')

export default figma.code\`def python_code():
  return \${text}\`
`,
        templateData: {},
        metadata: {
          cliVersion,
        },
      },
    ])
  })
})
