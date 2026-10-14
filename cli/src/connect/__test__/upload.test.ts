import chalk from 'chalk'
import stripAnsi from 'strip-ansi'
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

function makeOkResponse(
  newActiveSelections: Array<{
    file_key: string
    library_name: string
    framework: string
  }> = [],
) {
  return {
    data: {
      meta: {
        success: true,
        published_count: 0,
        failed_count: 0,
        published_nodes: [],
        failed_nodes: [],
        new_active_selections: newActiveSelections,
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

describe('upload — first active pair', () => {
  let stderrSpy: jest.SpyInstance
  const originalColorLevel = chalk.level

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
    chalk.level = originalColorLevel
  })

  it.each([0, 1] as const)('logs the first selection with color level %s', async (colorLevel) => {
    chalk.level = colorLevel
    post.mockResolvedValueOnce(
      makeOkResponse([{ file_key: 'abc123', library_name: 'Stupid DS', framework: 'React' }]),
    )

    await upload({
      accessToken: 'tok',
      docs: makeDocs(1),
      verbose: false,
    })

    const messages = (logger.info as jest.Mock).mock.calls.map(([message]) => stripAnsi(message))

    expect(messages).toContainEqual(expect.stringContaining('Code Connect active selection set'))
    expect(messages).toContainEqual(
      expect.stringContaining(
        "If this wasn't intentional, a plan admin can change the active library\nand framework in Figma's Code Connect settings.",
      ),
    )
    expect(messages).toContainEqual(expect.stringContaining('Library:   Stupid DS'))
    expect(messages).toContainEqual(expect.stringContaining('https://www.figma.com/design/abc123'))
    expect(messages).toContainEqual(expect.stringContaining('Framework: React'))
  })

  it('preserves a development host in the active library link', async () => {
    post.mockResolvedValueOnce(
      makeOkResponse([{ file_key: 'abc123', library_name: 'Stupid DS', framework: 'React' }]),
    )
    const docs = makeDocs(1)
    docs[0].figmaNode =
      'https://christinaalexander-christina-4.figdev.systems/design/abc123/Test?node-id=1-0'

    await upload({
      accessToken: 'tok',
      docs,
      verbose: false,
    })

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining(
        'https://christinaalexander-christina-4.figdev.systems/design/abc123',
      ),
    )
  })

  it('does not log the message when the active pair was already set', async () => {
    post.mockResolvedValueOnce(makeOkResponse())

    await upload({
      accessToken: 'tok',
      docs: makeDocs(1),
      verbose: false,
    })

    expect(logger.info).not.toHaveBeenCalledWith(
      expect.stringContaining('Code Connect active selection set'),
    )
  })
})

describe.each([0, 1] as const)('upload — readable failures with color level %s', (colorLevel) => {
  const originalColorLevel = chalk.level

  beforeEach(() => {
    post.mockReset()
    logger.info = jest.fn()
    logger.error = jest.fn()
    chalk.level = colorLevel
  })

  afterEach(() => {
    chalk.level = originalColorLevel
  })

  const libraryReason =
    'Cannot publish Code Connect mappings to this library because another library is active for this Professional plan.'
  const frameworkReason =
    'Cannot publish Vue Code Connect mappings because React is the active framework for this Professional plan.'

  it.each([
    [libraryReason, ['Library: Another library is active for this Professional plan.']],
    [frameworkReason, ['Framework: Cannot publish Vue; the active framework is React.']],
    [
      `${libraryReason} ${frameworkReason}`,
      [
        'Library: Another library is active for this Professional plan.',
        'Framework: Cannot publish Vue; the active framework is React.',
      ],
    ],
  ])('renders %s', async (reason, expectedReasons) => {
    const docs = makeDocs(1)
    docs[0].label = 'Vue'
    post.mockResolvedValueOnce({
      data: {
        meta: {
          published_nodes: [],
          failed_nodes: [{ figmaNode: docs[0].figmaNode, label: 'Vue', reason }],
        },
      },
    })

    await upload({ accessToken: 'tok', docs, verbose: false })

    const messages = (logger.error as jest.Mock).mock.calls.map(([message]) => message as string)
    const output = messages.find((message) => stripAnsi(message).startsWith('Failed to upload'))!
    const hasProRestriction = reason.includes(libraryReason) || reason.includes(frameworkReason)
    expect(
      messages.filter((message) => message.includes('Your Professional plan supports')),
    ).toHaveLength(hasProRestriction ? 1 : 0)
    expect(messages.filter((message) => message.includes('Upgrade your plan:'))).toHaveLength(
      hasProRestriction ? 1 : 0,
    )
    if (hasProRestriction) {
      expect(messages[0]).toContain('one library and one framework.')
      expect(messages[messages.length - 1]).toContain('A plan admin can change')
      expect(messages[messages.length - 1]).toContain('https://www.figma.com/pricing/')
    }
    expect(stripAnsi(output)).toBe(
      `Failed to upload to Figma, for Vue:\n\n  C1\n  ${docs[0].figmaNode}\n\n${expectedReasons.map((line) => `  ${line}`).join('\n')}\n`,
    )
    if (reason.includes(libraryReason)) {
      expect(output).toContain(chalk.bold('Library:'))
    }
    if (reason.includes(frameworkReason)) {
      expect(output).toContain(chalk.bold('Framework:'))
      expect(output).toContain(chalk.bold('Vue'))
      expect(output).toContain(chalk.bold('React'))
    }
  })
})

describe.each([undefined, 1])('upload — structured errors with batch size %s', (batchSize) => {
  let stderrSpy: jest.SpyInstance
  const originalColorLevel = chalk.level

  beforeEach(() => {
    post.mockReset()
    logger.info = jest.fn()
    logger.error = jest.fn()
    logger.warn = jest.fn()
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    stderrSpy.mockRestore()
    chalk.level = originalColorLevel
  })

  describe.each([0, 1] as const)('with color level %s', (colorLevel) => {
    it.each([
      {
        errors: [{ code: 'CODE_CONNECT_PRO_LIBRARY_INACTIVE' }],
        expected: ['Library: Another library is active for this Professional plan.'],
      },
      {
        errors: [{ code: 'CODE_CONNECT_PRO_FRAMEWORK_INACTIVE', active_framework: 'React' }],
        expected: ['Framework: Cannot publish Vue; the active framework is React.'],
      },
      {
        errors: [
          { code: 'CODE_CONNECT_PRO_LIBRARY_INACTIVE' },
          { code: 'CODE_CONNECT_PRO_FRAMEWORK_INACTIVE', active_framework: 'React' },
        ],
        expected: [
          'Library: Another library is active for this Professional plan.',
          'Framework: Cannot publish Vue; the active framework is React.',
        ],
      },
    ])('formats $errors independently of the reason text', async ({ errors, expected }) => {
      chalk.level = colorLevel
      const docs = makeDocs(1)
      docs[0].label = 'Vue'
      post.mockResolvedValueOnce({
        data: {
          meta: {
            published_nodes: [],
            failed_nodes: [
              {
                figmaNode: docs[0].figmaNode,
                label: 'Vue',
                // Codes must also take precedence over legacy conflict classification.
                reason: 'Code Connect UI mapping already exists: server wording changed.',
                errors,
              },
            ],
          },
        },
      })

      await upload({ accessToken: 'tok', docs, batchSize, verbose: false })

      const messages = (logger.error as jest.Mock).mock.calls.map(([message]) => message as string)
      const output = messages.find((message) => stripAnsi(message).startsWith('Failed to upload'))!
      expect(stripAnsi(output)).toBe(
        `Failed to upload to Figma, for Vue:\n\n  C1\n  ${docs[0].figmaNode}\n\n${expected.map((line) => `  ${line}`).join('\n')}\n`,
      )
      expect(
        messages.filter((message) => message.includes('Your Professional plan supports')),
      ).toHaveLength(1)
      expect(messages.filter((message) => message.includes('Upgrade your plan:'))).toHaveLength(1)
      expect(logger.warn).not.toHaveBeenCalled()
      for (const line of expected) {
        expect(output).toContain(chalk.bold(line.split(':')[0] + ':'))
      }
    })
  })

  it.each([{ errors: [] }, { errors: [{ code: 'FUTURE_ERROR_CODE' }] }])(
    'does not infer a Pro restriction from the reason when codes are present: $errors',
    async ({ errors }) => {
      const docs = makeDocs(1)
      const reason =
        'Cannot publish Code Connect mappings to this library because another library is active for this Professional plan.'
      post.mockResolvedValueOnce({
        data: {
          meta: {
            published_nodes: [],
            failed_nodes: [{ ...docs[0], reason, errors }],
          },
        },
      })

      await upload({ accessToken: 'tok', docs, batchSize, verbose: false })

      const messages = (logger.error as jest.Mock).mock.calls.map(([message]) => stripAnsi(message))
      expect(messages).toHaveLength(1)
      expect(messages[0]).toContain(reason)
      expect(messages[0]).not.toContain('Library:')
    },
  )

  it('keeps unknown error details alongside recognized restrictions', async () => {
    const docs = makeDocs(1)
    const reason = 'A newer server also rejected this mapping for a new reason.'
    post.mockResolvedValueOnce({
      data: {
        meta: {
          published_nodes: [],
          failed_nodes: [
            {
              ...docs[0],
              reason,
              errors: [
                { code: 'CODE_CONNECT_PRO_LIBRARY_INACTIVE' },
                { code: 'FUTURE_ERROR_CODE' },
              ],
            },
          ],
        },
      },
    })

    await upload({ accessToken: 'tok', docs, batchSize, verbose: false })

    const output = (logger.error as jest.Mock).mock.calls
      .map(([message]) => stripAnsi(message))
      .join('\n')
    expect(output).toContain('Library: Another library is active for this Professional plan.')
    expect(output).toContain(reason)
  })

  it('keeps the server reason when a framework error has no active framework', async () => {
    const docs = makeDocs(1)
    const reason = 'The active framework was not supplied.'
    post.mockResolvedValueOnce({
      data: {
        meta: {
          published_nodes: [],
          failed_nodes: [
            { ...docs[0], reason, errors: [{ code: 'CODE_CONNECT_PRO_FRAMEWORK_INACTIVE' }] },
          ],
        },
      },
    })

    await upload({ accessToken: 'tok', docs, batchSize, verbose: false })

    const output = (logger.error as jest.Mock).mock.calls
      .map(([message]) => stripAnsi(message))
      .join('\n')
    expect(output).toContain(reason)
    expect(output).not.toContain('undefined')
  })

  it('reports success and framework rejection separately for the same Figma node', async () => {
    const docs = makeDocs(2)
    docs[0].label = 'React'
    docs[1].figmaNode = docs[0].figmaNode
    docs[1].label = 'Vue'
    post.mockResolvedValueOnce({
      data: {
        meta: {
          published_nodes: [{ figmaNode: docs[0].figmaNode, label: 'React' }],
          failed_nodes: [
            {
              figmaNode: docs[1].figmaNode,
              label: 'Vue',
              reason: 'Framework restriction.',
              errors: [{ code: 'CODE_CONNECT_PRO_FRAMEWORK_INACTIVE', active_framework: 'React' }],
            },
          ],
        },
      },
    })

    await upload({ accessToken: 'tok', docs, batchSize, verbose: false })

    const successes = (logger.info as jest.Mock).mock.calls
      .map(([message]) => stripAnsi(message))
      .join('\n')
    const failures = (logger.error as jest.Mock).mock.calls
      .map(([message]) => stripAnsi(message))
      .join('\n')
    expect(successes).toContain('Successfully uploaded to Figma, for React:')
    expect(successes).not.toContain('Successfully uploaded to Figma, for Vue:')
    expect(failures).toContain('Failed to upload to Figma, for Vue:')
    expect(failures).toContain('Framework: Cannot publish Vue; the active framework is React.')
    expect(failures).not.toContain('Failed to upload to Figma, for React:')
  })
})

describe('upload — shared Pro guidance', () => {
  it('shows the limitation and upgrade guidance once across multiple components and labels', async () => {
    post.mockReset()
    logger.info = jest.fn()
    logger.error = jest.fn()
    const docs = makeDocs(3)
    post.mockResolvedValueOnce({
      data: {
        meta: {
          published_nodes: [],
          failed_nodes: docs.map((doc) => ({
            figmaNode: doc.figmaNode,
            label: doc.label,
            reason:
              'Cannot publish Code Connect mappings to this library because another library is active for this Professional plan.',
          })),
        },
      },
    })

    await upload({ accessToken: 'tok', docs, verbose: false })

    const messages = (logger.error as jest.Mock).mock.calls.map(([message]) => stripAnsi(message))
    expect(
      messages.filter((message) => message.includes('Your Professional plan supports')),
    ).toHaveLength(1)
    expect(messages.filter((message) => message.includes('Upgrade your plan:'))).toHaveLength(1)
    expect(messages.filter((message) => message.includes('Failed to upload'))).toHaveLength(3)
  })
})

describe.each([undefined, 1])('upload — generic results with batch size %s', (batchSize) => {
  let stderrSpy: jest.SpyInstance
  const originalColorLevel = chalk.level

  beforeEach(() => {
    post.mockReset()
    logger.info = jest.fn()
    logger.error = jest.fn()
    logger.warn = jest.fn()
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    stderrSpy.mockRestore()
    chalk.level = originalColorLevel
  })

  it.each([0, 1] as const)(
    'separates labels and preserves unknown errors with color level %s',
    async (colorLevel) => {
      chalk.level = colorLevel
      const docs = makeDocs(2)
      docs[0].label = 'React'
      docs[1].figmaNode = docs[0].figmaNode
      docs[1].label = 'Vue'
      const reason = 'Unexpected server error. See https://example.com/help.'
      post.mockResolvedValueOnce({
        data: {
          meta: {
            published_nodes: [{ figmaNode: docs[0].figmaNode, label: 'React' }],
            failed_nodes: [
              {
                figmaNode: docs[1].figmaNode,
                label: 'Vue',
                reason,
                errors: [{ code: 'FUTURE_ERROR_CODE' }],
              },
            ],
          },
        },
      })

      await upload({ accessToken: 'tok', docs, batchSize, verbose: false })

      const successes = (logger.info as jest.Mock).mock.calls
        .map(([message]) => stripAnsi(message))
        .join('\n')
      expect(successes).toContain('Successfully uploaded to Figma, for React:')
      expect(successes).not.toContain('Successfully uploaded to Figma, for Vue:')
      const failures = (logger.error as jest.Mock).mock.calls.map(([message]) => stripAnsi(message))
      expect(failures).toEqual([
        `Failed to upload to Figma, for Vue:\n\n  C2\n  ${docs[1].figmaNode}\n\n  ${reason}\n`,
      ])
      expect(logger.warn).not.toHaveBeenCalled()
    },
  )
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

  it.each(['network', 'oversized'] as const)(
    'prints the first selection before a later %s batch fails',
    async (failure) => {
      const docs = makeDocs(2)
      const selection = { file_key: 'abc123', library_name: 'Test library', framework: 'React' }
      post.mockResolvedValueOnce(makeOkResponse([selection]))
      if (failure === 'network') {
        post.mockImplementationOnce(async () => {
          expect(logger.info).toHaveBeenCalledWith(
            expect.stringContaining('Code Connect active selection set'),
          )
          throw new Error('Network unavailable')
        })
      } else {
        docs[1].template = 'x'.repeat(6 * 1024 * 1024)
      }
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit(1)')
      })
      try {
        await expect(
          upload({ accessToken: 'tok', docs, batchSize: 1, verbose: false }),
        ).rejects.toThrow('process.exit(1)')
        const notices = (logger.info as jest.Mock).mock.calls.filter(([message]) =>
          message.includes('Code Connect active selection set'),
        )
        expect(notices).toHaveLength(1)
        expect(post).toHaveBeenCalledTimes(failure === 'network' ? 2 : 1)
      } finally {
        exitSpy.mockRestore()
      }
    },
  )

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
