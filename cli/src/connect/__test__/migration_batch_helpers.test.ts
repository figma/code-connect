import { buildBatchMigration, getBatchMigrationGroups } from '../migration_batch_helpers'
import { CodeConnectJSON } from '../figma_connect'
import { SyntaxHighlightLanguage } from '../label_language_mapping'

function baseDoc(overrides: Partial<CodeConnectJSON>): CodeConnectJSON {
  return {
    figmaNode: 'https://figma.com/test',
    component: 'Example',
    template: `const figma = require('figma')
export default figma.tsx\`<Example />\``,
    templateData: { nestable: true },
    language: SyntaxHighlightLanguage.TypeScript,
    label: 'react',
    metadata: { cliVersion: '1.0.0' },
    ...overrides,
  }
}

describe('buildBatchMigration', () => {
  it('selects files with at least 10 docs for automatic batch migration', () => {
    const selectedDocs = Array.from({ length: 10 }, (_, index) =>
      baseDoc({
        figmaNode: `https://figma.com/test/auto-${index}`,
        _codeConnectFilePath: '/tmp/icons.figmadoc.tsx',
      }),
    )
    const smallDocs = Array.from({ length: 9 }, (_, index) =>
      baseDoc({
        figmaNode: `https://figma.com/test/small-${index}`,
        _codeConnectFilePath: '/tmp/buttons.figmadoc.tsx',
      }),
    )

    const groups = getBatchMigrationGroups([...selectedDocs, ...smallDocs])

    expect([...groups.keys()]).toEqual(['/tmp/icons.figmadoc.tsx'])
    expect(groups.get('/tmp/icons.figmadoc.tsx')).toHaveLength(10)
  })

  it('selects every source file when batchAll is set', () => {
    const groups = getBatchMigrationGroups(
      [
        baseDoc({
          figmaNode: 'https://figma.com/test/one',
          _codeConnectFilePath: '/tmp/one.figmadoc.tsx',
        }),
        baseDoc({
          figmaNode: 'https://figma.com/test/two',
          _codeConnectFilePath: '/tmp/two.figmadoc.tsx',
        }),
      ],
      { batchAll: true },
    )

    expect([...groups.keys()]).toEqual(['/tmp/one.figmadoc.tsx', '/tmp/two.figmadoc.tsx'])
  })

  it('does not select any files when batch migration is disabled', () => {
    const groups = getBatchMigrationGroups(
      Array.from({ length: 10 }, (_, index) =>
        baseDoc({
          figmaNode: `https://figma.com/test/disabled-${index}`,
          _codeConnectFilePath: '/tmp/icons.figmadoc.tsx',
        }),
      ),
      { disabled: true },
    )

    expect(groups.size).toBe(0)
  })

  it('parameterizes icon-style component symbols in id, imports, and example', () => {
    const result = buildBatchMigration(
      [
        baseDoc({
          figmaNode: 'https://figma.com/test/icon-add',
          component: 'IconAdd',
          template: `const figma = require('figma')
export default figma.tsx\`<IconAdd />\``,
          templateData: {
            imports: ['import { IconAdd } from "@figma/fpl-icons"'],
            nestable: true,
          },
        }),
        baseDoc({
          figmaNode: 'https://figma.com/test/icon-remove',
          component: 'IconRemove',
          template: `const figma = require('figma')
export default figma.tsx\`<IconRemove />\``,
          templateData: {
            imports: ['import { IconRemove } from "@figma/fpl-icons"'],
            nestable: true,
          },
        }),
      ],
      { templateFile: './icons.figma.batch.ts' },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.template).toContain('id: figma.batch.id')
    expect(result.template).toContain(
      'imports: [`import { ${figma.batch.componentName} } from "@figma/fpl-icons"`]',
    )
    expect(result.template).toContain('example: figma.code`<${figma.batch.componentName} />`')
    expect(result.batchJson).toEqual({
      templateFile: './icons.figma.batch.ts',
      components: [
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
      ],
    })
  })

  it('parameterizes simple generated imports with trailing semicolons', () => {
    const result = buildBatchMigration([
      baseDoc({
        figmaNode: 'https://figma.com/test/icon-add',
        component: 'IconAdd',
        template: `const figma = require('figma')
export default figma.tsx\`<IconAdd />\``,
        templateData: {
          imports: ["import { IconAdd } from 'icons';"],
          nestable: true,
        },
      }),
      baseDoc({
        figmaNode: 'https://figma.com/test/icon-remove',
        component: 'IconRemove',
        template: `const figma = require('figma')
export default figma.tsx\`<IconRemove />\``,
        templateData: {
          imports: ["import { IconRemove } from 'icons';"],
          nestable: true,
        },
      }),
    ])

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.template).toContain(
      'imports: [`import { ${figma.batch.componentName} } from "icons"`]',
    )
    expect(result.template).toContain('example: figma.code`<${figma.batch.componentName} />`')
  })

  it('parameterizes icon props patterns and numeric JSX attributes', () => {
    function iconDoc(name: string, size: number): CodeConnectJSON {
      return baseDoc({
        figmaNode: `https://figma.com/test/${name}`,
        component: name,
        template: `const figma = require('figma')
const name = "${name}"
const fn = ${name}
const __props = {}
if (name !== undefined) {
  __props["name"] = name
}
if (fn !== undefined) {
  __props["fn"] = fn
}
export default { ...figma.tsx\`<${name} size={${size}} />\`, metadata: { __props } }`,
        templateData: {
          imports: [`import { ${name} } from "./icons"`],
          nestable: true,
        },
      })
    }

    const result = buildBatchMigration([
      iconDoc('GlyphAlphaIcon', 12),
      iconDoc('GlyphBetaIcon', 16),
    ])

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.template).not.toContain('__props')
    expect(result.template).toContain(
      'example: figma.code`<${figma.batch.componentName} size={${figma.batch.size}} />`',
    )
    expect(result.batchJson.components).toEqual([
      {
        url: 'https://figma.com/test/GlyphAlphaIcon',
        component: 'GlyphAlphaIcon',
        id: 'GlyphAlphaIcon',
        componentName: 'GlyphAlphaIcon',
        size: 12,
      },
      {
        url: 'https://figma.com/test/GlyphBetaIcon',
        component: 'GlyphBetaIcon',
        id: 'GlyphBetaIcon',
        componentName: 'GlyphBetaIcon',
        size: 16,
      },
    ])
  })

  it('parameterizes named string literal values and keeps constant metadata in the template', () => {
    const result = buildBatchMigration([
      baseDoc({
        figmaNode: 'https://figma.com/test/hero-btc',
        component: 'HeroSquare',
        source: 'src/HeroSquare.tsx',
        template: `const figma = require('figma')
export default figma.tsx\`<HeroSquare name="cbbtc" />\``,
        templateData: {
          imports: ['import { HeroSquare } from "@coinbase/cds-web/illustrations/HeroSquare"'],
          nestable: true,
        },
      }),
      baseDoc({
        figmaNode: 'https://figma.com/test/hero-eth',
        component: 'HeroSquare',
        source: 'src/HeroSquare.tsx',
        template: `const figma = require('figma')
export default figma.tsx\`<HeroSquare name="eth" />\``,
        templateData: {
          imports: ['import { HeroSquare } from "@coinbase/cds-web/illustrations/HeroSquare"'],
          nestable: true,
        },
      }),
    ])

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.template).toContain('// source=src/HeroSquare.tsx')
    expect(result.template).toContain('// component=HeroSquare')
    expect(result.template).toContain(
      'example: figma.code`<HeroSquare name="${figma.batch.name}" />`',
    )
    expect(result.batchJson.components).toEqual([
      { url: 'https://figma.com/test/hero-btc', name: 'cbbtc' },
      { url: 'https://figma.com/test/hero-eth', name: 'eth' },
    ])
  })

  it('skips unlabeled string differences', () => {
    const result = buildBatchMigration([
      baseDoc({
        figmaNode: 'https://figma.com/test/add',
        template: `const figma = require('figma')
export default figma.tsx\`makeIcon("add")\``,
      }),
      baseDoc({
        figmaNode: 'https://figma.com/test/remove',
        template: `const figma = require('figma')
export default figma.tsx\`makeIcon("remove")\``,
      }),
    ])

    expect(result).toEqual({
      ok: false,
      reason: 'Cannot batch: templates did not reduce to one compatible shape',
    })
  })

  it('skips variant docs', () => {
    const result = buildBatchMigration([
      baseDoc({
        figmaNode: 'https://figma.com/test/button-primary',
        variant: { Variant: 'Primary' },
      }),
      baseDoc({
        figmaNode: 'https://figma.com/test/button-secondary',
        variant: { Variant: 'Secondary' },
      }),
    ])

    expect(result).toEqual({
      ok: false,
      reason: 'Cannot batch: variant Code Connect docs are not supported yet',
    })
  })
})
