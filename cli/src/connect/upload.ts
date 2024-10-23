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

function codeConnectStr(doc: CodeConnectJSON) {
  return `${highlight(doc.component ?? '')}${doc.variant ? `(${Object.entries(doc.variant).map(([key, value]) => `${key}=${value}`)})` : ''} ${underline(doc.figmaNode)}`
}

export async function upload({ accessToken, docs, batchSize, verbose }: Args) {
  const apiUrl = getApiUrl(docs?.[0]?.figmaNode ?? '') + '/code_connect'

  try {
    logger.info(`Uploading to Figma...`)

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

        await request.post(apiUrl, batch, {
          headers: getHeaders(accessToken),
        })
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

      await request.post(apiUrl, docs, {
        headers: getHeaders(accessToken),
      })
    }

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
