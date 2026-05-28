import { logger } from '../../common/logging'

jest.mock('../../common/fetch', () => ({
  request: { post: jest.fn() },
  isFetchError: (e: any) => !!e?.__isFetchError,
}))

import { request as mockedRequest } from '../../common/fetch'
import { upload } from '../upload'

const post = (mockedRequest as any).post as jest.Mock

function makeFetchError(status: number, retryAfter?: string) {
  const headerMap = new Map<string, string>()
  if (retryAfter) headerMap.set('Retry-After', retryAfter)
  return {
    __isFetchError: true,
    response: {
      status,
      headers: { get: (k: string) => headerMap.get(k) ?? null },
    },
    data: { message: 'err' },
  }
}

function makeOkResponse() {
  return {
    data: {
      meta: {
        success: true,
        published_count: 0,
        failed_count: 0,
        published_nodes: [],
        failed_nodes: [],
      },
    },
  }
}

function makeDocs(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    figmaNode: `https://www.figma.com/design/abc123/Test?node-id=${i + 1}-0`,
    label: `L${i + 1}`,
    component: `C${i + 1}`,
  })) as any[]
}

describe('upload — retry behavior (via postWithRetry)', () => {
  let recordedDelaysMs: number[]
  let originalSetTimeout: typeof setTimeout
  let exitSpy: jest.SpyInstance
  let stderrSpy: jest.SpyInstance

  beforeEach(() => {
    post.mockReset()
    recordedDelaysMs = []
    originalSetTimeout = global.setTimeout

    global.setTimeout = ((fn: any, ms: number) => {
      recordedDelaysMs.push(ms)
      fn()
      return 0 as any
    }) as any

    exitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`)
    }) as any)

    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true)

    logger.warn = jest.fn()
    logger.info = jest.fn()
    logger.debug = jest.fn()
    logger.error = jest.fn()
  })

  afterEach(() => {
    global.setTimeout = originalSetTimeout
    exitSpy.mockRestore()
    stderrSpy.mockRestore()
    jest.restoreAllMocks()
  })

  describe('on 429 (rate limit)', () => {
    it('uses the extended schedule 5/15/30/45/60/75s and ignores Retry-After', async () => {
      // Even with a Retry-After header, the 429 path should use the local schedule.
      post
        .mockRejectedValueOnce(makeFetchError(429, '999'))
        .mockRejectedValueOnce(makeFetchError(429))
        .mockResolvedValueOnce(makeOkResponse())

      await upload({
        accessToken: 'tok',
        docs: makeDocs(1),
        verbose: false,
      })

      expect(post).toHaveBeenCalledTimes(3)
      expect(recordedDelaysMs).toEqual([5_000, 15_000])
    })

    it('gives up after 6 retries (7 attempts total) and exits', async () => {
      for (let i = 0; i < 7; i++) post.mockRejectedValueOnce(makeFetchError(429))

      await expect(
        upload({
          accessToken: 'tok',
          docs: makeDocs(1),
          verbose: false,
        }),
      ).rejects.toThrow('process.exit(1)')

      expect(post).toHaveBeenCalledTimes(7)
      expect(recordedDelaysMs).toEqual([5_000, 15_000, 30_000, 45_000, 60_000, 75_000])
    })
  })

  describe('on 5xx (server error)', () => {
    it('uses the short schedule 5/15/30s', async () => {
      post
        .mockRejectedValueOnce(makeFetchError(500))
        .mockRejectedValueOnce(makeFetchError(503))
        .mockResolvedValueOnce(makeOkResponse())

      await upload({
        accessToken: 'tok',
        docs: makeDocs(1),
        verbose: false,
      })

      expect(post).toHaveBeenCalledTimes(3)
      expect(recordedDelaysMs).toEqual([5_000, 15_000])
    })

    it('honors Retry-After header instead of the fixed delay', async () => {
      post.mockRejectedValueOnce(makeFetchError(503, '7')).mockResolvedValueOnce(makeOkResponse())

      await upload({
        accessToken: 'tok',
        docs: makeDocs(1),
        verbose: false,
      })

      expect(recordedDelaysMs).toEqual([7_000])
    })

    it('gives up after 3 retries (4 attempts total) and exits', async () => {
      for (let i = 0; i < 4; i++) post.mockRejectedValueOnce(makeFetchError(500))

      await expect(
        upload({
          accessToken: 'tok',
          docs: makeDocs(1),
          verbose: false,
        }),
      ).rejects.toThrow('process.exit(1)')

      expect(post).toHaveBeenCalledTimes(4)
      expect(recordedDelaysMs).toEqual([5_000, 15_000, 30_000])
    })
  })

  it('tracks 429 and 5xx retry counters independently', async () => {
    // Alternate: 500, 429, 500, 429, 500, 429, success
    // After this sequence: 3 5xx retries used, 3 429 retries used → both still
    // within budget, request succeeds.
    post
      .mockRejectedValueOnce(makeFetchError(500))
      .mockRejectedValueOnce(makeFetchError(429))
      .mockRejectedValueOnce(makeFetchError(500))
      .mockRejectedValueOnce(makeFetchError(429))
      .mockRejectedValueOnce(makeFetchError(500))
      .mockRejectedValueOnce(makeFetchError(429))
      .mockResolvedValueOnce(makeOkResponse())

    await upload({
      accessToken: 'tok',
      docs: makeDocs(1),
      verbose: false,
    })

    expect(post).toHaveBeenCalledTimes(7)
    // 500s consume 5xx schedule indices 0,1,2 → 5s,15s,30s
    // 429s consume 429 schedule indices 0,1,2 → 5s,15s,30s
    // Interleaved in encounter order:
    expect(recordedDelaysMs).toEqual([5_000, 5_000, 15_000, 15_000, 30_000, 30_000])
  })

  it('does not retry on a non-retryable status (e.g. 400)', async () => {
    post.mockRejectedValueOnce(makeFetchError(400))

    await expect(
      upload({
        accessToken: 'tok',
        docs: makeDocs(1),
        verbose: false,
      }),
    ).rejects.toThrow('process.exit(1)')

    expect(post).toHaveBeenCalledTimes(1)
    expect(recordedDelaysMs).toEqual([])
  })
})

describe('upload — batch concurrency', () => {
  let stderrSpy: jest.SpyInstance

  beforeEach(() => {
    post.mockReset()
    logger.warn = jest.fn()
    logger.info = jest.fn()
    logger.debug = jest.fn()
    logger.error = jest.fn()
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    stderrSpy.mockRestore()
  })

  it('processes batches sequentially (one in flight at a time), not in parallel', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const callOrder: number[] = []
    let callIndex = 0

    post.mockImplementation(async () => {
      const id = ++callIndex
      callOrder.push(id)
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((r) => setImmediate(r))
      await new Promise((r) => setImmediate(r))
      inFlight--
      return makeOkResponse()
    })

    await upload({
      accessToken: 'tok',
      docs: makeDocs(4),
      batchSize: 1,
      verbose: false,
    })

    expect(post).toHaveBeenCalledTimes(4)
    expect(maxInFlight).toBe(1)
    expect(callOrder).toEqual([1, 2, 3, 4])
  })
})
