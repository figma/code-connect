
import { ProxyAgent, setGlobalDispatcher } from 'undici'
import { logger } from './logging'

type Method = 'POST' | 'GET' | 'PUT' | 'DELETE' | 'post' | 'get' | 'put' | 'delete'

type Options<OptionsT extends RequestInit = RequestInit> = OptionsT & {
  /* Set the query string of the request from an object */
  query?: Record<string, any>
}

function networkErrorMessage(cause: unknown): string {
  if (cause === undefined) return 'fetch failed'
  const causeMsg = cause instanceof Error ? cause.message : String(cause)
  const code =
    cause && typeof cause === 'object' && 'code' in cause
      ? (cause as { code?: string }).code
      : undefined
  const codeSuffix = code && !causeMsg.includes(code) ? ` (${code})` : ''
  return `fetch failed: ${causeMsg}${codeSuffix}`
}

export class FetchError extends Error {
  cause?: unknown

  constructor(
    public response?: Response,
    public data?: Record<any, any>,
    cause?: unknown,
  ) {
    // HTTP failures already report status and body at the call site. Keep their
    // message empty so that output stays the same, and only describe network
    // failures that never received a response.
    super(response ? '' : networkErrorMessage(cause))
    this.name = 'FetchError'
    this.cause = cause
  }
}

export const isFetchError = (error: unknown): error is FetchError => {
  return error instanceof FetchError
}

export function getProxyUrl() {
  return (
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.https_proxy ||
    process.env.http_proxy
  )
}

/**
 * Creates a ProxyAgent and sets it as the global dispatcher via unidici (which
 * affects fetch calls) if a proxy is set either in VS Code settings or as an
 * environment variable.
 */
const proxyUrl = getProxyUrl()
const agent = proxyUrl ? new ProxyAgent({ uri: proxyUrl }) : undefined
if (agent) {
  setGlobalDispatcher(agent)
}

/**
 * Makes a request to the Figma API. This is used by other functions to make
 * various types of requests. We return both the response object, and the data
 * parsed as JSON, to make it easier to work with the response.
 */
async function makeRequestInternal<ResponseT = unknown>(
  url: string,
  method: Method,
  options: Options = {},
  body?: Record<any, any>,
) {
  const urlObj = new URL(url)
  if (options?.query) {
    Object.entries(options.query).forEach(([key, value]) => {
      urlObj.searchParams.append(key, value as string)
    })
  }
  url = urlObj.toString()

  if (body) {
    options.body = JSON.stringify(body)
  }

  let response: Response
  try {
    response = await fetch(url, { ...options, method })
  } catch (err) {
    const cause = (err as { cause?: unknown } | null)?.cause ?? err
    logger.debug('Fetch error cause:', cause instanceof Error ? cause.stack : cause)
    throw new FetchError(undefined, undefined, cause)
  }
  if (!response.ok) {
    let data
    try {
      data = await response.json()
    } catch (e) {
      data = undefined
    }
    throw new FetchError(response, data)
  }

  const text = await response.text()
  const data = text ? (JSON.parse(text) as ResponseT) : ({} as ResponseT)

  return { response, data }
}

export const request = {
  get: <MetaT>(url: string, options: Options = {}) => {
    return makeRequestInternal<MetaT>(url, 'GET', options)
  },
  post: <MetaT>(url: string, body: Record<any, any>, options: Options = {}) => {
    return makeRequestInternal<MetaT>(url, 'POST', options, body)
  },
  put: <MetaT>(url: string, body: Record<any, any>, options: Options = {}) => {
    return makeRequestInternal<MetaT>(url, 'PUT', options, body)
  },
  delete: <MetaT>(url: string, body?: Record<any, any>, options: Options = {}) => {
    return makeRequestInternal<MetaT>(url, 'DELETE', options, body)
  },
}
