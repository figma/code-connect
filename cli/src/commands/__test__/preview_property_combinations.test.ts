import {
  chunkNodeIdsForPreview,
  chunkOutcomeToResults,
  parseMaxCombinationsArg,
  parseMissingProperty,
  type NodeToPreview,
} from '../preview_utils'
import { FigmaRestApi } from '../../connect/figma_rest_api'
import type { AvailableProperty, PropertyCombination } from '../../connect/property_combinations'

const node: NodeToPreview = {
  fileKey: 'file1',
  nodeId: '1:2',
  url: 'https://figma.com/file/file1?node-id=1-2',
  filePath: 'Button.figma.tsx',
}

const availableProps: Record<string, AvailableProperty[]> = {
  '1:2': [
    {
      name: 'Variant',
      type: FigmaRestApi.ComponentPropertyType.Variant,
      variantOptions: ['Primary', 'Secondary'],
    },
    { name: 'Has Icon Start', type: FigmaRestApi.ComponentPropertyType.Boolean, default: false },
  ],
}

function outcomeOf(results: any[]) {
  return {
    chunkNodeIds: ['1:2'],
    response: { response: { status: 200 }, data: { status: 200, error: false, meta: { results } } },
    error: null,
  } as any
}

describe('parseMissingProperty', () => {
  it('extracts the property name from a PropertyNotFound error', () => {
    expect(parseMissingProperty("PropertyNotFoundError: property 'Varient' not found")).toBe(
      'Varient',
    )
  })

  it('falls back to the first quoted token', () => {
    expect(parseMissingProperty('Unknown prop `foo` referenced')).toBe('foo')
  })

  it('returns undefined when there is nothing to parse', () => {
    expect(parseMissingProperty(undefined)).toBeUndefined()
    expect(parseMissingProperty('some error with no quotes')).toBeUndefined()
  })
})

describe('parseMaxCombinationsArg', () => {
  it('defaults to the backend request cap', () => {
    expect(parseMaxCombinationsArg(undefined)).toBe(500)
  })

  it('accepts a custom max below the backend request cap', () => {
    expect(parseMaxCombinationsArg('25')).toBe(25)
  })
})

describe('chunkOutcomeToResults with property combinations', () => {
  it('maps propertyCombinationLabel through for each rendered property combination', () => {
    const results = chunkOutcomeToResults(
      outcomeOf([
        {
          nodeId: '1:2',
          nodeUrl: node.url,
          snippet: '<Button />',
          language: 'typescript',
          propertyCombinationLabel: 'Has Icon Start=false',
        },
        {
          nodeId: '1:2',
          nodeUrl: node.url,
          snippet: '<Button iconStart />',
          language: 'typescript',
          propertyCombinationLabel: 'Has Icon Start=true',
        },
      ]),
      [node],
      'file1',
      availableProps,
    )

    expect(results).toHaveLength(2)
    expect(results[0]).toMatchObject({
      success: true,
      propertyCombinationLabel: 'Has Icon Start=false',
    })
    expect(results[1]).toMatchObject({
      success: true,
      propertyCombinationLabel: 'Has Icon Start=true',
    })
  })

  it('does not advance file attribution for multiple combinations of the same node', () => {
    const otherNodeForSameId: NodeToPreview = {
      ...node,
      filePath: 'OtherButton.figma.tsx',
    }
    const results = chunkOutcomeToResults(
      outcomeOf([
        {
          nodeId: '1:2',
          nodeUrl: node.url,
          snippet: '<Button />',
          language: 'typescript',
          propertyCombinationLabel: 'Variant=Primary',
        },
        {
          nodeId: '1:2',
          nodeUrl: node.url,
          snippet: '<Button variant="Secondary" />',
          language: 'typescript',
          propertyCombinationLabel: 'Variant=Secondary',
        },
      ]),
      [node, otherNodeForSameId],
      'file1',
      availableProps,
    )

    expect(results.map((result) => result.filePath)).toEqual([
      'Button.figma.tsx',
      'Button.figma.tsx',
    ])
  })

  it('enriches a failed result with errorDetails (missing property + vocabulary)', () => {
    const results = chunkOutcomeToResults(
      outcomeOf([
        {
          nodeId: '1:2',
          nodeUrl: node.url,
          error: "PropertyNotFoundError: property 'Varient' not found",
          errorKind: 'property-not-found',
          propertyCombinationLabel: 'Variant=Primary',
        },
      ]),
      [node],
      'file1',
      availableProps,
    )

    expect(results[0].success).toBe(false)
    expect(results[0].errorDetails).toEqual({
      kind: 'property-not-found',
      missingProperty: 'Varient',
      availableProperties: availableProps['1:2'],
    })
  })

  it('never attaches vocabulary to a per-result transport error, even under --all', () => {
    const results = chunkOutcomeToResults(
      outcomeOf([
        {
          nodeId: '1:2',
          nodeUrl: node.url,
          error: 'fetch failed',
          errorKind: 'transport',
          propertyCombinationLabel: 'Variant=Primary',
        },
      ]),
      [node],
      'file1',
      availableProps,
    )

    expect(results[0].success).toBe(false)
    // Transport failures carry only the kind — no availableProperties/missingProperty,
    // so a self-heal loop doesn't mistake a backend outage for a bad template prop.
    expect(results[0].errorDetails).toEqual({ kind: 'transport' })
  })

  it('omits errorDetails when no property vocabulary is available (not --all)', () => {
    const results = chunkOutcomeToResults(
      outcomeOf([{ nodeId: '1:2', nodeUrl: node.url, error: 'boom' }]),
      [node],
      'file1',
      undefined,
    )

    expect(results[0].success).toBe(false)
    expect(results[0].errorDetails).toBeUndefined()
  })

  it('maps unresolvedInstances through on a successful (placeholder) render', () => {
    const results = chunkOutcomeToResults(
      outcomeOf([
        {
          nodeId: '1:2',
          nodeUrl: node.url,
          snippet: '<Card>{/* Icon — no Code Connect template found */}</Card>',
          language: 'typescript',
          unresolvedInstances: [{ guid: '1:9', name: 'Icon', kind: 'instance' }],
        },
      ]),
      [node],
      'file1',
      availableProps,
    )

    expect(results[0].success).toBe(true)
    expect(results[0].unresolvedInstances).toEqual([
      { guid: '1:9', name: 'Icon', kind: 'instance' },
    ])
  })

  it('tags a chunk-level transport failure as kind "transport" with no vocabulary', () => {
    const outcome = {
      chunkNodeIds: ['1:2'],
      response: null,
      error: new Error('Not Found'),
    } as any

    const results = chunkOutcomeToResults(outcome, [node], 'file1', availableProps)

    expect(results[0].success).toBe(false)
    expect(results[0].errorDetails).toEqual({ kind: 'transport' })
  })
})

describe('chunkNodeIdsForPreview', () => {
  const combos = (n: number): PropertyCombination[] =>
    Array.from({ length: n }, (_, i) => ({ label: `c${i}`, properties: [] }))

  const totalCombinations = (chunk: string[], byNode: Record<string, PropertyCombination[]>) =>
    chunk.reduce((sum, id) => sum + (byNode[id]?.length ?? 0), 0)

  it('chunks purely by node count when no combinations are provided', () => {
    const nodeIds = Array.from({ length: 120 }, (_, i) => `n${i}`)
    const chunks = chunkNodeIdsForPreview(nodeIds)
    // PREVIEW_CHUNK_SIZE is 50 → 50 + 50 + 20.
    expect(chunks.map((c) => c.length)).toEqual([50, 50, 20])
  })

  it('keeps each request under the 500-combination server cap across nodes', () => {
    // Three nodes, each individually under the cap, but summing to 600.
    const byNode = { a: combos(200), b: combos(200), c: combos(200) }
    const chunks = chunkNodeIdsForPreview(['a', 'b', 'c'], byNode)

    // Must split rather than send 600 in one request.
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(totalCombinations(chunk, byNode)).toBeLessThanOrEqual(500)
    }
    // Every node is still previewed exactly once.
    expect(chunks.flat().sort()).toEqual(['a', 'b', 'c'])
  })

  it('places a node whose combinations equal the cap in its own chunk', () => {
    const byNode = { a: combos(500), b: combos(1) }
    const chunks = chunkNodeIdsForPreview(['a', 'b'], byNode)
    expect(chunks).toEqual([['a'], ['b']])
  })
})
