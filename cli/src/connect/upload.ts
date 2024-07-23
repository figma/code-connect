import { CodeConnectJSON } from '../common/figma_connect'
import { logger, underline, highlight } from '../common/logging'
import axios, { isAxiosError } from 'axios'
import { getApiUrl, getHeaders } from './figma_rest_api'
import { exitWithFeedbackMessage } from './helpers'

interface Args {
  accessToken: string
  docs: CodeConnectJSON[]
}

function codeConnectStr(doc: CodeConnectJSON) {
  return `${highlight(doc.component ?? '')}${doc.variant ? `(${Object.entries(doc.variant).map(([key, value]) => `${key}=${value}`)})` : ''} ${underline(doc.figmaNode)}`
}

export async function upload({ accessToken, docs }: Args) {
  const apiUrl = getApiUrl(docs?.[0]?.figmaNode ?? '') + '/code_connect'

  try {
    logger.info(`Uploading to Figma...`)

    const response = await axios.post(apiUrl, docs, {
      headers: getHeaders(accessToken),
    })

    const docsByLabel = docs.reduce(
      (acc, doc) => {
        if (acc[doc.label]) {
          acc[doc.label].push(doc)
        } else {
          acc[doc.label] = [doc]
        }
        return acc
      },
      {} as Record<string, CodeConnectJSON[]>,
    )

    for (const [label, docs] of Object.entries(docsByLabel)) {
      logger.info(
        `Successfully uploaded to Figma, for ${label}:\n${docs.map((doc) => `-> ${codeConnectStr(doc)}`).join('\n')}`,
      )
    }
  } catch (err) {
    if (isAxiosError(err)) {
      if (err.response) {
        logger.error(
          `Failed to upload to Figma (${err.code}): ${err.response?.status} ${err.response?.data?.message}`,
        )
      } else {
        logger.error(`Failed to upload to Figma: ${err.message}`)
      }
      logger.debug(JSON.stringify(err.response?.data))
    } else {
      logger.error(`Failed to upload to Figma: ${err}`)
    }
    exitWithFeedbackMessage(1)
  }
}
