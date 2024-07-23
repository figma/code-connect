import { FigmaRestApi } from '../../../figma_rest_api'
import { autoLinkComponents } from '../../autolinking'
import polarisReact from './test_cases/polaris_react'
import vitaminWeb from './test_cases/vitamin_web'

const TEST_CASES = [vitaminWeb, polarisReact]

describe('autolinking', () => {
  TEST_CASES.forEach((testCase) => {
    const guidToName: Record<string, string> = {}

    testCase.figmaComponents.forEach(({ name, id }) => {
      guidToName[id] = name
    })

    it(`Autolinking meets acceptable threshold for ${testCase.name}`, () => {
      const linkedNodeIdsToPaths: Record<string, string> = {}
      autoLinkComponents({
        linkedNodeIdsToPaths,
        unconnectedComponents: testCase.figmaComponents as FigmaRestApi.Component[],
        componentPaths: testCase.componentPaths,
      })

      const result: Record<'correct' | 'falsePositives' | 'misses', Record<string, string>> = {
        correct: {},
        falsePositives: {},
        misses: {},
      }

      Object.entries(linkedNodeIdsToPaths).forEach(([nodeId, path]) => {
        const resultType =
          nodeId in testCase.perfectResult && path === testCase.perfectResult[nodeId]
            ? 'correct'
            : 'falsePositives'

        const componentName = guidToName[nodeId]
        result[resultType][`${componentName} (${nodeId})`] = path
      })

      Object.entries(testCase.perfectResult).forEach(([nodeId, path]) => {
        if (!linkedNodeIdsToPaths[nodeId]) {
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
  })
})
