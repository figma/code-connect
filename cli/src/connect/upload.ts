import { CodeConnectJSON } from '../connect/figma_connect'
import { logger, underline, highlight } from '../common/logging'
import { getApiUrl, getHeaders } from './figma_rest_api'
import { exitWithFeedbackMessage } from './helpers'
import { parseFigmaNode } from './validation'
import { isFetchError, request } from '../common/fetch'

interface Args {
  accessToken: string
  docs: CodeConnectJSON[]
  batchSize?: number
  verbose: boolean
}

interface UploadResponse {
  status: number
  error: boolean
  meta: {
    success: boolean
    published_count: number
    failed_count: number
    published_nodes: Array<{ figmaNode: string; label: string }>
    failed_nodes: Array<{ figmaNode: string; label: string; reason: string }>
  }
}

/**
 * Returns a string representation of the code connect JSON
 * @param doc - The code connect JSON
 * @returns A string representation of the code connect JSON
 */
function codeConnectStr(doc: CodeConnectJSON): string {
  return `${highlight(doc.component ?? '')}${doc.variant ? `(${Object.entries(doc.variant).map(([key, value]) => `${key}=${value}`)})` : ''} ${underline(doc.figmaNode)}`
}

/**
 * Extracts the fileKey and nodeId from the Figma node URL and returns a key in the format of fileKey-nodeId
 * @param figmaNode - The Figma node URL
 * @returns The key in the format of fileKey-nodeId
 */
function getKeyFromFigmaNode(figmaNode: string): string {
  const url = new URL(figmaNode)

  // Extract fileKey from path (after /file/ or /design/)
  const pathMatch = url.pathname.match(/\/(file|design)\/([A-Za-z0-9]+)/)
  const fileKey = pathMatch ? pathMatch[2] : ''

  // Extract nodeId from query parameter and convert format (1-24 -> 1:24)
  const nodeIdParam = url.searchParams.get('node-id') || ''
  const nodeId = nodeIdParam.replace(/-/g, ':')

  return `${fileKey}-${nodeId}`
}

/**
 * Creates a map from fileKey-nodeId to original docs for easy lookup
 */
export function createDocsMap(
  docs: CodeConnectJSON[],
  verbose: boolean,
): Map<string, CodeConnectJSON[]> {
  const docsMap = new Map<string, CodeConnectJSON[]>()

  for (const doc of docs) {
    const parsedData = parseFigmaNode(verbose, doc)
    if (!parsedData) {
      continue
    }

    const mapKey = `${parsedData.fileKey}-${parsedData.nodeId}`
    if (!docsMap.has(mapKey)) {
      docsMap.set(mapKey, [])
    }

    docsMap.get(mapKey)?.push(doc)
  }

  return docsMap
}

export async function upload({ accessToken, docs, batchSize, verbose }: Args) {
  const apiUrl = getApiUrl(docs?.[0]?.figmaNode ?? '') + '/code_connect'

  try {
    logger.info(`Uploading to Figma...`)

    // Create a map from fileKey-nodeId to original docs for detailed output
    const docsMap = createDocsMap(docs, verbose)

    let allUploadedNodes = new Set<string>()
    let allFailedNodes = new Map<string, string>() // key -> failure reason

    if (batchSize) {
      if (typeof batchSize !== 'number') {
        logger.error('Batch size must be a number')
        exitWithFeedbackMessage(1)
      }

      // batch together based on fileKey + nodeId as all variants etc of the same node should be uploaded together
      // Otherwise, the server will overwrite the previous upload
      const groupedDocs = docs.reduce(
        (acc, doc) => {
          const parsedData = parseFigmaNode(verbose, doc)

          if (!parsedData) {
            exitWithFeedbackMessage(1)
          }

          const { fileKey, nodeId } = parsedData
          const accKey = fileKey + ',' + nodeId
          if (!acc[accKey]) {
            acc[accKey] = []
          }
          acc[accKey].push(doc)
          return acc
        },
        {} as Record<string, CodeConnectJSON[]>,
      )

      const batchedDocs: CodeConnectJSON[][] = []
      const nodeKeys = Object.keys(groupedDocs)

      for (let i = 0; i < nodeKeys.length; i += batchSize) {
        const batch: CodeConnectJSON[] = []
        for (let j = i; j < i + batchSize && j < nodeKeys.length; j++) {
          const nodeKey = nodeKeys[j]
          batch.push(...groupedDocs[nodeKey])
        }
        batchedDocs.push(batch)
      }

      let currentBatch = 1
      const noOfBatches = batchedDocs.length
      for (const batch of batchedDocs) {
        process.stderr.write('\x1b[2K\x1b[0G')
        process.stderr.write(`Uploading batch ${currentBatch}/${noOfBatches}`)

        var size = Buffer.byteLength(JSON.stringify(batch)) / (1024 * 1024)

        // Server has a limit of 5mb
        if (size > 5) {
          logger.error(
            `Failed to upload to Figma: The request is too large (${size.toFixed(2)}mb).`,
          )
          logger.error(
            'Please try reducing the size of uploads by splitting them into smaller requests by running again and decreasing the --batch-size parameter.',
          )
          exitWithFeedbackMessage(1)
        }

        logger.debug(`Uploading ${size.toFixed(2)}mb to Figma`)

        const response = await request.post<UploadResponse>(apiUrl, batch, {
          headers: getHeaders(accessToken),
        })

        const data = response.data

        if (data.meta?.published_nodes) {
          data.meta.published_nodes.forEach((node) =>
            allUploadedNodes.add(getKeyFromFigmaNode(node.figmaNode)),
          )
        }
        if (data.meta?.failed_nodes) {
          data.meta.failed_nodes.forEach((node) =>
            allFailedNodes.set(getKeyFromFigmaNode(node.figmaNode), node.reason),
          )
        }

        currentBatch++
      }
      process.stderr.write(`\n`)
    } else {
      var size = Buffer.byteLength(JSON.stringify(docs)) / (1024 * 1024)

      // Server has a limit of 5mb
      if (size > 5) {
        logger.error(`Failed to upload to Figma: The request is too large (${size.toFixed(2)}mb).`)
        logger.error(
          'Please try reducing the size of uploads by splitting them into smaller requests by running again with the --batch-size parameter. You can do also this by running on different subdirectories using the --dir flag or by iteratively adjusting the includes field in the configuration.',
        )
        exitWithFeedbackMessage(1)
      }

      logger.debug(`Uploading ${size.toFixed(2)}mb to Figma`)

      const response = await request.post<UploadResponse>(apiUrl, docs, {
        headers: getHeaders(accessToken),
      })

      const data = response.data

      if (data.meta?.published_nodes) {
        data.meta.published_nodes.forEach((node) =>
          allUploadedNodes.add(getKeyFromFigmaNode(node.figmaNode)),
        )
      }
      if (data.meta?.failed_nodes) {
        data.meta.failed_nodes.forEach((node) =>
          allFailedNodes.set(getKeyFromFigmaNode(node.figmaNode), node.reason),
        )
      }
    }

    // Separate successful and failed uploads
    const successfulDocsByLabel: Record<string, CodeConnectJSON[]> = {}
    const failedDocsByLabel: Record<string, Array<{ doc: CodeConnectJSON; reason: string }>> = {}

    for (const [mapKey, nodeDocs] of docsMap.entries()) {
      for (const doc of nodeDocs) {
        const label = doc.label
        const docKey = getKeyFromFigmaNode(doc.figmaNode)
        const isUploaded = allUploadedNodes.has(docKey)
        const failureReason = allFailedNodes.get(docKey)

        if (isUploaded) {
          if (!successfulDocsByLabel[label]) {
            successfulDocsByLabel[label] = []
          }
          successfulDocsByLabel[label].push(doc)
        } else if (failureReason) {
          if (!failedDocsByLabel[label]) {
            failedDocsByLabel[label] = []
          }
          failedDocsByLabel[label].push({ doc, reason: failureReason })
        }
      }
    }

    for (const [label, docs] of Object.entries(successfulDocsByLabel)) {
      logger.info(
        `Successfully uploaded to Figma, for ${label}:\n${docs.map((doc) => `-> ${codeConnectStr(doc)}`).join('\n')}`,
      )
    }

    if (Object.keys(failedDocsByLabel).length > 0) {
      for (const [label, failedItems] of Object.entries(failedDocsByLabel)) {
        logger.error(
          `Failed to upload to Figma, for ${label}:\n${failedItems.map((item) => `-> ${codeConnectStr(item.doc)} (${item.reason})`).join('\n')}`,
        )
      }
    }
  } catch (err) {
    if (isFetchError(err)) {
      if (err.response) {
        logger.error(
          `Failed to upload to Figma (${err.response.status}): ${err.response.status} ${err.data?.message}`,
        )
      } else {
        logger.error(`Failed to upload to Figma: ${err.message}`)
      }
      logger.debug(JSON.stringify(err?.data))
    } else {
      logger.error(`Failed to upload to Figma: ${err}`)
    }
    exitWithFeedbackMessage(1)
  }
}
