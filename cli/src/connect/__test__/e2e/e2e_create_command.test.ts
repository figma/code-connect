import { exec } from 'child_process'
import { existsSync, readFileSync, rmSync } from 'fs'
import path from 'path'
import { promisify } from 'util'
import { tidyStdOutput } from '../../../__test__/utils'

describe('e2e test for `create` command', () => {
  const testParentPath = path.join(__dirname, 'e2e_create_command')
  function getTestPath(testName: string) {
    return path.join(testParentPath, testName)
  }

  async function runCreate(cwd: string, options = '') {
    return await promisify(exec)(
      `npx cross-env FIGMA_ACCESS_TOKEN=test CODE_CONNECT_MOCK_CREATE_API_RESPONSE=${testParentPath}/dummy_api_response.json npx tsx ../../../../../cli connect create --skip-update-check ${options} https://www.figma.com/file/1234abcd/Test-File?node-id=1-39`,
      {
        cwd,
      },
    )
  }

  async function runCreateTemplate(cwd: string) {
    return await promisify(exec)(
      `npx cross-env FIGMA_ACCESS_TOKEN=test CODE_CONNECT_MOCK_CREATE_API_RESPONSE=${testParentPath}/dummy_api_response.json npx tsx ${testParentPath}/cli_template connect create https://www.figma.com/file/1234abcd/Test-File?node-id=1-39`,
      {
        cwd,
      },
    )
  }

  it.each(['ts', 'js', 'template.ts', 'template.js'])(
    'accepts --outFile Button.figma.%s',
    async (extension) => {
      const testPath = getTestPath('react')
      const filename = `Button.figma.${extension}`
      const filePath = path.join(testPath, filename)
      try {
        await runCreate(testPath, `--outFile ${filename}`)
        expect(readFileSync(filePath, 'utf-8')).toEqual(
          readFileSync(path.join(testParentPath, 'template/expected_component'), 'utf-8'),
        )
      } finally {
        rmSync(filePath, { force: true })
      }
    },
  )

  it('rejects a legacy .figma.tsx output filename without creating a file', async () => {
    const testPath = getTestPath('react')
    const filename = 'Button.figma.tsx'
    try {
      await expect(runCreate(testPath, `--outFile ${filename}`)).rejects.toMatchObject({
        code: 1,
        stderr: expect.stringContaining(
          `Invalid template filename: ${filename}. Use .figma.ts or .figma.js`,
        ),
      })
      expect(existsSync(path.join(testPath, filename))).toBe(false)
    } finally {
      rmSync(path.join(testPath, filename), { force: true })
    }
  })

  it('successfully creates a template file when no parser is configured', async () => {
    const testPath = getTestPath('template')

    try {
      const result = await runCreateTemplate(testPath)

      expect(readFileSync(path.join(testPath, 'TestInstanceComponent.figma.ts'), 'utf-8')).toEqual(
        readFileSync(path.join(testPath, 'expected_component'), 'utf-8'),
      )

      expect(tidyStdOutput(result.stderr)).toBe(
        `Config file found, parsing ${testPath} using specified include globs
Fetching component information from Figma...
Parsing response
Generating Code Connect files...
Code Connect file generated successfully:
${path.join(testPath, 'TestInstanceComponent.figma.ts')}`,
      )
    } finally {
      rmSync(path.join(testPath, 'TestInstanceComponent.figma.ts'), { force: true })
    }
  })

  it('creates a template file when a parser is detected', async () => {
    const testPath = getTestPath('react')

    try {
      const result = await runCreate(testPath)

      expect(readFileSync(path.join(testPath, 'TestInstanceComponent.figma.ts'), 'utf-8')).toEqual(
        readFileSync(path.join(testParentPath, 'template/expected_component'), 'utf-8'),
      )

      expect(tidyStdOutput(result.stderr)).toBe(
        `No config file found in ${testPath}, proceeding with default options
Using "react" parser as package.json containing a "react" dependency was found in ${testPath}. If this is incorrect, please check you are running Code Connect from your project root, or add a \`parser\` key to your config file. See https://github.com/figma/code-connect for more information.
Fetching component information from Figma...
Parsing response
Generating Code Connect files...
Code Connect file generated successfully:
${path.join(testPath, 'TestInstanceComponent.figma.ts')}`,
      )
    } finally {
      rmSync(path.join(testPath, 'TestInstanceComponent.figma.ts'), { force: true })
    }
  })
})
