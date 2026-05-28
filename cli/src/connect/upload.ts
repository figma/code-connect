import { CodeConnectJSON } from '../connect/figma_connect'
import { logger, underline, highlight, warn } from '../common/logging'
import { getApiUrl, getHeaders } from './figma_rest_api'
import { exitWithFeedbackMessage } from './helpers'
import { parseFigmaNode } from './validation'
import { isFetchError, request } from '../common/fetch'

const COMPONENT_BROWSER_CONFLICT_REASON = 'Code Connect UI mapping already exists'

// 429 (rate limit): extended schedule, ignore Retry-After to keep waits predictable.
const RETRY_DELAYS_MS_429 = [5_000, 15_000, 30_000, 45_000, 60_000, 75_000]
// 5xx (server error): original shorter schedule, still honoring Retry-After if provided.
const RETRY_DELAYS_MS_5XX = [5_000, 15_000, 30_000]

async function postWithRetry<T>(
  apiUrl: string,
  batch: CodeConnectJSON[],
  accessToken: string,
  useOAuth = false,
): Promise<{ data: T }> {
  let attempt429 = 0
  let attempt5xx = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await request.post<T>(apiUrl, batch, { headers: getHeaders(accessToken, useOAuth) })
    } catch (err) {
      if (!isFetchError(err)) throw err

      const status = err.response.status

      if (status === 429) {
        if (attempt429 === RETRY_DELAYS_MS_429.length) throw err
        const delayMs = RETRY_DELAYS_MS_429[attempt429]
        logger.warn(
          `Received 429, retrying in ${delayMs / 1000}s (attempt ${attempt429 + 1}/${RETRY_DELAYS_MS_429.length})...`,
        )
        await new Promise((resolve) => setTimeout(resolve, delayMs))
        attempt429++
      } else if (status >= 500) {
        if (attempt5xx === RETRY_DELAYS_MS_5XX.length) throw err
        const retryAfterSec = err.response.headers.get('Retry-After')
        const delayMs = retryAfterSec
          ? parseInt(retryAfterSec, 10) * 1_000
          : RETRY_DELAYS_MS_5XX[attempt5xx]
        logger.warn(
          `Received ${status}, retrying in ${delayMs / 1000}s (attempt ${attempt5xx + 1}/${RETRY_DELAYS_MS_5XX.length})...`,
        )
        await new Promise((resolve) => setTimeout(resolve, delayMs))
        attempt5xx++
      } else {
        throw err
      }
    }
  }
}

interface Args {
  accessToken: string
  useOAuth?: boolean
  docs: CodeConnectJSON[]
  batchSize?: number
  verbose: boolean
  apiUrl?: string
  force?: boolean
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

export async function upload({
  accessToken,
  useOAuth = false,
  docs,
  batchSize,
  verbose,
  apiUrl: apiUrlOverride,
  force,
}: Args) {
  const apiUrl =
    getApiUrl(docs?.[0]?.figmaNode ?? '', apiUrlOverride) +
    '/code_connect' +
    (force ? '?force=true' : '')

  // Strip internal fields before uploading to Figma
  const cleanedDocs = docs.map((doc) => {
    const { _codeConnectFilePath, ...cleanDoc } = doc
    return cleanDoc as CodeConnectJSON
  })

  try {
    logger.info(`Uploading to Figma...`)

    // Create a map from fileKey-nodeId to original docs for detailed output
    const docsMap = createDocsMap(cleanedDocs, verbose)

    let allUploadedNodes = new Set<string>()
    let allFailedNodes = new Map<string, string>() // key -> failure reason

    if (batchSize) {
      if (typeof batchSize !== 'number') {
        logger.error('Batch size must be a number')
        exitWithFeedbackMessage(1)
      }

      // batch together based on fileKey + nodeId as all variants etc of the same node should be uploaded together
      // Otherwise, the server will overwrite the previous upload
      const groupedDocs = cleanedDocs.reduce(
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

        const response = await postWithRetry<UploadResponse>(apiUrl, batch, accessToken, useOAuth)

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
      var size = Buffer.byteLength(JSON.stringify(cleanedDocs)) / (1024 * 1024)

      // Server has a limit of 5mb
      if (size > 5) {
        logger.error(`Failed to upload to Figma: The request is too large (${size.toFixed(2)}mb).`)
        logger.error(
          'Please try reducing the size of uploads by splitting them into smaller requests by running again with the --batch-size parameter. You can do also this by running on different subdirectories using the --dir flag or by iteratively adjusting the includes field in the configuration.',
        )
        exitWithFeedbackMessage(1)
      }

      logger.debug(`Uploading ${size.toFixed(2)}mb to Figma`)
      logger.info(`Uploading to ${apiUrl}`)

      const response = await postWithRetry<UploadResponse>(
        apiUrl,
        cleanedDocs,
        accessToken,
        useOAuth,
      )

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
      let hasComponentBrowserConflicts = false
      for (const [label, failedItems] of Object.entries(failedDocsByLabel)) {
        const conflicts = failedItems.filter((item) =>
          item.reason.includes(COMPONENT_BROWSER_CONFLICT_REASON),
        )
        const otherFailures = failedItems.filter(
          (item) => !item.reason.includes(COMPONENT_BROWSER_CONFLICT_REASON),
        )

        if (conflicts.length > 0) {
          hasComponentBrowserConflicts = true
          logger.warn(
            warn(
              `Warning: ${conflicts.length} node(s) already have UI-created Code Connect mappings in Figma for label "${label}":\n${conflicts.map((item) => `-> ${codeConnectStr(item.doc)}`).join('\n')}`,
            ),
          )
        }

        if (otherFailures.length > 0) {
          logger.error(
            `Failed to upload to Figma, for ${label}:\n${otherFailures.map((item) => `-> ${codeConnectStr(item.doc)} (${item.reason})`).join('\n')}`,
          )
        }
      }

      if (hasComponentBrowserConflicts && !force) {
        logger.warn(
          warn(
            `Re-run with --force to overwrite the existing UI-created mappings with your Code Connect files.`,
          ),
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
