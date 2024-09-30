import { ComponentTypeSignature } from '../../../../react/parser'
import { FigmaRestApi } from '../../../figma_rest_api'
import { PropMapping } from '../../../parser_executable_types'

export type PropMappingTestCase = {
  exportName: string // TODO maybe get rid?
  signature: ComponentTypeSignature
  componentPropertyDefinitions: Record<string, FigmaRestApi.ComponentPropertyDefinition>
  perfectResult: PropMapping
}

export type PropMappingTestSuite = {
  name: string
  testCases: PropMappingTestCase[]
}
