import { isFetchError, request } from '../fetch'

const { version } = require('../../../package.json')

describe('fetch requests', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('identifies requests that do not supply headers', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response('{}'))

    await request.get('https://api.github.com/repos/figma/code-connect/releases/latest')

    const [, options] = (global.fetch as jest.Mock).mock.calls[0]
    expect(new Headers(options.headers).get('User-Agent')).toBe(
      `code-connect-cli/${version} (@figma/code-connect)`,
    )
  })

  it.each(['get', 'post', 'put', 'delete'] as const)(
    'identifies %s requests while preserving supplied headers',
    async (method) => {
      global.fetch = jest.fn().mockResolvedValue(new Response('{}'))
      const headers = { 'X-Figma-Token': 'test-token', 'Content-Type': 'application/json' }
      const url = 'https://api.figma.com/v1/code_connect'

      if (method === 'get') {
        await request.get(url, { headers })
      } else {
        await request[method](url, {}, { headers })
      }

      const [, options] = (global.fetch as jest.Mock).mock.calls[0]
      expect(options.method).toBe(method.toUpperCase())
      expect(Object.fromEntries(new Headers(options.headers))).toEqual({
        'content-type': 'application/json',
        'user-agent': `code-connect-cli/${version} (@figma/code-connect)`,
        'x-figma-token': 'test-token',
      })
      expect(headers).toEqual({ 'X-Figma-Token': 'test-token', 'Content-Type': 'application/json' })
    },
  )

  it('includes the underlying cause when fetch fails before a response', async () => {
    const cause = new Error('Connect Timeout Error')
    ;(cause as { code?: string }).code = 'UND_ERR_CONNECT_TIMEOUT'
    const fetchFailed = new TypeError('fetch failed')
    ;(fetchFailed as { cause?: unknown }).cause = cause
    global.fetch = jest.fn().mockRejectedValue(fetchFailed)

    await expect(request.get('https://api.figma.com/v1/me')).rejects.toMatchObject({
      message: 'fetch failed: Connect Timeout Error (UND_ERR_CONNECT_TIMEOUT)',
      response: undefined,
      cause,
    })
  })

  it('still throws FetchError for an HTTP error response', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'nope' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
    )

    try {
      await request.get('https://api.figma.com/v1/files/abc')
      throw new Error('expected request to fail')
    } catch (err) {
      expect(isFetchError(err)).toBe(true)
      if (!isFetchError(err) || !err.response) throw err
      expect(err.response.status).toBe(400)
      expect(err.data).toEqual({ message: 'nope' })
    }
  })
})
