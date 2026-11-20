import { createServer, Server } from 'http'
import { AddressInfo } from 'net'
import { fetch as undiciFetch, getGlobalDispatcher, setGlobalDispatcher } from 'undici'
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

describe('fetch proxy', () => {
  const originalEnv = process.env
  const originalDispatcher = getGlobalDispatcher()
  const servers: Server[] = []

  // Records what reaches it. The proxy refuses every tunnel, like an egress proxy refusing a host.
  async function listen(name: string, seen: string[]) {
    const server = createServer((req, res) => {
      seen.push(`${name} ${req.method} ${req.url}`)
      res.end('{}')
    })
    server.on('connect', (req, socket) => {
      seen.push(`${name} CONNECT ${req.url}`)
      socket.end('HTTP/1.1 403 Forbidden\r\n\r\n')
    })
    servers.push(server)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    return (server.address() as AddressInfo).port
  }

  afterEach(async () => {
    process.env = originalEnv
    setGlobalDispatcher(originalDispatcher)
    await Promise.all(
      servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))),
    )
  })

  it('connects directly to NO_PROXY hosts and sends the rest through HTTPS_PROXY', async () => {
    const seen: string[] = []
    const proxyPort = await listen('proxy', seen)
    const figmaPort = await listen('local figma', seen)
    // An egress-confined eval: only HTTPS_PROXY is set, and the local Figma server is exempt.
    process.env = {
      ...originalEnv,
      HTTPS_PROXY: `http://127.0.0.1:${proxyPort}`,
      NO_PROXY: '127.0.0.1',
    }
    for (const name of ['HTTP_PROXY', 'http_proxy', 'https_proxy', 'no_proxy'])
      delete process.env[name]

    // Loading the module installs its dispatcher. Jest's sandbox hides it from the
    // built-in fetch, so send requests with undici's fetch, which uses that dispatcher.
    jest.isolateModules(() => require('../fetch'))

    await undiciFetch(`http://127.0.0.1:${figmaPort}/v1/files/abc`)
    await expect(undiciFetch('http://api.figma.test/v1/me')).rejects.toThrow('fetch failed')
    expect(seen).toEqual(['local figma GET /v1/files/abc', 'proxy CONNECT api.figma.test:80'])
  })
})
