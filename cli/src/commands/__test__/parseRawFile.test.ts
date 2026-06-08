import { parseRawFile, isRawTemplate, CodePropertiesError } from '../../connect/raw_templates'
import { CodeConnectConfig } from '../../connect/project'
import { SyntaxHighlightLanguage } from '../../connect/label_language_mapping'
import fs from 'fs'
import path from 'path'
import os from 'os'

describe('parseRawFile', () => {
  let tempDir: string
  let tempFilePath: string

  beforeEach(() => {
    // Create a temporary directory and file for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parseRawFile-test-'))
    tempFilePath = path.join(tempDir, 'test.figma.template.js')
  })

  afterEach(() => {
    // Clean up temporary files
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath)
    }
    if (fs.existsSync(tempDir)) {
      fs.rmdirSync(tempDir)
    }
  })

  it('parses a raw file without documentUrlSubstitutions', () => {
    const fileContent = `// url=https://figma.com/design/abc123?node-id=1:1
const figma = require('figma')
export default figma.code\`<Button />\``

    fs.writeFileSync(tempFilePath, fileContent)

    const result = parseRawFile(tempFilePath, undefined)

    expect(result.figmaNode).toBe('https://figma.com/design/abc123?node-id=1:1')
  })

  it('applies documentUrlSubstitutions when config is provided', () => {
    const fileContent = `// url=https://figma.com/design/SOURCE-FILE?node-id=1:1
const figma = require('figma')
export default figma.code\`<Button />\``

    fs.writeFileSync(tempFilePath, fileContent)

    const config: CodeConnectConfig = {
      parser: 'react',
      documentUrlSubstitutions: {
        'https://figma.com/design/SOURCE-FILE': 'https://figma.com/design/TARGET-FILE',
      },
    }

    const result = parseRawFile(tempFilePath, undefined, config)

    expect(result.figmaNode).toBe('https://figma.com/design/TARGET-FILE?node-id=1:1')
  })

  it('applies longer keys before shorter prefix keys to avoid corruption', () => {
    const fileContent = `// url=SearchInputMenu
const figma = require('figma')
export default figma.code\`<Button />\``

    fs.writeFileSync(tempFilePath, fileContent)

    const config: CodeConnectConfig = {
      parser: 'react',
      documentUrlSubstitutions: {
        SearchInput: 'https://figma.com/file/abc/?node-id=4307-49807',
        SearchInputMenu: 'https://figma.com/file/abc/?node-id=15100-76317',
      },
    }

    const result = parseRawFile(tempFilePath, undefined, config)

    expect(result.figmaNode).toBe('https://figma.com/file/abc/?node-id=15100-76317')
  })

  it('applies multiple documentUrlSubstitutions', () => {
    const fileContent = `// url=https://figma.com/design/SOURCE-FILE/My-Component?node-id=1:1
const figma = require('figma')
export default figma.code\`<Button />\``

    fs.writeFileSync(tempFilePath, fileContent)

    const config: CodeConnectConfig = {
      parser: 'react',
      documentUrlSubstitutions: {
        'SOURCE-FILE': 'TARGET-FILE',
        'My-Component': 'Your-Component',
      },
    }

    const result = parseRawFile(tempFilePath, undefined, config)

    expect(result.figmaNode).toBe('https://figma.com/design/TARGET-FILE/Your-Component?node-id=1:1')
  })

  it('does not modify URL when no matching substitutions', () => {
    const fileContent = `// url=https://figma.com/design/OTHER-FILE?node-id=1:1
const figma = require('figma')
export default figma.code\`<Button />\``

    fs.writeFileSync(tempFilePath, fileContent)

    const config: CodeConnectConfig = {
      parser: 'react',
      documentUrlSubstitutions: {
        'SOURCE-FILE': 'TARGET-FILE',
      },
    }

    const result = parseRawFile(tempFilePath, undefined, config)

    expect(result.figmaNode).toBe('https://figma.com/design/OTHER-FILE?node-id=1:1')
  })

  it('preserves isParserless flag and other metadata', () => {
    const fileContent = `// url=https://figma.com/design/SOURCE-FILE?node-id=1:1
const figma = require('figma')
export default figma.code\`<Button />\``

    fs.writeFileSync(tempFilePath, fileContent)

    const config: CodeConnectConfig = {
      parser: 'react',
      documentUrlSubstitutions: {
        'SOURCE-FILE': 'TARGET-FILE',
      },
    }

    const result = parseRawFile(tempFilePath, 'Python', config)

    expect(result.figmaNode).toBe('https://figma.com/design/TARGET-FILE?node-id=1:1')
    expect(result.label).toBe('Python')
    expect(result.templateData.isParserless).toBe(true)
    expect(result.templateData.nestable).toBe(true)
  })

  it('uses language from config when provided', () => {
    const fileContent = `// url=https://figma.com/design/abc123?node-id=1:1
const figma = require('figma')
export default figma.code\`<Button />\``

    fs.writeFileSync(tempFilePath, fileContent)

    const config: CodeConnectConfig = {
      parser: 'react',
      language: SyntaxHighlightLanguage.Kotlin,
    }

    const result = parseRawFile(tempFilePath, 'React', config)

    expect(result.language).toBe(SyntaxHighlightLanguage.Kotlin)
    expect(result.label).toBe('React')
  })

  it('parses component field from comment', () => {
    const fileContent = `// component=Button
// url=https://figma.com/design/abc123?node-id=1:1
const figma = require('figma')
export default figma.code\`<Button />\``

    fs.writeFileSync(tempFilePath, fileContent)
    const result = parseRawFile(tempFilePath, undefined)

    expect(result.component).toBe('Button')
    expect(result.figmaNode).toBe('https://figma.com/design/abc123?node-id=1:1')
  })

  it('parses source field from comment', () => {
    const fileContent = `// source=src/button.tsx
// url=https://figma.com/design/abc123?node-id=1:1
const figma = require('figma')
export default figma.code\`<Button />\``

    fs.writeFileSync(tempFilePath, fileContent)
    const result = parseRawFile(tempFilePath, undefined)

    expect(result.source).toBe('src/button.tsx')
  })

  it('parses fields in any order', () => {
    const fileContent = `// url=https://figma.com/design/abc123?node-id=1:1
// component=Button
// source=src/button.tsx
const figma = require('figma')
export default figma.code\`<Button />\``

    fs.writeFileSync(tempFilePath, fileContent)
    const result = parseRawFile(tempFilePath, undefined)

    expect(result.figmaNode).toBe('https://figma.com/design/abc123?node-id=1:1')
    expect(result.component).toBe('Button')
    expect(result.source).toBe('src/button.tsx')
  })

  it('handles missing optional fields', () => {
    const fileContent = `// url=https://figma.com/design/abc123?node-id=1:1
const figma = require('figma')
export default figma.code\`<Button />\``

    fs.writeFileSync(tempFilePath, fileContent)
    const result = parseRawFile(tempFilePath, undefined)

    expect(result.figmaNode).toBe('https://figma.com/design/abc123?node-id=1:1')
    expect(result.component).toBeUndefined()
  })

  it('throws error when url field is missing', () => {
    const fileContent = `// component=Button
const figma = require('figma')
export default figma.code\`<Button />\``

    fs.writeFileSync(tempFilePath, fileContent)

    expect(() => parseRawFile(tempFilePath, undefined)).toThrow('Missing required url field')
  })

  it('trims whitespace from field values', () => {
    const fileContent = `// component=  Button
// source=  src/button.tsx
// url=  https://figma.com/design/abc123?node-id=1:1
const figma = require('figma')
export default figma.code\`<Button />\``

    fs.writeFileSync(tempFilePath, fileContent)
    const result = parseRawFile(tempFilePath, undefined)

    expect(result.component).toBe('Button')
    expect(result.source).toBe('src/button.tsx')
    expect(result.figmaNode).toBe('https://figma.com/design/abc123?node-id=1:1')
  })
})

describe('isRawTemplate', () => {
  it('returns true when url= is the first comment', () => {
    expect(
      isRawTemplate(
        '// url=https://figma.com/design/abc?node-id=1:1\nconst figma = require("figma")',
      ),
    ).toBe(true)
  })

  it('returns true when url= appears after other header comments', () => {
    expect(
      isRawTemplate(
        '// component=Button\n// url=https://figma.com/design/abc?node-id=1:1\nconst figma = require("figma")',
      ),
    ).toBe(true)
  })

  it('returns true when there are blank lines before the url= comment', () => {
    expect(
      isRawTemplate(
        '\n// url=https://figma.com/design/abc?node-id=1:1\nconst figma = require("figma")',
      ),
    ).toBe(true)
  })

  it('returns false for a React/HTML Code Connect file with no url= header', () => {
    expect(isRawTemplate('import figma from "@figma/code-connect"\nfigma.connect(...)')).toBe(false)
  })

  it('returns false when url= appears after non-comment code', () => {
    expect(isRawTemplate('const x = 1\n// url=https://figma.com/design/abc?node-id=1:1')).toBe(
      false,
    )
  })

  it('returns true when component= is the first comment', () => {
    expect(isRawTemplate('// component=Button\nconst figma = require("figma")')).toBe(true)
  })

  it('returns true when source= is the first comment', () => {
    expect(isRawTemplate('// source=src/button.tsx\nconst figma = require("figma")')).toBe(true)
  })

  it('returns false for an empty file', () => {
    expect(isRawTemplate('')).toBe(false)
  })
})

describe('parseRawFile with ESM imports', () => {
  let tempDir: string
  let tempFilePath: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parseRawFile-esm-test-'))
    tempFilePath = path.join(tempDir, 'test.figma.template.ts')
  })

  afterEach(() => {
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath)
    }
    if (fs.existsSync(tempDir)) {
      fs.rmdirSync(tempDir)
    }
  })

  it('converts ESM import figma from "figma" to require', () => {
    const fileContent = `// url=https://figma.com/design/abc123?node-id=1:1
import figma from 'figma'
const text = figma.currentLayer.__properties__.string('Text')
export default figma.code\`<Button text="\${text}" />\``

    fs.writeFileSync(tempFilePath, fileContent)
    const result = parseRawFile(tempFilePath, undefined)

    // The template should have the converted require syntax
    expect(result.template).toContain("const figma = require('figma')")
    expect(result.template).not.toContain("import figma from 'figma'")
  })

  it('converts ESM import with single quotes', () => {
    const fileContent = `// url=https://figma.com/design/abc123?node-id=1:1
import figma from 'figma'
export default figma.code\`<Button />\``

    fs.writeFileSync(tempFilePath, fileContent)
    const result = parseRawFile(tempFilePath, undefined)

    expect(result.template).toContain("const figma = require('figma')")
  })

  it('converts ESM import with double quotes', () => {
    const fileContent = `// url=https://figma.com/design/abc123?node-id=1:1
import figma from "figma"
export default figma.code\`<Button />\``

    fs.writeFileSync(tempFilePath, fileContent)
    const result = parseRawFile(tempFilePath, undefined)

    expect(result.template).toContain("const figma = require('figma')")
  })

  it('converts ESM import with semicolon', () => {
    const fileContent = `// url=https://figma.com/design/abc123?node-id=1:1
import figma from 'figma';
export default figma.code\`<Button />\``

    fs.writeFileSync(tempFilePath, fileContent)
    const result = parseRawFile(tempFilePath, undefined)

    expect(result.template).toContain("const figma = require('figma')")
  })

  it('still allows type imports', () => {
    const fileContent = `// url=https://figma.com/design/abc123?node-id=1:1
import type { SomeType } from './types'
import figma from 'figma'
export default figma.code\`<Button />\``

    fs.writeFileSync(tempFilePath, fileContent)

    // Should not throw - type imports are allowed
    expect(() => parseRawFile(tempFilePath, undefined)).not.toThrow()
  })

  it('rejects other non-figma ESM imports', () => {
    const fileContent = `// url=https://figma.com/design/abc123?node-id=1:1
import figma from 'figma'
import { helper } from './helper'
export default figma.code\`<Button />\``

    fs.writeFileSync(tempFilePath, fileContent)

    expect(() => parseRawFile(tempFilePath, undefined)).toThrow(
      'TypeScript template files only support importing from',
    )
  })

  it('rejects named imports from figma module', () => {
    const fileContent = `// url=https://figma.com/design/abc123?node-id=1:1
import { code } from 'figma'
export default code\`<Button />\``

    fs.writeFileSync(tempFilePath, fileContent)

    expect(() => parseRawFile(tempFilePath, undefined)).toThrow(
      'TypeScript template files only support importing from',
    )
  })

  it('rejects multiple named imports from figma module', () => {
    const fileContent = `// url=https://figma.com/design/abc123?node-id=1:1
import { code, currentLayer } from 'figma'
export default code\`<Button />\``

    fs.writeFileSync(tempFilePath, fileContent)

    expect(() => parseRawFile(tempFilePath, undefined)).toThrow(
      'TypeScript template files only support importing from',
    )
  })

  it('rejects namespace import from figma module', () => {
    const fileContent = `// url=https://figma.com/design/abc123?node-id=1:1
import * as figma from 'figma'
export default figma.code\`<Button />\``

    fs.writeFileSync(tempFilePath, fileContent)

    expect(() => parseRawFile(tempFilePath, undefined)).toThrow(
      'TypeScript template files only support importing from',
    )
  })

  it('rejects mixed default and named imports from figma module', () => {
    const fileContent = `// url=https://figma.com/design/abc123?node-id=1:1
import figma, { code } from 'figma'
export default figma.code\`<Button />\``

    fs.writeFileSync(tempFilePath, fileContent)

    expect(() => parseRawFile(tempFilePath, undefined)).toThrow(
      'TypeScript template files only support importing from',
    )
  })

  it('throws CodePropertiesError (skip) for a url-less file containing codeProperties', () => {
    // No url + contains `codeProperties` => skip signal, as long as the file has
    // no unsupported import (see the test below).
    const fileContent = `// component=Button
export const codeProperties = { value: 1 }`

    fs.writeFileSync(tempFilePath, fileContent)

    expect(() => parseRawFile(tempFilePath, undefined)).toThrow(CodePropertiesError)
    expect(() => parseRawFile(tempFilePath, undefined)).not.toThrow(
      'TypeScript template files only support importing from',
    )
  })

  it('fails on a non-figma import even when the file contains codeProperties', () => {
    // An unsupported import is always a hard error and takes precedence over the
    // codeProperties skip, so an import mistake is never silently swallowed.
    const fileContent = `// component=Button
import { helper } from './helper'
export const codeProperties = { value: helper() }`

    fs.writeFileSync(tempFilePath, fileContent)

    expect(() => parseRawFile(tempFilePath, undefined)).toThrow(
      'TypeScript template files only support importing from',
    )
    expect(() => parseRawFile(tempFilePath, undefined)).not.toThrow(CodePropertiesError)
  })

  it('still surfaces the original import error for a url-less file WITHOUT codeProperties', () => {
    // Unchanged behaviour: only `codeProperties` files are skipped; any other
    // url-less file with a non-figma import fails on the import error as before.
    const fileContent = `// component=Button
import { helper } from './helper'
export default helper`

    fs.writeFileSync(tempFilePath, fileContent)

    expect(() => parseRawFile(tempFilePath, undefined)).toThrow(
      'TypeScript template files only support importing from',
    )
  })
})
