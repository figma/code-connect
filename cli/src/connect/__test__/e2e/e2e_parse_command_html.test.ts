import { promisify } from 'util'
import { exec } from 'child_process'
import { tidyStdOutput } from '../../../__test__/utils'
import path from 'path'

describe('e2e test for `parse` command (HTML)', () => {
  const cliVersion = require('../../../../package.json').version

  function expectSuccess(
    label: string,
    dependency: string | undefined,
    expectUsingLabel: boolean,
    testPath: string,
    result: { stdout: string; stderr: string },
  ) {
    const maybeLabelExplanation = dependency
      ? `\nUsing "${label}" label as package.json containing a "${dependency}" dependency was found in ${testPath}. If this is incorrect, please check you are running Code Connect from your project root, or add a \`parser\` key to your config file. See https://github.com/figma/code-connect for more information.`
      : ''

    const maybeLabelMessage = expectUsingLabel ? `\nUsing label "${label}"` : ''

    expect(tidyStdOutput(result.stderr)).toBe(
      `No config file found in ${testPath}, proceeding with default options
Using "html" parser as package.json containing no other supported web frameworks was found in ${testPath}. If this is incorrect, please check you are running Code Connect from your project root, or add a \`parser\` key to your config file. See https://github.com/figma/code-connect for more information.${maybeLabelExplanation}
${path.join(testPath, 'test-component.figma.ts')}${maybeLabelMessage}`,
    )
    const json = JSON.parse(result.stdout)

    expect(json).toMatchObject([
      {
        figmaNode: 'test',
        label,
        language: 'html',
        templateData: {
          nestable: true,
        },
        metadata: {
          cliVersion,
        },
      },
    ])

    expect(json[0].template.startsWith('function _fcc_templateString')).toBe(true)
    // We don't care about checking the contents of the function as this can change
    expect(
      json[0].template.endsWith('export default figma.html`<my-component></my-component>`\n'),
    ).toBe(true)
  }

  it('successfully parses a HTML Code Connect file', async () => {
    const testPath = path.join(__dirname, 'e2e_parse_command/html')

    const result = await promisify(exec)(
      `npx tsx ../../../cli connect parse --skip-update-check --dir ${testPath}`,
      {
        cwd: __dirname,
      },
    )

    expectSuccess('Web Components', undefined, false, testPath, result)
  })

  it('successfully parses a HTML Code Connect file with overriden label using a CLI arg', async () => {
    const testPath = path.join(__dirname, 'e2e_parse_command/html')

    const result = await promisify(exec)(
      `npx tsx ../../../cli connect parse --skip-update-check --dir ${testPath} --label Test`,
      {
        cwd: __dirname,
      },
    )

    expectSuccess('Test', undefined, true, testPath, result)
  })

  it('successfully parses a HTML Code Connect file which uses Angular', async () => {
    const testPath = path.join(__dirname, 'e2e_parse_command/html_angular')

    const result = await promisify(exec)(
      `npx tsx ../../../cli connect parse --skip-update-check --dir ${testPath}`,
      {
        cwd: __dirname,
      },
    )

    expectSuccess('Angular', 'angular', true, testPath, result)
  })

  it('successfully parses a HTML Code Connect file which uses Vue', async () => {
    const testPath = path.join(__dirname, 'e2e_parse_command/html_vue')

    const result = await promisify(exec)(
      `npx tsx ../../../cli connect parse --skip-update-check --dir ${testPath}`,
      {
        cwd: __dirname,
      },
    )

    expectSuccess('Vue', 'vue', true, testPath, result)
  })
})
