import path from 'path'
import { ReactProjectInfo, getProjectInfo, getReactProjectInfo } from '../../../project'
import {
  generatePropMapping,
  extractSignatureAndGeneratePropMapping,
  generateValueMapping,
} from '../../prop_mapping'
import { FigmaRestApi } from '../../../figma_rest_api'

import basic from './basic'

const PROP_MAPPING_TEST_SUITES = [
  basic,
]

describe('Prop mapping', () => {
  describe('generatePropMapping', () => {
    PROP_MAPPING_TEST_SUITES.forEach((suite) => {
      it(`Prop mapping meets acceptable threshold for ${suite.name}`, () => {
        /**
         * For each suite of components, get the total number of props that have a mapping
         * in the test data, as well as the count of mappings we've correctly generated.
         * We then divide correct / total to get the overall success rate
         */
        const [totalProps, totalCorrect] = suite.testCases.reduce(
          ([totalProps, totalCorrect], testCase) => {
            const actualResult = generatePropMapping({
              componentPropertyDefinitions: testCase.componentPropertyDefinitions,
              signature: testCase.signature,
            })

            // count correct prop mappings for single component
            let numCorrect = 0
            Object.keys(testCase.perfectResult).forEach((prop) => {
              if (
                JSON.stringify(actualResult[prop]) === JSON.stringify(testCase.perfectResult[prop])
              ) {
                numCorrect++
              }
            })

            return [
              totalProps + Object.keys(testCase.perfectResult).length,
              totalCorrect + numCorrect,
            ]
          },
          [0, 0],
        )

        const percentageCorrect = totalCorrect / totalProps

        expect(percentageCorrect).toBeGreaterThanOrEqual(suite.passThreshold)
      })
    })
  })

  describe('generateValueMapping', () => {
    it('creates value mapping using fuzzy matching', () => {
      const result = generateValueMapping('"input" | "filter" | "single-choice" | "action"', {
        type: FigmaRestApi.ComponentPropertyType.Variant,
        defaultValue: 'Filter',
        variantOptions: [
          'Action',
          'Filter',
          'Filter + badge',
          'Input',
          'Input + icon',
          'Input + img',
          'Single choice',
        ],
      })

      expect(result).toEqual({
        'Single choice': 'single-choice',
        Input: 'input',
        Filter: 'filter',
        Action: 'action',
      })
    })
  })

  describe('extractSignatureAndGeneratePropMapping', () => {
    let projectInfo: ReactProjectInfo
    let componentsFilepath: string

    beforeEach(async () => {
      projectInfo = await getProjectInfo(path.join(__dirname, 'tsProgram', 'react'), '').then(
        (res) => getReactProjectInfo(res as ReactProjectInfo),
      )
      componentsFilepath = path.join(__dirname, 'tsProgram', 'react', 'Components.tsx')
    })

    it('Generates a prop mapping from a file, export, and Figma component', async () => {
      const result = await extractSignatureAndGeneratePropMapping({
        exportName: 'LotsOfProps',
        filepath: componentsFilepath,
        projectInfo,
        componentPropertyDefinitions: {
          'Has Icon': {
            type: FigmaRestApi.ComponentPropertyType.Boolean,
            defaultValue: false,
          },
          Title: {
            type: FigmaRestApi.ComponentPropertyType.Text,
            defaultValue: '',
          },
          'Fuzzy Match String': {
            type: FigmaRestApi.ComponentPropertyType.Text,
            defaultValue: '',
          },
        },
        cmd: {} as any,
      })
      expect(result).toEqual({
        hasIcon: {
          kind: 'boolean',
          args: {
            figmaPropName: 'Has Icon',
          },
        },
        title: {
          kind: 'string',
          args: {
            figmaPropName: 'Title',
          },
        },
        fuzzyMatchingString: {
          kind: 'string',
          args: {
            figmaPropName: 'Fuzzy Match String',
          },
        },
      })
    })
  })
})
