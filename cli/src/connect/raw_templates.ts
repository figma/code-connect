import fs from 'fs'
import ts from 'typescript'
import { CodeConnectJSON } from './figma_connect'
import { CodeConnectConfig } from './project'
import { CodeConnectLabel, getInferredLanguageForRaw } from './label_language_mapping'
import { applyDocumentUrlSubstitutions } from './helpers'

/**
 * Thrown when a raw template file has no `// url=` directive but contains the
 * string `codeProperties`. These files (e.g. Make's code component property
 * definitions) are not Code Connect, so callers skip them with a log instead of
 * failing. Every other file is handled exactly as before — a missing url is
 * still a hard error.
 */
export class CodePropertiesError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CodePropertiesError'
  }
}

/**
 * Returns true if the file content looks like a raw template file, i.e. its
 * leading comment block contains a `// url=`, `// component=`, or `// source=`
 * directive. Used to distinguish raw `.figma.ts` templates from React/HTML
 * Code Connect files that share the same extension.
 */
export function isRawTemplate(content: string): boolean {
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('//')) {
      if (/^\/\/\s*(url|component|source)=/.test(trimmed)) {
        return true
      }
      continue
    }
    // First non-comment, non-blank line reached without finding a known directive — not a raw template
    break
  }
  return false
}

// Convert ESM import of 'figma' to require syntax. Supports: import figma from 'figma'
const figmaImportRegex = /^import\s+figma\s+from\s+['"]figma['"]\s*;?\s*$/m

/**
 * Throws if the file imports from anything other than 'figma'. Type-only imports
 * (`import type`) are erased by the TS compiler and are fine; the `figma` default
 * import is the one supported module (no bundling in Phase 1). This runs BEFORE
 * the `codeProperties` skip guard so an unsupported import is always a hard error,
 * even in a file that would otherwise be skipped.
 */
function assertOnlyFigmaImports(filePath: string, fileContent: string): void {
  // Ignore the supported `import figma from 'figma'` form before scanning.
  const withoutFigmaImport = fileContent.replace(figmaImportRegex, '')
  const importRegex = /^import\s+(?!type\s)/m
  if (importRegex.test(withoutFigmaImport)) {
    const match = withoutFigmaImport.match(/^(import\s+.+)$/m)
    const importLine = match ? match[1] : 'import ...'
    throw new Error(
      `TypeScript template files only support importing from 'figma'.\n` +
        `Found in ${filePath}:\n` +
        `  ${importLine}\n\n` +
        `Use "const figma = require('figma')" or "import figma from 'figma'" to access the Figma API.\n` +
        `Other module imports will be supported in a future version.`,
    )
  }
}

function transpileTypeScriptTemplate(filePath: string, fileContent: string): string {
  if (figmaImportRegex.test(fileContent)) {
    fileContent = fileContent.replace(figmaImportRegex, "const figma = require('figma')")
  }

  const result = ts.transpileModule(fileContent, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2021,
      removeComments: false,
    },
  })

  return result.outputText
}

/**
 * Extracts metadata fields (url, component, source) from the leading comments
 * of a raw template file. This must be done before transpilation because
 * TypeScript can remove comments that appear before type-only imports.
 */
function extractMetadataFields(fileContent: string): {
  fields: { url?: string; component?: string; source?: string }
  templateStartLine: number
} {
  const lines = fileContent.split('\n')
  const fields: { url?: string; component?: string; source?: string } = {}
  let templateStartLine = 0

  // Parse consecutive comment lines at the start of the file
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    // Match pattern: // fieldName=value
    const match = line.match(/^\/\/\s*(\w+)=(.+)$/)
    if (match) {
      const [, fieldName, fieldValue] = match
      const normalizedFieldName = fieldName.toLowerCase()
      if (
        normalizedFieldName === 'url' ||
        normalizedFieldName === 'component' ||
        normalizedFieldName === 'source'
      ) {
        fields[normalizedFieldName] = fieldValue.trim()
      }
      templateStartLine = i + 1
    } else if (line === '' || line.startsWith('//')) {
      // Allow blank lines or other comments, but don't increment template start
      continue
    } else {
      // First non-comment line found
      break
    }
  }

  return { fields, templateStartLine }
}

export interface BatchOverrides {
  url: string
  source?: string
  component?: string
  batchData: Record<string, any>
  batchFilePath: string
}

export function parseRawFile(
  filePath: string,
  label: string | undefined,
  config?: CodeConnectConfig,
  dir?: string,
  batchOverrides?: BatchOverrides,
): CodeConnectJSON {
  let fileContent = fs.readFileSync(filePath, 'utf-8')

  // Extract metadata fields BEFORE transpilation to avoid losing comments
  // that appear before type-only imports (which TypeScript erases)
  const { fields, templateStartLine } = extractMetadataFields(fileContent)

  const figmaUrl = batchOverrides?.url || fields.url

  // An unsupported (non-figma) import is always a hard error, even in a file that
  // would otherwise be skipped as a `codeProperties` file below. Checked first so
  // an import mistake is never silently swallowed by the skip guard.
  if (filePath.endsWith('.ts')) {
    assertOnlyFigmaImports(filePath, fileContent)
  }

  // A file with no // url= directive that contains the string `codeProperties`
  // is not Code Connect (e.g. Make's code component property definitions). Skip
  // it (callers log and continue) instead of failing. Every other file is
  // handled exactly as before.
  if (!figmaUrl && fileContent.includes('codeProperties')) {
    throw new CodePropertiesError(
      `Skipping ${filePath}: file has no // url= directive and contains "codeProperties", so it is not treated as a Code Connect file.`,
    )
  }

  if (filePath.endsWith('.ts')) {
    fileContent = transpileTypeScriptTemplate(filePath, fileContent)
  }

  // For batch templates, metadata comes from the batch entry instead of comments
  const component = batchOverrides?.component || fields.component
  const source = batchOverrides?.source || fields.source || ''

  if (!figmaUrl) {
    throw new Error(
      batchOverrides
        ? `Missing required "url" field in ${batchOverrides.batchFilePath}. Please add "url" to each entry in your .figma.batch.json file.`
        : `Missing required url field in ${filePath}. Please add a // url=... comment to the top of the file.`,
    )
  }
  let figmaNodeUrl = figmaUrl

  // Extract template from the transpiled content, starting at the line
  // where the metadata comments ended in the original source
  const transpiledLines = fileContent.split('\n')
  let templateStartIndex = 0

  // Skip lines until we've passed the original metadata comment section
  for (let i = 0; i < transpiledLines.length; i++) {
    const line = transpiledLines[i].trim()
    // Skip blank lines and comments at the start
    if (line === '' || line.startsWith('//')) {
      continue
    }
    // First non-comment line in transpiled output
    templateStartIndex = i
    break
  }

  let template = transpiledLines.slice(templateStartIndex).join('\n')

  // For batch templates, set globalThis['__FIGMA_BATCH'] so the runtime exposes it as
  // figma.batch. Using globalThis rather than a const so it's accessible from
  // __FIGMA_CODE_CONNECT_REQUIRE's closure regardless of where require('figma') is called.
  // (globalThis works in both browser and Node.js, unlike window.)
  if (batchOverrides) {
    template = `globalThis['__FIGMA_BATCH'] = ${JSON.stringify(batchOverrides.batchData)}\n${template}`
  }

  // Apply documentUrlSubstitutions if provided
  if (config?.documentUrlSubstitutions) {
    figmaNodeUrl = applyDocumentUrlSubstitutions(figmaNodeUrl, config.documentUrlSubstitutions)
  }

  // Determine effective label from parameter, config, or default
  const effectiveLabel = label || config?.label || CodeConnectLabel.Code

  const language = config?.language || getInferredLanguageForRaw(effectiveLabel)

  return {
    figmaNode: figmaNodeUrl,
    component,
    template,
    // nestable by default unless user specifies in template
    // (templateData.nestable AND template.metadata.nestable need to
    // be true for instance to be nested)
    templateData: { nestable: true, isParserless: true },
    language,
    label: effectiveLabel,
    source,
    sourceLocation: { line: -1 },
    metadata: {
      cliVersion: require('../../package.json').version,
    },
  }
}
