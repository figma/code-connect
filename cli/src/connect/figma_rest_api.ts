import { isFetchError, request } from '../common/fetch'
import { logger } from '../common/logging'

const version = require('../../package.json').version

export function getApiUrl(figmaNode: string) {
  return 'https://api.figma.com/v1'
}

export function getHeaders(accessToken: string) {
  return {
    'X-Figma-Token': accessToken,
    'Content-Type': 'application/json',
    'User-Agent': `code-connect-cli/${version}`,
  }
}

// These typings are a subset of the Figma REST API
export namespace FigmaRestApi {
  export enum ComponentPropertyType {
    Boolean = 'BOOLEAN',
    InstanceSwap = 'INSTANCE_SWAP',
    Text = 'TEXT',
    Variant = 'VARIANT',
  }

  export interface ComponentPropertyDefinition {
    defaultValue: boolean | string
    type: ComponentPropertyType
    /**
     * All possible values for this property. Only exists on VARIANT properties
     */
    variantOptions?: string[]
    /**
     * Only exists on INSTANCE_SWAP  properties
     */
    preferredValues?: { type: string; key: string }[]
  }

  export interface Node {
    // we don't care about other node types
    type: 'COMPONENT' | 'COMPONENT_SET' | 'OTHER'
    name: string
    id: string
    children: Node[]
  }

  export interface Component extends Node {
    type: 'COMPONENT' | 'COMPONENT_SET'
    componentPropertyDefinitions: Record<string, ComponentPropertyDefinition>
  }
}

export async function getDocument(url: string, accessToken: string): Promise<FigmaRestApi.Node> {
  try {
    logger.info('Fetching component information from Figma...')
    const response = await request.get<{ document: FigmaRestApi.Node }>(url, {
      headers: getHeaders(accessToken),
    })

    if (response.response.status === 200) {
      logger.info('Successfully fetched component information from Figma')
      return response.data.document
    } else {
      logger.error(
        `Failed to get node information from Figma with status: ${response.response.status}`,
      )
      logger.debug('Failed to get node information from Figma with Body:', response.data)
      return Promise.reject()
    }
  } catch (err) {
    if (isFetchError(err)) {
      if (err.response) {
        logger.error(
          `Failed to get node data from Figma (${err.response.status}): ${err.response.status} ${err.data?.err ?? err.data?.message}`,
        )
      } else {
        logger.error(`Failed to get node data from Figma: ${err.message}`)
      }
      logger.debug(JSON.stringify(err.data))
    } else {
      logger.error(`Failed to create: ${err}`)
    }
    return Promise.reject()
  }
}
