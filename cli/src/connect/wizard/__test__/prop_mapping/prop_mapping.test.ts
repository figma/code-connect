import path from 'path'
import { ReactProjectInfo, getProjectInfo, getReactProjectInfo } from '../../../project'
import {
  generatePropMapping,
  extractSignatureAndGeneratePropMapping,
  generateValueMapping,
  buildMatchableNamesMap,
  MatchableNameTypes,
} from '../../prop_mapping'
import { FigmaRestApi } from '../../../figma_rest_api'
import { runPropMappingBenchmarking } from './benchmarking_helpers'

describe('Prop mapping', () => {

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
        propMapping: {
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
        },
        signature: {
          anOptionalString: '?string',
          children: 'React.ReactNode',
          count: 'number',
          fuzzyMatchingString: 'string',
          hasIcon: 'false | true',
          onClick: 'React.MouseEventHandler<HTMLDivElement>',
          title: 'string',
        },
      })
    })
  })

  describe('buildMatchableNamesMap', () => {
    it('Builds a map of matchable names to their corresponding definitions, adding to array for any collisions', () => {
      const componentPropertyDefinitions = {
        'Has Icon': {
          type: FigmaRestApi.ComponentPropertyType.Boolean,
          defaultValue: false,
        },
        Action: {
          type: FigmaRestApi.ComponentPropertyType.Text,
          defaultValue: '',
        },
        Variant: {
          type: FigmaRestApi.ComponentPropertyType.Variant,
          defaultValue: 'Filter',
          variantOptions: ['Action', 'Filter'],
        },
      }

      const result = buildMatchableNamesMap(componentPropertyDefinitions)
      expect(result).toEqual({
        Action: [
          {
            name: 'Action',
            type: MatchableNameTypes.Property,
          },
          {
            name: 'Action',
            type: MatchableNameTypes.VariantValue,
            variantProperty: 'Variant',
          },
        ],
        Filter: [
          {
            name: 'Filter',
            type: MatchableNameTypes.VariantValue,
            variantProperty: 'Variant',
          },
        ],
        HasIcon: [
          {
            name: 'Has Icon',
            type: MatchableNameTypes.Property,
          },
        ],
        Variant: [
          {
            name: 'Variant',
            type: MatchableNameTypes.Property,
          },
        ],
      })
    })
  })
})
