import { promisify } from 'util'
import { exec } from 'child_process'
import { tidyStdOutput } from '../../../__test__/utils'
import path from 'path'

describe('e2e test for `parse` command (batch)', () => {
  const cliVersion = require('../../../../package.json').version

  it('successfully parses batch file with multiple components', async () => {
    const testPath = path.join(__dirname, 'e2e_parse_command/batch')
    const expectedBatch = path.join(testPath, 'icons.figma.batch.json')

    const result = await promisify(exec)(
      `npx tsx ../../../cli connect parse --skip-update-check --dir ${testPath}`,
      {
        cwd: __dirname,
      },
    )

    expect(tidyStdOutput(result.stderr)).toContain(`${expectedBatch} (3 components)`)

    const json = JSON.parse(result.stdout)

    expect(json).toHaveLength(3)

    // Template should have __FIGMA_BATCH prepended with entry data
    expect(json[0].template).toContain("globalThis['__FIGMA_BATCH'] =")
    expect(json[0].template).toContain('"Icon24Arrow"')
    expect(json[0].template).toContain('"icon-arrow"')

    // Each entry should have different __FIGMA_BATCH data
    expect(json[1].template).toContain('"Icon24Check"')
    expect(json[2].template).toContain('"Icon24Star"')

    // The template body (after __FIGMA_BATCH) should still reference figma.batch
    expect(json[0].template).toContain('figma.batch.name')
    expect(json[0].template).toContain('figma.batch.id')

    // No batchData field — data is baked into the template
    expect(json[0].batchData).toBeUndefined()

    // Reserved fields should be in their standard spots
    expect(json[0].figmaNode).toBe('https://figma.com/file/ABC?node-id=1-1')
    expect(json[0].source).toBe('./src/icons/Icon24Arrow.tsx')
    expect(json[2].source).toBe('')

    // ESM import should be transpiled
    expect(json[0].template).toContain("const figma = require('figma')")
    expect(json[0].template).not.toContain("import figma from 'figma'")

    // Standard metadata
    expect(json[0]).toMatchObject({
      label: 'Code',
      language: 'plaintext',
      sourceLocation: { line: -1 },
      templateData: { nestable: true, isParserless: true },
      metadata: { cliVersion },
    })
  })
})
