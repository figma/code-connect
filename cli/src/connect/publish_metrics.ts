import { USER_AGENT } from '../common/user_agent'

export async function trackPreflightRejection(
  apiUrl: string,
  reason:
    | 'preflight_invalid_figma_node'
    | 'preflight_invalid_document'
    | 'preflight_file_unavailable'
    | 'preflight_api_rejected',
  send: typeof fetch | undefined = process.env.JEST_WORKER_ID ? undefined : fetch,
) {
  if (!send || process.env.DO_NOT_TRACK === '1') return

  try {
    const origin = new URL(apiUrl).origin
    const figmentOrigins: Record<string, string> = {
      'https://api.figma.com': 'https://www.figma.com',
    }
    const figmentOrigin = figmentOrigins[origin]
    if (!figmentOrigin) return

    await send(`${figmentOrigin}/api/figment-proxy/put`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
      body: JSON.stringify([
        {
          figment_metadata: { namespace: 'figapi' },
          data: {
            event: 'code_connect_publish_rejected',
            properties: { tier: 'unknown', source: 'cli', operation: 'publish', reason },
            context: { forwardToDatadog: true },
          },
        },
      ]),
      signal: AbortSignal.timeout(1000),
    })
  } catch {}
}
