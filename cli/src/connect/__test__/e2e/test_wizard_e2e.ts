import { promisify } from 'util'
import { exec, execSync } from 'child_process'
import { tidyStdOutput } from '../../../__test__/utils'
import fs from 'fs'
import path from 'path'
import { stdout } from 'process'

export function testWizardE2e(testCase: {
  name: string
  dirPath: string
  componentsPath: string
  expectedCreatedComponentPath: string
  expectedIncludeGlobs: string[]
}) {
  describe(`e2e test for the wizard - ${testCase.name}`, () => {
    let result: {
      stdout: string
      stderr: string
    }

    const testPath = path.join(__dirname, testCase.dirPath)

    beforeAll(
      async () => {
        const mockDocPath = path.join(
          __dirname,
          'e2e_parse_command/dummy_api_response_for_wizard.json',
        )

        if (testCase.name === 'swift') {
          // First, we need to ensure the Swift project has been built as we are
          // using a local version. We don't need to build the actual project itself
          // for this to work.
          stdout.write('Building Swift project, this may take a while the first time...\n')
          execSync('swift build -c release', {
            cwd: path.join(__dirname, '..', '..', '..', '..'),
          })
        }

        const wizardAnswers = [
          'figd_123', // Access token
          testCase.componentsPath, // Top-level components directory
          'https://www.figma.com/design/abc123/my-design-system', // Design system URL
          'yes', // Confirm create a new config file
          '', // Don't select any links to edit
          '', // co-locate CC files
        ]

        const escapedStringifiedJson = JSON.stringify(wizardAnswers).replace(/"/g, '\\"')

        result = await promisify(exec)(
          `npx cross-env CODE_CONNECT_MOCK_DOC_RESPONSE=${mockDocPath} WIZARD_ANSWERS_TO_PREFILL="${escapedStringifiedJson}" npx tsx ../../../cli connect --skip-update-check --dir ${testPath}`,
          {
            cwd: __dirname,
          },
        )
      },
      // On first run, building the Swift package can take a while, so add a
      // generous timeout. Usually the test only takes a few seconds to run
      10 * 60 * 1000,
    )

    afterAll(() => {
      fs.rmSync(path.join(testPath, 'figma.config.json'), { force: true })
      fs.rmSync(path.join(testPath, testCase.expectedCreatedComponentPath), { force: true })
    })

    it('starts the wizard', () => {
      expect(tidyStdOutput(result.stderr)).toContain('Welcome to Code Connect')
    })

    it('creates config file from given answers', () => {
      const configPath = path.join(testPath, 'figma.config.json')
      expect(fs.readFileSync(configPath, 'utf8')).toBe(`\
{
  "codeConnect": {
    "include": ${JSON.stringify(testCase.expectedIncludeGlobs)}
  }
}
`)
    })

    it('reaches linking step', () => {
      expect(tidyStdOutput(result.stderr)).toContain('Connecting your components')
    })

    it('creates Code Connect file at correct location', () => {
      const codeConnectPath = path.join(testPath, testCase.expectedCreatedComponentPath)
      expect(tidyStdOutput(result.stderr)).toContain(`Created ${codeConnectPath}`)
      const exists = fs.existsSync(codeConnectPath)
      expect(exists).toBe(true)
    })
  })
}
