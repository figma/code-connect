import { isFetchError, request } from '../fetch'

describe('fetch network errors', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

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
