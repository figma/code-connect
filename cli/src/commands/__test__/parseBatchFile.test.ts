import { parseBatchFile } from '../../connect/batch_templates'
import { CodeConnectConfig } from '../../connect/project'
import { SyntaxHighlightLanguage } from '../../connect/label_language_mapping'
import fs from 'fs'
import path from 'path'
import os from 'os'

describe('parseBatchFile', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parseBatchFile-test-'))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  function writeBatch(data: object): string {
    const batchPath = path.join(tempDir, 'icons.figma.batch.json')
    fs.writeFileSync(batchPath, JSON.stringify(data))
    return batchPath
  }

  function writeTemplate(filename: string, content: string): void {
    fs.writeFileSync(path.join(tempDir, filename), content)
  }

  const jsTemplate = `const figma = require('figma')

export default {
  example: figma.code\`<\${figma.batch.name} />\`,
  id: figma.batch.id,
}`

  const tsTemplate = `import figma from 'figma'

export default {
  example: figma.code\`<\${figma.batch.name} />\`,
  id: figma.batch.id,
}`

  it('produces correct number of CodeConnectJSON objects', () => {
    writeTemplate('template.figma.batch.js', jsTemplate)
    const batchPath = writeBatch({
      templateFile: './template.figma.batch.js',
      components: [
        { url: 'https://figma.com/file/ABC?node-id=1-1', name: 'Icon24Arrow', id: 'arrow' },
        { url: 'https://figma.com/file/ABC?node-id=1-2', name: 'Icon24Check', id: 'check' },
        { url: 'https://figma.com/file/ABC?node-id=1-3', name: 'Icon24Star', id: 'star' },
      ],
    })

    const results = parseBatchFile(batchPath, undefined)
    expect(results).toHaveLength(3)
  })

  it('prepends __FIGMA_BATCH with entry data to each template', () => {
    writeTemplate('template.figma.batch.js', jsTemplate)
    const batchPath = writeBatch({
      templateFile: './template.figma.batch.js',
      components: [
        { url: 'https://figma.com/file/ABC?node-id=1-1', name: 'Icon24Arrow', id: 'arrow' },
        { url: 'https://figma.com/file/ABC?node-id=1-2', name: 'Icon24Check', id: 'check' },
      ],
    })

    const results = parseBatchFile(batchPath, undefined)

    // globalThis['__FIGMA_BATCH'] contains the full entry
    expect(results[0].template).toContain("globalThis['__FIGMA_BATCH'] =")
    expect(results[0].template).toContain('"Icon24Arrow"')
    expect(results[1].template).toContain('"Icon24Check"')
    expect(results[0].template).toContain('figma.batch.name')
  })

  it('puts reserved fields in both __FIGMA_BATCH and standard CodeConnectJSON spots', () => {
    writeTemplate('template.figma.batch.js', jsTemplate)
    const batchPath = writeBatch({
      templateFile: './template.figma.batch.js',
      components: [
        {
          url: 'https://figma.com/file/ABC?node-id=1-1',
          name: 'Icon24Arrow',
          id: 'arrow',
          source: './src/Icon24Arrow.tsx',
          component: 'Arrow Icon',
        },
      ],
    })

    const results = parseBatchFile(batchPath, undefined)

    // Reserved fields go to their standard CodeConnectJSON spots
    expect(results[0].source).toBe('./src/Icon24Arrow.tsx')
    expect(results[0].component).toBe('Arrow Icon')
    expect(results[0].figmaNode).toBe('https://figma.com/file/ABC?node-id=1-1')

    // Full entry is also available in globalThis['__FIGMA_BATCH'] for the template
    expect(results[0].template).toContain("globalThis['__FIGMA_BATCH'] =")
    expect(results[0].template).toContain('"Icon24Arrow"')
  })

  it('does not have batchData field on CodeConnectJSON', () => {
    writeTemplate('template.figma.batch.js', jsTemplate)
    const batchPath = writeBatch({
      templateFile: './template.figma.batch.js',
      components: [
        { url: 'https://figma.com/file/ABC?node-id=1-1', name: 'Icon24Arrow', id: 'arrow' },
      ],
    })

    const results = parseBatchFile(batchPath, undefined)
    expect((results[0] as any).batchData).toBeUndefined()
  })

  it('handles .ts template files', () => {
    writeTemplate('template.figma.batch.ts', tsTemplate)
    const batchPath = writeBatch({
      templateFile: './template.figma.batch.ts',
      components: [
        { url: 'https://figma.com/file/ABC?node-id=1-1', name: 'Icon24Arrow', id: 'arrow' },
      ],
    })

    const results = parseBatchFile(batchPath, undefined)
    expect(results[0].template).toContain("const figma = require('figma')")
    expect(results[0].template).not.toContain("import figma from 'figma'")
    expect(results[0].template).toContain("globalThis['__FIGMA_BATCH'] =")
  })

  it('supports array format for multiple groups', () => {
    writeTemplate('icons.figma.batch.js', jsTemplate)

    const buttonTemplate = `const figma = require('figma')

export default figma.code\`<\${figma.batch.name} variant="\${figma.batch.variant}" />\``

    writeTemplate('buttons.figma.batch.js', buttonTemplate)

    const batchPath = writeBatch([
      {
        templateFile: './icons.figma.batch.js',
        components: [
          { url: 'https://figma.com/file/ABC?node-id=1-1', name: 'Icon24Arrow', id: 'arrow' },
        ],
      },
      {
        templateFile: './buttons.figma.batch.js',
        components: [
          {
            url: 'https://figma.com/file/ABC?node-id=2-1',
            name: 'PrimaryButton',
            variant: 'primary',
          },
        ],
      },
    ])

    const results = parseBatchFile(batchPath, undefined)
    expect(results).toHaveLength(2)
    expect(results[0].template).toContain('"Icon24Arrow"')
    expect(results[1].template).toContain('"PrimaryButton"')
  })

  it('applies documentUrlSubstitutions', () => {
    writeTemplate('template.figma.batch.js', jsTemplate)
    const batchPath = writeBatch({
      templateFile: './template.figma.batch.js',
      components: [
        { url: 'https://figma.com/file/SOURCE?node-id=1-1', name: 'Icon24Arrow', id: 'arrow' },
      ],
    })

    const config: CodeConnectConfig = {
      parser: 'react',
      documentUrlSubstitutions: {
        'https://figma.com/file/SOURCE': 'https://figma.com/file/TARGET',
      },
    }

    const results = parseBatchFile(batchPath, undefined, config)
    expect(results[0].figmaNode).toBe('https://figma.com/file/TARGET?node-id=1-1')
  })

  it('allows object and array values in custom fields', () => {
    const template = `const figma = require('figma')

export default figma.code\`name: \${figma.batch.name}\``

    writeTemplate('template.figma.batch.js', template)
    const batchPath = writeBatch({
      templateFile: './template.figma.batch.js',
      components: [
        {
          url: 'https://figma.com/file/ABC?node-id=1-1',
          name: 'Icon24Arrow',
          config: { size: 24, nested: true },
          tags: ['icon', 'navigation'],
        },
      ],
    })

    const results = parseBatchFile(batchPath, undefined)
    expect(results[0].template).toContain('"config":{"size":24,"nested":true}')
    expect(results[0].template).toContain('"tags":["icon","navigation"]')
  })

  it('sets correct metadata', () => {
    writeTemplate('template.figma.batch.js', jsTemplate)
    const batchPath = writeBatch({
      templateFile: './template.figma.batch.js',
      components: [
        { url: 'https://figma.com/file/ABC?node-id=1-1', name: 'Icon24Arrow', id: 'arrow' },
      ],
    })

    const results = parseBatchFile(batchPath, undefined)
    expect(results[0].templateData).toEqual({ nestable: true, isParserless: true })
    expect(results[0].sourceLocation).toEqual({ line: -1 })
    expect(results[0].label).toBe('Code')
    expect(results[0].language).toBe('plaintext')
    expect(results[0].metadata.cliVersion).toBeDefined()
  })

  it('uses provided label', () => {
    writeTemplate('template.figma.batch.js', jsTemplate)
    const batchPath = writeBatch({
      templateFile: './template.figma.batch.js',
      components: [
        { url: 'https://figma.com/file/ABC?node-id=1-1', name: 'Icon24Arrow', id: 'arrow' },
      ],
    })

    const results = parseBatchFile(batchPath, 'React')
    expect(results[0].label).toBe('React')
    expect(results[0].language).toBe(SyntaxHighlightLanguage.JSX)
  })

  // Validation tests

  it('throws for missing templateFile', () => {
    const batchPath = writeBatch({
      components: [{ url: 'https://figma.com/file/ABC?node-id=1-1', name: 'Arrow' }],
    })
    expect(() => parseBatchFile(batchPath, undefined)).toThrow(
      'Missing required field "templateFile"',
    )
  })

  it('throws for empty components array', () => {
    writeTemplate('template.figma.batch.js', jsTemplate)
    const batchPath = writeBatch({
      templateFile: './template.figma.batch.js',
      components: [],
    })
    expect(() => parseBatchFile(batchPath, undefined)).toThrow(
      '"components" must be a non-empty array',
    )
  })

  it('throws when template file does not exist', () => {
    const batchPath = writeBatch({
      templateFile: './nonexistent.figma.batch.js',
      components: [{ url: 'https://figma.com/file/ABC?node-id=1-1', name: 'Arrow' }],
    })
    expect(() => parseBatchFile(batchPath, undefined)).toThrow('Template file not found')
  })

  it('throws when template file has wrong extension', () => {
    writeTemplate('template.figma.js', jsTemplate)
    const batchPath = writeBatch({
      templateFile: './template.figma.js',
      components: [{ url: 'https://figma.com/file/ABC?node-id=1-1', name: 'Arrow' }],
    })
    expect(() => parseBatchFile(batchPath, undefined)).toThrow(
      'must have a .figma.batch.ts or .figma.batch.js extension',
    )
  })

  it('throws for missing url in entry', () => {
    writeTemplate('template.figma.batch.js', jsTemplate)
    const batchPath = writeBatch({
      templateFile: './template.figma.batch.js',
      components: [{ name: 'Icon24Arrow', id: 'arrow' }],
    })
    expect(() => parseBatchFile(batchPath, undefined)).toThrow('Missing required field "url"')
  })

  it('defaults source and component to empty string', () => {
    writeTemplate('template.figma.batch.js', jsTemplate)
    const batchPath = writeBatch({
      templateFile: './template.figma.batch.js',
      components: [
        { url: 'https://figma.com/file/ABC?node-id=1-1', name: 'Icon24Arrow', id: 'arrow' },
      ],
    })

    const results = parseBatchFile(batchPath, undefined)
    expect(results[0].source).toBe('')
    expect(results[0].component).toBeUndefined()
  })
})
