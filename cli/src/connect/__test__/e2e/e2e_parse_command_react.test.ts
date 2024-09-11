import { promisify } from 'util'
import { exec } from 'child_process'
import { tidyStdOutput } from '../../../__test__/utils'
import path from 'path'

describe('e2e test for `parse` command (React)', () => {
  const cliVersion = require('../../../../package.json').version

  it('successfully parses both React and Storybook files', async () => {
    const testPath = path.join(__dirname, 'e2e_parse_command/react_storybook')

    const result = await promisify(exec)(
      `npx tsx ../../../cli connect parse --skip-update-check --dir ${testPath}`,
      {
        cwd: __dirname,
      },
    )

    expect(tidyStdOutput(result.stderr)).toBe(
      `No config file found in ${testPath}, proceeding with default options
Using "react" parser as package.json containing a "react" dependency was found in ${testPath}. If this is incorrect, please check you are running Code Connect from your project root, or add a \`parser\` key to your config file. See https://github.com/figma/code-connect for more information.
${path.join(testPath, 'ReactApiComponent.figmadoc.tsx')}`,
    )
    const json = JSON.parse(result.stdout)

    expect(json).toMatchObject([
      {
        figmaNode: 'ui/button',
        label: 'React',
        language: 'typescript',
        component: 'ReactApiComponent',
        source:
          'https://github.com/figma/code-connect/blob/main/cli/src/connect/__test__/e2e/e2e_parse_command/react_storybook/ReactApiComponent.tsx',
        sourceLocation: { line: 13 },
        template: `const figma = require(\"figma\")

export default figma.tsx\`<ReactApiComponent />\``,
        templateData: {
          imports: ["import { ReactApiComponent } from './ReactApiComponent'"],
        },
        metadata: {
          cliVersion,
        },
      },
      {
        figmaNode: 'https://figma.com/test',
        source:
          'https://github.com/figma/code-connect/blob/main/cli/src/connect/__test__/e2e/e2e_parse_command/react_storybook/StorybookComponent.tsx',
        sourceLocation: { line: 8 },
        templateData: { imports: [] },
        component: 'StorybookComponent',
        label: 'Storybook',
        language: 'typescript',
        metadata: {
          cliVersion,
        },
      },
    ])

    expect(json[1].template.startsWith('function _fcc_renderReactProp')).toBe(true)
    // We don't care about checking the contents of the function as this can change
    expect(
      json[1].template.endsWith(
        "const figma = require('figma')\n\nexport default figma.tsx`<StorybookComponent disabled={false}>Hello</StorybookComponent>`\n",
      ),
    ).toBe(true)
  })
})

// TODO E2E test for publish?
