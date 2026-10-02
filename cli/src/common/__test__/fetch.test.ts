import { isFetchError, FetchError, request } from '../fetch'

describe('fetch', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    jest.restoreAllMocks()
  })

  describe('isFetchError', () => {
    it('returns true for FetchError instances with response', () => {
      const mockResponse = new Response('{}', { status: 404 })
      const error = new FetchError(mockResponse, { message: 'Not found' })
      expect(isFetchError(error)).toBe(true)
      expect(error.response).toBe(mockResponse)
      expect(error.message).toBe('Request failed with status 404')
    })

    it('returns true for FetchError instances from network failure cause', () => {
      const cause = new Error('self signed certificate in certificate chain')
      ;(cause as any).code = 'SELF_SIGNED_CERT_IN_CHAIN'
      const error = new FetchError(undefined, undefined, cause)
      expect(isFetchError(error)).toBe(true)
      expect(error.response).toBeUndefined()
      expect(error.message).toContain(
        'fetch failed: self signed certificate in certificate chain (SELF_SIGNED_CERT_IN_CHAIN)',
      )
      expect(error.cause).toBe(cause)
    })

    it('returns false for standard Error and non-FetchError objects', () => {
      expect(isFetchError(new Error('Network error'))).toBe(false)
      expect(isFetchError(new TypeError('fetch failed'))).toBe(false)
      expect(isFetchError(null)).toBe(false)
      expect(isFetchError(undefined)).toBe(false)
      expect(isFetchError({ response: {} })).toBe(false)
    })
  })

  describe('request methods', () => {
    it('surfaces underlying network/SSL error causes in FetchError when fetch rejects', async () => {
      const sslError = new Error('self signed certificate in certificate chain')
      ;(sslError as any).code = 'SELF_SIGNED_CERT_IN_CHAIN'
      const typeError = new TypeError('fetch failed')
      ;(typeError as any).cause = sslError

      global.fetch = jest.fn().mockRejectedValue(typeError)

      let caughtError: unknown
      try {
        await request.get('https://api.figma.com/v1/me')
      } catch (err) {
        caughtError = err
      }

      expect(isFetchError(caughtError)).toBe(true)
      const fetchError = caughtError as FetchError
      expect(fetchError.response).toBeUndefined()
      expect(fetchError.message).toBe(
        'fetch failed: self signed certificate in certificate chain (SELF_SIGNED_CERT_IN_CHAIN)',
      )
      expect(fetchError.cause).toBe(sslError)
    })

    it('handles network timeout errors with cause codes', async () => {
      const timeoutError = new Error('Connect Timeout Error')
      ;(timeoutError as any).code = 'UND_ERR_CONNECT_TIMEOUT'
      const fetchFailed = new TypeError('fetch failed')
      ;(fetchFailed as any).cause = timeoutError

      global.fetch = jest.fn().mockRejectedValue(fetchFailed)

      await expect(request.post('https://api.figma.com/v1/test', {})).rejects.toThrow(
        'fetch failed: Connect Timeout Error (UND_ERR_CONNECT_TIMEOUT)',
      )
    })

    it('throws FetchError on non-ok HTTP responses', async () => {
      const mockResponse = new Response(JSON.stringify({ err: 'Invalid node' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })
      global.fetch = jest.fn().mockResolvedValue(mockResponse)

      let caughtError: unknown
      try {
        await request.get('https://api.figma.com/v1/files/abc')
      } catch (err) {
        caughtError = err
      }

      expect(isFetchError(caughtError)).toBe(true)
      const fetchError = caughtError as FetchError
      expect(fetchError.response?.status).toBe(400)
      expect(fetchError.data).toEqual({ err: 'Invalid node' })
    })

    it('returns parsed data and response on success', async () => {
      const mockResponse = new Response(JSON.stringify({ user: 'test' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
      global.fetch = jest.fn().mockResolvedValue(mockResponse)

      const result = await request.get<{ user: string }>('https://api.figma.com/v1/me')
      expect(result.data).toEqual({ user: 'test' })
      expect(result.response.status).toBe(200)
    })
  })
})
