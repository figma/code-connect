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
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('parses a raw file without documentUrlSubstitutions', async () => {
    const fileContent = `// url=https://figma.com/design/abc123?node-id=1:1
const figma = require('figma')
export default figma.code\`<Button />\``

    fs.writeFileSync(tempFilePath, fileContent)

    const result = await parseRawFile(tempFilePath, undefined)

    expect(result.figmaNode).toBe('https://figma.com/design/abc123?node-id=1:1')
  })

  it('applies documentUrlSubstitutions when config is provided', async () => {
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

    const result = await parseRawFile(tempFilePath, undefined, config)

    expect(result.figmaNode).toBe('https://figma.com/design/TARGET-FILE?node-id=1:1')
  })

  it('applies longer keys before shorter prefix keys to avoid corruption', async () => {
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

    const result = await parseRawFile(tempFilePath, undefined, config)

    expect(result.figmaNode).toBe('https://figma.com/file/abc/?node-id=15100-76317')
  })

  it('applies multiple documentUrlSubstitutions', async () => {
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

    const result = await parseRawFile(tempFilePath, undefined, config)

    expect(result.figmaNode).toBe('https://figma.com/design/TARGET-FILE/Your-Component?node-id=1:1')
  })

  it('does not modify URL when no matching substitutions', async () => {
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

    const result = await parseRawFile(tempFilePath, undefined, config)

    expect(result.figmaNode).toBe('https://figma.com/design/OTHER-FILE?node-id=1:1')
  })

  it('preserves isParserless flag and other metadata', async () => {
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

    const result = await parseRawFile(tempFilePath, 'Python', config)

    expect(result.figmaNode).toBe('https://figma.com/design/TARGET-FILE?node-id=1:1')
    expect(result.label).toBe('Python')
    expect(result.templateData.isParserless).toBe(true)
    expect(result.templateData.nestable).toBe(true)
  })

  it('uses language from config when provided', async () => {
    const fileContent = `// url=https://figma.com/design/abc123?node-id=1:1
const figma = require('figma')
export default figma.code\`<Button />\``

    fs.writeFileSync(tempFilePath, fileContent)

    const config: CodeConnectConfig = {
      parser: 'react',
      language: SyntaxHighlightLanguage.Kotlin,
    }

    const result = await parseRawFile(tempFilePath, 'React', config)

    expect(result.language).toBe(SyntaxHighlightLanguage.Kotlin)
    expect(result.label).toBe('React')
  })

  it('parses component field from comment', async () => {
    const fileContent = `// component=Button
// url=https://figma.com/design/abc123?node-id=1:1
const figma = require('figma')
export default figma.code\`<Button />\``

    fs.writeFileSync(tempFilePath, fileContent)
    const result = await parseRawFile(tempFilePath, undefined)

    expect(result.component).toBe('Button')
    expect(result.figmaNode).toBe('https://figma.com/design/abc123?node-id=1:1')
  })

  it('parses source field from comment', async () => {
    const fileContent = `// source=src/button.tsx
// url=https://figma.com/design/abc123?node-id=1:1
const figma = require('figma')
export default figma.code\`<Button />\``

    fs.writeFileSync(tempFilePath, fileContent)
    const result = await parseRawFile(tempFilePath, undefined)

    expect(result.source).toBe('src/button.tsx')
  })

  it('parses fields in any order', async () => {
    const fileContent = `// url=https://figma.com/design/abc123?node-id=1:1
// component=Button
// source=src/button.tsx
const figma = require('figma')
export default figma.code\`<Button />\``

    fs.writeFileSync(tempFilePath, fileContent)
    const result = await parseRawFile(tempFilePath, undefined)

    expect(result.figmaNode).toBe('https://figma.com/design/abc123?node-id=1:1')
    expect(result.component).toBe('Button')
    expect(result.source).toBe('src/button.tsx')
  })

  it('handles missing optional fields', async () => {
    const fileContent = `// url=https://figma.com/design/abc123?node-id=1:1
const figma = require('figma')
export default figma.code\`<Button />\``

    fs.writeFileSync(tempFilePath, fileContent)
    const result = await parseRawFile(tempFilePath, undefined)

    expect(result.figmaNode).toBe('https://figma.com/design/abc123?node-id=1:1')
    expect(result.component).toBeUndefined()
  })

  it('throws error when url field is missing', async () => {
    const fileContent = `// component=Button
const figma = require('figma')
export default figma.code\`<Button />\``

    fs.writeFileSync(tempFilePath, fileContent)

    await expect(parseRawFile(tempFilePath, undefined)).rejects.toThrow(
      'Missing required url field',
    )
  })

  it('trims whitespace from field values', async () => {
    const fileContent = `// component=  Button
// source=  src/button.tsx
// url=  https://figma.com/design/abc123?node-id=1:1
const figma = require('figma')
export default figma.code\`<Button />\``

    fs.writeFileSync(tempFilePath, fileContent)
    const result = await parseRawFile(tempFilePath, undefined)

    expect(result.component).toBe('Button')
    expect(result.source).toBe('src/button.tsx')
    expect(result.figmaNode).toBe('https://figma.com/design/abc123?node-id=1:1')
  })
})

describe('isRawTemplate', () => {
  it('returns true when url= is the first comment', async () => {
    expect(
      isRawTemplate(
        '// url=https://figma.com/design/abc?node-id=1:1\nconst figma = require("figma")',
      ),
    ).toBe(true)
  })

  it('returns true when url= appears after other header comments', async () => {
    expect(
      isRawTemplate(
        '// component=Button\n// url=https://figma.com/design/abc?node-id=1:1\nconst figma = require("figma")',
      ),
    ).toBe(true)
  })

  it('returns true when there are blank lines before the url= comment', async () => {
    expect(
      isRawTemplate(
        '\n// url=https://figma.com/design/abc?node-id=1:1\nconst figma = require("figma")',
      ),
    ).toBe(true)
  })

  it('returns false for a React/HTML Code Connect file with no url= header', async () => {
    expect(isRawTemplate('import figma from "@figma/code-connect"\nfigma.connect(...)')).toBe(false)
  })

  it('returns false when url= appears after non-comment code', async () => {
    expect(isRawTemplate('const x = 1\n// url=https://figma.com/design/abc?node-id=1:1')).toBe(
      false,
    )
  })

  it('returns true when component= is the first comment', async () => {
    expect(isRawTemplate('// component=Button\nconst figma = require("figma")')).toBe(true)
  })

  it('returns true when source= is the first comment', async () => {
    expect(isRawTemplate('// source=src/button.tsx\nconst figma = require("figma")')).toBe(true)
  })

  it('returns false for an empty file', async () => {
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
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('converts ESM import figma from "figma" to require', async () => {
    const fileContent = `// url=https://figma.com/design/abc123?node-id=1:1
import figma from 'figma'
const text = figma.currentLayer.__properties__.string('Text')
export default figma.code\`<Button text="\${text}" />\``

    fs.writeFileSync(tempFilePath, fileContent)
    const result = await parseRawFile(tempFilePath, undefined)

    // The template should have the converted require syntax
    expect(result.template).toContain("const figma = require('figma')")
    expect(result.template).not.toContain("import figma from 'figma'")
  })

  it('converts ESM import with single quotes', async () => {
    const fileContent = `// url=https://figma.com/design/abc123?node-id=1:1
import figma from 'figma'
export default figma.code\`<Button />\``

    fs.writeFileSync(tempFilePath, fileContent)
    const result = await parseRawFile(tempFilePath, undefined)

    expect(result.template).toContain("const figma = require('figma')")
  })

  it('converts ESM import with double quotes', async () => {
    const fileContent = `// url=https://figma.com/design/abc123?node-id=1:1
import figma from "figma"
export default figma.code\`<Button />\``

    fs.writeFileSync(tempFilePath, fileContent)
    const result = await parseRawFile(tempFilePath, undefined)

    expect(result.template).toContain("const figma = require('figma')")
  })

  it('converts ESM import with semicolon', async () => {
    const fileContent = `// url=https://figma.com/design/abc123?node-id=1:1
import figma from 'figma';
export default figma.code\`<Button />\``

    fs.writeFileSync(tempFilePath, fileContent)
    const result = await parseRawFile(tempFilePath, undefined)

    expect(result.template).toContain("const figma = require('figma')")
  })

  it('still allows type imports', async () => {
    const fileContent = `// url=https://figma.com/design/abc123?node-id=1:1
import type { SomeType } from './types'
import figma from 'figma'
export default figma.code\`<Button />\``

    fs.writeFileSync(tempFilePath, fileContent)

    // Should not reject - type imports are allowed
    await expect(parseRawFile(tempFilePath, undefined)).resolves.toBeDefined()
  })

  it('supports relative helper imports by bundling them into the template', async () => {
    const helperPath = path.join(tempDir, 'helper.ts')
    fs.writeFileSync(
      helperPath,
      `export function formatLabel(text: string): string {
  return text.toUpperCase()
}`,
    )

    const fileContent = `// url=https://figma.com/design/abc123?node-id=1:1
import figma from 'figma'
import { formatLabel } from './helper'
const label = formatLabel('Button')
export default figma.code\`<Button label="\${label}" />\``

    fs.writeFileSync(tempFilePath, fileContent)
    const result = await parseRawFile(tempFilePath, undefined)

    // The helper body is inlined into the self-contained bundle...
    expect(result.template).toContain('function formatLabel')
    expect(result.template).toContain('return text.toUpperCase()')
    // ...`figma` stays external (resolved by the runtime require)...
    expect(result.template).toContain('__figmaRequire("figma")')
    // ...and the bundle ends with the entry's default export for the runtime.
    expect(result.template).toMatch(/export default \w+$/m)
    // No `import` statements survive, and no absolute path (which leaks
    // usernames) leaks into the published template.
    expect(result.template).not.toContain('import { formatLabel }')
    expect(result.template).not.toContain(tempDir)
  })

  it('bundles relative helper imports for JavaScript template files, inlining the helper body', async () => {
    const jsFilePath = path.join(tempDir, 'test.figma.js')
    const helperPath = path.join(tempDir, 'helper.js')
    fs.writeFileSync(
      helperPath,
      `const saySomething = () => {
  return 'hello world'
}
export { saySomething }`,
    )

    const fileContent = `// url=https://figma.com/design/abc123?node-id=1:1
const figma = require('figma')
import { saySomething } from './helper'
export default {
  example: figma.code\`<CC-1> \${saySomething()} </CC-1>\`,
  id: 'CC-1',
}`

    fs.writeFileSync(jsFilePath, fileContent)
    const result = await parseRawFile(jsFilePath, undefined)

    // Helper definition inlined so the template runs standalone (esbuild
    // normalizes string quotes, so assert on the content only).
    expect(result.template).toContain('hello world')
    // The entry's default export is re-exposed for the runtime to `return`.
    expect(result.template).toMatch(/export default \w+$/m)
    expect(result.template).not.toContain("import { saySomething } from './helper'")
    expect(result.template).not.toContain(tempDir)
  })

  it('bundles renamed, default and namespace imports, and tree-shakes unused helper code', async () => {
    const jsFilePath = path.join(tempDir, 'test.figma.js')
    fs.writeFileSync(
      path.join(tempDir, 'helper.js'),
      `export const upper = (s) => s.toUpperCase()
export const lower = (s) => s.toLowerCase()
export const neverUsed = 'UNREACHABLE_HELPER_CONSTANT'
export default () => 'defaultExport'`,
    )
    fs.writeFileSync(
      jsFilePath,
      `// url=https://figma.com/design/abc123?node-id=1:1
const figma = require('figma')
import { upper as renamed } from './helper'
import defaultHelper from './helper'
import * as namespaced from './helper'
export default {
  example: figma.code\`<CC-1> \${renamed('a')} \${defaultHelper()} \${namespaced.lower('B')} </CC-1>\`,
  id: 'CC-1',
}`,
    )

    const result = await parseRawFile(jsFilePath, undefined)

    expect(result.template).not.toContain('import ')
    expect(result.template).not.toContain('UNREACHABLE_HELPER_CONSTANT')
    // The bundle is flat: none of esbuild's CommonJS interop survives.
    expect(result.template).not.toContain('__toCommonJS')
    expect(result.template).not.toContain('__esm')
  })

  it('rejects a require of a relative helper in the entry', async () => {
    const jsFilePath = path.join(tempDir, 'test.figma.js')
    fs.writeFileSync(path.join(tempDir, 'helper.js'), `export const upper = (s) => s.toUpperCase()`)
    fs.writeFileSync(
      jsFilePath,
      `// url=https://figma.com/design/abc123?node-id=1:1
const figma = require('figma')
const { upper } = require('./helper')
export default { example: figma.code\`<CC-1>\${upper('a')}</CC-1>\`, id: 'CC-1' }`,
    )

    await expect(parseRawFile(jsFilePath, undefined)).rejects.toThrow(
      /Helper files must be imported, not required[\s\S]*import \{ helper \} from '\.\/helper'/,
    )
  })

  // Helper files aren't parsed up front, so this covers the output-scan guard:
  // an unbundled require would otherwise ship as a call that fails at render.
  it('rejects a require of another helper from inside a helper', async () => {
    const jsFilePath = path.join(tempDir, 'test.figma.js')
    fs.writeFileSync(path.join(tempDir, 'leaf.js'), `export const leaf = () => 'leaf'`)
    fs.writeFileSync(
      path.join(tempDir, 'helper.js'),
      `const { leaf } = require('./leaf')
export const upper = () => leaf().toUpperCase()`,
    )
    fs.writeFileSync(
      jsFilePath,
      `// url=https://figma.com/design/abc123?node-id=1:1
const figma = require('figma')
import { upper } from './helper'
export default { example: figma.code\`<CC-1>\${upper()}</CC-1>\`, id: 'CC-1' }`,
    )

    await expect(parseRawFile(jsFilePath, undefined)).rejects.toThrow(
      /Helper files must be imported, not required/,
    )
  })

  it('fails when a bundled template exceeds the max template size', async () => {
    // A ~1.2mb helper constant guarantees the bundle exceeds the 1mb cap.
    const bigString = 'x'.repeat(Math.ceil(1.2 * 1024 * 1024))
    const helperPath = path.join(tempDir, 'helper.ts')
    fs.writeFileSync(helperPath, `export const big = '${bigString}'`)

    const fileContent = `// url=https://figma.com/design/abc123?node-id=1:1
import figma from 'figma'
import { big } from './helper'
export default figma.code\`<Button data="\${big.length}" />\``
    fs.writeFileSync(tempFilePath, fileContent)

    await expect(parseRawFile(tempFilePath, undefined)).rejects.toThrow(
      'exceeds the 1mb maximum template size',
    )
  })

  it('does not fail on size for a small bundled template', async () => {
    const helperPath = path.join(tempDir, 'helper.ts')
    fs.writeFileSync(helperPath, `export const label = 'Button'`)

    const fileContent = `// url=https://figma.com/design/abc123?node-id=1:1
import figma from 'figma'
import { label } from './helper'
export default figma.code\`<Button label="\${label}" />\``
    fs.writeFileSync(tempFilePath, fileContent)

    await expect(parseRawFile(tempFilePath, undefined)).resolves.toBeDefined()
  })

  it('counts prepended batch data toward the max template size', async () => {
    // Tiny template with no helpers — the batch payload alone exceeds the cap,
    // which the size check must catch even though nothing gets bundled.
    const fileContent = `const figma = require('figma')
export default figma.code\`<Button />\``
    fs.writeFileSync(tempFilePath, fileContent)

    const batchOverrides = {
      url: 'https://figma.com/design/abc123?node-id=1:1',
      batchData: { big: 'x'.repeat(Math.ceil(1.2 * 1024 * 1024)) },
      batchFilePath: 'test.figma.batch.json',
    }

    await expect(
      parseRawFile(tempFilePath, undefined, undefined, undefined, batchOverrides),
    ).rejects.toThrow('exceeds the 1mb maximum template size')
  })

  it('rejects non-relative module imports', async () => {
    const fileContent = `// url=https://figma.com/design/abc123?node-id=1:1
import figma from 'figma'
import { compact } from 'lodash'
export default figma.code\`<Button />\``

    fs.writeFileSync(tempFilePath, fileContent)

    await expect(parseRawFile(tempFilePath, undefined)).rejects.toThrow(
      "TypeScript template files only support importing from 'figma' and relative helper files.",
    )
  })

  it('does not treat require(...) inside the emitted snippet as a real import', async () => {
    // Parserless templates emit code snippets, so `require(...)` text inside the
    // `figma.code` template literal must not be scanned as an import (it would
    // otherwise be falsely rejected or falsely bundled).
    const fileContent = `// url=https://figma.com/design/abc123?node-id=1:1
import figma from 'figma'
export default figma.code\`const x = require('lodash'); const y = require('./thing')\``

    fs.writeFileSync(tempFilePath, fileContent)
    const result = await parseRawFile(tempFilePath, undefined)

    // Not rejected, not bundled, and the literal text is preserved verbatim.
    expect(result.template).not.toContain('__figmaHelperModules')
    expect(result.template).toContain("require('lodash')")
    expect(result.template).toContain("require('./thing')")
    expect(result.template).not.toContain('__figmaLoadHelper')
  })

  it('rejects re-exports (export ... from) in the template entry', async () => {
    const helperPath = path.join(tempDir, 'helper.ts')
    fs.writeFileSync(helperPath, `export const foo = 1`)

    const fileContent = `// url=https://figma.com/design/abc123?node-id=1:1
import figma from 'figma'
export { foo } from './helper'
export default figma.code\`<Button />\``

    fs.writeFileSync(tempFilePath, fileContent)

    await expect(parseRawFile(tempFilePath, undefined)).rejects.toThrow(
      "Template files do not support re-exports ('export ... from ...').",
    )
  })

  it('refuses to bundle a helper that resolves outside the project directory', async () => {
    // A separate temp dir standing in for "outside the project".
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parseRawFile-outside-'))
    try {
      fs.writeFileSync(path.join(outsideDir, 'secret.ts'), `export const s = 'TOP_SECRET'`)
      // With no dir passed, the project root defaults to the entry's own dir
      // (tempDir), so a helper in outsideDir escapes it.
      const relative = path
        .relative(tempDir, path.join(outsideDir, 'secret'))
        .split(path.sep)
        .join('/')

      const fileContent = `// url=https://figma.com/design/abc123?node-id=1:1
import figma from 'figma'
import { s } from '${relative}'
export default figma.code\`<Button value="\${s}" />\``

      fs.writeFileSync(tempFilePath, fileContent)

      await expect(parseRawFile(tempFilePath, undefined)).rejects.toThrow(
        'it resolves outside the project directory',
      )
    } finally {
      fs.rmSync(outsideDir, { recursive: true, force: true })
    }
  })

  it('bundles a multi-level helper graph (a helper importing another helper)', async () => {
    // esbuild resolves the whole relative graph, so helpers may import other
    // helpers — there is no artificial single-level restriction.
    fs.writeFileSync(path.join(tempDir, 'leaf.ts'), `export const n = 1`)
    fs.writeFileSync(
      path.join(tempDir, 'helper.ts'),
      `import { n } from './leaf'\nexport const hi = () => n`,
    )

    const fileContent = `// url=https://figma.com/design/abc123?node-id=1:1
import figma from 'figma'
import { hi } from './helper'
export default figma.code\`<Button value="\${hi()}" />\``

    fs.writeFileSync(tempFilePath, fileContent)
    const result = await parseRawFile(tempFilePath, undefined)

    // Both helper levels are inlined into the self-contained bundle (esbuild
    // may emit `var`/`const`, so assert on the declaration content only).
    expect(result.template).toContain('n = 1')
    expect(result.template).toContain('hi = () =>')
    expect(result.template).toMatch(/export default \w+$/m)
    expect(result.template).not.toContain("import { hi } from './helper'")
  })

  it('rejects a helper that imports an external package', async () => {
    fs.writeFileSync(
      path.join(tempDir, 'helper.ts'),
      `import { compact } from 'lodash'\nexport const hi = () => compact([1])`,
    )

    const fileContent = `// url=https://figma.com/design/abc123?node-id=1:1
import figma from 'figma'
import { hi } from './helper'
export default figma.code\`<Button value="\${hi()}" />\``

    fs.writeFileSync(tempFilePath, fileContent)

    await expect(parseRawFile(tempFilePath, undefined)).rejects.toThrow(
      "TypeScript template files only support importing from 'figma' and relative helper files.",
    )
  })

  it('rejects named imports from figma module', async () => {
    const fileContent = `// url=https://figma.com/design/abc123?node-id=1:1
import { code } from 'figma'
export default code\`<Button />\``

    fs.writeFileSync(tempFilePath, fileContent)

    await expect(parseRawFile(tempFilePath, undefined)).rejects.toThrow(
      'TypeScript template files only support importing from',
    )
  })

  it('rejects multiple named imports from figma module', async () => {
    const fileContent = `// url=https://figma.com/design/abc123?node-id=1:1
import { code, currentLayer } from 'figma'
export default code\`<Button />\``

    fs.writeFileSync(tempFilePath, fileContent)

    await expect(parseRawFile(tempFilePath, undefined)).rejects.toThrow(
      'TypeScript template files only support importing from',
    )
  })

  it('rejects namespace import from figma module', async () => {
    const fileContent = `// url=https://figma.com/design/abc123?node-id=1:1
import * as figma from 'figma'
export default figma.code\`<Button />\``

    fs.writeFileSync(tempFilePath, fileContent)

    await expect(parseRawFile(tempFilePath, undefined)).rejects.toThrow(
      'TypeScript template files only support importing from',
    )
  })

  it('rejects mixed default and named imports from figma module', async () => {
    const fileContent = `// url=https://figma.com/design/abc123?node-id=1:1
import figma, { code } from 'figma'
export default figma.code\`<Button />\``

    fs.writeFileSync(tempFilePath, fileContent)

    await expect(parseRawFile(tempFilePath, undefined)).rejects.toThrow(
      'TypeScript template files only support importing from',
    )
  })

  it('throws CodePropertiesError (skip) for a url-less file containing codeProperties', async () => {
    // No url + contains `codeProperties` => skip signal, as long as the file has
    // no unsupported import (see the test below).
    const fileContent = `// component=Button
export const codeProperties = { value: 1 }`

    fs.writeFileSync(tempFilePath, fileContent)

    await expect(parseRawFile(tempFilePath, undefined)).rejects.toThrow(CodePropertiesError)
    await expect(parseRawFile(tempFilePath, undefined)).rejects.not.toThrow(
      'TypeScript template files only support importing from',
    )
  })

  it('fails on a non-figma import even when the file contains codeProperties', async () => {
    // An unsupported import is always a hard error and takes precedence over the
    // codeProperties skip, so an import mistake is never silently swallowed.
    const fileContent = `// component=Button
import { compact } from 'lodash'
export const codeProperties = { value: compact([1, 2, 3]) }`

    fs.writeFileSync(tempFilePath, fileContent)

    await expect(parseRawFile(tempFilePath, undefined)).rejects.toThrow(
      "TypeScript template files only support importing from 'figma' and relative helper files.",
    )
    await expect(parseRawFile(tempFilePath, undefined)).rejects.not.toThrow(CodePropertiesError)
  })

  it('still surfaces the original import error for a url-less file WITHOUT codeProperties', async () => {
    // Unchanged behaviour: only `codeProperties` files are skipped; any other
    // url-less file with a non-figma import fails on the import error as before.
    const fileContent = `// component=Button
import { compact } from 'lodash'
export default compact`

    fs.writeFileSync(tempFilePath, fileContent)

    await expect(parseRawFile(tempFilePath, undefined)).rejects.toThrow(
      "TypeScript template files only support importing from 'figma' and relative helper files.",
    )
  })
})
