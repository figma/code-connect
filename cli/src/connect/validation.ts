import * as url from 'url'
import { chunk } from 'lodash'

import { CodeConnectJSON } from '../connect/figma_connect'
import { logger } from '../common/logging'
import { validateNodeId } from './helpers'
import { getApiUrl, getHeaders } from './figma_rest_api'
import { BaseCommand } from '../commands/connect'
import { isFetchError, request } from '../common/fetch'

export function parseFigmaNode(
  verbose: boolean,
  doc: CodeConnectJSON,
  silent: boolean = false,
): { fileKey: string; nodeId: string } | null {
  const figmaNodeUrl = url.parse(doc.figmaNode, true)
  const fileKeyMatch = figmaNodeUrl.path?.match(/(file|design)\/([a-zA-Z0-9]+)/)
  if (!fileKeyMatch) {
    if (!silent || verbose) {
      logger.error(`Failed to parse ${doc.figmaNode}`)
    }
    return null
  }
  const fileKey = fileKeyMatch[2]
  const nodeId = figmaNodeUrl.query['node-id']
  if (nodeId && typeof nodeId === 'string') {
    const figmaNodeId = validateNodeId(nodeId)
    return { fileKey, nodeId: figmaNodeId }
  } else {
    if (!silent || verbose) {
      logger.error(`Failed to get node-id from ${doc.figmaNode}`)
    }
    return null
  }
}

async function fetchNodeInfo(
  baseApiUrl: string,
  fileKey: string,
  nodeIdsChunk: string[],
  accessToken: string,
): Promise<any> {
  try {
    const response = await request.get<{ message: string; nodes: any }>(
      `${baseApiUrl}${fileKey}/nodes?ids=${nodeIdsChunk.join(',')}`,
      { headers: getHeaders(accessToken) },
    )
    if (response.response.status !== 200) {
      logger.error(
        'Failed to fetch node info: ' + response.response.status + ' ' + response.data?.message,
      )
      return null
    }
    return response.data.nodes
  } catch (err) {
    if (isFetchError(err)) {
      if (err.response) {
        logger.error(
          `Failed to to fetch node info (${err.response.status}): ${err.response.status} ${err.data?.err ?? err.data?.message}`,
        )
      } else {
        logger.error(`Failed to to fetch node info: ${err.message}`)
      }
      logger.debug(JSON.stringify(err.data))
    } else {
      logger.error(`Failed to to fetch node info: ${err}`)
    }
    return null
  }
}

function validateProps(doc: CodeConnectJSON, document: any): boolean {
  if (doc.templateData && doc.templateData?.props) {
    let propsValid = true
    const codeConnectProps = Object.keys(doc.templateData.props ?? {})

    for (let i = 0; i < codeConnectProps.length; i++) {
      const codeConnectProp = doc.templateData?.props[codeConnectProps[i]]
      if (codeConnectProp.kind === 'children') {
        const codeConnectLayerNames = codeConnectProp.args.layers
        // Get all layer names in the figma doc
        const figmaLayerNames: string[] = []
        const getLayerNames = (layer: any) => {
          if (layer.name) {
            figmaLayerNames.push(layer.name)
          }
          if (layer.children) {
            layer.children.forEach((child: any) => getLayerNames(child))
          }
        }
        getLayerNames(document)
        // And make sure that the layer names in the code connect file are present in the figma doc
        for (const codeConnectLayerName of codeConnectLayerNames) {
          const regex = new RegExp('^' + codeConnectLayerName.replace('*', '.*'))
          if (figmaLayerNames.every((name) => !regex.test(name))) {
            logger.error(
              `Validation failed for ${doc.component} (${doc.figmaNode}): The layer "${codeConnectLayerName}" does not exist on the Figma component`,
            )
            propsValid = false
          }
        }
        continue
      }
      if (
        codeConnectProp.kind === 'boolean' ||
        codeConnectProp.kind === 'enum' ||
        codeConnectProp.kind === 'string'
      ) {
        const codeConnectFigmaPropName = codeConnectProp?.args?.figmaPropName

        if (
          !document.componentPropertyDefinitions ||
          !Object.keys(document.componentPropertyDefinitions).find((figmaProp) =>
            propMatches(figmaProp, codeConnectFigmaPropName, document.componentPropertyDefinitions),
          )
        ) {
          logger.error(
            `Validation failed for ${doc.component} (${doc.figmaNode}): The property "${codeConnectFigmaPropName}" does not exist on the Figma component`,
          )
          propsValid = false
        }
      }
    }

    if (!propsValid) {
      return false
    }
  }
  return true
}

function getPropName(componentPropertyDefinitions: any, propName: string): string {
  const prop = componentPropertyDefinitions[propName]
  if (prop.type === 'VARIANT') {
    return propName
  }

  // non Variant Keys are of the form "name#id"
  // We have to take the last one in case the name contains #'s
  const lastIndex = propName.lastIndexOf('#')
  if (lastIndex !== -1) {
    return propName.substring(0, lastIndex)
  }
  return propName
}

function propMatches(
  figmaProp: any,
  codeConnectPropName: string,
  componentPropertyDefinitions: any,
): boolean {
  const figmaPropName = getPropName(componentPropertyDefinitions, figmaProp)
  return figmaPropName === codeConnectPropName
}




export const STATE_BOOLEAN_VALUE_PAIRS = [
  ['yes', 'no'],
  ['true', 'false'],
  ['on', 'off'],
]

function isVariantBoolean(variantPossibleValues: string[]) {
  if (variantPossibleValues.length === 2) {
    const lowerCaseOptions = variantPossibleValues.map((p) => p.toLowerCase())
    for (const pair of STATE_BOOLEAN_VALUE_PAIRS) {
      const i = lowerCaseOptions.indexOf(pair[0]!)
      const j = lowerCaseOptions.indexOf(pair[1]!)
      if (i !== -1 && j !== -1) {
        return true
      }
    }
  }
  return false
}

function validateVariantRestrictions(doc: CodeConnectJSON, document: any): boolean {
  if (doc.variant) {
    let variantRestrictionsValid = true
    const codeConnectVariantRestrictions = Object.keys(doc.variant)

    for (let i = 0; i < codeConnectVariantRestrictions.length; i++) {
      const variantRestriction: any = codeConnectVariantRestrictions[i]

      const match = Object.keys(document.componentPropertyDefinitions ?? {}).find((figmaProp) =>
        propMatches(figmaProp, variantRestriction, document.componentPropertyDefinitions),
      )
      if (!match) {
        logger.error(
          `Validation failed for ${doc.component} (${doc.figmaNode}): The property "${variantRestriction}" does not exist on the Figma component`,
        )
        variantRestrictionsValid = false
        continue
      }

      const variantRestrictionValue = doc.variant[variantRestriction]
      const variantOrProp = document.componentPropertyDefinitions[match]

      // Only check `variantOptions` for Variants, and not for props, since props
      // don't have a set of possible values we can check against
      const isValidBooleanVariant =
        typeof variantRestrictionValue === 'boolean' &&
        Array.isArray(variantOrProp.variantOptions) &&
        isVariantBoolean(variantOrProp.variantOptions)

      const isValidVariantValue =
        variantOrProp.variantOptions?.includes(variantRestrictionValue) || isValidBooleanVariant

      if (variantOrProp.type === 'VARIANT' && !isValidVariantValue) {
        logger.error(
          `Validation failed for ${doc.component} (${doc.figmaNode}): The Figma Variant "${match}" does not have an option for ${variantRestrictionValue}`,
        )
        variantRestrictionsValid = false
        continue
      }
    }

    if (!variantRestrictionsValid) {
      return false
    }
  }
  return true
}

export function validateDoc(doc: CodeConnectJSON, figmaNode: any, nodeId: string): boolean {
  if (!figmaNode || !figmaNode.document) {
    logger.error(
      `Validation failed for ${doc.component} (${doc.figmaNode}): node not found in file`,
    )
    return false
  }

  const document = figmaNode.document
  if (document.type !== 'COMPONENT' && document.type !== 'COMPONENT_SET') {
    logger.error(
      `Validation failed for ${doc.component} (${doc.figmaNode}): corresponding node is not a component or component set`,
    )
    return false
  }

  const component = figmaNode.components[nodeId]
  if (component && component.componentSetId) {
    logger.error(
      `Validation failed for ${doc.component} (${doc.figmaNode}): node is not a top level component or component set. Please check that the node is not a variant`,
    )
    return false
  }

  const propsValid = validateProps(doc, document)
  if (!propsValid) {
    return false
  }

  const variantRestrictionsValid = validateVariantRestrictions(doc, document)
  if (!variantRestrictionsValid) {
    return false
  }

  return true
}

export async function validateDocs(
  cmd: BaseCommand,
  accessToken: string,
  docs: CodeConnectJSON[],
): Promise<boolean> {
  let baseApiUrl = getApiUrl(docs?.[0]?.figmaNode ?? '') + '/files/'

  const fileKeyToNodeIds: { [key: string]: any } = {}
  let valid = true
  docs.forEach((doc) => {
    const parsedNode = parseFigmaNode(cmd.verbose, doc)
    if (!parsedNode) {
      valid = false
      return
    }
    fileKeyToNodeIds[parsedNode.fileKey] ||= {}
    fileKeyToNodeIds[parsedNode.fileKey][parsedNode.nodeId] ||= []
    fileKeyToNodeIds[parsedNode.fileKey][parsedNode.nodeId].push(doc)
  })

  if (!valid) {
    return false
  }

  logger.debug('fileKeyToNodeIds')
  logger.debug(JSON.stringify(fileKeyToNodeIds, null, 2))

  const fileKeys = Object.keys(fileKeyToNodeIds)
  for (let i = 0; i < fileKeys.length; i++) {
    const fileKey = fileKeys[i]
    logger.debug(`Validating file ${fileKey}`)
    const nodeMap = fileKeyToNodeIds[fileKey]
    const nodeIds = Object.keys(nodeMap)
    logger.debug(`Validating ${nodeIds.length} nodes`)
    const chunks = chunk(nodeIds, 400)

    for (let batch = 0; batch < chunks.length; batch++) {
      const nodeIdsChunk = chunks[batch]
      logger.debug(`Running for ${baseApiUrl + fileKey + '/nodes?ids=' + nodeIdsChunk.join(',')}`)
      const nodeMapRet = await fetchNodeInfo(baseApiUrl, fileKey, nodeIdsChunk, accessToken)
      if (!nodeMapRet) {
        return false
      }

      valid =
        valid &&
        nodeIdsChunk
          .map((nodeId: string) => {
            return nodeMap[nodeId]
              .map((doc: CodeConnectJSON) => validateDoc(doc, nodeMapRet[nodeId], nodeId))
              .every(Boolean)
          })
          .every(Boolean)
    }
  }
  return valid
}
