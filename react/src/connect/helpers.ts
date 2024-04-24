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
    logger.error(`Invalid figma node URL: the provided node-id "${id}" is invalid`)
    process.exit(1)
  }
  return newId
}

export function parseNodeIds(figmaNodeUrls: string[]): string[] {
  const nodeIds: string[] = []
  for (const nodeURL of figmaNodeUrls) {
    const figmaNodeUrl = url.parse(nodeURL, true)
    const nodeId = figmaNodeUrl.query['node-id']
    if (nodeId && typeof nodeId === 'string') {
      const figmaNodeId = validateNodeId(nodeId)
      nodeIds.push(figmaNodeId)
    } else if (!nodeId) {
      logger.error(
        `Invalid figma node URL: the provided url "${nodeURL}" does not contain a node-id`,
      )
      process.exit(1)
    } else {
      logger.error(
        `Invalid figma node URL: the provided url "${nodeURL}" contains more than one node-id`,
      )
      process.exit(1)
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
