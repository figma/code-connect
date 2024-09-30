import { IntrinsicKind } from '../../../../connect/intrinsics'
import { FigmaRestApi } from '../../../figma_rest_api'
import { PropMappingTestSuite } from './types'

const BASIC: PropMappingTestSuite = {
  name: 'basic',
  testCases: [
    {
      exportName: 'basic',
      signature: {
        text: 'string',
        isExpanded: 'false | true',
        disabled: 'false | true',
      },
      componentPropertyDefinitions: {
        Text: {
          type: FigmaRestApi.ComponentPropertyType.Text,
          defaultValue: '',
        },
        'Is Expanded': {
          type: FigmaRestApi.ComponentPropertyType.Boolean,
          defaultValue: false,
        },
      },
      perfectResult: {
        isExpanded: {
          kind: IntrinsicKind.Boolean,
          args: {
            figmaPropName: 'Is Expanded',
          },
        },
        text: {
          kind: IntrinsicKind.String,
          args: {
            figmaPropName: 'Text',
          },
        },
      },
    },
  ],
}

export default BASIC
