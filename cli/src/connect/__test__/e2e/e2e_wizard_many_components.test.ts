import { promisify } from 'util'
import { exec } from 'child_process'
import { tidyStdOutput } from '../../../__test__/utils'
import path from 'path'
import fs from 'fs'

const TEST_PATH = path.join(__dirname, 'e2e_parse_command/react_wizard')

const OUTPUT_FOLDER = `e2e-wizard-many-components-folder`
const OUTPUT_PATH = path.join(__dirname, OUTPUT_FOLDER)

describe('e2e wizard with many components', () => {
  beforeEach(() => {
    fs.rmSync(OUTPUT_PATH, { recursive: true, force: true })
  })
  afterEach(() => {
    fs.rmSync(OUTPUT_PATH, { recursive: true, force: true })
  })
  it(
    'it reaches the point of asking to select pages',
    async () => {
      const mockDocPath = path.join(
        path.join(TEST_PATH, '..'),
        'dummy_api_response_for_wizard_many_components.json',
      )

      const wizardAnswers = JSON.stringify([
        'figd_123', // Access token,
        'no', // don't create an .env file to store the access token
        `${TEST_PATH}/components`, // Top-level components directory
        'https://www.figma.com/design/abc123/my-design-system', // Design system URL
        'no', // don't create a config file
        'no', // don't use ai
        ['0:1'], // select the first page
        '', // Don't select any links to edit
        OUTPUT_FOLDER, // output in the folder
      ]).replace(/"/g, '\\"')

      const result = await promisify(exec)(
        `npx cross-env CODE_CONNECT_MOCK_DOC_RESPONSE=${mockDocPath} WIZARD_ANSWERS_TO_PREFILL="${wizardAnswers}" npx tsx ../../../cli connect --skip-update-check --dir ${TEST_PATH}`,
        {
          cwd: __dirname,
        },
      )

      expect(tidyStdOutput(result.stderr)).toContain(
        '98 Figma components found in the Figma file across 2 pages',
      )
    },
    5 * 60 * 1000,
  )
})
