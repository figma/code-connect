import { trackPreflightRejection } from '../publish_metrics'

describe('trackPreflightRejection', () => {
  const send = jest.fn()
  const originalDoNotTrack = process.env.DO_NOT_TRACK

  beforeEach(() => {
    send.mockReset()
    delete process.env.DO_NOT_TRACK
  })

  afterAll(() => {
    if (originalDoNotTrack === undefined) delete process.env.DO_NOT_TRACK
    else process.env.DO_NOT_TRACK = originalDoNotTrack
  })

  it.each(['preflight_invalid_figma_node', 'preflight_invalid_document'] as const)(
    'sends %s',
    async (reason) => {
      await trackPreflightRejection('https://api.figma.com/v1/files/', reason, send)

      expect(send).toHaveBeenCalledTimes(1)
      const [url, options] = send.mock.calls[0]
      expect(url).toBe('https://www.figma.com/api/figment-proxy/put')
      expect(options).toMatchObject({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      expect(JSON.parse(options.body)).toEqual([
        {
          figment_metadata: { namespace: 'figapi' },
          data: {
            event: 'code_connect_publish_rejected',
            properties: { tier: 'unknown', source: 'cli', operation: 'publish', reason },
            context: { forwardToDatadog: true },
          },
        },
      ])
    },
  )

  it('honors DO_NOT_TRACK and ignores request failures', async () => {
    process.env.DO_NOT_TRACK = '1'
    await trackPreflightRejection('https://api.figma.com/v1', 'preflight_invalid_document', send)
    expect(send).not.toHaveBeenCalled()

    delete process.env.DO_NOT_TRACK
    send.mockRejectedValueOnce(new Error('offline'))
    await expect(
      trackPreflightRejection('https://api.figma.com/v1', 'preflight_invalid_document', send),
    ).resolves.toBeUndefined()
  })
})
