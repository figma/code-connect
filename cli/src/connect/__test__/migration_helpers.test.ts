import {
  migrateV1TemplateToV2,
  migrateTemplateToUseServerSideHelpers,
  addImports,
  addNestableToMetadata,
  writeTemplateFile,
  removePropsDefinitionAndMetadata,
  prepareMigratedTemplate,
  groupCodeConnectObjectsByFigmaUrl,
  writeVariantTemplateFile,
  getFilenameFromComponentName,
} from '../migration_helpers'
import { CodeConnectJSON } from '../figma_connect'
import { SyntaxHighlightLanguage } from '../label_language_mapping'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

describe('migrateV1TemplateToV2', () => {
  describe('Core object rename', () => {
    it('should rename figma.currentLayer to figma.selectedInstance', () => {
      const input = `const figma = require('figma')
const prop = figma.currentLayer.__properties__.string('Text')`
      const expected = `const figma = require('figma')
const prop = figma.selectedInstance.getString('Text')`
      expect(migrateV1TemplateToV2(input)).toBe(expected)
    })

    it('should handle multiple occurrences of figma.currentLayer', () => {
      const input = `const prop1 = figma.currentLayer.__properties__.string('Text')
const prop2 = figma.currentLayer.__properties__.boolean('Bool')`
      const expected = `const prop1 = figma.selectedInstance.getString('Text')
const prop2 = figma.selectedInstance.getBoolean('Bool')`
      expect(migrateV1TemplateToV2(input)).toBe(expected)
    })
  })

  describe('Template type normalization', () => {
    it('should normalize figma template helpers to figma.code', () => {
      const input = `export default figma.html\`<div>Hello</div>\``
      const result = migrateV1TemplateToV2(input)
      expect(result).toContain('figma.code')
      expect(result).not.toContain('figma.html')
    })
  })

  describe('Property accessor methods', () => {
    it('should migrate __properties__.string() to getString()', () => {
      const input = `const text = figma.currentLayer.__properties__.string('Label')`
      const expected = `const text = figma.selectedInstance.getString('Label')`
      expect(migrateV1TemplateToV2(input)).toBe(expected)
    })

    it('should migrate __properties__.boolean() to getBoolean()', () => {
      const input = `const disabled = figma.currentLayer.__properties__.boolean('Disabled')`
      const expected = `const disabled = figma.selectedInstance.getBoolean('Disabled')`
      expect(migrateV1TemplateToV2(input)).toBe(expected)
    })

    it('should migrate __properties__.boolean() with options to getBoolean()', () => {
      const input = `const icon = figma.currentLayer.__properties__.boolean('Icon', {
"true": 'icon',
"false": undefined})`
      const expected = `const icon = figma.selectedInstance.getBoolean('Icon', {
"true": 'icon',
"false": undefined})`
      expect(migrateV1TemplateToV2(input)).toBe(expected)
    })

    it('should migrate __properties__.enum() to getEnum()', () => {
      const input = `const size = figma.currentLayer.__properties__.enum('Size', {
"Large": 'large',
"Small": 'small'})`
      const expected = `const size = figma.selectedInstance.getEnum('Size', {
"Large": 'large',
"Small": 'small'})`
      expect(migrateV1TemplateToV2(input)).toBe(expected)
    })

    it('should migrate __properties__.__instance__() to getInstanceSwap()', () => {
      const input = `const instance = figma.currentLayer.__properties__.__instance__('Icon')`
      const expected = `const instance = figma.selectedInstance.getInstanceSwap('Icon')`
      expect(migrateV1TemplateToV2(input)).toBe(expected)
    })

    it('should handle all property methods in the same template', () => {
      const input = `const str = figma.currentLayer.__properties__.string('Text')
const bool = figma.currentLayer.__properties__.boolean('Disabled')
const enumVal = figma.currentLayer.__properties__.enum('Size', { "Large": 'lg' })
const inst = figma.currentLayer.__properties__.__instance__('Icon')`
      const expected = `const str = figma.selectedInstance.getString('Text')
const bool = figma.selectedInstance.getBoolean('Disabled')
const enumVal = figma.selectedInstance.getEnum('Size', { "Large": 'lg' })
const inst = figma.selectedInstance.getInstanceSwap('Icon')`
      expect(migrateV1TemplateToV2(input)).toBe(expected)
    })
  })

  describe('Properties alias', () => {
    it('should migrate figma.selectedInstance.__properties__ to figma.properties', () => {
      const input = `const children = figma.selectedInstance.__properties__.children(["Button"])`
      const expected = `const children = figma.properties.children(["Button"])`
      expect(migrateV1TemplateToV2(input)).toBe(expected)
    })

    it('should handle multiple __properties__ calls', () => {
      const input = `const children = figma.selectedInstance.__properties__.children(["Button"])
const other = figma.selectedInstance.__properties__.something()`
      const expected = `const children = figma.properties.children(["Button"])
const other = figma.properties.something()`
      expect(migrateV1TemplateToV2(input)).toBe(expected)
    })
  })

  describe('Other method renames', () => {
    it('should migrate __getPropertyValue__() to getPropertyValue()', () => {
      const input = `const value = figma.currentLayer.__getPropertyValue__('PropName')`
      const expected = `const value = figma.selectedInstance.getPropertyValue('PropName')`
      expect(migrateV1TemplateToV2(input)).toBe(expected)
    })
  })

  describe('Export format - simple case', () => {
    it('should wrap simple figma.code export in V2 format', () => {
      const input = `export default figma.code\`<Component />\``
      const expected = `export default { example: figma.code\`<Component />\` }`
      expect(migrateV1TemplateToV2(input)).toBe(expected)
    })

    it('should wrap simple figma.tsx export in V2 format', () => {
      const input = `export default figma.tsx\`<Component />\``
      const expected = `export default { example: figma.code\`<Component />\` }`
      expect(migrateV1TemplateToV2(input)).toBe(expected)
    })

    it('should wrap simple figma.html export in V2 format', () => {
      const input = `export default figma.html\`<div></div>\``
      const expected = `export default { example: figma.code\`<div></div>\` }`
      expect(migrateV1TemplateToV2(input)).toBe(expected)
    })

    it('should wrap simple figma.swift export in V2 format', () => {
      const input = `export default figma.swift\`Button()\``
      const expected = `export default { example: figma.code\`Button()\` }`
      expect(migrateV1TemplateToV2(input)).toBe(expected)
    })

    it('should wrap simple figma.kotlin export in V2 format', () => {
      const input = `export default figma.kotlin\`Button()\``
      const expected = `export default { example: figma.code\`Button()\` }`
      expect(migrateV1TemplateToV2(input)).toBe(expected)
    })

    it('should handle multiline template literals', () => {
      const input = `export default figma.tsx\`<Button>
  \${label}
</Button>\``
      const expected = `export default { example: figma.code\`<Button>
  \${label}
</Button>\` }`
      expect(migrateV1TemplateToV2(input)).toBe(expected)
    })
  })

  describe('Export format - spread operator case', () => {
    it('should migrate spread operator export format', () => {
      const input = `export default { ...figma.tsx\`<Component />\`, metadata: { __props } }`
      const expected = `export default { example: figma.code\`<Component />\`, metadata: { __props } }`
      expect(migrateV1TemplateToV2(input)).toBe(expected)
    })

    it('should handle spread operator with various template types', () => {
      const input = `export default { ...figma.code\`code\`, metadata: { __props } }`
      const expected = `export default { example: figma.code\`code\`, metadata: { __props } }`
      expect(migrateV1TemplateToV2(input)).toBe(expected)
    })

    it('should handle spread operator with whitespace variations', () => {
      const input = `export default {  ...figma.tsx\`<Component />\`, metadata: { __props } }`
      const expected = `export default { example: figma.code\`<Component />\`, metadata: { __props } }`
      expect(migrateV1TemplateToV2(input)).toBe(expected)
    })
  })

  describe('Real-world template examples', () => {
    it('should migrate a complete V1 template with props and metadata', () => {
      const input = `const figma = require('figma')

const variant = figma.currentLayer.__properties__.enum('Variant', {
"Primary": 'primary',
"Secondary": 'secondary'})
const disabled = figma.currentLayer.__properties__.boolean('Disabled')
const label = figma.currentLayer.__properties__.string('Label')
const __props = {}
if (variant && variant.type !== 'ERROR') {
  __props["variant"] = variant
}
if (disabled && disabled.type !== 'ERROR') {
  __props["disabled"] = disabled
}
if (label && label.type !== 'ERROR') {
  __props["label"] = label
}

export default { ...figma.tsx\`<Button\${_fcc_renderReactProp('variant', variant)}\${_fcc_renderReactProp('disabled', disabled)}>
  \${_fcc_renderReactChildren(label)}
</Button>\`, metadata: { __props } }`

      const expected = `const figma = require('figma')

const variant = figma.selectedInstance.getEnum('Variant', {
"Primary": 'primary',
"Secondary": 'secondary'})
const disabled = figma.selectedInstance.getBoolean('Disabled')
const label = figma.selectedInstance.getString('Label')
const __props = {}
if (variant && variant.type !== 'ERROR') {
  __props["variant"] = variant
}
if (disabled && disabled.type !== 'ERROR') {
  __props["disabled"] = disabled
}
if (label && label.type !== 'ERROR') {
  __props["label"] = label
}

export default { example: figma.code\`<Button\${_fcc_renderReactProp('variant', variant)}\${_fcc_renderReactProp('disabled', disabled)}>
  \${_fcc_renderReactChildren(label)}
</Button>\`, metadata: { __props } }`

      expect(migrateV1TemplateToV2(input)).toBe(expected)
    })

    it('should migrate a simple template without metadata', () => {
      const input = `const figma = require('figma')
const text = figma.currentLayer.__properties__.string('Text')

export default figma.code\`def python_code():
  return \${text}\``

      const expected = `const figma = require('figma')
const text = figma.selectedInstance.getString('Text')

export default { example: figma.code\`def python_code():
  return \${text}\` }`

      expect(migrateV1TemplateToV2(input)).toBe(expected)
    })
  })

  describe('Legacy find methods', () => {
    describe('__findChildWithCriteria__', () => {
      it('should migrate TEXT type with __render__() to findText().textContent', () => {
        const input = `const text = figma.selectedInstance.__findChildWithCriteria__({ name: 'Label', type: "TEXT" }).__render__()`
        const expected = `const text = figma.selectedInstance.findText('Label').textContent`
        expect(migrateV1TemplateToV2(input)).toBe(expected)
      })

      it('should handle TEXT type with reversed parameter order', () => {
        const input = `const text = figma.selectedInstance.__findChildWithCriteria__({ type: "TEXT", name: 'Label' }).__render__()`
        const expected = `const text = figma.selectedInstance.findText('Label').textContent`
        expect(migrateV1TemplateToV2(input)).toBe(expected)
      })

      it('should migrate INSTANCE type to findInstance()', () => {
        const input = `const instance = figma.selectedInstance.__findChildWithCriteria__({ name: 'Icon', type: 'INSTANCE' })`
        const expected = `const instance = figma.selectedInstance.findInstance('Icon')`
        expect(migrateV1TemplateToV2(input)).toBe(expected)
      })

      it('should handle INSTANCE type with reversed parameter order', () => {
        const input = `const instance = figma.selectedInstance.__findChildWithCriteria__({ type: 'INSTANCE', name: 'Icon' })`
        const expected = `const instance = figma.selectedInstance.findInstance('Icon')`
        expect(migrateV1TemplateToV2(input)).toBe(expected)
      })

      it('should migrate TEXT type without __render__() to findText()', () => {
        const input = `const textHandle = figma.selectedInstance.__findChildWithCriteria__({ name: 'Label', type: 'TEXT' })`
        const expected = `const textHandle = figma.selectedInstance.findText('Label')`
        expect(migrateV1TemplateToV2(input)).toBe(expected)
      })

      it('should handle TEXT type with double quotes', () => {
        const input = `const text = figma.selectedInstance.__findChildWithCriteria__({ name: 'Label', type: "TEXT" }).__render__()`
        const expected = `const text = figma.selectedInstance.findText('Label').textContent`
        expect(migrateV1TemplateToV2(input)).toBe(expected)
      })

      it('should handle INSTANCE type with double quotes', () => {
        const input = `const instance = figma.selectedInstance.__findChildWithCriteria__({ name: 'Icon', type: "INSTANCE" })`
        const expected = `const instance = figma.selectedInstance.findInstance('Icon')`
        expect(migrateV1TemplateToV2(input)).toBe(expected)
      })
    })

    describe('__find__', () => {
      it('should migrate __find__() to findInstance() with single quotes', () => {
        const input = `const child = figma.selectedInstance.__find__('ChildName')`
        const expected = `const child = figma.selectedInstance.findInstance("ChildName")`
        expect(migrateV1TemplateToV2(input)).toBe(expected)
      })

      it('should migrate __find__() to findInstance() with double quotes', () => {
        const input = `const child = figma.selectedInstance.__find__("ChildName")`
        const expected = `const child = figma.selectedInstance.findInstance("ChildName")`
        expect(migrateV1TemplateToV2(input)).toBe(expected)
      })

      it('should handle multiple __find__() calls', () => {
        const input = `const child1 = figma.selectedInstance.__find__('Child1')
const child2 = figma.selectedInstance.__find__('Child2')`
        const expected = `const child1 = figma.selectedInstance.findInstance("Child1")
const child2 = figma.selectedInstance.findInstance("Child2")`
        expect(migrateV1TemplateToV2(input)).toBe(expected)
      })
    })
  })

  describe('Template execution methods', () => {
    describe('__render__', () => {
      it('should migrate __render__() to executeTemplate().example', () => {
        const input = `const rendered = instance.__render__()`
        const expected = `const rendered = instance.executeTemplate().example`
        expect(migrateV1TemplateToV2(input)).toBe(expected)
      })

      it('should handle multiple __render__() calls', () => {
        const input = `const r1 = instance1.__render__()
const r2 = instance2.__render__()`
        const expected = `const r1 = instance1.executeTemplate().example
const r2 = instance2.executeTemplate().example`
        expect(migrateV1TemplateToV2(input)).toBe(expected)
      })

      it('should not double-migrate __render__() from __findChildWithCriteria__()', () => {
        // __render__() should already be handled by __findChildWithCriteria__ migration
        const input = `const text = figma.selectedInstance.__findChildWithCriteria__({ name: 'Label', type: "TEXT" }).__render__()`
        const result = migrateV1TemplateToV2(input)
        // Should become findText().textContent, not findText().__render__() or findText().executeTemplate().example
        expect(result).toBe(`const text = figma.selectedInstance.findText('Label').textContent`)
        expect(result).not.toContain('__render__')
        expect(result).not.toContain('executeTemplate')
      })
    })

    describe('__getProps__', () => {
      it('should migrate __getProps__() to executeTemplate().metadata.props', () => {
        const input = `const props = instance.__getProps__()`
        const expected = `const props = instance.executeTemplate().metadata.props`
        expect(migrateV1TemplateToV2(input)).toBe(expected)
      })

      it('should handle multiple __getProps__() calls', () => {
        const input = `const p1 = instance1.__getProps__()
const p2 = instance2.__getProps__()`
        const expected = `const p1 = instance1.executeTemplate().metadata.props
const p2 = instance2.executeTemplate().metadata.props`
        expect(migrateV1TemplateToV2(input)).toBe(expected)
      })
    })
  })

  describe('Real-world generated patterns', () => {
    it('should migrate TextContent intrinsic pattern', () => {
      // This is the pattern generated by intrinsics.ts for TextContent
      const input = `figma.selectedInstance.__findChildWithCriteria__({ name: 'Label', type: "TEXT" }).__render__()`
      const expected = `figma.selectedInstance.findText('Label').textContent`
      expect(migrateV1TemplateToV2(input)).toBe(expected)
    })

    it('should migrate NestedProps intrinsic pattern', () => {
      // This is the pattern generated by intrinsics.ts for NestedProps
      const input = `const nestedLayer0 = figma.selectedInstance.__find__("IconLayer")
return nestedLayer0.type === "ERROR" ? nestedLayer0 : {
  iconName: nestedLayer0.getString('Name')
}`
      const expected = `const nestedLayer0 = figma.selectedInstance.findInstance("IconLayer")
return nestedLayer0.type === "ERROR" ? nestedLayer0 : {
  iconName: nestedLayer0.getString('Name')
}`
      expect(migrateV1TemplateToV2(input)).toBe(expected)
    })

    it('should migrate GetProps modifier pattern', () => {
      // This is the pattern generated by modifiers.ts for GetProps
      const input = `const props = nestedInstance.__getProps__()`
      const expected = `const props = nestedInstance.executeTemplate().metadata.props`
      expect(migrateV1TemplateToV2(input)).toBe(expected)
    })
  })

  describe('Instance property accessor', () => {
    it('should migrate __properties__.instance() to getInstanceSwap()?.executeTemplate().example', () => {
      const input = `const icon = figma.selectedInstance.__properties__.instance('Icon')`
      const expected = `const icon = figma.selectedInstance.getInstanceSwap('Icon')?.executeTemplate().example`
      expect(migrateV1TemplateToV2(input)).toBe(expected)
    })

    it('should handle __properties__.instance() with double quotes', () => {
      const input = `const icon = figma.selectedInstance.__properties__.instance("Icon")`
      const expected = `const icon = figma.selectedInstance.getInstanceSwap("Icon")?.executeTemplate().example`
      expect(migrateV1TemplateToV2(input)).toBe(expected)
    })

    it('should handle multiple __properties__.instance() calls', () => {
      const input = `const icon1 = figma.selectedInstance.__properties__.instance('Icon1')
const icon2 = figma.selectedInstance.__properties__.instance('Icon2')`
      const expected = `const icon1 = figma.selectedInstance.getInstanceSwap('Icon1')?.executeTemplate().example
const icon2 = figma.selectedInstance.getInstanceSwap('Icon2')?.executeTemplate().example`
      expect(migrateV1TemplateToV2(input)).toBe(expected)
    })

    it('should handle __properties__.instance() in template literals', () => {
      const input = `export default { example: figma.code\`<Component icon=\${figma.selectedInstance.__properties__.instance('Icon')} />\` }`
      const expected = `export default { example: figma.code\`<Component icon=\${figma.selectedInstance.getInstanceSwap('Icon')?.executeTemplate().example} />\` }`
      expect(migrateV1TemplateToV2(input)).toBe(expected)
    })

    it('should not confuse __properties__.instance() with __properties__.__instance__()', () => {
      // __properties__.__instance__() should only add .getInstanceSwap(), not .executeTemplate().example
      const input = `const instanceHandle = figma.selectedInstance.__properties__.__instance__('Icon')`
      const expected = `const instanceHandle = figma.selectedInstance.getInstanceSwap('Icon')`
      expect(migrateV1TemplateToV2(input)).toBe(expected)
    })
  })

  describe('Patterns intentionally NOT migrated', () => {
    it('should migrate __properties__.children() to figma.properties alias', () => {
      const input = `const children = figma.currentLayer.__properties__.children(['Child1', 'Child2'])`
      const result = migrateV1TemplateToV2(input)
      // Should migrate currentLayer and also use figma.properties alias
      const expected = `const children = figma.properties.children(['Child1', 'Child2'])`
      expect(result).toBe(expected)
    })

    it('should leave __renderWithFn__() as-is (complex transformation)', () => {
      const input = `const rendered = instance.__renderWithFn__(({prop1, prop2}) => figma.code\\\`<Component prop1=\${prop1} />\\\`)`
      const result = migrateV1TemplateToV2(input)
      // Should still contain __renderWithFn__ as it's not migrated
      expect(result).toContain('__renderWithFn__')
    })

    it('should leave __props metadata pattern as-is', () => {
      const input = `const __props = {}
if (variant && variant.type !== 'ERROR') {
  __props["variant"] = variant
}`
      const result = migrateV1TemplateToV2(input)
      expect(result).toBe(input)
    })
  })

  describe('Edge cases', () => {
    it('should handle already migrated V2 templates (idempotent)', () => {
      const input = `const figma = require('figma')
const text = figma.selectedInstance.getString('Text')
export default { example: figma.code\`<Component />\` }`
      const result = migrateV1TemplateToV2(input)
      expect(result).toBe(input)
    })

    it('should handle partially migrated templates', () => {
      const input = `const prop1 = figma.selectedInstance.getString('Text')
const prop2 = figma.currentLayer.__properties__.boolean('Bool')`
      const expected = `const prop1 = figma.selectedInstance.getString('Text')
const prop2 = figma.selectedInstance.getBoolean('Bool')`
      expect(migrateV1TemplateToV2(input)).toBe(expected)
    })

    it('should handle empty template', () => {
      expect(migrateV1TemplateToV2('')).toBe('')
    })

    it('should handle template with no migrations needed', () => {
      const input = `const figma = require('figma')
const value = 'static'
export default { example: figma.code\`\${value}\` }`
      expect(migrateV1TemplateToV2(input)).toBe(input)
    })
  })

  describe('Composition with other migrations', () => {
    it('should work correctly when chained with migrateTemplateToUseServerSideHelpers', () => {
      const input = `const figma = require('figma')
const label = figma.currentLayer.__properties__.string('Label')

export default figma.tsx\`<Button>\${_fcc_renderReactChildren(label)}</Button>\``

      // First migrate helpers, then V2
      const afterHelpers = migrateTemplateToUseServerSideHelpers(input)
      const afterV2 = migrateV1TemplateToV2(afterHelpers)

      expect(afterV2).toContain('figma.selectedInstance.getString')
      expect(afterV2).toContain('figma.helpers.react.renderChildren')
      expect(afterV2).toContain('export default { example: figma.code')
    })

    it('should work correctly in reverse order (V2 then helpers)', () => {
      const input = `const figma = require('figma')
const label = figma.currentLayer.__properties__.string('Label')

export default figma.tsx\`<Button>\${_fcc_renderReactChildren(label)}</Button>\``

      // First migrate V2, then helpers
      const afterV2 = migrateV1TemplateToV2(input)
      const afterHelpers = migrateTemplateToUseServerSideHelpers(afterV2)

      expect(afterHelpers).toContain('figma.selectedInstance.getString')
      expect(afterHelpers).toContain('figma.helpers.react.renderChildren')
      expect(afterHelpers).toContain('export default { example: figma.code')
    })
  })
})

describe('addImports', () => {
  it('should add imports after id field when id is present', () => {
    const input = `export default { id: 'my-component', example: figma.code\`<Component />\` }`
    const imports = ['import { Button } from "./ui"', 'import React from "react"']
    const expected = `export default { id: 'my-component', imports: ["import { Button } from \\"./ui\\"","import React from \\"react\\""], example: figma.code\`<Component />\` }`
    expect(addImports(input, imports)).toBe(expected)
  })

  it('should add imports at the start when no id field is present', () => {
    const input = `export default { example: figma.code\`<Component />\` }`
    const imports = ['import { Button } from "./ui"']
    const expected = `export default { imports: ["import { Button } from \\"./ui\\""], example: figma.code\`<Component />\` }`
    expect(addImports(input, imports)).toBe(expected)
  })

  it('should handle empty imports array by returning template unchanged', () => {
    const input = `export default { id: 'my-component', example: figma.code\`<Component />\` }`
    expect(addImports(input, [])).toBe(input)
  })

  it('should handle undefined imports by returning template unchanged', () => {
    const input = `export default { id: 'my-component', example: figma.code\`<Component />\` }`
    expect(addImports(input, undefined)).toBe(input)
  })

  it('should handle single import', () => {
    const input = `export default { id: 'my-component', example: figma.code\`<Component />\` }`
    const imports = ['import { Button } from "./ui"']
    const expected = `export default { id: 'my-component', imports: ["import { Button } from \\"./ui\\""], example: figma.code\`<Component />\` }`
    expect(addImports(input, imports)).toBe(expected)
  })

  it('should properly escape special characters in imports', () => {
    const input = `export default { id: 'my-component', example: figma.code\`<Component />\` }`
    const imports = ['import { Button } from "./ui/components"']
    const expected = `export default { id: 'my-component', imports: ["import { Button } from \\"./ui/components\\""], example: figma.code\`<Component />\` }`
    expect(addImports(input, imports)).toBe(expected)
  })

  it('should handle multiline templates', () => {
    const input = `export default {
  id: 'my-component',
  example: figma.code\`<Component />\`
}`
    const imports = ['import { Button } from "./ui"']
    // The regex will add imports after id on the same line
    const result = addImports(input, imports)
    expect(result).toContain(
      'id: \'my-component\', imports: ["import { Button } from \\"./ui\\""],',
    )
    expect(result).toContain('export default {')
    expect(result).toContain('example: figma.code')
  })
})

describe('addNestableToMetadata', () => {
  it('should add nestable to existing metadata object', () => {
    const input = `export default { id: 'Button', example: figma.tsx\`<Button />\`, metadata: { __props } }`
    const expected = `export default { id: 'Button', example: figma.tsx\`<Button />\`, metadata: { nestable: true, __props } }`
    expect(addNestableToMetadata(input, true)).toBe(expected)
  })

  it('should handle nestable: false', () => {
    const input = `export default { id: 'Button', example: figma.tsx\`<Button />\`, metadata: { __props } }`
    const expected = `export default { id: 'Button', example: figma.tsx\`<Button />\`, metadata: { nestable: false, __props } }`
    expect(addNestableToMetadata(input, false)).toBe(expected)
  })

  it('should return template unchanged when no metadata object exists', () => {
    const input = `export default { id: 'Button', example: figma.tsx\`<Button />\` }`
    expect(addNestableToMetadata(input, false)).toBe(input)
  })

  it('should handle metadata with whitespace (normalizes to single space)', () => {
    const input = `export default { id: 'Button', example: figma.tsx\`<Button />\`, metadata:  { __props } }`
    const expected = `export default { id: 'Button', example: figma.tsx\`<Button />\`, metadata: { nestable: true, __props } }`
    expect(addNestableToMetadata(input, true)).toBe(expected)
  })
})

describe('removePropsDefinitionAndMetadata', () => {
  it('should remove const __props definition, assignments, and __props from metadata', () => {
    const input = `const figma = require('figma')
const label = figma.selectedInstance.getString('Label')
const disabled = figma.selectedInstance.getBoolean('Disabled')
const __props = {}
if (label && label.type !== 'ERROR') {
  __props["label"] = label
}
if (disabled && disabled.type !== 'ERROR') {
  __props["disabled"] = disabled
}

export default { example: figma.tsx\`<Button />\`, metadata: { __props } }`

    const expected = `const figma = require('figma')
const label = figma.selectedInstance.getString('Label')
const disabled = figma.selectedInstance.getBoolean('Disabled')

export default { example: figma.tsx\`<Button />\`, metadata: {} }`

    expect(removePropsDefinitionAndMetadata(input)).toBe(expected)
  })
})

describe('writeTemplateFile with imports', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-migrate-test-'))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('should output a .figma.ts file by default', () => {
    const doc: CodeConnectJSON = {
      figmaNode: 'https://figma.com/file/abc?node-id=1:1',
      component: 'Button',
      template: `const figma = require('figma')
export default figma.tsx\`<Button />\``,
      templateData: { nestable: true },
      language: SyntaxHighlightLanguage.TypeScript,
      label: 'react',
      metadata: { cliVersion: '1.0.0' },
    }

    const { outputPath } = writeTemplateFile(doc, tempDir, tempDir)
    expect(outputPath).toMatch(/\.figma\.ts$/)
  })

  it('should output a .figma.js file when useTypeScript is false', () => {
    const doc: CodeConnectJSON = {
      figmaNode: 'https://figma.com/file/abc?node-id=1:1',
      component: 'Button',
      template: `const figma = require('figma')
export default figma.tsx\`<Button />\``,
      templateData: { nestable: true },
      language: SyntaxHighlightLanguage.TypeScript,
      label: 'react',
      metadata: { cliVersion: '1.0.0' },
    }

    const { outputPath } = writeTemplateFile(doc, tempDir, tempDir, {
      includeProps: false,
      useTypeScript: false,
    })
    expect(outputPath).toMatch(/\.figma\.js$/)
  })

  it('should include imports in the default export when migrating', () => {
    const doc: CodeConnectJSON = {
      figmaNode: 'https://figma.com/file/abc?node-id=1:1',
      component: 'Button',
      template: `const figma = require('figma')
const label = figma.currentLayer.__properties__.string('Label')

export default figma.tsx\`<Button>\${label}</Button>\``,
      templateData: {
        imports: ['import { Button } from "./ui"', 'import React from "react"'],
        nestable: true,
      },
      language: SyntaxHighlightLanguage.TypeScript,
      label: 'react',
      metadata: {
        cliVersion: '1.0.0',
      },
    }

    const { outputPath, skipped } = writeTemplateFile(doc, tempDir, tempDir)

    expect(skipped).toBe(false)
    expect(fs.existsSync(outputPath)).toBe(true)
    expect(outputPath).toMatch(/\.figma\.ts$/)

    const content = fs.readFileSync(outputPath, 'utf-8')

    // Verify URL is present
    expect(content).toContain('// url=https://figma.com/file/abc?node-id=1:1')

    // Verify imports are in the default export (prettier formats with single quotes)
    expect(content).toContain('imports: [')
    expect(content).toContain('import { Button } from "./ui"')
    expect(content).toContain('import React from "react"')

    // Verify id is present (prettier formats with double quotes)
    expect(content).toContain('id: "Button"')

    // Verify example is present
    expect(content).toContain('example: figma.code')

    // Verify V2 migration happened
    expect(content).toContain('figma.selectedInstance')
    expect(content).not.toContain('figma.currentLayer')
  })

  it('should not add imports field when no imports exist', () => {
    const doc: CodeConnectJSON = {
      figmaNode: 'https://figma.com/file/abc?node-id=1:1',
      component: 'Button',
      template: `const figma = require('figma')

export default figma.tsx\`<Button />\``,
      templateData: {
        nestable: true,
      },
      language: SyntaxHighlightLanguage.TypeScript,
      label: 'react',
      metadata: {
        cliVersion: '1.0.0',
      },
    }

    const { outputPath, skipped } = writeTemplateFile(doc, tempDir, tempDir)

    expect(skipped).toBe(false)
    const content = fs.readFileSync(outputPath, 'utf-8')

    // Verify imports field is not present
    expect(content).not.toContain('imports:')
  })

  it('should include component and source fields in comment header when present', () => {
    const doc: CodeConnectJSON = {
      figmaNode: 'https://figma.com/file/abc123?node-id=1:1',
      component: 'Button',
      source: 'src/components/button.tsx',
      template: `export default { id: 'Button', example: figma.code\`<Button />\` }`,
      templateData: {
        nestable: true,
        isParserless: true,
      },
      language: SyntaxHighlightLanguage.TypeScript,
      label: 'React',
      sourceLocation: { line: -1 },
      metadata: {
        cliVersion: '1.0.0',
      },
    }

    const { outputPath, skipped } = writeTemplateFile(doc, tempDir, tempDir)

    expect(skipped).toBe(false)
    const content = fs.readFileSync(outputPath, 'utf-8')

    // Verify comment fields are written
    expect(content).toContain('// url=https://figma.com/file/abc123?node-id=1:1')
    expect(content).toContain('// source=src/components/button.tsx')
    expect(content).toContain('// component=Button')
  })

  it('should only include url field when component and source are not present', () => {
    const doc: CodeConnectJSON = {
      figmaNode: 'https://figma.com/file/abc123?node-id=1:1',
      template: `export default { id: 'Button', example: figma.code\`<Button />\` }`,
      templateData: {
        nestable: true,
        isParserless: true,
      },
      language: SyntaxHighlightLanguage.TypeScript,
      label: 'React',
      sourceLocation: { line: -1 },
      metadata: {
        cliVersion: '1.0.0',
      },
    }

    const { outputPath, skipped } = writeTemplateFile(doc, tempDir, tempDir)

    expect(skipped).toBe(false)
    const content = fs.readFileSync(outputPath, 'utf-8')

    // Verify only url field is present
    expect(content).not.toContain('// component=')
    expect(content).not.toContain('// source=')
    expect(content).toContain('// url=https://figma.com/file/abc123?node-id=1:1')
  })
})

describe('prepareMigratedTemplate', () => {
  it('applies migrations and returns template (no url)', () => {
    const doc: CodeConnectJSON = {
      figmaNode: 'https://figma.com/file/abc?node-id=1:1',
      component: 'Button',
      template: `const figma = require('figma')
const label = figma.currentLayer.__properties__.string('Label')

export default figma.tsx\`<Button>\${label}</Button>\``,
      templateData: { nestable: true },
      language: SyntaxHighlightLanguage.TypeScript,
      label: 'react',
      metadata: { cliVersion: '1.0.0' },
    }
    const result = prepareMigratedTemplate(doc)
    expect(result).toContain('figma.selectedInstance.getString')
    expect(result).toContain('example: figma.code')
    expect(result).toContain('id:')
    expect(result).toContain('Button')
    expect(result).not.toContain('// url=')
  })

  describe('TypeScript type assertion for .type !== "ERROR" checks', () => {
    const baseDoc = (template: string): CodeConnectJSON => ({
      figmaNode: 'https://figma.com/file/abc?node-id=1:1',
      component: 'Button',
      template,
      templateData: { nestable: false },
      language: SyntaxHighlightLanguage.TypeScript,
      label: 'react',
      metadata: { cliVersion: '1.0.0' },
    })

    it('adds type assertion when useTypeScript is true', () => {
      const template = `const figma = require('figma')
const align = figma.selectedInstance.getInstanceSwap('Align')
const __props = {}
if (align && align.type !== "ERROR") {
  __props["align"] = align
}
export default { id: 'Button', example: figma.code\`<Button />\`, metadata: { nestable: false } }`
      const result = prepareMigratedTemplate(baseDoc(template), true, true)
      expect(result).toContain('(align as { type?: string }).type !== "ERROR"')
      expect(result).not.toMatch(/align\.type !== "ERROR"/)
    })

    it('does NOT add type assertion when useTypeScript is false', () => {
      const template = `const figma = require('figma')
const align = figma.selectedInstance.getInstanceSwap('Align')
const __props = {}
if (align && align.type !== "ERROR") {
  __props["align"] = align
}
export default { id: 'Button', example: figma.code\`<Button />\`, metadata: { nestable: false } }`
      const result = prepareMigratedTemplate(baseDoc(template), true, false)
      expect(result).not.toContain('as { type?: string }')
      expect(result).toContain('align.type !== "ERROR"')
    })

    it('handles multiple props with .type !== "ERROR" checks', () => {
      const template = `const figma = require('figma')
const align = figma.selectedInstance.getInstanceSwap('Align')
const children = figma.selectedInstance.getInstanceSwap('Children')
const __props = {}
if (align && align.type !== "ERROR") {
  __props["align"] = align
}
if (children && children.type !== "ERROR") {
  __props["children"] = children
}
export default { id: 'Button', example: figma.code\`<Button />\`, metadata: { nestable: false } }`
      const result = prepareMigratedTemplate(baseDoc(template), true, true)
      expect(result).toContain('(align as { type?: string }).type !== "ERROR"')
      expect(result).toContain('(children as { type?: string }).type !== "ERROR"')
      expect(result).not.toMatch(/\balign\.type !== "ERROR"/)
      expect(result).not.toMatch(/\bchildren\.type !== "ERROR"/)
    })

    it('converts require("figma") with double quotes to import when useTypeScript is true', () => {
      // getDefaultTemplate() in parser.ts generates require("figma") with double quotes
      const template = `const figma = require("figma")

export default figma.tsx\`<Button />\``
      const result = prepareMigratedTemplate(baseDoc(template), false, true)
      expect(result).toContain('import figma from "figma"')
      expect(result).not.toContain('require(')
    })
  })

  it('does not duplicate id when template already has id field', () => {
    const doc: CodeConnectJSON = {
      figmaNode: 'https://figma.com/file/abc?node-id=1:1',
      component: 'Button',
      template: `const figma = require('figma')
export default { id: 'Button', example: figma.code\`<Button />\` }`,
      templateData: { nestable: true },
      language: SyntaxHighlightLanguage.TypeScript,
      label: 'react',
      metadata: { cliVersion: '1.0.0' },
    }
    const result = prepareMigratedTemplate(doc)
    const idMatches = result.match(/\bid:/g)
    expect(idMatches).toHaveLength(1)
  })
})

describe('groupCodeConnectObjectsByFigmaUrl', () => {
  it('groups main + variants by figmaUrl', () => {
    const url = 'https://figma.com/file/abc?node-id=1:1'
    const main: CodeConnectJSON = {
      figmaNode: url,
      component: 'Button',
      template: 'export default { example: figma.tsx`<Button />` }',
      templateData: {},
      language: SyntaxHighlightLanguage.TypeScript,
      label: 'react',
      metadata: { cliVersion: '1.0.0' },
    }
    const variantPrimary: CodeConnectJSON = {
      ...main,
      variant: { Variant: 'Primary' },
      template: 'export default { example: figma.tsx`<ButtonPrimary />` }',
    }
    const variantSecondary: CodeConnectJSON = {
      ...main,
      variant: { Variant: 'Secondary' },
      template: 'export default { example: figma.tsx`<ButtonSecondary />` }',
    }
    const grouped = groupCodeConnectObjectsByFigmaUrl([main, variantPrimary, variantSecondary])
    expect(Object.keys(grouped)).toEqual([url])
    expect(grouped[url].main).toEqual(main)
    expect(grouped[url].variants).toHaveLength(2)
    expect(grouped[url].variants.map((v) => v.variant?.Variant)).toEqual(['Primary', 'Secondary'])
  })
})

describe('writeVariantTemplateFile', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-variant-migrate-'))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('outputs a .figma.ts file by default', () => {
    const url = 'https://figma.com/file/abc?node-id=1:1'
    const variant: CodeConnectJSON = {
      figmaNode: url,
      component: 'Button',
      variant: { Variant: 'Primary' },
      template: `const figma = require('figma')
export default { example: figma.tsx\`<ButtonPrimary />\` }`,
      templateData: {},
      language: SyntaxHighlightLanguage.TypeScript,
      label: 'react',
      metadata: { cliVersion: '1.0.0' },
    }
    const group = { main: null, variants: [variant] }
    const { outputPath } = writeVariantTemplateFile(group, url, tempDir, tempDir, {
      filePathsCreated: new Set(),
    })
    expect(outputPath).toMatch(/\.figma\.ts$/)
  })

  it('outputs a .figma.js file when useTypeScript is false', () => {
    const url = 'https://figma.com/file/abc?node-id=1:1'
    const variant: CodeConnectJSON = {
      figmaNode: url,
      component: 'Button',
      variant: { Variant: 'Primary' },
      template: `const figma = require('figma')
export default { example: figma.tsx\`<ButtonPrimary />\` }`,
      templateData: {},
      language: SyntaxHighlightLanguage.TypeScript,
      label: 'react',
      metadata: { cliVersion: '1.0.0' },
    }
    const group = { main: null, variants: [variant] }
    const { outputPath } = writeVariantTemplateFile(group, url, tempDir, tempDir, {
      filePathsCreated: new Set(),
      useTypeScript: false,
    })
    expect(outputPath).toMatch(/\.figma\.js$/)
  })

  it('writes one file with variant switch (main + variants)', () => {
    const url = 'https://figma.com/file/abc?node-id=1:1'
    const main: CodeConnectJSON = {
      figmaNode: url,
      component: 'Button',
      template: `const figma = require('figma')
export default { example: figma.tsx\`<Button>Default</Button>\` }`,
      templateData: {},
      language: SyntaxHighlightLanguage.TypeScript,
      label: 'react',
      metadata: { cliVersion: '1.0.0' },
    }
    const variantPrimary: CodeConnectJSON = {
      ...main,
      variant: { Variant: 'Primary' },
      template: `const figma = require('figma')
export default { example: figma.tsx\`<ButtonPrimary />\` }`,
    }
    const variantSecondary: CodeConnectJSON = {
      ...main,
      variant: { Variant: 'Secondary' },
      template: `const figma = require('figma')
export default { example: figma.tsx\`<ButtonSecondary />\` }`,
    }
    const group = {
      main,
      variants: [variantPrimary, variantSecondary],
    }

    const { outputPath, skipped } = writeVariantTemplateFile(group, url, tempDir, tempDir, {
      filePathsCreated: new Set(),
    })
    expect(skipped).toBe(false)

    const content = fs.readFileSync(outputPath, 'utf-8')

    const expected = `// url=https://figma.com/file/abc?node-id=1:1
// component=Button

import figma from "figma"

// Branch per variant combination.

let template
if (figma.selectedInstance.getPropertyValue("Variant") === "Primary") {
  template = { id: "Button", example: figma.code\`<ButtonPrimary />\` }
} else if (figma.selectedInstance.getPropertyValue("Variant") === "Secondary") {
  template = { id: "Button", example: figma.code\`<ButtonSecondary />\` }
} else {
  template = { id: "Button", example: figma.code\`<Button>Default</Button>\` }
}

export default template
`
    expect(content).toBe(expected)
  })

  it('variants-only: no default, else uses first', () => {
    const url = 'https://figma.com/file/abc?node-id=2:2'
    const variantPrimary: CodeConnectJSON = {
      figmaNode: url,
      component: 'Button',
      variant: { Variant: 'Primary' },
      template: `const figma = require('figma')
export default { example: figma.tsx\`<ButtonPrimary />\` }`,
      templateData: {},
      language: SyntaxHighlightLanguage.TypeScript,
      label: 'react',
      metadata: { cliVersion: '1.0.0' },
    }
    const variantSecondary: CodeConnectJSON = {
      ...variantPrimary,
      variant: { Variant: 'Secondary' },
      template: `const figma = require('figma')
export default { example: figma.tsx\`<ButtonSecondary />\` }`,
    }
    const group = { main: null, variants: [variantPrimary, variantSecondary] }
    const { outputPath, skipped } = writeVariantTemplateFile(group, url, tempDir, tempDir, {
      filePathsCreated: new Set(),
    })
    expect(skipped).toBe(false)
    const content = fs.readFileSync(outputPath, 'utf-8')
    expect(content).toContain('no default')
    expect(content).toContain('template = {')
    expect(content).toContain('export default template')
  })

  it('each branch has its own props (label, disabled)', () => {
    const url = 'https://figma.com/file/abc?node-id=3:3'
    const main: CodeConnectJSON = {
      figmaNode: url,
      component: 'Button',
      template: `const figma = require('figma')
const label = figma.currentLayer.__properties__.string('Label')
const disabled = figma.currentLayer.__properties__.boolean('Disabled')
export default { example: figma.tsx\`<Button disabled={\${disabled}}>\${label}</Button>\` }`,
      templateData: {},
      language: SyntaxHighlightLanguage.TypeScript,
      label: 'react',
      metadata: { cliVersion: '1.0.0' },
    }
    const variantPrimary: CodeConnectJSON = {
      ...main,
      variant: { Variant: 'Primary' },
      template: `const figma = require('figma')
const label = figma.currentLayer.__properties__.string('Label')
export default { example: figma.tsx\`<ButtonPrimary>\${label}</ButtonPrimary>\` }`,
    }
    const group = { main, variants: [variantPrimary] }

    const { outputPath, skipped } = writeVariantTemplateFile(group, url, tempDir, tempDir, {
      filePathsCreated: new Set(),
    })
    expect(skipped).toBe(false)

    const content = fs.readFileSync(outputPath, 'utf-8')

    // Each branch has its own property declarations (no deduplication)
    // Check that both branches have label, and default has disabled too
    expect(content).toMatch(
      /if \(figma\.selectedInstance\.getPropertyValue\("Variant"\) === "Primary"\)[\s\S]*getString[\s\S]*\} else \{[\s\S]*getString[\s\S]*getBoolean/,
    )
  })

  it('complex: main + Primary + Danger, each branch self-contained', () => {
    const url = 'https://figma.com/file/xyz?node-id=4:4'
    const main: CodeConnectJSON = {
      figmaNode: url,
      component: 'Button',
      template: `const figma = require('figma')
const label = figma.currentLayer.__properties__.string('Label')
const disabled = figma.currentLayer.__properties__.boolean('Disabled')
const size = figma.currentLayer.__properties__.enum('Size', { S: 'S', M: 'M', L: 'L' })
export default { example: figma.tsx\`<Button size={\${size}} disabled={\${disabled}}>\${label}</Button>\` }`,
      templateData: {},
      language: SyntaxHighlightLanguage.TypeScript,
      label: 'react',
      metadata: { cliVersion: '1.0.0' },
    }
    const variantPrimary: CodeConnectJSON = {
      ...main,
      variant: { Variant: 'Primary' },
      template: `const figma = require('figma')
const label = figma.currentLayer.__properties__.string('Label')
const size = figma.currentLayer.__properties__.enum('Size', { S: 'S', M: 'M', L: 'L' })
export default { example: figma.tsx\`<ButtonPrimary size={\${size}}>\${label}</ButtonPrimary>\` }`,
    }
    const variantDanger: CodeConnectJSON = {
      ...main,
      variant: { Variant: 'Danger' },
      template: `const figma = require('figma')
const label = figma.currentLayer.__properties__.string('Label')
const disabled = figma.currentLayer.__properties__.boolean('Disabled')
export default { example: figma.tsx\`<ButtonDanger disabled={\${disabled}}>\${label}</ButtonDanger>\` }`,
    }
    const group = { main, variants: [variantPrimary, variantDanger] }

    const { outputPath, skipped } = writeVariantTemplateFile(group, url, tempDir, tempDir, {
      filePathsCreated: new Set(),
    })
    expect(skipped).toBe(false)

    const content = fs.readFileSync(outputPath, 'utf-8')

    // Check whole structure: branches using getPropertyValue
    expect(content).toMatch(/let template/)
    expect(content).toMatch(/figma\.selectedInstance\.getPropertyValue/)

    // Check Primary branch has complete code (label, size declarations + template)
    expect(content).toMatch(
      /if \(figma\.selectedInstance\.getPropertyValue\("Variant"\) === "Primary"\) \{[^]*const label[^]*const size[^]*template = \{/,
    )

    // Check Danger branch has complete code (label, disabled declarations + template)
    expect(content).toMatch(
      /\} else if \(figma\.selectedInstance\.getPropertyValue\("Variant"\) === "Danger"\) \{[^]*const label[^]*const disabled[^]*template = \{/,
    )

    // Check default branch exists with its own code
    expect(content).toMatch(/\} else \{[^]*template = \{[^]*\}[^]*export default template/)
  })

  it('handles multi-property variants (e.g., {disabled: true, type: "info"})', () => {
    const url = 'https://figma.com/file/xyz?node-id=5:5'
    const main: CodeConnectJSON = {
      figmaNode: url,
      component: 'Button',
      template: `const figma = require('figma')
export default { example: figma.tsx\`<Button>Default</Button>\` }`,
      templateData: {},
      language: SyntaxHighlightLanguage.TypeScript,
      label: 'react',
      metadata: { cliVersion: '1.0.0' },
    }
    const variantDisabledInfo: CodeConnectJSON = {
      ...main,
      variant: { disabled: true, type: 'info' },
      template: `const figma = require('figma')
export default { example: figma.tsx\`<Button disabled type="info">Info</Button>\` }`,
    }
    const variantEnabledWarning: CodeConnectJSON = {
      ...main,
      variant: { disabled: false, type: 'warning' },
      template: `const figma = require('figma')
export default { example: figma.tsx\`<Button type="warning">Warning</Button>\` }`,
    }
    const group = { main, variants: [variantDisabledInfo, variantEnabledWarning] }

    const { outputPath, skipped } = writeVariantTemplateFile(group, url, tempDir, tempDir, {
      filePathsCreated: new Set(),
    })
    expect(skipped).toBe(false)

    const content = fs.readFileSync(outputPath, 'utf-8')

    // Check that conditions use all properties with &&
    expect(content).toMatch(
      /if \([^)]*figma\.selectedInstance\.getPropertyValue\("disabled"\) === true[^)]*&&[^)]*figma\.selectedInstance\.getPropertyValue\("type"\) === "info"[^)]*\)/,
    )
    expect(content).toMatch(
      /else if \([^)]*figma\.selectedInstance\.getPropertyValue\("disabled"\) === false[^)]*&&[^)]*figma\.selectedInstance\.getPropertyValue\("type"\) === "warning"[^)]*\)/,
    )
    expect(content).toContain('export default template')
  })
})

describe('getFilenameFromComponentName', () => {
  it('passes through simple alphanumeric names unchanged', () => {
    expect(getFilenameFromComponentName('Button')).toBe('Button')
    expect(getFilenameFromComponentName('MyButton')).toBe('MyButton')
  })

  it('preserves allowlisted special characters (hyphen, dot)', () => {
    expect(getFilenameFromComponentName('my-button')).toBe('my-button')
    expect(getFilenameFromComponentName('Button.swift')).toBe('Button.swift')
  })

  it('converts disallowed chars to underscore', () => {
    expect(getFilenameFromComponentName('Button/Primary')).toBe('Button_Primary')
    expect(getFilenameFromComponentName('Button (Large)')).toBe('Button_Large')
  })

  it('collapses multiple consecutive underscores into one', () => {
    expect(getFilenameFromComponentName('Button  Large')).toBe('Button_Large')
    expect(getFilenameFromComponentName('Foo / Bar')).toBe('Foo_Bar')
  })

  it('handles kotlin-style fully qualified names', () => {
    expect(getFilenameFromComponentName('com.example.ButtonComponent')).toBe(
      'com.example.ButtonComponent',
    )
  })

  it('handles swift-style names with underscores', () => {
    expect(getFilenameFromComponentName('ContentView_Previews')).toBe('ContentView_Previews')
  })

  it('strips leading and trailing underscores', () => {
    expect(getFilenameFromComponentName('/Button/')).toBe('Button')
  })
})
