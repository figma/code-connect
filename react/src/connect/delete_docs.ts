import { FigmaConnectJSON } from '../common/figma_connect'
import { logger, underline, highlight } from '../common/logging'
import axios, { isAxiosError } from 'axios'
import { getApiUrl } from './figma_rest_api'

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

    const response = await axios.delete(apiUrl, {
      headers: {
        'X-Figma-Token': accessToken,
        'Content-Type': 'application/json',
      },
      data: { nodes_to_delete: docs },
    })

    logger.info(
      `Successfully deleted:\n${docs.map((doc) => `-> ${doc.figmaNode} (${doc.label})`).join('\n')}`,
    )
  } catch (err) {
    if (isAxiosError(err)) {
      if (err.response) {
        logger.error(
          `Failed to upload to Figma (${err.code}): ${err.response?.status} ${err.response?.data?.err ?? err.response?.data?.message}`,
        )
      } else {
        logger.error(`Failed to upload to Figma: ${err.message}`)
      }
      logger.debug(JSON.stringify(err.response?.data))
    } else {
      logger.error(`Failed to delete docs: ${err}`)
    }
    process.exit(1)
  }
}
