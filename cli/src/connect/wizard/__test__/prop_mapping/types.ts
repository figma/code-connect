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
  passThreshold: number // TODO maybe we want to be more granular with this - false positives, % rates for different helpers?
  testCases: PropMappingTestCase[]
}
