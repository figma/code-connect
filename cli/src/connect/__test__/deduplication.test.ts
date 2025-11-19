import { deduplicateCodeConnectDocs } from '../helpers'
import { BaseCodeConnectObject, CodeConnectJSON } from '../figma_connect'

describe('deduplicateCodeConnectDocs', () => {
  const createDoc = (
    figmaNode: string,
    template: string,
    overrides: Partial<CodeConnectJSON> = {},
  ): CodeConnectJSON => ({
    figmaNode,
    template,
    component: 'TestComponent',
    templateData: { props: {}, imports: [] },
    language: 'typescript',
    label: 'Test',
    metadata: {
      cliVersion: '1.0.0',
    },
    ...overrides,
  })

  const createBaseDoc = (
    figmaNode: string,
    template: string,
    overrides: Partial<BaseCodeConnectObject> = {},
  ): BaseCodeConnectObject => ({
    figmaNode,
    template,
    component: 'TestComponent',
    templateData: { props: {}, imports: [] },
    language: 'typescript',
    label: 'Test',
    ...overrides,
  })

  describe('with CodeConnectJSON (with metadata)', () => {
    it('should deduplicate docs with identical figmaNode and template', () => {
      const docs: CodeConnectJSON[] = [
        createDoc('https://figma.com/file/abc/node1', 'template1'),
        createDoc('https://figma.com/file/abc/node1', 'template1', { label: 'Different Label' }),
        createDoc('https://figma.com/file/abc/node2', 'template2'),
      ]

      const result = deduplicateCodeConnectDocs(docs)

      // Should keep first occurrence and remove duplicate
      expect(result).toHaveLength(2)
      expect(result[0]).toEqual(docs[0]) // First doc kept
      expect(result[1]).toEqual(docs[2])
    })

    it('should NOT deduplicate docs with same figmaNode but different template', () => {
      const docs: CodeConnectJSON[] = [
        createDoc('https://figma.com/file/abc/node1', 'template1'),
        createDoc('https://figma.com/file/abc/node1', 'template2'),
      ]

      const result = deduplicateCodeConnectDocs(docs)

      // Different templates mean different code examples, should keep both
      expect(result).toHaveLength(2)
    })

    it('should NOT deduplicate docs with same template but different figmaNode', () => {
      const docs: CodeConnectJSON[] = [
        createDoc('https://figma.com/file/abc/node1', 'template1'),
        createDoc('https://figma.com/file/abc/node2', 'template1'),
      ]

      const result = deduplicateCodeConnectDocs(docs)

      // Different nodes mean different components, should keep both
      expect(result).toHaveLength(2)
    })

    it('should handle empty array', () => {
      const result = deduplicateCodeConnectDocs([])
      expect(result).toEqual([])
    })

    it('should handle single doc', () => {
      const docs: CodeConnectJSON[] = [createDoc('https://figma.com/file/abc/node1', 'template1')]

      const result = deduplicateCodeConnectDocs(docs)

      expect(result).toEqual(docs)
    })

    it('should keep first occurrence when multiple duplicates exist', () => {
      const docs: CodeConnectJSON[] = [
        createDoc('https://figma.com/file/abc/node1', 'template1', { label: 'First' }),
        createDoc('https://figma.com/file/abc/node1', 'template1', { label: 'Second' }),
        createDoc('https://figma.com/file/abc/node1', 'template1', { label: 'Third' }),
      ]

      const result = deduplicateCodeConnectDocs(docs)

      expect(result).toHaveLength(1)
      expect(result[0].label).toBe('First')
    })

    it('should deduplicate across multi-module project scenario', () => {
      // Simulates same component appearing in multiple modules
      const docs: CodeConnectJSON[] = [
        createDoc('https://figma.com/file/abc/node1', '<Button {...props} />', {
          component: 'Button',
          source: 'module1/Button.tsx',
        }),
        createDoc('https://figma.com/file/abc/node1', '<Button {...props} />', {
          component: 'Button',
          source: 'module2/Button.tsx',
        }),
        createDoc('https://figma.com/file/abc/node2', '<Input {...props} />', {
          component: 'Input',
          source: 'module1/Input.tsx',
        }),
      ]

      const result = deduplicateCodeConnectDocs(docs)

      // Should only keep one Button despite being in different modules
      expect(result).toHaveLength(2)
      expect(result.find((d) => d.component === 'Button')).toBeDefined()
      expect(result.find((d) => d.component === 'Input')).toBeDefined()
    })
  })

  describe('with BaseCodeConnectObject (without metadata)', () => {
    it('should work with BaseCodeConnectObject from parser response', () => {
      const docs: BaseCodeConnectObject[] = [
        createBaseDoc('https://figma.com/file/abc/node1', 'template1'),
        createBaseDoc('https://figma.com/file/abc/node1', 'template1'),
        createBaseDoc('https://figma.com/file/abc/node2', 'template2'),
      ]

      const result = deduplicateCodeConnectDocs(docs)

      expect(result).toHaveLength(2)
    })

    it('should preserve type when deduplicating BaseCodeConnectObject', () => {
      const docs: BaseCodeConnectObject[] = [createBaseDoc('node1', 'template1')]

      const result = deduplicateCodeConnectDocs(docs)

      // Type should be preserved
      expect(result).toHaveLength(1)
      expect(result[0]).not.toHaveProperty('metadata')
    })
  })

  describe('edge cases', () => {
    it('should handle docs with special characters in template', () => {
      const docs: CodeConnectJSON[] = [
        createDoc('node1', '<Component prop={"value with \\"quotes\\""} />'),
        createDoc('node1', '<Component prop={"value with \\"quotes\\""} />'),
      ]

      const result = deduplicateCodeConnectDocs(docs)

      expect(result).toHaveLength(1)
    })

    it('should handle docs with newlines in template', () => {
      const template = `<Component
        prop1="value1"
        prop2="value2"
      />`

      const docs: CodeConnectJSON[] = [
        createDoc('node1', template),
        createDoc('node1', template),
      ]

      const result = deduplicateCodeConnectDocs(docs)

      expect(result).toHaveLength(1)
    })

    it('should treat similar but not identical templates as different', () => {
      const docs: CodeConnectJSON[] = [
        createDoc('node1', '<Component prop="value1" />'),
        createDoc('node1', '<Component prop="value2" />'),
      ]

      const result = deduplicateCodeConnectDocs(docs)

      // Different prop values = different templates
      expect(result).toHaveLength(2)
    })

    it('should handle docs with very long templates', () => {
      const longTemplate = '<Component>' + 'child'.repeat(1000) + '</Component>'

      const docs: CodeConnectJSON[] = [
        createDoc('node1', longTemplate),
        createDoc('node1', longTemplate),
      ]

      const result = deduplicateCodeConnectDocs(docs)

      expect(result).toHaveLength(1)
    })
  })

  describe('cross-parser scenarios', () => {
    it('should deduplicate docs from different parsers with same content', () => {
      // Simulates React parser + no-parser template with identical content
      const docs: CodeConnectJSON[] = [
        createDoc('https://figma.com/file/abc/node1', '<Button {...props} />', {
          language: 'typescript',
          label: 'React',
        }),
        createDoc('https://figma.com/file/abc/node1', '<Button {...props} />', {
          language: 'raw',
          label: 'Code',
        }),
      ]

      const result = deduplicateCodeConnectDocs(docs)

      // Should keep first one (React) even though second is from different parser
      expect(result).toHaveLength(1)
      expect(result[0].label).toBe('React')
    })

    it('should NOT deduplicate similar docs with different code examples', () => {
      // Different implementation approaches for same Figma component
      const docs: CodeConnectJSON[] = [
        createDoc('node1', '<Button variant="primary" />', {
          label: 'React - Props',
        }),
        createDoc('node1', '<Button className="btn-primary" />', {
          label: 'React - CSS',
        }),
      ]

      const result = deduplicateCodeConnectDocs(docs)

      // Both are valid approaches, should keep both
      expect(result).toHaveLength(2)
    })
  })
})
