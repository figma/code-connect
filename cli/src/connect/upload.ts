import { CodeConnectJSON } from '../connect/figma_connect'
import { logger, underline, highlight, warn, success } from '../common/logging'
import { getApiUrl, getHeaders } from './figma_rest_api'
import { exitWithFeedbackMessage } from './helpers'
import { parseFigmaNode } from './validation'
import { isFetchError, request } from '../common/fetch'

const PRO_LIBRARY_REASON =
  'Cannot publish Code Connect mappings to this library because another library is active for this Professional plan.'
const PRO_FRAMEWORK_REASON =
  /Cannot publish (.+?) Code Connect mappings because (.+?) is the active framework for this Professional plan\./
const PRO_LIBRARY_ERROR_CODE = 'CODE_CONNECT_PRO_LIBRARY_INACTIVE'
const PRO_FRAMEWORK_ERROR_CODE = 'CODE_CONNECT_PRO_FRAMEWORK_INACTIVE'

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
      if (!isFetchError(err) || !err.response) throw err

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

interface UploadFailure {
  figmaNode: string
  label: string
  reason: string
  errors?: Array<{
    code: string
    active_framework?: string
  }>
}

interface UploadResponse {
  status: number
  error: boolean
  meta: {
    success: boolean
    published_count: number
    failed_count: number
    published_nodes: Array<{ figmaNode: string; label: string }>
    failed_nodes: UploadFailure[]
    new_active_selections?: Array<{
      file_key: string
      library_name: string
      framework: string
    }>
  }
}

function logNewActiveSelections(
  selections: UploadResponse['meta']['new_active_selections'],
  docs: CodeConnectJSON[],
): void {
  for (const { file_key: fileKey, library_name: libraryName, framework } of selections ?? []) {
    const libraryFileUrl = getLibraryFileUrl(fileKey, docs)
    logger.info(
      [
        '',
        success(highlight('Code Connect active selection set')),
        '',
        `  Library:   ${highlight(libraryName)}`,
        `             ${underline(libraryFileUrl)}`,
        `  Framework: ${highlight(framework)}`,
        '',
        "If this wasn't intentional, a plan admin can change the active library",
        "and framework in Figma's Code Connect settings.",
        '',
      ].join('\n'),
    )
  }
}

/**
 * Returns a string representation of the code connect JSON
 * @param doc - The code connect JSON
 * @returns A string representation of the code connect JSON
 */
function codeConnectStr(doc: CodeConnectJSON, separator = ' '): string {
  return `${highlight(doc.component ?? '')}${doc.variant ? `(${Object.entries(doc.variant).map(([key, value]) => `${key}=${value}`)})` : ''}${separator}${underline(doc.figmaNode)}`
}

function isProFailure({ errors, reason }: UploadFailure): boolean {
  if (errors !== undefined) {
    return errors.some(
      ({ code }) => code === PRO_LIBRARY_ERROR_CODE || code === PRO_FRAMEWORK_ERROR_CODE,
    )
  }
  // Older servers only return the human-readable reason.
  return reason.includes(PRO_LIBRARY_REASON) || PRO_FRAMEWORK_REASON.test(reason)
}

function isComponentBrowserConflict({ errors, reason }: UploadFailure): boolean {
  return errors === undefined && reason.includes(COMPONENT_BROWSER_CONFLICT_REASON)
}

function formatFailureReason(failure: UploadFailure): string {
  let formattedReason = failure.reason
  // Structured errors take precedence over wording; preserve unknown errors verbatim.
  const { errors, reason, label } = failure
  if (errors !== undefined) {
    const reasons = errors.map(({ code, active_framework: activeFramework }) => {
      if (code === PRO_LIBRARY_ERROR_CODE) {
        return `${highlight('Library:')} Another library is active for this Professional plan.`
      }
      if (code === PRO_FRAMEWORK_ERROR_CODE && activeFramework !== undefined) {
        return `${highlight('Framework:')} Cannot publish ${highlight(label)}; the active framework is ${highlight(activeFramework)}.`
      }
      return reason
    })
    formattedReason = [...new Set(reasons)].join('\n') || reason
  } else {
    // Keep the existing output when talking to a server without structured errors.
    formattedReason = reason
      .replace(
        PRO_LIBRARY_REASON,
        `${highlight('Library:')} Another library is active for this Professional plan.\n`,
      )
      .replace(
        PRO_FRAMEWORK_REASON,
        (_, requested: string, active: string) =>
          `${highlight('Framework:')} Cannot publish ${highlight(requested)}; the active framework is ${highlight(active)}.`,
      )
  }
  return formattedReason
    .trim()
    .split('\n')
    .map((line) => `  ${line.trim()}`)
    .join('\n')
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

function getUploadResultKey(node: { figmaNode: string; label: string }): string {
  return JSON.stringify([getKeyFromFigmaNode(node.figmaNode), node.label])
}

/**
 * Returns the URL for a Figma library file, preserving the host used by the uploaded docs so
 * links work in development environments as well as production.
 */
function getLibraryFileUrl(fileKey: string, docs: CodeConnectJSON[]): string {
  for (const doc of docs) {
    try {
      const url = new URL(doc.figmaNode)
      const pathMatch = url.pathname.match(/\/(file|design)\/([A-Za-z0-9]+)/)
      if (pathMatch?.[2] === fileKey) {
        return `${url.origin}/design/${fileKey}`
      }
    } catch {
      // Invalid Figma node URLs are reported by the existing validation flow.
    }
  }

  return `https://www.figma.com/design/${fileKey}`
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
    const { _codeConnectFilePath, _batchTemplateFilePath, ...cleanDoc } = doc
    return cleanDoc as CodeConnectJSON
  })

  try {
    logger.info(`Uploading to Figma...`)

    // Create a map from fileKey-nodeId to original docs for detailed output
    const docsMap = createDocsMap(cleanedDocs, verbose)

    const allUploadedNodes = new Set<string>()
    const allFailedNodes = new Map<string, UploadFailure>()

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
            allUploadedNodes.add(getUploadResultKey(node)),
          )
        }
        if (data.meta?.failed_nodes) {
          data.meta.failed_nodes.forEach((node) =>
            allFailedNodes.set(getUploadResultKey(node), node),
          )
        }
        if (data.meta?.new_active_selections?.length) {
          process.stderr.write('\n')
          logNewActiveSelections(data.meta.new_active_selections, cleanedDocs)
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
        data.meta.published_nodes.forEach((node) => allUploadedNodes.add(getUploadResultKey(node)))
      }
      if (data.meta?.failed_nodes) {
        data.meta.failed_nodes.forEach((node) => allFailedNodes.set(getUploadResultKey(node), node))
      }
      logNewActiveSelections(data.meta?.new_active_selections, cleanedDocs)
    }

    // Separate successful and failed uploads
    const successfulDocsByLabel: Record<string, CodeConnectJSON[]> = {}
    const failedDocsByLabel: Record<
      string,
      Array<{ doc: CodeConnectJSON; failure: UploadFailure }>
    > = {}

    for (const nodeDocs of docsMap.values()) {
      for (const doc of nodeDocs) {
        const label = doc.label
        const docKey = getUploadResultKey(doc)
        const isUploaded = allUploadedNodes.has(docKey)
        const failure = allFailedNodes.get(docKey)

        if (isUploaded) {
          if (!successfulDocsByLabel[label]) {
            successfulDocsByLabel[label] = []
          }
          successfulDocsByLabel[label].push(doc)
        } else if (failure) {
          if (!failedDocsByLabel[label]) {
            failedDocsByLabel[label] = []
          }
          failedDocsByLabel[label].push({ doc, failure })
        }
      }
    }

    for (const [label, docs] of Object.entries(successfulDocsByLabel)) {
      logger.info(
        `Successfully uploaded to Figma, for ${label}:\n${docs.map((doc) => `-> ${codeConnectStr(doc)}`).join('\n')}`,
      )
    }

    if (Object.keys(failedDocsByLabel).length > 0) {
      const hasProRestrictions = Object.values(failedDocsByLabel).some((items) =>
        items.some(({ failure }) => isProFailure(failure)),
      )
      if (hasProRestrictions) {
        logger.error(
          'Your Professional plan supports Code Connect for one library and one framework.\n',
        )
      }
      let hasComponentBrowserConflicts = false
      for (const [label, failedItems] of Object.entries(failedDocsByLabel)) {
        const conflicts = failedItems.filter(({ failure }) => isComponentBrowserConflict(failure))
        const otherFailures = failedItems.filter(
          ({ failure }) => !isComponentBrowserConflict(failure),
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
            [
              highlight(`Failed to upload to Figma, for ${label}:`),
              ...otherFailures.map(
                ({ doc, failure }) =>
                  `  ${codeConnectStr(doc, '\n  ')}\n\n${formatFailureReason(failure)}`,
              ),
            ].join('\n\n') + '\n',
          )
        }
      }

      if (hasProRestrictions) {
        logger.error(
          [
            'A plan admin can change the active library and framework in',
            "Figma's Code Connect settings, or upgrade your plan to connect",
            'multiple libraries and frameworks.',
            '',
            `Upgrade your plan: ${underline('https://www.figma.com/pricing/')}`,
            '',
          ].join('\n'),
        )
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
