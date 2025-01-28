import { promisify } from 'util'
import { exec } from 'child_process'
import { tidyStdOutput } from '../../../__test__/utils'
import path from 'path'

describe('e2e test for `parse` command (React)', () => {
  const cliVersion = require('../../../../package.json').version

  /**
   * @description Test that the parse command successfully parses a React file using
   * both a JSX and TSX Figmadoc file, and Storybook file.
   */
  it('successfully parses both React and Storybook files', async () => {
    const testPath = path.join(__dirname, 'e2e_parse_command/react_storybook')

    const result = await promisify(exec)(
      `npx tsx ../../../cli connect parse --skip-update-check --dir ${testPath}`,
      {
        cwd: __dirname,
      },
    )

    // Check that both JSX and TSX Figmadoc files are parsed
    const components = ['ReactLabelComponent.figmadoc.jsx', 'ReactButtonComponent.figmadoc.tsx']
    const componentPaths = components.map((c) => path.join(testPath, c)).join('\n')

    expect(tidyStdOutput(result.stderr)).toBe(
      `No config file found in ${testPath}, proceeding with default options
Using "react" parser as package.json containing a "react" dependency was found in ${testPath}. If this is incorrect, please check you are running Code Connect from your project root, or add a \`parser\` key to your config file. See https://github.com/figma/code-connect for more information.
${componentPaths}`,
    )
    const json = JSON.parse(result.stdout)

    expect(json).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          figmaNode: 'ui/label',
          label: 'React',
          language: 'typescript',
          component: 'ReactLabelComponent',
          source: expect.stringMatching(
            /https:\/\/github\.com\/figma\/[a-z-/]+\/cli\/src\/connect\/__test__\/e2e\/e2e_parse_command\/react_storybook\/ReactLabelComponent\.tsx/,
          ),
          sourceLocation: { line: 13 },
          template: `const figma = require(\"figma\")

export default figma.tsx\`<ReactLabelComponent />\``,
          templateData: {
            imports: ["import { ReactLabelComponent } from './ReactLabelComponent'"],
            nestable: true,
          },
          metadata: {
            cliVersion,
          },
        }),
        expect.objectContaining({
          figmaNode: 'ui/button',
          label: 'React',
          language: 'typescript',
          component: 'ReactButtonComponent',
          source: expect.stringMatching(
            /https:\/\/github\.com\/figma\/[a-z-/]+\/cli\/src\/connect\/__test__\/e2e\/e2e_parse_command\/react_storybook\/ReactButtonComponent\.tsx/,
          ),
          sourceLocation: { line: 13 },
          template: `const figma = require(\"figma\")

export default figma.tsx\`<ReactButtonComponent />\``,
          templateData: {
            imports: ["import { ReactButtonComponent } from './ReactButtonComponent'"],
            nestable: true,
          },
          metadata: {
            cliVersion,
          },
        }),
        expect.objectContaining({
          figmaNode: 'https://figma.com/test',
          source: expect.stringMatching(
            /https:\/\/github.com\/figma\/[a-z-/]+\/cli\/src\/connect\/__test__\/e2e\/e2e_parse_command\/react_storybook\/StorybookComponent.tsx/,
          ),
          sourceLocation: { line: 8 },
          templateData: { imports: [] },
          component: 'StorybookComponent',
          label: 'Storybook',
          language: 'typescript',
        }),
      ]),
    )

    expect(json[2].template.startsWith('function _fcc_renderReactProp')).toBe(true)
    // We don't care about checking the contents of the function as this can change
    expect(
      json[2].template.endsWith(
        "const figma = require('figma')\n\nexport default figma.tsx`<StorybookComponent disabled={false}>Hello</StorybookComponent>`\n",
      ),
    ).toBe(true)
  })
})

// TODO E2E test for publish?
