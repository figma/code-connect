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

    await request.delete(
      apiUrl,
      { nodes_to_delete: docs },
      {
        headers: getHeaders(accessToken),
      },
    )

    logger.info(
      `Successfully deleted:\n${docs.map((doc) => `-> ${doc.figmaNode} (${doc.label})`).join('\n')}`,
    )
  } catch (err) {
    if (isFetchError(err)) {
      if (err.response) {
        logger.error(
          `Failed to upload to Figma (${err.response.status}): ${err.response.status} ${err.data?.err ?? err.data?.message}`,
        )
      } else {
        logger.error(`Failed to upload to Figma: ${err.message}`)
      }
      logger.debug(JSON.stringify(err.data))
    } else {
      logger.error(`Failed to delete docs: ${err}`)
    }
    exitWithFeedbackMessage(1)
  }
}
