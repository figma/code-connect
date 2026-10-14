import { validateDoc, validateDocs } from '../validation'
import { CodeConnectJSON } from '../figma_connect'
import { logger } from '../../common/logging'
import * as publishMetrics from '../publish_metrics'
import type { BaseCommand } from '../../commands/connect'

const MOCK_DOC: any = {
  variant: { toggled: 'on' },
}

const createMockFigmaNode = (variantOptions: string[]) => {
  return {
    document: {
      type: 'COMPONENT_SET',
      componentPropertyDefinitions: {
        toggled: {
          type: 'VARIANT',
          defaultValue: variantOptions[0],
          variantOptions,
        },
      },
    },
    components: {},
    componentSets: { '1:23': { name: 'ComponentSet' } },
  }
}

const NID = '1:23'
describe('validateDoc', () => {
  describe('variants in a component set', () => {
    beforeEach(() => {
      logger.error = jest.fn()
      jest.resetAllMocks()
    })
    it('a variant value should be one of the available variant options', () => {
      const figmaNode = createMockFigmaNode(['a', 'b', 'c'])
      expect(validateDoc({ variant: { toggled: 'a' } } as any, figmaNode, NID)).toBe(true)
      expect(validateDoc({ variant: { toggled: 'b' } } as any, figmaNode, NID)).toBe(true)
      expect(validateDoc({ variant: { toggled: 'c' } } as any, figmaNode, NID)).toBe(true)

      expect(validateDoc({ variant: { toggled: 'd' } } as any, figmaNode, NID)).toBe(false)
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('The Figma Variant "toggled" does not have an option for d'),
      )
    })

    describe('boolean-like variants', () => {
      it.each([
        ['true', 'false'],
        ['yes', 'no'],
        ['on', 'off'],
        ['True', 'False'],
        ['YES', 'NO'],
        ['ON', 'OFF'],
      ])('works well with %s/%s variants or exact string matching', (trueValue, falseValue) => {
        const figmaNode = createMockFigmaNode([trueValue, falseValue])

        expect(validateDoc({ variant: { toggled: true } } as any, figmaNode, NID)).toBe(true)
        expect(validateDoc({ variant: { toggled: false } } as any, figmaNode, NID)).toBe(true)
        expect(validateDoc({ variant: { toggled: trueValue } } as any, figmaNode, NID)).toBe(true)
        expect(validateDoc({ variant: { toggled: falseValue } } as any, figmaNode, NID)).toBe(true)
      })

      it("it doesn't work with other values", () => {
        const figmaNode = createMockFigmaNode(['positive', 'negative'])
        expect(validateDoc({ variant: { toggled: true } } as any, figmaNode, NID)).toBe(false)
        expect(validateDoc({ variant: { toggled: false } } as any, figmaNode, NID)).toBe(false)
      })
      it("it doesn't work with more than two variant values", () => {
        const figmaNode = createMockFigmaNode(['true', 'false', 'maybe'])
        expect(validateDoc({ variant: { toggled: true } } as any, figmaNode, NID)).toBe(false)
        expect(validateDoc({ variant: { toggled: false } } as any, figmaNode, NID)).toBe(false)
      })
      it("it doesn't work with using a non-boolean value with boolean-like variants", () => {
        const figmaNode = createMockFigmaNode(['true', 'false'])
        expect(validateDoc({ variant: { toggled: 1 } } as any, figmaNode, NID)).toBe(false)
        expect(logger.error).toHaveBeenCalledWith(
          expect.stringContaining('The Figma Variant "toggled" does not have an option for 1'),
        )
      })
    })
  })
})

describe('validateDocs telemetry', () => {
  const cmd = { verbose: false, dryRun: false } as BaseCommand
  const doc = { figmaNode: 'https://www.figma.com/design/abc/Test?node-id=1-2' } as CodeConnectJSON
  let fetchSpy: jest.SpyInstance
  let trackSpy: jest.SpyInstance

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch')
    trackSpy = jest.spyOn(publishMetrics, 'trackPreflightRejection').mockResolvedValue()
  })

  afterEach(() => jest.restoreAllMocks())

  it('counts malformed node IDs', async () => {
    expect(await validateDocs(cmd, 'token', [{ ...doc, figmaNode: `${doc.figmaNode}bad` }])).toBe(
      false,
    )
    expect(trackSpy).toHaveBeenCalledWith(
      'https://api.figma.com/v1/files/',
      'preflight_invalid_figma_node',
    )
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it.each([401, 403, 404, 500])('tracks selected 4xx, not 5xx (%s)', async (status) => {
    fetchSpy.mockResolvedValue(new Response('{"message":"error"}', { status }))
    expect(await validateDocs(cmd, 'token', [doc])).toBe(false)
    expect(trackSpy).toHaveBeenCalledTimes(status === 500 ? 0 : 1)
    if (status !== 500) {
      expect(trackSpy).toHaveBeenCalledWith(
        'https://api.figma.com/v1/files/',
        status === 404 ? 'preflight_file_unavailable' : 'preflight_api_rejected',
      )
    }
  })

  it('does not count dry-run rejections', async () => {
    expect(
      await validateDocs({ verbose: false, dryRun: true } as BaseCommand, 'token', [
        { ...doc, figmaNode: 'bad' },
      ]),
    ).toBe(false)
    expect(trackSpy).not.toHaveBeenCalled()
  })
})
