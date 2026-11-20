import { collapsePreviewResults } from '../preview_collapse'
import type { PreviewResult } from '../preview_utils'

const r = (over: Partial<PreviewResult>): PreviewResult => ({
  url: 'https://figma.com/design/K?node-id=1-2',
  nodeId: '1:2',
  filePath: 'X.figma.ts',
  success: true,
  ...over,
})

describe('collapsePreviewResults', () => {
  it('folds property combinations with identical output into one result, tracking coverage', () => {
    const out = collapsePreviewResults([
      r({ propertyCombinationLabel: 'A', snippet: '<X />' }),
      r({ propertyCombinationLabel: 'B', snippet: '<X />' }),
      r({ propertyCombinationLabel: 'C', snippet: '<X variant="danger" />' }),
    ])
    expect(out).toHaveLength(2)
    expect(out[0].propertyCombinationLabel).toBe('A') // first combination is the representative
    expect(out[0].propertyCombinationLabels).toEqual(['A', 'B'])
    expect(out[0].propertyCombinationCount).toBe(2)
    expect(out[1].propertyCombinationCount).toBe(1)
    expect(out[1].propertyCombinationLabels).toEqual(['C'])
  })

  it('does not collapse identical snippets across different nodes', () => {
    const out = collapsePreviewResults([
      r({ nodeId: '1:2', propertyCombinationLabel: 'A', snippet: '<X />' }),
      r({ nodeId: '3:4', propertyCombinationLabel: 'B', snippet: '<X />' }),
    ])
    expect(out).toHaveLength(2)
  })

  it('keeps identical output separate for different source files or Figma files', () => {
    const out = collapsePreviewResults([
      r({ filePath: 'Button.figma.ts', snippet: '<X />' }),
      r({ filePath: 'Card.figma.ts', snippet: '<X />' }),
      r({
        filePath: 'Button.figma.ts',
        url: 'https://figma.com/design/OTHER?node-id=1-2',
        snippet: '<X />',
      }),
    ])
    expect(out).toHaveLength(3)
    expect(out.map((result) => result.propertyCombinationCount)).toEqual([1, 1, 1])
  })

  it.each([true, false])(
    'keeps batch template outputs and coverage separate (success: %s)',
    (success) => {
      const out = collapsePreviewResults(
        ['Button', 'Card'].flatMap((component) =>
          ['A', 'B'].map((label) =>
            r({
              filePath: 'components.figma.batch.json',
              batchTemplateFilePath: `/dist/${component}.js`,
              source: `src/${component}.tsx`,
              propertyCombinationLabel: label,
              success,
              ...(success ? { snippet: '<X />' } : { error: 'boom' }),
            }),
          ),
        ),
      )
      expect(out).toHaveLength(2)
      expect(out.map((result) => result.batchTemplateFilePath)).toEqual([
        '/dist/Button.js',
        '/dist/Card.js',
      ])
      expect(out.map((result) => result.source)).toEqual(['src/Button.tsx', 'src/Card.tsx'])
      expect(out.map((result) => result.propertyCombinationCount)).toEqual([2, 2])
      expect(out.map((result) => result.propertyCombinationLabels)).toEqual([
        ['A', 'B'],
        ['A', 'B'],
      ])
    },
  )

  it('groups failures by error text, separately from successes', () => {
    const out = collapsePreviewResults([
      r({ propertyCombinationLabel: 'A', success: false, snippet: undefined, error: 'boom' }),
      r({ propertyCombinationLabel: 'B', success: false, snippet: undefined, error: 'boom' }),
      r({ propertyCombinationLabel: 'C', success: true, snippet: '<X />' }),
    ])
    expect(out).toHaveLength(2)
    expect(out.find((o) => !o.success)?.propertyCombinationCount).toBe(2)
    expect(out.find((o) => o.success)?.propertyCombinationCount).toBe(1)
  })

  it('preserves first-appearance order of distinct outputs', () => {
    const out = collapsePreviewResults([
      r({ propertyCombinationLabel: 'A', snippet: '<B />' }),
      r({ propertyCombinationLabel: 'C', snippet: '<A />' }),
      r({ propertyCombinationLabel: 'D', snippet: '<B />' }),
    ])
    expect(out.map((o) => o.snippet)).toEqual(['<B />', '<A />'])
    expect(out[0].propertyCombinationCount).toBe(2)
  })
})
