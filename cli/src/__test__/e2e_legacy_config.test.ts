import { promisify } from 'util'
import { exec } from 'child_process'
import { spawn } from 'cross-spawn'
import { copyFileSync, readFileSync, rmSync } from 'fs'
import path from 'path'
import { LONG_TEST_TIMEOUT_MS, tidyStdOutput } from './utils'

describe('e2e test for legacy config handling', () => {
  async function runCommandInteractively(testCase: string, answer: string) {
    const command = 'npx'
    const args = ['tsx', '../cli', 'connect', 'parse', '--dir', `./e2e_connect_command/${testCase}`]
    const child = spawn(command, args, {
      cwd: __dirname,
      stdio: 'pipe',
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (data) => {
      stdout += data
    })

    child.stderr.on('data', (data) => {
      stderr += data
    })

    // Answer the prompt
    child.stdin!.write(`${answer}\n`)
    child.stdin!.end()

    return new Promise<{
      code: number | null
      stdout: string
      stderr: string
    }>((resolve) => {
      child.on('exit', (code) => {
        resolve({
          code,
          stdout,
          stderr,
        })
      })
    })
  }

  describe('legacy react config', () => {
    const expectedOutput = `⚠️  Your Code Connect configuration needs to be updated

Code Connect is migrating from a single configuration file for all supported languages, to individual configuration files for each language.

As part of this change, your Code Connect configuration file needs to be updated to remove the react key and add { parser: "react" }:

{
  "codeConnect": {
    "parser": "react",
    "include": [
      "src/components/**/*.tsx"
    ]
  }
}

Code Connect can make this change for you automatically, or you can do it manually.

Please also ensure your configuration file is located in your React project root. If you move the configuration file, you will need to check any include/exclude paths are correct relative to the new location.

Please raise an issue at https://github.com/figma/code-connect/issues if you have any problems.

---

Would you like Code Connect to update your configuration file for you? (y/n)`

    const expectedSuccessOutput =
      expectedOutput +
      `\nConfiguration file updated
Config file found, parsing ./e2e_connect_command/legacy_react_config using specified include globs`

    const expectedErrorOutput = expectedOutput + `\nPlease update your configuration file manually`

    it(
      'displays a message and exits if a "react" config is defined and the user does not answer "y"',
      async () => {
        await runCommandInteractively('legacy_react_config', 'n').then(
          ({ code, stdout, stderr }) => {
            expect(code).toBe(1)
            expect(tidyStdOutput(stdout)).toBe('')
            expect(tidyStdOutput(stderr)).toBe(expectedErrorOutput)
          },
        )
      },
      LONG_TEST_TIMEOUT_MS,
    )

    // We make a backup copy of the original config before running these tests,
    // as the config will be modified by Code Connect, and then restore the
    // backup afterwards. We use a dummy describe block here so beforeEach and
    // afterEach work – try/finally is not reliable with child processes.
    describe('', () => {
      const testPath = path.join(__dirname, 'e2e_connect_command', 'legacy_react_config')

      const configPath = path.join(testPath, 'figma.config.json')
      const configBackupPath = path.join(testPath, 'figma.config.json.backup')

      beforeEach(() => {
        copyFileSync(configPath, configBackupPath)
      })

      afterEach(() => {
        copyFileSync(configBackupPath, configPath)
        rmSync(configBackupPath)
      })

      it(
        'displays a message and updates the config and proceeds if a "react" config is defined and the user answers "y"',
        async () => {
          const testPath = path.join(__dirname, 'e2e_connect_command', 'legacy_react_config')

          await runCommandInteractively('legacy_react_config', 'y').then(
            ({ code, stdout, stderr }) => {
              expect(code).toBe(0)
              expect(tidyStdOutput(stdout)).toBe('[]')
              expect(tidyStdOutput(stderr)).toBe(expectedSuccessOutput)
              expect(readFileSync(configPath, 'utf8')).toBe(`{
  "codeConnect": {
    "parser": "react",
    "include": [
      "src/components/**/*.tsx"
    ]
  }
}`)
            },
          )
        },
        LONG_TEST_TIMEOUT_MS,
      )
    })
  })

  describe('legacy swift config', () => {
    const expectedOutput = `⚠️  Your Code Connect configuration needs to be updated

Code Connect is migrating from a single configuration file for all supported languages, to individual configuration files for each language.

As part of this change, your Code Connect configuration file needs to be updated to remove the swift key and add { parser: "swift" }:

{
  "codeConnect": {
    "parser": "swift",
    "include": [
      "src/components/**/*.swift"
    ]
  }
}

Code Connect can make this change for you automatically, or you can do it manually.

Please also ensure your configuration file is located in your Swift project root. If you move the configuration file, you will need to check any include/exclude paths are correct relative to the new location.

Please raise an issue at https://github.com/figma/code-connect/issues if you have any problems.

---

Would you like Code Connect to update your configuration file for you? (y/n)`

    const expectedSuccessOutput =
      expectedOutput +
      `\nConfiguration file updated
Config file found, parsing ./e2e_connect_command/legacy_swift_config using specified include globs`

    const expectedErrorOutput = expectedOutput + `\nPlease update your configuration file manually`

    it(
      'displays a message and exits if a "swift" config is defined and the user does not answer "y"',
      async () => {
        await runCommandInteractively('legacy_swift_config', 'n').then(
          ({ code, stdout, stderr }) => {
            expect(code).toBe(1)
            expect(tidyStdOutput(stdout)).toBe('')
            expect(tidyStdOutput(stderr)).toBe(expectedErrorOutput)
          },
        )
      },
      LONG_TEST_TIMEOUT_MS,
    )

    // See above comment on dummy describe block
    describe('', () => {
      const testPath = path.join(__dirname, 'e2e_connect_command', 'legacy_swift_config')

      const configPath = path.join(testPath, 'figma.config.json')
      const configBackupPath = path.join(testPath, 'figma.config.json.backup')

      beforeEach(() => {
        copyFileSync(configPath, configBackupPath)
      })

      afterEach(() => {
        copyFileSync(configBackupPath, configPath)
        rmSync(configBackupPath)
      })

      it(
        'displays a message and updates the config and proceeds if a "swift" config is defined and the user answers "y"',
        async () => {
          await runCommandInteractively('legacy_swift_config', 'y').then(
            ({ code, stdout, stderr }) => {
              // This test will error out because it's not a full Xcode project,
              // but we check that the stdout shows the config was updated
              expect(code).toBe(1)
              expect(tidyStdOutput(stdout)).toBe('')
              // We check startsWith because there will be some error output after this
              expect(tidyStdOutput(stderr).startsWith(expectedSuccessOutput)).toBe(true)
              expect(readFileSync(configPath, 'utf8')).toBe(`{
  "codeConnect": {
    "parser": "swift",
    "include": [
      "src/components/**/*.swift"
    ]
  }
}`)
            },
          )
        },
        LONG_TEST_TIMEOUT_MS,
      )
    })
  })

  it(
    'displays a message and exits if both "react" and "swift" configs are defined',
    async () => {
      try {
        await promisify(exec)(
          `npx tsx ../cli connect parse --dir ./e2e_connect_command/legacy_both_config`,
          {
            cwd: __dirname,
          },
        )
      } catch (e) {
        expect((e as any).code).toBe(1)
        expect(tidyStdOutput((e as any).stdout)).toBe('')
        expect(tidyStdOutput((e as any).stderr))
          .toBe(`⚠️  Your Code Connect configuration needs to be updated

Code Connect is migrating from a single configuration file for all supported languages, to individual configuration files for each language.

As part of this change, your Code Connect configuration file needs to be split into two configuration files, one for React and one for Swift.

The React figma.config.json should be located in your React project root and contain:

{
  "codeConnect": {
    "parser": "react",
    "include": [
      "src/components/**/*.tsx"
    ]
  }
}

The Swift figma.config.json should be located in your Swift project root and contain:

{
  "codeConnect": {
    "parser": "swift",
    "include": [
      "src/components/**/*.swift"
    ]
  }
}

You will need to check any include/exclude paths are correct relative to the new locations.

Please raise an issue at https://github.com/figma/code-connect/issues if you have any problems.`)
      }
    },
    LONG_TEST_TIMEOUT_MS,
  )
})
