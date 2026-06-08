import { exec } from 'child_process'
import { readFileSync, rmSync, existsSync } from 'fs'
import path from 'path'
import { promisify } from 'util'
import { tidyStdOutput } from '../../../__test__/utils'
import { parseBatchFile } from '../../batch_templates'
import { parseRawFile } from '../../raw_templates'

describe('e2e test for `migrate` command', () => {
  const testParentPath = path.join(__dirname, 'e2e_migrate_command')

  function getTestPath(testName: string) {
    return path.join(testParentPath, testName)
  }

  async function runMigrate(cwd: string, extraArgs = '') {
    return await promisify(exec)(
      `npx tsx ../../../../../cli connect migrate --skip-update-check${extraArgs ? ' ' + extraArgs : ''}`,
      {
        cwd,
      },
    )
  }

  function cleanupTemplateFiles(testPath: string) {
    const files = [
      'Button.figma.ts',
      'Button.figma.js',
      'Avatar.figma.ts',
      'Avatar.figma.js',
      'Incompatible.figma.ts',
      'Incompatible_1.figma.ts',
      'PropIcons.figma.ts',
      'PropIcons_1.figma.ts',
      'PropIcons_2.figma.ts',
      'PropIcons_3.figma.ts',
      'PropIcons_4.figma.ts',
      'PropIcons_5.figma.ts',
      'PropIcons_6.figma.ts',
      'PropIcons_7.figma.ts',
      'PropIcons_8.figma.ts',
      'PropIcons_9.figma.ts',
    ]
    files.forEach((file) => {
      const filePath = path.join(testPath, file)
      if (existsSync(filePath)) {
        rmSync(filePath, { force: true })
      }
    })
  }

  function cleanupBatchFiles(testPath: string) {
    const files = [
      'Icons.figma.batch.ts',
      'Icons.figma.batch.json',
      'HeroSquare.figma.batch.ts',
      'HeroSquare.figma.batch.json',
      'PropIcons.figma.batch.ts',
      'PropIcons.figma.batch.json',
      'Incompatible.figma.batch.ts',
      'Incompatible.figma.batch.json',
    ]
    files.forEach((file) => {
      const filePath = path.join(testPath, file)
      if (existsSync(filePath)) {
        rmSync(filePath, { force: true })
      }
    })
  }

  it('successfully migrates React Code Connect files to parserless templates (TypeScript by default)', async () => {
    const testPath = getTestPath('react_basic')

    try {
      const result = await runMigrate(testPath)

      // .figma.ts files were created (not .figma.js)
      const buttonTemplatePath = path.join(testPath, 'Button.figma.ts')
      const avatarTemplatePath = path.join(testPath, 'Avatar.figma.ts')
      expect(existsSync(buttonTemplatePath)).toBe(true)
      expect(existsSync(avatarTemplatePath)).toBe(true)
      expect(existsSync(path.join(testPath, 'Button.figma.js'))).toBe(false)
      expect(existsSync(path.join(testPath, 'Avatar.figma.js'))).toBe(false)

      // Read generated files
      const buttonTemplate = readFileSync(buttonTemplatePath, 'utf-8')
      const avatarTemplate = readFileSync(avatarTemplatePath, 'utf-8')

      // Check key parts of output (v2 API, helpers, structure)
      expect(buttonTemplate).toMatch(/import figma from "figma"/)
      expect(buttonTemplate).toMatch(/figma\.selectedInstance\.getString/)
      expect(buttonTemplate).toMatch(/figma\.selectedInstance\.getBoolean/)
      expect(buttonTemplate).toMatch(/figma\.helpers\.react\.renderProp/)
      expect(buttonTemplate).toMatch(
        /export default \{[^]*id:[^]*imports:[^]*example:[^]*metadata:/,
      )

      expect(avatarTemplate).toMatch(/import figma from "figma"/)
      expect(avatarTemplate).toMatch(/figma\.selectedInstance\.getString/)
      expect(avatarTemplate).toMatch(/figma\.helpers\.react\.renderProp/)
      expect(avatarTemplate).toMatch(/export default \{[^]*id:[^]*imports:[^]*example:/)

      // Check that the templates contain the component usage
      expect(buttonTemplate).toContain('<Button')
      expect(avatarTemplate).toContain('<Avatar')

      // Check that nestable is preserved in metadata (simple JSX example should be nestable: true)
      expect(buttonTemplate).toContain('metadata: { nestable: true }')
      // Check that __props has been removed (no longer needed for parserless templates)
      expect(buttonTemplate).not.toContain('__props')

      // Verify the generated .figma.ts files are valid — parseRawFile should succeed
      const buttonParsed = parseRawFile(buttonTemplatePath, undefined)
      expect(buttonParsed.figmaNode).toBeTruthy()
      expect(buttonParsed.template).toBeTruthy()
      const avatarParsed = parseRawFile(avatarTemplatePath, undefined)
      expect(avatarParsed.figmaNode).toBeTruthy()
      expect(avatarParsed.template).toBeTruthy()

      // Check migration completed successfully
      expect(tidyStdOutput(result.stderr)).toContain('Migration complete')
      expect(tidyStdOutput(result.stderr)).toContain('2 migrated')
    } finally {
      cleanupTemplateFiles(testPath)
    }
  })

  it('outputs .figma.js files when --javascript flag is passed', async () => {
    const testPath = getTestPath('react_basic')

    try {
      const result = await runMigrate(testPath, '--javascript')

      // .figma.js files were created (not .figma.ts)
      const buttonTemplatePath = path.join(testPath, 'Button.figma.js')
      const avatarTemplatePath = path.join(testPath, 'Avatar.figma.js')
      expect(existsSync(buttonTemplatePath)).toBe(true)
      expect(existsSync(avatarTemplatePath)).toBe(true)
      expect(existsSync(path.join(testPath, 'Button.figma.ts'))).toBe(false)
      expect(existsSync(path.join(testPath, 'Avatar.figma.ts'))).toBe(false)

      // Verify the generated .figma.js files are valid — parseRawFile should succeed
      const buttonParsed = parseRawFile(buttonTemplatePath, undefined)
      expect(buttonParsed.figmaNode).toBeTruthy()
      expect(buttonParsed.template).toBeTruthy()

      expect(tidyStdOutput(result.stderr)).toContain('2 migrated')
    } finally {
      cleanupTemplateFiles(testPath)
    }
  })

  it('skips files that already exist', async () => {
    const testPath = getTestPath('react_basic')

    try {
      // Run migrate once to create the files
      await runMigrate(testPath)

      // Run migrate again - should skip the existing files and exit with error
      try {
        await runMigrate(testPath)
        fail('Expected command to fail when no files are migrated')
      } catch (e: any) {
        expect(e.code).toBe(1)
        expect(tidyStdOutput(e.stderr)).toContain('2 skipped')
        expect(tidyStdOutput(e.stderr)).toContain('already exists')
        expect(tidyStdOutput(e.stderr)).toContain('No files were migrated')
      }
    } finally {
      cleanupTemplateFiles(testPath)
    }
  })

  it('migrates Storybook connections to parserless template files', async () => {
    const testPath = getTestPath('react_storybook')
    const templatePath = path.join(testPath, 'StorybookComponent.figma.ts')

    try {
      const result = await runMigrate(testPath)

      expect(existsSync(templatePath)).toBe(true)

      // Strip the source= line as it contains a repo-specific remote URL
      const template = readFileSync(templatePath, 'utf-8').replace(/^\/\/ source=.*\n/m, '')
      expect(template).toBe(
        `// url=https://figma.com/test\n` +
          `// component=StorybookComponent\n` +
          `\n` +
          `import figma from "figma"\n` +
          `\n` +
          `export default {\n` +
          `  id: "StorybookComponent",\n` +
          `  example: figma.code\`<StorybookComponent disabled={false}>Hello</StorybookComponent>\`,\n` +
          `}\n`,
      )

      // Verify the file is parseable as a raw template
      const parsed = parseRawFile(templatePath, undefined)
      expect(parsed.figmaNode).toBe('https://figma.com/test')
      expect(parsed.template).toBeTruthy()

      expect(tidyStdOutput(result.stderr)).toContain('1 migrated')
    } finally {
      if (existsSync(templatePath)) rmSync(templatePath, { force: true })
    }
  })

  it('includes imports in the default export when migrating', async () => {
    const testPath = getTestPath('react_basic')

    try {
      const result = await runMigrate(testPath)

      const buttonTemplatePath = path.join(testPath, 'Button.figma.ts')
      const buttonTemplate = readFileSync(buttonTemplatePath, 'utf-8')

      // Check imports are in correct position: id, imports, example
      expect(buttonTemplate).toMatch(
        /id:\s*"[^"]+",\s*imports:\s*\[[^]*import \{ Button \}[^]*example:/,
      )

      expect(tidyStdOutput(result.stderr)).toContain('Migration complete')
    } finally {
      cleanupTemplateFiles(testPath)
    }
  })

  it('migrates selected Code Connect files to batch files', async () => {
    const testPath = getTestPath('react_batch')

    try {
      const result = await runMigrate(
        testPath,
        '--file Icons.figmadoc.tsx HeroSquare.figmadoc.tsx --batch all',
      )

      const iconsTemplatePath = path.join(testPath, 'Icons.figma.batch.ts')
      const iconsBatchPath = path.join(testPath, 'Icons.figma.batch.json')
      const heroTemplatePath = path.join(testPath, 'HeroSquare.figma.batch.ts')
      const heroBatchPath = path.join(testPath, 'HeroSquare.figma.batch.json')

      expect(existsSync(iconsTemplatePath)).toBe(true)
      expect(existsSync(iconsBatchPath)).toBe(true)
      expect(existsSync(heroTemplatePath)).toBe(true)
      expect(existsSync(heroBatchPath)).toBe(true)
      expect(existsSync(path.join(testPath, 'IconAdd.figma.ts'))).toBe(false)
      expect(existsSync(path.join(testPath, 'HeroSquare.figma.ts'))).toBe(false)

      const iconsTemplate = readFileSync(iconsTemplatePath, 'utf-8')
      expect(iconsTemplate).toContain('id: figma.batch.id')
      expect(iconsTemplate).toContain(
        'imports: [`import { ${figma.batch.componentName} } from "./Icons"`]',
      )
      expect(iconsTemplate).toContain('example: figma.code`<${figma.batch.componentName} />`')

      const iconsBatch = JSON.parse(readFileSync(iconsBatchPath, 'utf-8'))
      expect(iconsBatch.components).toEqual([
        {
          url: 'https://figma.com/test/icon-add',
          component: 'IconAdd',
          id: 'IconAdd',
          componentName: 'IconAdd',
        },
        {
          url: 'https://figma.com/test/icon-remove',
          component: 'IconRemove',
          id: 'IconRemove',
          componentName: 'IconRemove',
        },
        {
          url: 'https://figma.com/test/icon-search',
          component: 'IconSearch',
          id: 'IconSearch',
          componentName: 'IconSearch',
        },
      ])

      const heroTemplate = readFileSync(heroTemplatePath, 'utf-8')
      expect(heroTemplate).toContain('// component=HeroSquare')
      expect(heroTemplate).toContain(
        'example: figma.code`<HeroSquare name="${figma.batch.name}"/>`',
      )

      const heroBatch = JSON.parse(readFileSync(heroBatchPath, 'utf-8'))
      expect(heroBatch.components).toEqual([
        { url: 'https://figma.com/test/hero-btc', name: 'cbbtc' },
        { url: 'https://figma.com/test/hero-eth', name: 'eth' },
      ])

      expect(parseBatchFile(iconsBatchPath, undefined)).toHaveLength(3)
      expect(parseBatchFile(heroBatchPath, undefined)).toHaveLength(2)
      expect(tidyStdOutput(result.stderr)).toContain('5 migrated')
    } finally {
      cleanupBatchFiles(testPath)
    }
  })

  it('automatically migrates files with at least 10 Code Connect docs to batch files', async () => {
    const testPath = getTestPath('react_batch')

    try {
      const result = await runMigrate(testPath, '--file PropIcons.figmadoc.tsx')

      const templatePath = path.join(testPath, 'PropIcons.figma.batch.ts')
      const batchPath = path.join(testPath, 'PropIcons.figma.batch.json')

      expect(existsSync(templatePath)).toBe(true)
      expect(existsSync(batchPath)).toBe(true)

      const template = readFileSync(templatePath, 'utf-8')
      expect(template).not.toContain('__props')
      expect(template).toMatch(
        /example: figma\.code`<\$\{figma\.batch\.componentName\} size=\{\$\{figma\.batch\.size\}\}\s*\/>`/,
      )

      const batch = JSON.parse(readFileSync(batchPath, 'utf-8'))
      expect(batch.components).toHaveLength(10)
      expect(batch.components[0]).toEqual({
        url: 'https://figma.com/test/glyph-alpha',
        component: 'GlyphAlphaIcon',
        id: 'GlyphAlphaIcon',
        componentName: 'GlyphAlphaIcon',
        size: 12,
      })

      expect(parseBatchFile(batchPath, undefined)).toHaveLength(10)
      expect(tidyStdOutput(result.stderr)).toContain('10 migrated')
    } finally {
      cleanupTemplateFiles(testPath)
      cleanupBatchFiles(testPath)
    }
  })

  it('falls back to regular migration when an explicit batch migration is incompatible', async () => {
    const testPath = getTestPath('react_batch')

    try {
      const result = await runMigrate(testPath, '--file Incompatible.figmadoc.tsx --batch all')

      const firstTemplatePath = path.join(testPath, 'Incompatible.figma.ts')
      const secondTemplatePath = path.join(testPath, 'Incompatible_1.figma.ts')

      expect(existsSync(firstTemplatePath)).toBe(true)
      expect(existsSync(secondTemplatePath)).toBe(true)
      expect(existsSync(path.join(testPath, 'Incompatible.figma.batch.ts'))).toBe(false)
      expect(existsSync(path.join(testPath, 'Incompatible.figma.batch.json'))).toBe(false)

      expect(parseRawFile(firstTemplatePath, undefined).template).toBeTruthy()
      expect(parseRawFile(secondTemplatePath, undefined).template).toBeTruthy()
      const stderr = tidyStdOutput(result.stderr)
      const successIndex = stderr.indexOf('✓ Migrated to')
      const warningIndex = stderr.indexOf('Unable to migrate the following files to batch files:')
      expect(successIndex).toBeGreaterThan(-1)
      expect(warningIndex).toBeGreaterThan(successIndex)
      expect(stderr).toContain(
        `- ${path.join(testPath, 'Incompatible.figmadoc.tsx')} (2 connections): Templates did not reduce to one compatible shape`,
      )
      expect(stderr).toContain(
        "If you'd like to create batch files for these, we recommend using a coding agent. See example prompt: https://developers.figma.com/docs/code-connect/template-files/#migration-script",
      )
      expect(stderr).toContain('2 migrated')
    } finally {
      cleanupTemplateFiles(testPath)
      cleanupBatchFiles(testPath)
    }
  })
})
