import { promisify } from 'util'
import { exec } from 'child_process'
import { LONG_TEST_TIMEOUT_MS, tidyStdOutput } from './utils'
import fs from 'fs'
import path from 'path'

describe('e2e test for the wizard', () => {
  let result: {
    stdout: string
    stderr: string
  }

  const testPath = path.join(__dirname, 'e2e_connect_command/react_wizard')

  beforeAll(async () => {
    const mockDocPath = path.join(
      __dirname,
      'e2e_connect_command/dummy_api_response_for_wizard.json',
    )

    const wizardAnswers = [
      'figd_123', // Access token
      './e2e_connect_command/react_wizard/components', // Top-level components directory
      'https://www.figma.com/design/abc123/my-design-system', // Design system URL
      'yes', // Confirm create a new config file
      '', // Don't select any links to edit
      '', // co-locate CC files
    ]

    const escapedStringifiedJson = JSON.stringify(wizardAnswers).replace(/"/g, '\\"')

    result = await promisify(exec)(
      `npx cross-env CODE_CONNECT_MOCK_DOC_RESPONSE=${mockDocPath} WIZARD_ANSWERS_TO_PREFILL="${escapedStringifiedJson}" npx tsx ../cli connect --dir ${testPath}`,
      {
        cwd: __dirname,
      },
    )
  }, LONG_TEST_TIMEOUT_MS)

  afterAll(() => {
    fs.rmSync(path.join(testPath, 'figma.config.json'), { force: true })
    fs.rmSync(path.join(testPath, 'components/PrimaryButton.figma.tsx'), { force: true })
  })

  it('starts the wizard', () => {
    expect(tidyStdOutput(result.stderr)).toContain('Welcome to Code Connect')
  })

  it('creates config file from given answers', () => {
    const configPath = path.join(testPath, 'figma.config.json')
    expect(fs.readFileSync(configPath, 'utf8')).toBe(`\
{
  "codeConnect": {
    "include": ["components/**/*.{tsx,jsx}"]
  }
}
`)
  })

  it('reaches linking step', () => {
    expect(tidyStdOutput(result.stderr)).toContain('Connecting your components')
  })

  it('creates Code Connect file at correct location', () => {
    const codeConnectPath = path.join(testPath, 'components/PrimaryButton.figma.tsx')
    expect(tidyStdOutput(result.stderr)).toContain(`Created ${codeConnectPath}`)
    const exists = fs.existsSync(codeConnectPath)
    expect(exists).toBe(true)
  })
})
