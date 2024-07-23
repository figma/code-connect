import { FigmaRestApi } from '../../../figma_rest_api'

export type AutolinkingTestCase = {
  name: string
  passThreshold: number
  figmaComponents: {
    name: FigmaRestApi.Component['name']
    id: FigmaRestApi.Component['id']
  }[]
  componentPaths: string[]
  perfectResult: Record<string, string>
}
