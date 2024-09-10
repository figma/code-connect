import { FigmaRestApi, getApiUrl, getDocument } from '../connect/figma_rest_api'
import {
  figmaUrlOfComponent,
  findComponentsInDocument,
  normalizePropName,
  parseFileKey,
  parseNodeIds,
} from '../connect/helpers'

export interface ComponentInfo {
  id: string
  name: string
  fileKey: string
  figmaUrl: string
}

export interface FigmaConnectClient {
  /**
   * Fetches components from a figma file, filtering out components that don't
   * match the provided function.
   *
   * @param fileOrNode figma URL
   * @param match a function that returns true if the component should be
   * included
   * @returns a list of components
   */
  getComponents: (fileOrNode: string) => Promise<(FigmaRestApi.Component & ComponentInfo)[]>
}

require('dotenv').config()

/**
 * Fetch components from a figma file. If the `node-id` query parameter is used,
 * only components within those frames will be included. This is useful if your
 * file is very large, as this will speed up the query.
 *
 * @param fileOrNode a figma file URL
 * @param match a function that returns true if the component should be included
 * @returns
 */
export async function getComponents(fileOrNode: string) {
  if (!process.env.FIGMA_ACCESS_TOKEN) {
    throw new Error('FIGMA_ACCESS_TOKEN is not set')
  }

  const fileKey = parseFileKey(fileOrNode)
  if (!fileKey) {
    throw new Error(`Invalid Figma file URL: ${fileOrNode}, file key missing`)
  }

  const nodeIds = parseNodeIds([fileOrNode])
  let apiUrl = getApiUrl(fileOrNode ?? '') + `/files/${fileKey}`
  if (nodeIds.length > 0) {
    apiUrl += `?ids=${nodeIds.join(',')}`
  }

  const doc = await getDocument(apiUrl, process.env.FIGMA_ACCESS_TOKEN)

  // `doc` in this case will only include the top frame(s) passed via `ids`. We omit the
  // nodeIds arg here because we want to return all components within the frame(s)
  return findComponentsInDocument(doc).map((component) => ({
    ...component,
    fileKey,
    figmaUrl: figmaUrlOfComponent(component, fileKey),
    componentPropertyDefinitions:
      component.type === 'COMPONENT_SET'
        ? Object.keys(component.componentPropertyDefinitions).reduce((result, key) => {
            return {
              ...result,
              // this removes the ID prefix from property names e.g #123:name -> name
              [normalizePropName(key)]: component.componentPropertyDefinitions[key],
            }
          }, {})
        : undefined,
  }))
}
