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
    exitWithFeedbackMessage(1)
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
    } else if (Array.isArray(nodeId)) {
      for (const id of nodeId) {
        const figmaNodeId = validateNodeId(id)
        nodeIds.push(figmaNodeId)
      }
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
  nodeIds?: string[],
): FigmaRestApi.Component[] {
  const components: FigmaRestApi.Component[] = []
  const stack = [document]

  while (stack.length > 0) {
    const node = stack.pop()!
    if (nodeIds && nodeIds.includes(node.id)) {
      if (!isComponent(node)) {
        throw new Error('Specified node is not a component or a component set')
      }
      components.push(node)
    }
    if (!nodeIds && isComponent(node)) {
      components.push(node)
    }
    // don't traverse into component sets
    if (Array.isArray(node.children) && !isComponent(node)) {
      stack.push(...node.children)
    }
  }

  return components
}

/**
 * Gets the URL of a figma component
 *
 * @param component a published figma component
 * @returns a URL to the figma component
 */
export function figmaUrlOfComponent(component: FigmaRestApi.Component, fileKey: string) {
  const fileUrl = process.env.FILE_URL || `https://figma.com/file/`
  const nodeId = component.id.replace(':', '-')
  const urlId = nodeId.replace(':', '-')
  return `${fileUrl}${fileKey}/?node-id=${urlId}`
}

/**
 * removes the ID part of a component property name
 */
export function normalizePropName(name: string) {
  return name.replace(/#[0-9:]*/g, '')
}

/**
 * Displays a feedback/bugs issues link before exiting
 */
export function exitWithFeedbackMessage(exitCode: number): never {
  logger.info('Please raise any bugs or feedback at https://github.com/figma/code-connect/issues.')
  process.exit(exitCode)
}
