import axios from 'axios'
import { getApiUrl, getHeaders } from '../figma_rest_api'
import { parseFileKey } from '../helpers'

export type EmbeddingsResponse = {
  status: number
  error: boolean
  meta: {
    embeddings: number[][]
  }
}

export async function fetchEmbeddings({
  uniqueMatchableNames,
  accessToken,
  figmaUrl,
}: {
  uniqueMatchableNames: string[]
  accessToken: string
  figmaUrl: string
}) {
  const apiUrl = getApiUrl(figmaUrl)
  const fileKey = parseFileKey(figmaUrl)

  const result = await axios.post<EmbeddingsResponse>(
    apiUrl + '/code_connect/name_embeddings',
    uniqueMatchableNames,
    {
      headers: getHeaders(accessToken),
      params: {
        file_key: fileKey,
      },
    },
  )

  return result.data
}
