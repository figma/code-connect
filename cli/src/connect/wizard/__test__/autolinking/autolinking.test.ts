import { FigmaRestApi } from '../../../figma_rest_api'
import { autoLinkComponents, getBestMatchingExportWithinFile } from '../../autolinking'


const TEST_CASES = [
]

describe('autolinking', () => {
  TEST_CASES.forEach((testCase) => {
    const guidToName: Record<string, string> = {}

    testCase.figmaComponents.forEach(({ name, id }) => {
      guidToName[id] = name
    })

    it(`Autolinking meets acceptable threshold for ${testCase.name}`, () => {
      const linkedNodeIdsToFilepathExports: Record<string, string> = {}
      autoLinkComponents({
        linkedNodeIdsToFilepathExports,
        unconnectedComponents: testCase.figmaComponents as FigmaRestApi.Component[],
        filepathExports: testCase.filepathExports,
      })

      const result: Record<'correct' | 'falsePositives' | 'misses', Record<string, string>> = {
        correct: {},
        falsePositives: {},
        misses: {},
      }

      Object.entries(linkedNodeIdsToFilepathExports).forEach(([nodeId, path]) => {
        const resultType =
          nodeId in testCase.perfectResult && path === testCase.perfectResult[nodeId]
            ? 'correct'
            : 'falsePositives'

        const componentName = guidToName[nodeId]
        result[resultType][`${componentName} (${nodeId})`] = path
      })

      Object.entries(testCase.perfectResult).forEach(([nodeId, path]) => {
        if (!linkedNodeIdsToFilepathExports[nodeId]) {
          const componentName = guidToName[nodeId]
          result.misses[`${componentName} (${nodeId})`] = path
        }
      })

      const passRate =
        Object.keys(result.correct).length / Object.keys(testCase.perfectResult).length

      if (passRate < testCase.passThreshold) {
        console.error(JSON.stringify(result, null, 2))
      }

      expect(passRate).toBeGreaterThanOrEqual(testCase.passThreshold)
    })

    it('works for files without exports', () => {
      const linkedNodeIdsToFilepathExports: Record<string, string> = {}
      autoLinkComponents({
        linkedNodeIdsToFilepathExports,
        unconnectedComponents: [
          {
            name: 'Card',
            id: '111:111',
          },
          {
            name: 'Modal',
            id: '222:222',
          },
          {
            name: 'Hero',
            id: '333:333',
          },
        ] as FigmaRestApi.Component[],
        filepathExports: [
          '/components/Modal.tsx',
          '/components/Button.tsx',
          '/components/Card.tsx',
        ],
      })
      expect(linkedNodeIdsToFilepathExports).toEqual({
        '111:111': '/components/Card.tsx',
        '222:222': '/components/Modal.tsx',
      })
    })

    describe('getBestMatchingExportWithinFile', () => {
      it('returns a single export', () => {
        const result = getBestMatchingExportWithinFile({
          filepath: 'my/file.tsx',
          exportOptions: [
            {
              title: 'SomeExport',
              value: 'my/file.tsx~SomeExport',
            },
          ],
          nameToMatch: 'somethingElse',
        })
        expect(result).toBe('my/file.tsx~SomeExport')
      })
      it('prioritizes default exports', () => {
        const result = getBestMatchingExportWithinFile({
          filepath: 'my/file.tsx',
          exportOptions: [
            {
              title: 'MatchingExport',
              value: 'my/file.tsx~MatchingExport',
            },
            {
              title: 'default',
              value: 'my/file.tsx~default',
            },
            {
              title: 'AnotherExport',
              value: 'my/file.tsx~AnotherExport',
            },
          ],
          nameToMatch: 'MatchingExport',
        })
        expect(result).toBe('my/file.tsx~default')
      })
      it('finds closest match', () => {
        const result = getBestMatchingExportWithinFile({
          filepath: 'my/file.tsx',
          exportOptions: [
            {
              title: 'ButtonProps',
              value: 'my/Button.tsx~ButtonProps',
            },
            {
              title: 'Button',
              value: 'my/Button.tsx~Button',
            },
            {
              title: 'SecondaryButton',
              value: 'my/Button.tsx~SecondaryButton',
            },
          ],
          nameToMatch: 'Button',
        })
        expect(result).toBe('my/Button.tsx~Button')
      })
    })
  })
})
