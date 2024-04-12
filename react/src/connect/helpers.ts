import { FigmaRestApi } from './figma_rest_api'
import * as url from 'url'
import { logger } from '../common/logging'

const guidRegex = /^I?[0-9]+:[0-9]+(;[0-9]+:[0-9]+)*$/

export function isComponent(node: FigmaRestApi.Node): node is FigmaRestApi.Component {
  return node.type === 'COMPONENT' || node.type === 'COMPONENT_SET'
}

export const validateNodeId = function (id: string): string {
  const newId = id.replace('-', ':')
  if (!guidRegex.test(newId)) {
    throw new Error(`ID ${id} is not a valid node_id`)
  }
  return newId
}

export function parseNodeIds(figmaNodeUrls: string[]): string[] {
  const nodeIds: string[] = []
  for (const nodeURL of figmaNodeUrls) {
    const figmaNodeUrl = url.parse(nodeURL, true)
    const nodeId = figmaNodeUrl.query['node-id']
    if (typeof nodeId !== 'string') {
      logger.error(`Invalid figma node URL: ${nodeURL}, more than one node-id given`)
      process.exit(1)
    }
    if (nodeId) {
      const figmaNodeId = validateNodeId(nodeId)
      nodeIds.push(figmaNodeId)
    }
  }
  return nodeIds
}

export function parseFileKey(figmaNodeUrl: string) {
  return figmaNodeUrl.match(/(?:file|design)\/([a-zA-Z0-9]+)/)?.[1]
}

/**
 * Parses components from a Rest API response
 * @param document
 * @param nodeIds
 * @returns
 */
export function findComponentsInDocument(
  document: FigmaRestApi.Node,
  nodeIds: string[],
): FigmaRestApi.Component[] {
  const components: FigmaRestApi.Component[] = []
  const stack = [document]

  while (stack.length > 0) {
    const node = stack.pop()!
    if (nodeIds.includes(node.id)) {
      if (!isComponent(node)) {
        throw new Error('Specified node is not a component or a component set')
      }
      components.push(node)
    }
    if (Array.isArray(node.children)) {
      stack.push(...node.children)
    }
  }

  return components
}
