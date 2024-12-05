import {
  MatchableNameTypes,
  buildMatchableNamesMap,
  generateValueMapping,
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

    it('creates value mapping from mixed type options', () => {
      const result = generateValueMapping('false | true | 9 | "indeterminate"', {
        type: FigmaRestApi.ComponentPropertyType.Variant,
        defaultValue: 'false',
        variantOptions: ['false', 'true', '9', 'indeterminate'],
      })

      expect(result).toEqual({
        false: false,
        true: true,
        '9': 9,
        indeterminate: 'indeterminate',
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
        'Has Icon': [
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
