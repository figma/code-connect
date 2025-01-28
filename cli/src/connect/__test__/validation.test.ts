import { validateDoc } from '../validation'
import { CodeConnectJSON } from '../figma_connect'
import { logger } from '../../common/logging'

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
