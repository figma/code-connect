// This is broken out into its own file as it can be slow to run and won't run
// on non-Mac systems, so the file can be ignored by Jest if needed

import { promisify } from 'util'
import { exec, execSync } from 'child_process'
import { tidyStdOutput } from '../../../__test__/utils'
import path from 'path'
import { stdout } from 'process'

describe('e2e test for `parse` command (Swift Package.swift project)', () => {
  const cliVersion = require('../../../../package.json').version
  it(
    'successfully parses Swift files',
    async () => {
      const testPath = path.join(__dirname, 'e2e_parse_command/swift_package')

      // First, we need to ensure the Swift project has been built as we are
      // using a local version. We don't need to build the actual project itself
      // for this to work.
      stdout.write('Building Swift project, this may take a while the first time...\n')
      execSync('swift build -c release', {
        cwd: path.join(__dirname, '..', '..', '..'),
      })

      const result = await promisify(exec)(
        `npx tsx ../../../cli connect parse --skip-update-check --dir ${testPath}`,
        {
          cwd: __dirname,
        },
      )

      const tidiedStdErr = tidyStdOutput(result.stderr)

      expect(
        tidiedStdErr.startsWith(`No config file found in ${testPath}, proceeding with default options
Using "swift" parser as a file matching *.xcodeproj or Package.swift was found in ${testPath}. If this is incorrect, please check you are running Code Connect from your project root, or add a \`parser\` key to your config file. See https://github.com/figma/code-connect for more information.`),
      ).toBe(true)

      // xcodebuild sometimes outputs some messages to stderr here, I couldn't
      // find how to suppress these but still output actual errors, so ignore this
      // part of the output

      expect(
        tidiedStdErr.endsWith(
          `Found Code Connect Swift package at ${path.join(__dirname, '..', '..', '..')}, building parser binary. This may take a few minutes if this is the first time you've run Code Connect`,
        ),
      )

      const json = JSON.parse(result.stdout)
      expect(json).toMatchObject([
        {
          figmaNode: 'https://www.figma.com/file/test/test?node-id=12-345',
          component: 'Toggle<AnyView>',
          variant: {},
          source: '',
          sourceLocation: {
            line: 0,
          },
          templateData: {
            props: {},
            imports: [],
          },
          language: 'swift',
          label: 'SwiftUI',
          metadata: {
            cliVersion,
          },
        },
      ])

      expect(
        json[0].template.startsWith(
          "const figma = require('figma')\n\nfunction __fcc_renderSwiftChildren(children, prefix) {",
        ),
      ).toBeTruthy()

      // We don't test the contents of the function as it's a bit brittle

      expect(
        json[0].template.endsWith(
          'export default figma.swift`Toggle(isOn: $isOn) {\n' + '    // Add a label here\n' + '}`',
        ),
      ).toBeTruthy()
    },
    // On first run, building the Swift package can take a while, so add a
    // generous timeout. Usually the test only takes a few seconds to run
    10 * 60 * 1000,
  )
})
