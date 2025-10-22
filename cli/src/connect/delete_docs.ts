import { isFetchError, request } from '../common/fetch'
import { logger } from '../common/logging'
import { getApiUrl, getHeaders } from './figma_rest_api'
import { exitWithFeedbackMessage } from './helpers'

interface NodesToDeleteInfo {
  figmaNode: string
  label: string
}

interface Args {
  accessToken: string
  docs: NodesToDeleteInfo[]
}

export async function delete_docs({ accessToken, docs }: Args) {
  const apiUrl = getApiUrl(docs?.[0]?.figmaNode ?? '') + '/code_connect'

  try {
    logger.info(`Unpublishing Code Connect files from Figma...`)

    const response = await request.delete(
      apiUrl,
      { nodes_to_delete: docs },
      {
        headers: getHeaders(accessToken),
      },
    )

    interface DeleteResult {
      success: boolean
      deleted_count: number
      failed_count: number
      deleted_nodes: Array<{ figmaNode: string; label: string }>
      failed_nodes: Array<{ figmaNode: string; label: string; reason: string }>
    }

    const responseData = response.data as {
      meta?: DeleteResult
    }

    const result: DeleteResult = responseData.meta ?? (response.data as DeleteResult)

    if (result.deleted_count > 0) {
      logger.info(
        `\nSuccessfully deleted ${
          result.deleted_count
        } Code Connect mapping(s):\n${result.deleted_nodes
          .map((doc) => `${doc.figmaNode} (${doc.label})`)
          .join('\n')}`,
      )
    }

    if (result.failed_count > 0) {
      logger.error(
        `\nFailed to delete ${result.failed_count} Code Connect mapping(s):\n${result.failed_nodes
          .map((doc) => `✗ ${doc.figmaNode} (${doc.label}): ${doc.reason}`)
          .join('\n')}`,
      )
      exitWithFeedbackMessage(1)
    }

    if (result.deleted_count === 0 && result.failed_count === 0) {
      logger.warn('No Code Connect mappings were found to delete.')
    }
  } catch (err) {
    if (isFetchError(err)) {
      if (err.response) {
        // Provide more specific error message based on status code
        if (err.response.status === 400) {
          const errorMsg = err.data?.err ?? err.data?.message ?? 'Bad request'
          if (errorMsg.includes('insufficient permissions')) {
            logger.error(`Insufficient permissions to unpublish Code Connect for this file.`)
          } else if (errorMsg.includes('Failed to parse')) {
            logger.error(`Invalid Figma URL format in the request.`)
          } else {
            logger.error(`Failed to unpublish from Figma: ${errorMsg}`)
          }
        } else {
          logger.error(
            `Failed to unpublish from Figma (${err.response.status}): ${
              err.data?.err ?? err.data?.message ?? 'Unknown error'
            }`,
          )
        }
      } else {
        logger.error(`Failed to unpublish from Figma: ${err.message}`)
      }
      logger.debug(JSON.stringify(err.data))
    } else {
      logger.error(`Failed to delete docs: ${err}`)
    }
    exitWithFeedbackMessage(1)
  }
}
